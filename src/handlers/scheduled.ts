import {
  type DirectCastConversation,
  type User as Participant,
  sendDirectCast,
  sendDirectCastMessage,
} from '@nekofar/warpcast';
import { DateTime } from 'luxon';
import {
  entries,
  filter,
  first,
  flatMap,
  groupByProp,
  isEmpty,
  join,
  last,
  map,
  partition,
  pipe,
  takeLast,
} from 'remeda';
import { generateContextText, handleAiToolCalls } from '@/lib/ai';
import { getLastFetchTime, setLastFetchTime } from '@/lib/cache';
import type { getConfig } from '@/lib/config';
import { createLogger } from '@/lib/logger';
import { agentSystemMessage } from '@/lib/prompts';
import {
  fetchLilNounsConversationMessages,
  fetchLilNounsConversationParticipants,
  fetchLilNounsUnreadConversations,
  markLilNounsConversationAsRead,
} from '@/services/farcaster';
import { stripMarkdown } from '@/utils/text';

/**
 * Provides essential environment and configuration context for conversation handling operations.
 * This interface encapsulates the necessary dependencies for processing messages,
 * interacting with Farcaster API, and managing AI-powered responses.
 *
 * @property {Env} env - The environment object containing runtime configurations and service connections
 * @property {ReturnType<typeof getConfig>} config - Application configuration with agent settings and feature flags
 */
interface ConversationContext {
  env: Env;
  config: ReturnType<typeof getConfig>;
}

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

/**
 * Processes new one-to-one messages from a list of conversations, generating AI responses and sending them back.
 *
 * @param {ConversationContext} context - Environment and configuration context required for message processing
 * @param {DirectCastConversation[]} conversations - An array of one-to-one conversations containing messages to process.
 * @return {Promise<void>} A Promise that resolves when all conversations are processed, or rejects on errors.
 */
async function handleNewOneToOneMessages(
  context: ConversationContext,
  conversations: DirectCastConversation[]
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
 * Handles mentions in group conversations by processing messages from users and generating appropriate AI responses.
 *
 * @param {ConversationContext} context - Environment and configuration context required for group message processing
 * @param {DirectCastConversation[]} conversations - A list of conversations to process, including message and sender details.
 * @return {Promise<void>} A promise indicating the completion of mentions processing in group conversations.
 */
async function handleNewMentionsInGroups(
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
 * Processes a single one-to-one conversation by fetching messages, generating AI responses, and sending replies.
 *
 * @param {ConversationContext} context - Environment and configuration context required for conversation processing
 * @param {string} conversationId - The unique identifier of the conversation to process
 * @return {Promise<void>} A promise that resolves when the conversation has been processed
 */
export async function processOneToOneConversation(
  context: ConversationContext,
  conversationId: string
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
    conversationId
  );

  const { participants } = await fetchLilNounsConversationParticipants(
    context,
    conversationId
  );

  // If no messages found, skip this conversation or if the last message is from the agent
  if (last(messages)?.senderFid === config.agent.fid) {
    conversationLogger.debug(
      { agentFid: config.agent.fid },
      'Skipping conversation already handled by the agent'
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
      join('\n')
    )
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
            : `${agentSystemMessage}\nRELEVANT CONTEXT:\n${contextText}`,
        },
        // The actual message content to respond to
        ...pipe(
          messages,
          takeLast(10),
          map(m => ({
            role: m.senderFid === config.agent.fid ? 'assistant' : 'user',
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

  conversationLogger.debug({ response }, 'AI generated response');

  // Prepare a plain text message without Markdown
  const messageContent = stripMarkdown(response ?? "I don't know");

  conversationLogger.debug(
    { messageContent },
    'Sending message to conversation'
  );

  // Send the AI-generated response back to the conversation on Farcaster
  if (config.agent.features.sendDirectMessagesToOneToOneConversations) {
    const { error } = await sendDirectCast({
      auth: () => config.farcasterApiKey,
      body: {
        recipientFid: Number(
          pipe(
            participants,
            filter(p => p.fid !== config.agent.fid),
            first<Participant[]>
          )?.fid ?? 0
        ),
        idempotencyKey: crypto.randomUUID(),
        message: messageContent,
      },
    });

    if (error) {
      conversationLogger.error(
        { error },
        'Error sending message to conversation'
      );
    } else {
      conversationLogger.info('Message sent successfully');
    }
  } else {
    conversationLogger.info(
      {
        messageContent,
        recipientFid: Number(
          pipe(
            participants,
            filter(p => p.fid !== config.agent.fid),
            first<Participant[]>
          )?.fid ?? 0
        ),
        idempotencyKey: crypto.randomUUID(),
      },
      'Would send direct cast message to one-to-one conversation (not actually sent)'
    );
  }
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
