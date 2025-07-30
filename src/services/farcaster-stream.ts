import { DurableObject } from 'cloudflare:workers';
import type { Logger } from 'pino';
import {
  processGroupConversation,
  processOneToOneConversation,
} from '@/handlers/scheduled';
import { getConfig } from '@/lib/config';
import { createLogger } from '@/lib/logger';
import { fetchLilNounsUnreadConversation } from '@/services/farcaster';

interface FarcasterMessage {
  messageType:
    | 'authenticate'
    | 'heartbeat'
    | 'unseen'
    | 'refresh-direct-cast-conversation'
    | 'direct-cast-read';
  data?: string;
  payload?: Record<string, any>;
}

// Possible unseen payload types based on AsyncAPI schema
type UnseenPayload =
  | { inboxCount: number }
  | { unreadNotificationsCount: number }
  | {
      channelFeedsUnseenStatus: Array<{
        channelKey: string;
        feedType: string;
        hasNewItems: boolean;
      }>;
    };

interface RefreshPayload {
  conversationId: string;
  message: {
    conversationId: string;
    message: string;
    messageId: string;
    senderFid: number;
    serverTimestamp: number;
    type: string;
    isDeleted: boolean;
    senderContext: {
      displayName: string;
      fid: number;
      pfp: {
        url: string;
        verified: boolean;
      };
      username: string;
    };
    reactions: Array<Record<string, any>>;
    hasMention: boolean;
    isPinned: boolean;
    mentions: Array<Record<string, any>>;
  };
}

export class FarcasterStreamWebsocket extends DurableObject<Env> {
  private config: ReturnType<typeof getConfig>;
  private ws: WebSocket | null = null;
  private backoff = 1000;
  private readonly logger: Logger;
  private readonly websocketUrl = 'wss://ws.farcaster.xyz/stream';
  private readonly heartbeatInterval = 30_000;
  private readonly maxBackoff = 30_000;
  private readonly initialBackoff = 1000;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Initialize logger with consistent child configuration pattern
    this.logger = createLogger(env).child({
      module: 'FarcasterStreamWebsocket',
      durableObjectId: ctx.id.toString(),
    });

    // Initialize configuration from environment variables
    this.config = getConfig(env);

    // Schedule initial heartbeat alarm if none exists
    // Using proper promise handling with explicit logging for both success and error cases
    this.ctx.storage
      .getAlarm()
      .then(existingAlarm => {
        if (existingAlarm === null) {
          this.ctx.storage.setAlarm(Date.now() + this.heartbeatInterval);
          this.logger.debug('Initial heartbeat alarm scheduled');
        } else {
          this.logger.debug(
            'Existing alarm found, skipping initial alarm setup'
          );
        }
      })
      .catch(error => {
        this.logger.error({ error }, 'Failed to check existing alarm');
      });
  }

  // HTTP entrypoint to trigger connection
  async fetch(_request: Request): Promise<Response> {
    const logger = this.logger.child({
      method: 'fetch',
      timestamp: new Date().toISOString(),
    });

    logger.info('WebSocket fetch request started');

    try {
      await this.connect();
      logger.info('WebSocket connection initiated successfully');
      return new Response('WebSocket connection initiated');
    } catch (error) {
      logger.error({ error }, 'Failed to initiate WebSocket connection');
      throw error; // Re-throw to ensure proper error reporting
    }
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
        // Attempt to reconnect with backoff
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
        this.ws?.send(
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

    // Handle different types of unseen payloads
    if ('inboxCount' in payload) {
      this.logger.info(
        { inboxCount: payload.inboxCount },
        'Received inbox count update'
      );
      // Handle inbox count
    } else if ('unreadNotificationsCount' in payload) {
      this.logger.info(
        { unreadCount: payload.unreadNotificationsCount },
        'Received notification count update'
      );
      // Handle unread notifications count
    } else if ('channelFeedsUnseenStatus' in payload) {
      this.logger.info(
        { channels: payload.channelFeedsUnseenStatus.length },
        'Received channel feeds status update'
      );
      // Handle channel feeds status
    }
  }

  // Handle refresh of direct cast conversation
  private async handleRefresh(payload: RefreshPayload): Promise<void> {
    try {
      const { conversationId, message } = payload;
      if (!message || !message.messageId) {
        this.logger.warn(
          { payload },
          'Refresh payload missing required message data'
        );
        return;
      }

      // Fetch the conversation details
      const { conversation } = await fetchLilNounsUnreadConversation(
        { env: this.env, config: this.config },
        conversationId
      );

      if (!conversation) {
        this.logger.warn(
          { conversationId },
          'No conversation found for refresh'
        );
        return;
      }

      if (conversation.isGroup) {
        if (this.config.agent.features.handleGroupConversations) {
          this.logger.info(
            { conversationId, messageId: message.messageId },
            'Processing group conversation update'
          );
          // Handle group conversation updates if needed
          await processGroupConversation(
            { env: this.env, config: this.config },
            conversationId
          );
        } else {
          this.logger.warn(
            { conversationId },
            'Group conversations are not enabled in the configuration'
          );
        }
      } else {
        if (this.config.agent.features.handleOneToOneConversations) {
          this.logger.info(
            { conversationId, messageId: message.messageId },
            'Processing one-to-one conversation update'
          );
          // Process one-to-one conversation updates
          await processOneToOneConversation(
            { env: this.env, config: this.config },
            conversationId
          );
        } else {
          this.logger.warn(
            { conversationId },
            'One-to-one conversations are not enabled in the configuration'
          );
        }
      }

      // Store relevant conversation data
      await this.ctx.storage.put(
        `conversation:${conversationId}:lastMessageId`,
        message.messageId
      );
      await this.ctx.storage.put(
        `conversation:${conversationId}:timestamp`,
        message.serverTimestamp.toString()
      );

      this.logger.info(
        {
          conversationId,
          messageId: message.messageId,
          sender: message.senderContext.username,
        },
        'Processed conversation update'
      );
    } catch (error) {
      this.logger.error({ error, payload }, 'Failed to handle refresh message');
      throw error;
    }
  }
}
