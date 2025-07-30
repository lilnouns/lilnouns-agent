import {
  type DirectCastConversation,
  sendDirectCastMessage,
} from '@nekofar/warpcast';
import {
  entries,
  filter,
  flatMap,
  groupByProp,
  isEmpty,
  join,
  last,
  map,
  pipe,
  takeLast,
} from 'remeda';
import { generateContextText, handleAiToolCalls } from '@/lib/ai';
import { getLastFetchTime } from '@/lib/cache';
import { createLogger } from '@/lib/logger';
import { agentSystemMessage } from '@/lib/prompts';
import {
  fetchLilNounsConversationMessages,
  markLilNounsConversationAsRead,
} from '@/services/farcaster';
import type { ConversationContext } from '@/types/conversation';
import { stripMarkdown } from '@/utils/text';

/**
 * Handles mentions in group conversations by processing messages from users and generating appropriate AI responses.
 *
 * @param {ConversationContext} context - Environment and configuration context required for group message processing
 * @param {DirectCastConversation[]} conversations - A list of conversations to process, including message and sender details.
 * @return {Promise<void>} A promise indicating the completion of mentions processing in group conversations.
 */
export async function handleNewMentionsInGroups(
  context: ConversationContext,
  conversations: DirectCastConversation[]
) {
  const { env } = context;

  // Create a logger for this handler
  const logger = createLogger(env).child({
    module: 'handlers',
    function: 'handleNewMentionsInGroups',
    conversationCount: conversations.length,
  });
  logger.debug('Starting to process mentions in groups');

  // Process each conversation individually
  for (const { conversationId } of conversations) {
    const conversationLogger = logger.child({ conversationId });
    conversationLogger.debug('Processing group conversation');

    // Perform the actual processing of the group conversation
    await processGroupConversation(context, conversationId);

    // Mark the conversation as read after processing all messages
    await markLilNounsConversationAsRead(context, conversationId);
  }

  logger.info('Completed processing mentions in group conversations');
}

/**
 * Processes a group conversation by fetching recent messages, grouping them by participants,
 * and generating AI responses based on the conversation context.
 *
 * @param context - Object contains environment and configuration context
 * @param conversationId - The unique identifier of the group conversation being processed
 * @returns A promise that resolves when the group conversation processing is complete
 */
export async function processGroupConversation(
  context: ConversationContext,
  conversationId: string
): Promise<void> {
  const { env, config } = context;

  const logger = createLogger(env).child({
    module: 'handlers',
    function: 'processGroupConversation',
    conversationId,
  });

  const lastFetchTime = await getLastFetchTime(env, config);

  // Fetch messages from this conversation
  const { messages } = await fetchLilNounsConversationMessages(
    context,
    conversationId
  );

  logger.debug(
    { messageCount: messages.length },
    'Found unprocessed messages in conversation'
  );

  // Group messages by participants, excluding the agent's own messages
  const messageGroups = pipe(
    messages,
    filter(m => m.senderFid !== config.agent.fid),
    groupByProp('senderFid')
  );

  logger.debug(
    { groupCount: Object.keys(messageGroups).length },
    'Grouped messages by sender'
  );

  for (const [senderFid, senderMessages] of entries(messageGroups)) {
    const messageLogger = logger.child({
      senderFid,
      messageCount: senderMessages.length,
    });

    messageLogger.debug('Processing messages for sender');

    // Check if the current sender has any messages since last fetch
    if (
      !senderMessages.some(m => Number(m.serverTimestamp ?? 0n) > lastFetchTime)
    ) {
      messageLogger.debug('No new messages since last fetch, skipping sender');
      continue;
    }

    const contextText = await generateContextText(
      env,
      config,
      pipe(
        senderMessages,
        filter(m => Number(m.serverTimestamp ?? 0n) > lastFetchTime),
        filter(m => m.senderFid === Number(senderFid)),
        filter(
          m =>
            (m.mentions?.some(
              mention => mention.user.fid === config.agent.fid
            ) ??
              false) ||
            m.inReplyTo?.senderFid === config.agent.fid
        ),
        flatMap(m => m.message),
        join('\n')
      )
    );

    const toolsMessage = await handleAiToolCalls(
      env,
      config,
      pipe(
        senderMessages,
        filter(m => Number(m.serverTimestamp ?? 0n) > lastFetchTime),
        filter(m => m.senderFid === Number(senderFid)),
        filter(
          m =>
            (m.mentions?.some(
              mention => mention.user.fid === config.agent.fid
            ) ??
              false) ||
            m.inReplyTo?.senderFid === config.agent.fid
        ),
        map(m => ({
          role: 'user',
          content: m.message,
        }))
      )
    );

    // Generate a final AI response incorporating any tool call results
    const { response } = await env.AI.run(
      config.agent.aiModels.functionCalling,
      {
        max_tokens: config.agent.maxTokens,
        messages: [
          {
            role: 'system',
            content: isEmpty(contextText)
              ? agentSystemMessage
              : `${agentSystemMessage}\nHere is some context from relevant documents:\n${contextText}`,
          },
          // The actual message content to respond to
          ...pipe(
            senderMessages,
            filter(m => m.senderFid === Number(senderFid)),
            filter(
              m =>
                (m.mentions?.some(
                  mention => mention.user.fid === config.agent.fid
                ) ??
                  false) ||
                m.inReplyTo?.senderFid === config.agent.fid
            ),
            takeLast(10),
            map(m => ({
              role: 'user',
              content: m.message,
            }))
          ),
          ...toolsMessage,
        ],
      },
      {
        gateway: {
          id: config.agent.gatewayId,
          skipCache: false,
          cacheTtl: config.agent.cacheTtl,
        },
      }
    );

    messageLogger.debug({ response }, 'AI generated response');

    // Prepare a plain text message without Markdown
    const messageContent = stripMarkdown(response ?? "I don't know");

    // Send the AI-generated response back to the conversation on Farcaster
    // Includes the original message ID for proper threading and mentions the original sender
    if (config.agent.features.sendDirectMessagesToGroupConversations) {
      const { error, data } = await sendDirectCastMessage({
        auth: () => config.farcasterAuthToken,
        body: {
          conversationId,
          recipientFids: [Number(senderFid)],
          messageId: crypto.randomUUID().replace(/-/g, ''),
          type: 'text',
          message: messageContent,
          inReplyToId: last(senderMessages).messageId,
        },
      });

      if (error) {
        messageLogger.error({ error }, 'Error sending message to group');
      } else {
        messageLogger.info(
          { responseMessageId: data?.result?.messageId },
          'Message sent successfully'
        );
      }
    } else {
      messageLogger.info(
        {
          messageContent,
          conversationId,
          recipientFids: [Number(senderFid)],
          messageId: crypto.randomUUID().replace(/-/g, ''),
          inReplyToId: last(senderMessages).messageId,
        },
        'Would send direct cast message to group conversation (not actually sent)'
      );
    }
  }

  logger.info('Completed processing group conversation');
}
