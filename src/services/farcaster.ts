import {
  type DirectCastConversation,
  type DirectCastMessage,
  getDirectCastConversation,
  getDirectCastConversationRecentMessages,
  getDirectCastInbox,
} from '@nekofar/warpcast';
import { filter, pipe, sortBy } from 'remeda';
import type { getConfig } from '@/lib/config';
import { createLogger } from '@/lib/logger';

/**
 * Fetches unread conversations for the Lil Nouns bot from Farcaster.
 *
 * @param env - The environment variables containing configuration settings
 * @param config - Configuration object with Farcaster auth token
 * @returns An object containing an array of unread DirectCastConversations
 */
export async function fetchLilNounsUnreadConversations(
  env: Env,
  config: ReturnType<typeof getConfig>
) {
  const logger = createLogger(env).child({
    module: 'farcaster',
    function: 'fetchLilNounsUnreadConversations',
  });

  logger.debug('Fetching Lil Nouns unread conversations');

  let conversations: DirectCastConversation[] = [];

  // Fetch the inbox
  const { data, error } = await getDirectCastInbox({
    auth: () => config.farcasterAuthToken,
    query: {
      limit: 100, // Fetch up to 100 conversations
      category: 'default',
      filter: 'unread',
    },
  });

  if (error) {
    logger.error({ error }, 'Error fetching unread conversations');
    return { conversations };
  }

  // Sort conversations by timestamp (oldest first) to process them in chronological order
  conversations = pipe(
    data?.result?.conversations ?? [],
    sortBy(c => c.lastMessage?.serverTimestamp ?? 0)
  );

  logger.debug(
    { conversationCount: conversations.length },
    'Found unread conversations'
  );

  return { conversations };
}

/**
 * Retrieves recent messages from a specific Farcaster conversation.
 *
 * @param env - The environment variables containing configuration settings
 * @param config - Configuration object with Farcaster auth token
 * @param conversationId - The unique identifier of the conversation to fetch messages from
 * @returns An object containing an array of text messages from the conversation
 */
export async function fetchLilNounsConversationMessages(
  env: Env,
  config: ReturnType<typeof getConfig>,
  conversationId: string
) {
  const logger = createLogger(env).child({
    module: 'farcaster',
    function: 'fetchLilNounsConversationMessages',
    conversationId,
  });

  logger.debug('Fetching messages for conversation');

  let messages: DirectCastMessage[] = [];

  // Get recent messages from the specified conversation
  const { data, error } = await getDirectCastConversationRecentMessages({
    auth: () => config.farcasterAuthToken,
    query: {
      conversationId,
    },
  });

  if (error) {
    logger.error({ error }, 'Error fetching conversation messages');
    return { messages };
  }

  // Filter out non-text messages and sort by timestamp (oldest first)
  // to maintain chronological order for processing
  messages = pipe(
    data?.result?.messages ?? [],
    filter(m => m.type === 'text'), // Only include text messages
    sortBy(m => m.serverTimestamp) // Sort by timestamp ascending
  );

  logger.debug(
    { messageCount: messages.length },
    'Retrieved messages from conversation'
  );
  return { messages };
}

/**
 * Retrieves the list of participants in a specific Farcaster conversation.
 *
 * @param env - The environment variables containing configuration settings
 * @param config - Configuration object with Farcaster auth token
 * @param conversationId - The unique identifier of the conversation
 * @returns An object containing an array of participants in the conversation
 */
export async function fetchLilNounsConversationParticipants(
  env: Env,
  config: ReturnType<typeof getConfig>,
  conversationId: string
) {
  const logger = createLogger(env).child({
    module: 'farcaster',
    function: 'fetchLilNounsConversationParticipants',
    conversationId,
  });

  logger.debug('Fetching participants for conversation');

  // Get the conversation details
  const { data, error } = await getDirectCastConversation({
    auth: () => config.farcasterAuthToken,
    query: {
      conversationId,
    },
  });

  if (error) {
    logger.error({ error }, 'Error fetching conversation participants');
    return { participants: [] };
  }

  // Extract participants from the conversation data, defaulting to empty array if not found
  const participants = data?.result?.conversation?.participants ?? [];

  logger.debug(
    { participantCount: participants.length },
    'Retrieved conversation participants'
  );

  return { participants };
}
