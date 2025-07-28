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
  join,
  last,
  map,
  partition,
  pipe,
  takeLast,
} from 'remeda';
import { generateContextText, handleAiToolCalls } from './ai';
import { getLastFetchTime, setLastFetchTime } from './cache';
import { getConfig } from './config';
import {
  fetchLilNounsConversationMessages,
  fetchLilNounsConversationParticipants,
  fetchLilNounsUnreadConversations,
} from './farcaster';
import { createLogger } from './logger';
import { agentSystemMessage } from './prompts';
import { stripMarkdown } from './utils/text';

/**
 * Handles processing of unread conversations, segregating them into group and one-to-one chats,
 * and processing messages accordingly. Updates the last fetch timestamp after successful processing.
 *
 * @param {Env} env - The environment object containing configuration and dependencies.
 * @return {Promise<void>} Resolves when all unread conversations have been processed successfully.
 */
export async function handleUnreadConversations(env: Env) {
  const logger = createLogger(env).child({
    module: 'handlers',
    function: 'handleUnreadConversations',
  });
  logger.debug('Starting to process unread conversations');

  const config = getConfig(env);
  const lastFetchTime = await getLastFetchTime(env, config);

  // Fetch all conversations with unread messages
  const { conversations } = await fetchLilNounsUnreadConversations(env, config);

  // Process each conversation individually
  const [groups, chats] = pipe(
    conversations,
    partition(c => c.isGroup)
  );

  logger.debug(
    { groupCount: groups.length, chatCount: chats.length },
    'Processing group and one-to-one conversations'
  );

  // Handle new mentions in groups conversations
  await handleNewMentionsInGroups(env, config, lastFetchTime, groups);

  // Handle new messages in one-to-one conversations
  await handleNewOneToOneMessages(env, config, lastFetchTime, chats);

  // Update the last fetch timestamp to current time for next iteration
  await setLastFetchTime(env, config, DateTime.now().toISO());
}

/**
 * Processes new one-to-one messages from a list of conversations, generating AI responses and sending them back.
 *
 * @param {Env} env - The environment configuration required to process the messages.
 * @param {Object} config - The result of the `getConfig` function providing configuration for the agent and services.
 * @param {number} lastFetchTime - The timestamp of the last message fetch, used to filter new messages.
 * @param {DirectCastConversation[]} conversations - An array of one-to-one conversations containing messages to process.
 * @return {Promise<void>} A Promise that resolves when all conversations are processed, or rejects on errors.
 */
async function handleNewOneToOneMessages(
  env: Env,
  config: ReturnType<typeof getConfig>,
  lastFetchTime: number,
  conversations: DirectCastConversation[]
) {
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

    // Fetch messages from this conversation
    const { messages } = await fetchLilNounsConversationMessages(
      env,
      config,
      conversationId
    );

    const { participants } = await fetchLilNounsConversationParticipants(
      env,
      config,
      conversationId
    );

    // If no messages found, skip this conversation or if the last message is from the agent
    if (last(messages)?.senderFid === config.agent.fid) {
      conversationLogger.debug(
        { agentFid: config.agent.fid },
        'Skipping conversation already handled by the agent'
      );
      continue;
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
            content: !contextText
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
  }

  logger.info('Completed processing one-to-one messages');
}

/**
 * Handles mentions in group conversations by processing messages from users and generating appropriate AI responses.
 *
 * @param {Env} env - The environment object containing application-specific utilities and configurations.
 * @param {object} config - The application configuration object, derived from the `getConfig` function, including agent credentials and settings.
 * @param {number} lastFetchTime - The timestamp representing the last time messages were fetched and processed.
 * @param {DirectCastConversation[]} conversations - A list of conversations to process, including message and sender details.
 * @return {Promise<void>} A promise indicating the completion of mentions processing in group conversations.
 */
async function handleNewMentionsInGroups(
  env: Env,
  config: ReturnType<typeof getConfig>,
  lastFetchTime: number,
  conversations: DirectCastConversation[]
) {
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

    // Fetch messages from this conversation
    const { messages } = await fetchLilNounsConversationMessages(
      env,
      config,
      conversationId
    );

    conversationLogger.debug(
      { messageCount: messages.length },
      'Found unprocessed messages in conversation'
    );

    // Group messages by participants, excluding the agent's own messages
    const messageGroups = pipe(
      messages,
      filter(m => m.senderFid !== config.agent.fid),
      groupByProp('senderFid')
    );

    conversationLogger.debug(
      { groupCount: Object.keys(messageGroups).length },
      'Grouped messages by sender'
    );

    for (const [senderFid, senderMessages] of entries(messageGroups)) {
      const messageLogger = conversationLogger.child({
        senderFid,
        messageCount: senderMessages.length,
      });
      messageLogger.debug('Processing messages for sender');

      const contextText = await generateContextText(
        env,
        config,
        pipe(
          messages,
          filter(m => Number(m.serverTimestamp ?? 0n) > lastFetchTime),
          filter(m => m.senderFid === Number(senderFid)),
          flatMap(m => m.message),
          join('\n')
        )
      );

      const toolsMessage = await handleAiToolCalls(
        env,
        config,
        pipe(
          messages,
          filter(m => Number(m.serverTimestamp ?? 0n) > lastFetchTime),
          filter(m => m.senderFid === Number(senderFid)),
          map(m => ({
            role: 'user',
            content: m.message,
          }))
        )
      );

      // Process each relevant message
      for (const message of senderMessages) {
        const messageLogger = conversationLogger.child({
          messageId: message.messageId,
          senderFid: message.senderFid,
        });
        messageLogger.debug('Processing message');

        // Generate a final AI response incorporating any tool call results
        const { response } = await env.AI.run(
          config.agent.aiModels.functionCalling,
          {
            max_tokens: config.agent.maxTokens,
            messages: [
              {
                role: 'system',
                content: !contextText
                  ? agentSystemMessage
                  : `${agentSystemMessage}\nHere is some context from relevant documents:\n${contextText}`,
              },
              // The actual message content to respond to
              ...pipe(
                messages,
                filter(m => m.senderFid === Number(senderFid)),
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
        const { error, data } = await sendDirectCastMessage({
          auth: () => config.farcasterAuthToken,
          body: {
            conversationId,
            recipientFids: [Number(senderFid)],
            messageId: crypto.randomUUID().replace(/-/g, ''),
            type: 'text',
            message: messageContent,
            inReplyToId: message.messageId,
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
      }
    }
  }
}
