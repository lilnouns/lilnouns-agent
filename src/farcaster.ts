// Retrieves group conversations with unread mentions for the Lil Nouns bot

import {
  type DirectCastConversation,
  type DirectCastMessage,
  getDirectCastConversation,
  getDirectCastConversationRecentMessages,
  getDirectCastInbox,
} from '@nekofar/warpcast';
import { filter, pipe, sortBy } from 'remeda';
import type { getConfig } from './config';
import { createLogger } from './logger';

export async function fetchUnreadMentionsInGroups(
  env: Env,
  config: ReturnType<typeof getConfig>
) {
  const logger = createLogger(env).child({
    module: 'farcaster',
    function: 'fetchUnreadMentionsInGroups',
  });
  logger.debug('Starting to fetch unread mentions in groups');

  // Fetch the DirectCast inbox using Farcaster authentication
  const { data, error } = await getDirectCastInbox({
    auth: () => config.farcasterAuthToken,
  });

  const conversationCount = data?.result?.conversations?.length ?? 0;
  logger.debug({ conversationCount }, 'DirectCast inbox fetched');

  if (error) {
    logger.error({ error }, 'Error fetching DirectCast inbox');
  }

  // Filter conversations to only include groups with unread mentions
  const conversations = pipe(
    data?.result?.conversations ?? [],
    filter(c => c.isGroup && (c.viewerContext?.unreadMentionsCount ?? 0) > 0),
    sortBy(c => c.lastMessage?.serverTimestamp ?? 0)
  );

  logger.debug(
    { count: conversations.length },
    'Found group conversations with unread mentions'
  );
  return { conversations };
}

// Retrieves messages from a conversation that are related to Lil Nouns
export async function fetchLilNounsRelatedMessages(
  env: Env,
  config: ReturnType<typeof getConfig>,
  conversationId: string
) {
  const logger = createLogger(env).child({
    module: 'farcaster',
    function: 'fetchLilNounsRelatedMessages',
    conversationId,
  });

  logger.debug('Retrieving messages for conversation');

  // Get recent messages from the specified conversation
  const { data, error } = await getDirectCastConversationRecentMessages({
    auth: () => config.farcasterAuthToken,
    query: {
      conversationId,
    },
  });

  const messageCount = data?.result?.messages?.length ?? 0;
  logger.debug({ messageCount }, 'Retrieved messages from conversation');

  if (error) {
    logger.error({ error }, 'Error retrieving conversation messages');
  }

  const messages = pipe(
    data?.result?.messages ?? [],
    filter(m => {
      // Check if a message has mentions and specifically mentions 'lilnouns'
      const lilNounsFid = config.agent.fid;

      // Skip all messages sent BY lilnouns to avoid self-responses
      if (m.senderFid === lilNounsFid) {
        return false;
      }

      // Check if message mentions the lilnouns account
      const hasLilNounsMention =
        m.hasMention &&
        m.mentions?.some(mention => mention.user.fid === lilNounsFid);

      // Check if message is a reply to lilnouns (but not from lilnouns itself)
      const isReplyToLilNouns =
        m.inReplyTo?.senderFid === lilNounsFid &&
        m.senderContext.fid !== lilNounsFid;

      return hasLilNounsMention || isReplyToLilNouns;
    }),
    sortBy(m => m.serverTimestamp) // Sort messages by timestamp
  );

  logger.debug(
    { filteredCount: messages.length },
    'Filtered Lil Nouns related messages'
  );

  return { messages };
}

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

  messages = pipe(
    data?.result?.messages ?? [],
    filter(m => m.type === 'text'),
    sortBy(m => m.serverTimestamp)
  );

  logger.debug(
    { messageCount: messages.length },
    'Retrieved messages from conversation'
  );
  return { messages };
}

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

  const participants = data?.result?.conversation?.participants ?? [];

  logger.debug(
    { participantCount: participants.length },
    'Retrieved conversation participants'
  );

  return { participants };
}
