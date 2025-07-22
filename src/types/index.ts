/**
 * TypeScript interfaces and types for the Lil Nouns Agent
 *
 * This file contains all type definitions used throughout the application,
 * following functional programming principles with immutable data structures.
 */

/**
 * Environment variables interface
 * Extends the default Cloudflare Workers Env with our specific requirements
 */
export interface Env {
  FARCASTER_AUTH_TOKEN: string;
  AI: Ai;
}

/**
 * Warpcast API response structures
 */
export interface WarpcastApiResponse<T> {
  data?: {
    result?: T;
  };
  error?: string;
  response?: Response;
}

/**
 * Conversation data from Warpcast inbox
 */
export interface Conversation {
  conversationId: string;
  isGroup: boolean;
  viewerContext?: {
    unreadMentionsCount?: number;
  };
}

/**
 * Message data from Warpcast conversations
 */
export interface Message {
  messageId: string;
  message: string;
  senderFid: number;
  serverTimestamp: number;
  hasMention: boolean;
  mentions?: Mention[];
  inReplyTo?: {
    senderFid: number;
  };
  senderContext: {
    fid: number;
  };
}

/**
 * Mention data within messages
 */
export interface Mention {
  user: {
    fid: number;
  };
}

/**
 * Inbox response structure
 */
export interface InboxResponse {
  conversations: Conversation[];
}

/**
 * Messages response structure
 */
export interface MessagesResponse {
  messages: Message[];
}

/**
 * AI response structure from Cloudflare AI
 */
export interface AIResponse {
  response?: string;
}

/**
 * Direct cast message request body
 */
export interface DirectCastMessageRequest {
  conversationId: string;
  recipientFids: number[];
  messageId: string;
  type: 'text';
  message: string;
  inReplyToId: string;
}

/**
 * Function type for message filtering predicates
 * Following functional programming principles
 */
export type MessagePredicate = (message: Message) => boolean;

/**
 * Function type for conversation filtering predicates
 */
export type ConversationPredicate = (conversation: Conversation) => boolean;

/**
 * Configuration type for AI requests
 */
export interface AIRequestConfig {
  max_tokens: number;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * Gateway configuration for AI requests
 */
export interface AIGatewayConfig {
  gateway: {
    id: string;
    skipCache: boolean;
    cacheTtl: number;
  };
}
