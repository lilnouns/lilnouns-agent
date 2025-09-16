import {
  type DirectCastConversation,
  type User as Participant,
  sendDirectCast,
} from '@nekofar/warpcast';
import {
  filter,
  first,
  flatMap,
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
import { aiTools } from '@/lib/tools';
import {
  fetchLilNounsConversationMessages,
  fetchLilNounsConversationParticipants,
  markLilNounsConversationAsRead,
} from '@/services/farcaster';
import type { ConversationContext } from '@/types/conversation';
import { splitMessage, stripMarkdown } from '@/utils/text';

/**
 * Processes new one-to-one messages from a list of conversations, generating AI responses and sending them back.
 *
 * @param {ConversationContext} context - Environment and configuration context required for message processing
 * @param {DirectCastConversation[]} conversations - An array of one-to-one conversations containing messages to process.
 * @return {Promise<void>} A Promise that resolves when all conversations are processed, or rejects on errors.
 */
export async function handleNewOneToOneMessages(
  context: ConversationContext,
  conversations: DirectCastConversation[],
) {
  const { env } = context;

  const logger = createLogger(env).child({
    module: 'handlers',
    function: 'handleNewOneToOneMessages',
    conversationCount: conversations.length,
  });
  logger.debug('Starting to process one-to-one messages');

  // Process each conversation individually
  for (const { conversationId } of conversations) {
    const conversationLogger = logger.child({ conversationId });
    conversationLogger.debug('Processing conversation');

    // Perform the actual processing of the conversation
    await processOneToOneConversation(context, conversationId);

    // Mark the conversation as read after processing all messages
    await markLilNounsConversationAsRead(context, conversationId);

    conversationLogger.debug('Marked conversation as read');
  }

  logger.info('Completed processing one-to-one messages');
}

/**
 * Processes a single one-to-one conversation by fetching messages, generating AI responses, and sending replies.
 *
 * @param {ConversationContext} context - Environment and configuration context required for conversation processing
 * @param {string} conversationId - The unique identifier of the conversation to process
 * @return {Promise<void>} A promise that resolves when the conversation has been processed
 */
export async function processOneToOneConversation(
  context: ConversationContext,
  conversationId: string,
): Promise<void> {
  const { env, config } = context;

  // Create a logger for this conversation handler
  const conversationLogger = createLogger(env).child({
    module: 'handlers',
    function: 'processOneToOneConversation',
    conversationId,
  });

  const lastFetchTime = await getLastFetchTime(env, config);

  // Fetch messages from this conversation
  const { messages } = await fetchLilNounsConversationMessages(
    context,
    conversationId,
  );

  const { participants } = await fetchLilNounsConversationParticipants(
    context,
    conversationId,
  );

  // If no messages found, skip this conversation or if the last message is from the agent
  if (last(messages)?.senderFid === config.agent.fid) {
    conversationLogger.debug(
      { agentFid: config.agent.fid },
      'Skipping conversation already handled by the agent',
    );
    return;
  }

  // Filter messages to only include those since last retrieval for this conversation
  // This ensures we only process new messages for generating context
  const contextText = await generateContextText(
    env,
    config,
    pipe(
      messages,
      filter(m => Number(m.serverTimestamp ?? 0n) > lastFetchTime),
      filter(m => m.senderFid !== config.agent.fid),
      flatMap(m => m.message),
      join('\n'),
    ),
  );

  // Filter messages to only include those since last and handle tool calls for the messages
  // This ensures we only process new messages for generating AI response
  const toolsMessage = await handleAiToolCalls(
    env,
    config,
    pipe(
      messages,
      filter(m => Number(m.serverTimestamp ?? 0n) > lastFetchTime),
      map(m => ({
        role: m.senderFid === config.agent.fid ? 'assistant' : 'user',
        content: m.message,
      })),
    ),
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
            : `${agentSystemMessage}\nRELEVANT CONTEXT:\n${contextText}`,
        },
        // The actual message content to respond to
        ...pipe(
          messages,
          takeLast(10),
          map(m => ({
            role: m.senderFid === config.agent.fid ? 'assistant' : 'user',
            content: m.message,
          })),
        ),
        ...toolsMessage,
      ],
      tools: aiTools,
    },
    {
      gateway: {
        id: config.agent.gatewayId,
        skipCache: false,
        cacheTtl: config.agent.cacheTtl,
      },
    },
  );

  conversationLogger.debug({ response }, 'AI generated response');

  const plainResponse = stripMarkdown(response ?? "I don't know").trim();
  const fallbackResponse =
    plainResponse.length > 0 ? plainResponse : "I don't know";
  const messageChunks = splitMessage(fallbackResponse);

  const recipientFid = Number(
    pipe(
      participants,
      filter(p => p.fid !== config.agent.fid),
      first<Participant[]>,
    )?.fid ?? 0,
  );

  conversationLogger.debug({ messageChunks }, 'Prepared direct message chunks');

  if (messageChunks.length === 0) {
    conversationLogger.warn('No message chunks generated, skipping send');
    return;
  }

  // Send the AI-generated response back to the conversation on Farcaster
  if (config.agent.features.sendDirectMessagesToOneToOneConversations) {
    for (const [index, chunk] of messageChunks.entries()) {
      const idempotencyKey = crypto.randomUUID();
      const { error } = await sendDirectCast({
        auth: () => config.farcasterApiKey,
        body: {
          recipientFid,
          idempotencyKey,
          message: chunk,
        },
      });

      if (error) {
        conversationLogger.error(
          { error, chunkIndex: index, idempotencyKey },
          'Error sending message chunk to conversation',
        );
        break;
      }

      conversationLogger.info(
        { chunkIndex: index, idempotencyKey },
        'Message chunk sent successfully',
      );
    }
  } else {
    conversationLogger.info(
      {
        messageChunks,
        recipientFid,
      },
      'Would send direct cast message chunks to one-to-one conversation (not actually sent)',
    );
  }
}
