/**
 * Farcaster Service
 *
 * This service handles all interactions with the Warpcast API,
 * following functional programming principles with pure functions
 * and immutable data transformations.
 */

import {
  getDirectCastConversation,
  getDirectCastConversationRecentMessages,
  getDirectCastInbox,
  sendDirectCastMessage,
} from '@nekofar/warpcast';
import { filter, pipe } from 'remeda';
import {
  createValidatedAuthFunction,
  handleAuthError,
  isWithinAuthRateLimit
} from '../utils/auth';
import type {
  Env,
  Conversation,
  Message,
  InboxResponse,
  MessagesResponse,
  WarpcastApiResponse,
  ConversationPredicate,
  DirectCastMessageRequest,
} from '../types';

/**
 * Retrieves conversations with unread mentions in group chats
 * Pure function that filters conversations based on group status and unread mentions
 *
 * @param env - Environment variables containing auth token
 * @returns Promise resolving to array of conversations with unread mentions
 */
export async function retrieveUnreadMentionsInGroups(
  env: Env
): Promise<Conversation[]> {
  // Check rate limiting for this operation
  const rateLimitId = 'inbox-check';
  if (!isWithinAuthRateLimit(rateLimitId, 30, 60000)) { // 30 requests per minute
    throw new Error('Rate limit exceeded for inbox retrieval');
  }

  try {
    const authFunction = createValidatedAuthFunction(env);
    const { data, error, response }: WarpcastApiResponse<InboxResponse> =
      await getDirectCastInbox({
        auth: authFunction,
      });

    if (error) {
      const authError = handleAuthError(new Error(error), 'retrieveUnreadMentionsInGroups');
      console[authError.logLevel](authError.message);
      throw new Error(`Failed to retrieve inbox: ${error}`);
    }

    const hasUnreadMentionsInGroup: ConversationPredicate = (c) =>
      c.isGroup && (c.viewerContext?.unreadMentionsCount ?? 0) > 0;

    return pipe(
      data?.result?.conversations ?? [],
      filter(hasUnreadMentionsInGroup)
    );
  } catch (error) {
    const authError = handleAuthError(error, 'retrieveUnreadMentionsInGroups');
    console[authError.logLevel](authError.message);
    throw error;
  }
}

/**
 * Retrieves recent messages from a specific conversation
 * Pure function that returns all messages without filtering
 *
 * @param env - Environment variables containing auth token
 * @param conversationId - ID of the conversation to retrieve messages from
 * @returns Promise resolving to array of messages
 */
export async function retrieveConversationMessages(
  env: Env,
  conversationId: string
): Promise<Message[]> {
  // Check rate limiting for message retrieval
  const rateLimitId = `messages-${conversationId}`;
  if (!isWithinAuthRateLimit(rateLimitId, 20, 60000)) { // 20 requests per minute per conversation
    throw new Error(`Rate limit exceeded for conversation ${conversationId}`);
  }

  try {
    const authFunction = createValidatedAuthFunction(env);
    const { data, response, error }: WarpcastApiResponse<MessagesResponse> =
      await getDirectCastConversationRecentMessages({
        auth: authFunction,
        query: {
          conversationId,
        },
      });

    if (error) {
      const authError = handleAuthError(new Error(error), 'retrieveConversationMessages');
      console[authError.logLevel](authError.message);
      throw new Error(`Failed to retrieve messages for conversation ${conversationId}: ${error}`);
    }

    return data?.result?.messages ?? [];
  } catch (error) {
    const authError = handleAuthError(error, 'retrieveConversationMessages');
    console[authError.logLevel](authError.message);
    throw error;
  }
}

/**
 * Sends a direct cast message to a conversation
 * Side effect function that sends a message via the Warpcast API
 *
 * @param env - Environment variables containing auth token
 * @param messageRequest - Message data to send
 * @returns Promise resolving to the API response
 */
export async function sendMessage(
  env: Env,
  messageRequest: DirectCastMessageRequest
): Promise<WarpcastApiResponse<any>> {
  // Check rate limiting for message sending (more restrictive)
  const rateLimitId = `send-${messageRequest.conversationId}`;
  if (!isWithinAuthRateLimit(rateLimitId, 5, 60000)) { // 5 messages per minute per conversation
    throw new Error(`Rate limit exceeded for sending messages to conversation ${messageRequest.conversationId}`);
  }

  try {
    const authFunction = createValidatedAuthFunction(env);
    const result = await sendDirectCastMessage({
      auth: authFunction,
      body: messageRequest,
    });

    if (result.error) {
      const authError = handleAuthError(new Error(result.error), 'sendMessage');
      console[authError.logLevel](authError.message);
      throw new Error(`Failed to send message: ${result.error}`);
    }

    return result;
  } catch (error) {
    const authError = handleAuthError(error, 'sendMessage');
    console[authError.logLevel](authError.message);
    throw error;
  }
}

/**
 * Generates a unique message ID
 * Pure function that creates a UUID without dashes
 *
 * @returns Unique message ID string
 */
export function generateMessageId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
