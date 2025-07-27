// Retrieves group conversations with unread mentions for the Lil Nouns bot

import {
  getDirectCastConversationRecentMessages,
  getDirectCastInbox,
} from '@nekofar/warpcast';
import { filter, pipe, sortBy } from 'remeda';
import type { getConfig } from './config';

export async function fetchUnreadMentionsInGroups(
  config: ReturnType<typeof getConfig>
) {
  console.log('[DEBUG] Starting fetchUnreadMentionsInGroups');
  // Fetch the DirectCast inbox using Farcaster authentication
  const { data, error, response } = await getDirectCastInbox({
    auth: () => config.farcasterAuthToken,
  });

  console.log(
    `[DEBUG] DirectCast inbox fetched. Found ${data?.result?.conversations?.length ?? 0} conversations`
  );
  if (error) console.log(`[DEBUG] DirectCast inbox error:`, error);

  // Filter conversations to only include groups with unread mentions
  const conversations = pipe(
    data?.result?.conversations ?? [],
    filter(c => c.isGroup && (c.viewerContext?.unreadMentionsCount ?? 0) > 0),
    sortBy(c => c.lastMessage?.serverTimestamp ?? 0)
  );

  console.log(
    `[DEBUG] Found ${conversations.length} group conversations with unread mentions`
  );
  return { conversations };
}

// Retrieves messages from a conversation that are related to Lil Nouns
export async function fetchLilNounsRelatedMessages(
  config: ReturnType<typeof getConfig>,
  conversationId: string
) {
  console.log(
    `[DEBUG] Retrieving messages for conversation: ${conversationId}`
  );
  // Get recent messages from the specified conversation
  const { data, response, error } =
    await getDirectCastConversationRecentMessages({
      auth: () => config.farcasterAuthToken,
      query: {
        conversationId,
      },
    });

  console.log(
    `[DEBUG] Retrieved ${data?.result?.messages?.length ?? 0} messages from conversation`
  );
  if (error) console.log(`[DEBUG] Error retrieving messages:`, error);

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
  console.log(
    `[DEBUG] Filtered to ${messages.length} Lil Nouns related messages`
  );
  return messages;
}
