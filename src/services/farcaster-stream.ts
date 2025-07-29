// Type definitions for WebSocket messages
import { DurableObject } from 'cloudflare:workers';
import type { Logger } from 'pino';
import { createLogger } from '@/lib/logger';

interface FarcasterMessage {
  messageType:
    | 'authenticate'
    | 'heartbeat'
    | 'unseen'
    | 'refresh-direct-cast-conversation';
  data?: string;
  payload?: any;
}

interface UnseenPayload {
  count: number;
  // Add other unseen payload properties as needed
}

interface RefreshPayload {
  message: {
    messageId: string;
    // Add other message properties as needed
  };
}

export class FarcasterStreamWebsocket extends DurableObject<Env> {
  private ws: WebSocket | null = null;
  private backoff = 1000;
  private readonly logger: Logger;
  private readonly websocketUrl = 'wss://ws.farcaster.xyz/stream';
  private readonly heartbeatInterval = 30_000;
  private readonly maxBackoff = 30_000;
  private readonly initialBackoff = 1000;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.logger = createLogger(env).child({
      module: 'FarcasterStreamWebsocket',
      durableObjectId: ctx.id.toString(),
    });
  }

  // Alarm handler: sends heartbeat or triggers reconnect
  async alarm(): Promise<void> {
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send heartbeat every 30s
        this.ws.send(
          JSON.stringify({
            messageType: 'heartbeat',
          } satisfies FarcasterMessage)
        );
        this.logger.debug('Heartbeat sent');
      } else {
        // Attempt reconnect with backoff
        await this.connect();
      }
      // Reschedule next alarm
      await this.ctx.storage.setAlarm(Date.now() + this.heartbeatInterval);
    } catch (error) {
      this.logger.error({ error }, 'Alarm handler failed');
      // Still reschedule to prevent hanging
      await this.ctx.storage.setAlarm(Date.now() + this.heartbeatInterval);
    }
  }

  // Establish or re-establish WebSocket connection
  private async connect(): Promise<void> {
    const token = this.env.FARCASTER_AUTH_TOKEN;

    if (!token) {
      this.logger.error('FARCASTER_AUTH_TOKEN not configured');
      return;
    }

    try {
      // Close any existing socket
      if (this.ws) {
        this.ws.close();
        this.logger.debug('Closed existing WebSocket connection');
      }

      this.ws = new WebSocket(this.websocketUrl);

      // Use addEventListener since Workers WebSocket typings use EventTarget
      this.ws.addEventListener('open', () => {
        this.logger.info('WebSocket connection opened');
        // Authenticate upon open
        this.ws!.send(
          JSON.stringify({
            messageType: 'authenticate',
            data: `Bearer ${token}`,
          } satisfies FarcasterMessage)
        );
        // Reset backoff
        this.backoff = this.initialBackoff;
      });

      this.ws.addEventListener('message', (ev: MessageEvent) => {
        this.handleMessage(ev.data).catch(error => {
          this.logger.error({ error }, 'Failed to handle WebSocket message');
        });
      });

      this.ws.addEventListener('error', event => {
        this.logger.error({ event }, 'WebSocket error occurred');
        this.scheduleReconnect();
      });

      this.ws.addEventListener('close', event => {
        this.logger.warn(
          { code: event.code, reason: event.reason },
          'WebSocket connection closed'
        );
        this.scheduleReconnect();
      });
    } catch (error) {
      this.logger.error({ error }, 'Failed to establish WebSocket connection');
      this.scheduleReconnect();
    }
  }

  // Exponential backoff reconnect scheduler
  private scheduleReconnect(): void {
    const delay = this.backoff;
    this.logger.info({ delay }, 'Scheduling reconnect');

    setTimeout(() => {
      this.connect().catch(error => {
        this.logger.error({ error }, 'Reconnection attempt failed');
      });
    }, delay);

    this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
  }

  // Parse and dispatch incoming messages
  private async handleMessage(raw: unknown): Promise<void> {
    if (typeof raw !== 'string') {
      this.logger.warn({ raw }, 'Received non-string message');
      return;
    }

    let msg: FarcasterMessage;
    try {
      msg = JSON.parse(raw);
    } catch (error) {
      this.logger.error({ error, raw }, 'Failed to parse message as JSON');
      return;
    }

    if (!msg.messageType) {
      this.logger.warn({ msg }, 'Message missing messageType field');
      return;
    }

    this.logger.debug({ messageType: msg.messageType }, 'Processing message');

    try {
      switch (msg.messageType) {
        case 'unseen': {
          if (!msg.data) {
            this.logger.warn('Unseen message missing data field');
            return;
          }
          const payload: UnseenPayload = JSON.parse(msg.data);
          await this.handleUnseen(payload);
          break;
        }
        case 'refresh-direct-cast-conversation': {
          if (!msg.payload) {
            this.logger.warn('Refresh message missing payload field');
            return;
          }
          await this.handleRefresh(msg.payload as RefreshPayload);
          break;
        }
        case 'heartbeat': {
          // Handle server heartbeat if needed
          this.logger.debug('Received heartbeat from server');
          break;
        }
        default: {
          this.logger.info(
            { messageType: msg.messageType },
            'Unhandled message type'
          );
        }
      }
    } catch (error) {
      this.logger.error(
        { error, messageType: msg.messageType },
        'Failed to handle message'
      );
    }
  }

  // Handle unseen messages count
  private async handleUnseen(payload: UnseenPayload): Promise<void> {
    this.logger.info({ payload }, 'Processing unseen messages');

    // Add your unseen message handling logic here
    // For example, updating counters in storage or triggering notifications
  }

  // Persist last message ID for a conversation
  private async handleRefresh(payload: RefreshPayload): Promise<void> {
    try {
      const messageId = payload.message?.messageId;
      if (!messageId) {
        this.logger.warn({ payload }, 'Refresh payload missing message ID');
        return;
      }

      await this.ctx.storage.put('lastMessageId', messageId);
      this.logger.info({ messageId }, 'Persisted last message ID');
    } catch (error) {
      this.logger.error({ error, payload }, 'Failed to handle refresh message');
      throw error;
    }
  }
}
