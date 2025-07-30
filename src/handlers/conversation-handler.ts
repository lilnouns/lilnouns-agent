import { DateTime } from 'luxon';
import { filter, partition, pipe } from 'remeda';
import { setLastFetchTime } from '@/lib/cache';
import { createLogger } from '@/lib/logger';
import { fetchLilNounsUnreadConversations } from '@/services/farcaster';
import type { ConversationContext } from '@/types/conversation';
import { handleNewMentionsInGroups } from './group-conversation-handler';
import { handleNewOneToOneMessages } from './one-to-one-conversation-handler';

/**
 * Handles processing of unread conversations, segregating them into group and one-to-one chats,
 * and processing messages accordingly. Updates the last fetch timestamp after successful processing.
 *
 * @param {ConversationContext} context - Environment and configuration context required for conversation processing
 * @return {Promise<void>} Resolves when all unread conversations have been processed successfully.
 */
export async function handleUnreadConversations(context: ConversationContext) {
  const { env, config } = context;

  const logger = createLogger(env).child({
    module: 'handlers',
    function: 'handleUnreadConversations',
  });
  logger.debug('Starting to process unread conversations');

  // Fetch all conversations with unread messages
  const { conversations } = await fetchLilNounsUnreadConversations(context);

  // Process each conversation individually
  const [groups, chats] = pipe(
    conversations,
    // Filter conversations that have not been updated in the last week
    // This helps in avoiding processing stale conversations
    filter(
      c =>
        Number(c.lastMessage?.serverTimestamp ?? 0) >
        DateTime.now().minus({ weeks: 1 }).startOf('week').toMillis()
    ),
    partition(c => c.isGroup)
  );

  logger.debug(
    { groupCount: groups.length, chatCount: chats.length },
    'Processing group and one-to-one conversations'
  );

  // Handle new mentions in groups conversations
  if (config.agent.features.handleGroupConversations && groups.length > 0) {
    logger.debug(
      { groupCount: groups.length },
      'Handling new mentions in group conversations'
    );

    await handleNewMentionsInGroups(context, groups);
  } else {
    logger.debug(
      { groupCount: groups.length },
      'Skipping group conversations handling as feature is disabled or no groups found'
    );
  }

  // Handle new messages in one-to-one conversations
  if (config.agent.features.handleOneToOneConversations && chats.length > 0) {
    logger.debug(
      { chatCount: chats.length },
      'Handling new messages in one-to-one conversations'
    );

    await handleNewOneToOneMessages(context, chats);
  } else {
    logger.debug(
      { chatCount: chats.length },
      'Skipping one-to-one conversations handling as feature is disabled or no chats found'
    );
  }

  // Update the last fetch timestamp to current time for next iteration
  await setLastFetchTime(env, config, DateTime.now().toISO());
}
