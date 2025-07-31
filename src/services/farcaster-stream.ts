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
    | 'unseen'
    | 'refresh-direct-cast-conversation'
    | 'refresh-self-direct-casts-inbox'
    | 'direct-cast-read';
  data?: string;
  payload?: Record<string, any>;
}

// Define the refresh-self-direct-casts-inbox payload structure
interface RefreshSelfDirectCastsInboxPayload {
  conversationId: string;
}

// Possible unseen payload types based on AsyncAPI schema
type UnseenPayload =
  | { inboxCount: number }
  | { unreadNotificationsCount: number }
  | { warpTransactionCount: number }
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
  private readonly healthCheckInterval = 30_000;
  private readonly maxBackoff = 30_000;
  private readonly initialBackoff = 1000;

  // A Map to track ongoing conversation processing
  private readonly processingConversations = new Map<string, Promise<void>>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Initialize logger with consistent child configuration pattern
    this.logger = createLogger(env).child({
      module: 'FarcasterStreamWebsocket',
      durableObjectId: ctx.id.toString(),
    });

    // Initialize configuration from environment variables
    this.config = getConfig(env);

    // Check if Farcaster Stream is enabled before setting up alarms
    if (!this.config.agent.features.enableFarcasterStream) {
      this.logger.info('Farcaster Stream is disabled in configuration');
      return;
    }

    // Schedule initial heartbeat alarm if none exists
    // Using proper promise handling with explicit logging for both success and error cases
    this.ctx.storage
      .getAlarm()
      .then(existingAlarm => {
        if (existingAlarm === null) {
          this.ctx.storage.setAlarm(Date.now() + this.healthCheckInterval);
          this.logger.debug('Initial health check alarm scheduled');
        } else {
          this.logger.debug(
            'Existing alarm found, skipping initial alarm setup',
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

    // Check if Farcaster Stream is enabled
    if (!this.config.agent.features.enableFarcasterStream) {
      logger.info('Farcaster Stream is disabled in configuration');
      return new Response('Farcaster Stream is disabled', { status: 503 });
    }

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

  // Alarm handler: checks connection health and triggers reconnect if needed
  async alarm(): Promise<void> {
    // Check if Farcaster Stream is enabled
    if (!this.config.agent.features.enableFarcasterStream) {
      this.logger.info('Farcaster Stream is disabled, skipping alarm');
      return;
    }

    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Connection is healthy, just log status
        this.logger.debug('WebSocket connection is healthy');
      } else {
        // Attempt to reconnect with backoff
        this.logger.info('WebSocket connection not open, attempting reconnect');
        await this.connect();
      }
      // Reschedule next alarm
      await this.ctx.storage.setAlarm(Date.now() + this.healthCheckInterval);
    } catch (error) {
      this.logger.error({ error }, 'Alarm handler failed');
      // Still reschedule to prevent hanging
      await this.ctx.storage.setAlarm(Date.now() + this.healthCheckInterval);
    }
  }

  // Establish or re-establish WebSocket connection
  private async connect(): Promise<void> {
    // Check if Farcaster Stream is enabled
    if (!this.config.agent.features.enableFarcasterStream) {
      this.logger.info('Farcaster Stream is disabled, skipping connection');
      return;
    }

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
          } satisfies FarcasterMessage),
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
          'WebSocket connection closed',
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
        case 'refresh-self-direct-casts-inbox': {
          if (!msg.payload) {
            this.logger.warn(
              'Refresh self direct casts inbox message missing payload field',
            );
            return;
          }
          await this.handleRefreshSelfDirectCastsInbox(
            msg.payload as RefreshSelfDirectCastsInboxPayload,
          );
          break;
        }
        case 'authenticate': {
          // Handle authentication response
          this.logger.info('Received authentication response');
          break;
        }
        case 'direct-cast-read': {
          // Handle direct cast read notifications
          this.logger.debug(
            { payload: msg.payload },
            'Received direct-cast-read message',
          );
          break;
        }
        default: {
          this.logger.warn(
            {
              messageType: msg.messageType,
              payload: msg.payload,
              data: msg.data,
              raw,
            },
            'Received unknown payload from FID ' +
              (msg.payload?.message?.senderFid || 'unknown'),
          );
        }
      }
    } catch (error) {
      this.logger.error(
        { error, messageType: msg.messageType },
        'Failed to handle message',
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
        'Received inbox count update',
      );
      // Handle inbox count
    } else if ('unreadNotificationsCount' in payload) {
      this.logger.info(
        { unreadCount: payload.unreadNotificationsCount },
        'Received notification count update',
      );
      // Handle unread notifications count
    } else if ('warpTransactionCount' in payload) {
      this.logger.info(
        { warpTransactionCount: payload.warpTransactionCount },
        'Received warp transaction count update',
      );
      // Handle warp transaction count
    } else if ('channelFeedsUnseenStatus' in payload) {
      this.logger.info(
        { channels: payload.channelFeedsUnseenStatus.length },
        'Received channel feeds status update',
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
          'Refresh payload missing required message data',
        );
        return;
      }

      // Check if this conversation is already being processed
      if (this.processingConversations.has(conversationId)) {
        this.logger.info(
          { conversationId, messageId: message.messageId },
          'Conversation is already being processed, skipping',
        );
        return;
      }

      // Fetch the conversation details
      const { conversation } = await fetchLilNounsUnreadConversation(
        { env: this.env, config: this.config },
        conversationId,
      );

      if (!conversation) {
        this.logger.warn(
          { conversationId },
          'No conversation found for refresh',
        );
        return;
      }

      // Create a processing promise and add it to the map
      const processingPromise = this.processConversation(
        conversation,
        conversationId,
        message,
      );
      this.processingConversations.set(conversationId, processingPromise);

      try {
        await processingPromise;
      } finally {
        // Always clean up the processing map entry
        this.processingConversations.delete(conversationId);
      }

      // Store relevant conversation data
      await this.ctx.storage.put(
        `conversation:${conversationId}:lastMessageId`,
        message.messageId,
      );
      await this.ctx.storage.put(
        `conversation:${conversationId}:timestamp`,
        message.serverTimestamp.toString(),
      );

      this.logger.info(
        {
          conversationId,
          messageId: message.messageId,
          sender: message.senderContext.username,
        },
        'Processed conversation update',
      );
    } catch (error) {
      this.logger.error({ error, payload }, 'Failed to handle refresh message');
      throw error;
    }
  }

  // Handle refresh of self direct casts inbox
  private async handleRefreshSelfDirectCastsInbox(
    payload: RefreshSelfDirectCastsInboxPayload,
  ): Promise<void> {
    try {
      const { conversationId } = payload;

      this.logger.info(
        { conversationId },
        'Processing self direct casts inbox refresh',
      );

      // Check if this conversation is already being processed
      if (this.processingConversations.has(conversationId)) {
        this.logger.info(
          { conversationId },
          'Conversation is already being processed, skipping self inbox refresh',
        );
        return;
      }

      // Fetch the conversation details
      const { conversation } = await fetchLilNounsUnreadConversation(
        { env: this.env, config: this.config },
        conversationId,
      );

      if (!conversation) {
        this.logger.warn(
          { conversationId },
          'No conversation found for self direct casts inbox refresh',
        );
        return;
      }

      // Create a processing promise and add it to the map
      const processingPromise = this.processConversation(
        conversation,
        conversationId,
        null, // No specific message for this type
      );
      this.processingConversations.set(conversationId, processingPromise);

      try {
        await processingPromise;
      } finally {
        // Always clean up the processing map entry
        this.processingConversations.delete(conversationId);
      }

      // Store conversation data
      await this.ctx.storage.put(
        `conversation:${conversationId}:lastRefresh`,
        Date.now().toString(),
      );

      this.logger.info(
        { conversationId },
        'Processed self direct casts inbox refresh',
      );
    } catch (error) {
      this.logger.error(
        { error, payload },
        'Failed to handle self direct casts inbox refresh',
      );
      throw error;
    }
  }

  // Extract conversation processing logic into a separate method
  private async processConversation(
    conversation: any,
    conversationId: string,
    message: any | null,
  ): Promise<void> {
    if (conversation.isGroup) {
      if (this.config.agent.features.handleGroupConversations) {
        this.logger.info(
          { conversationId, messageId: message?.messageId },
          'Processing group conversation update',
        );
        // Handle group conversation updates if needed
        await processGroupConversation(
          { env: this.env, config: this.config },
          conversationId,
        );
      } else {
        this.logger.warn(
          { conversationId },
          'Group conversations are not enabled in the configuration',
        );
      }
    } else {
      if (this.config.agent.features.handleOneToOneConversations) {
        this.logger.info(
          { conversationId, messageId: message?.messageId },
          'Processing one-to-one conversation update',
        );
        // Process one-to-one conversation updates
        await processOneToOneConversation(
          { env: this.env, config: this.config },
          conversationId,
        );
      } else {
        this.logger.warn(
          { conversationId },
          'One-to-one conversations are not enabled in the configuration',
        );
      }
    }
  }
}
