import {
  type DirectCastConversation,
  type User as Participant,
  sendDirectCast,
  sendDirectCastMessage,
} from '@nekofar/warpcast';
import { DateTime } from 'luxon';
import {
  filter,
  first,
  flatMap,
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
  fetchLilNounsRelatedMessages,
  fetchLilNounsUnreadConversations,
} from './farcaster';
import { createLogger } from './logger';
import { agentSystemMessage } from './prompts';
import { stripMarkdown } from './utils/text';

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
  // await handleNewMentionsInGroups(env, config, lastFetchTime, groups);

  // Handle new messages in one-to-one conversations
  await handleNewOneToOneMessages(env, config, lastFetchTime, chats);

  // Update the last fetch timestamp to current time for next iteration
  await setLastFetchTime(env, config, DateTime.now().toISO());
}

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
            map(m => {
              return {
                role: m.senderFid === config.agent.fid ? 'assistant' : 'user',
                content: m.message,
              };
            })
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

    // Prepare a plain text message without markdown
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
        idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
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

    // Get Lil Nouns related messages from this conversation
    const { messages } = await fetchLilNounsRelatedMessages(
      env,
      config,
      conversationId
    );

    // Filter messages to only include those since last retrieval
    const filteredMessages = pipe(
      messages,
      filter(m => (m.serverTimestamp ?? 0) > lastFetchTime)
    );

    conversationLogger.debug(
      { messageCount: filteredMessages.length },
      'Found unprocessed messages in conversation'
    );

    // Process each relevant message
    for (const message of filteredMessages) {
      const messageLogger = conversationLogger.child({
        messageId: message.messageId,
        senderFid: message.senderFid,
      });
      messageLogger.debug('Processing message');

      const contextText = await generateContextText(
        env,
        config,
        message.message
      );

      const toolsMessage = await handleAiToolCalls(env, config, [
        {
          role: message.senderFid === config.agent.fid ? 'assistant' : 'user',
          content: message.message,
        },
      ]);

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
            { role: 'user', content: message.message },
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

      // Prepare plain text message without markdown
      const messageContent = stripMarkdown(response ?? "I don't know");

      // Send the AI-generated response back to the conversation on Farcaster
      // Includes the original message ID for proper threading and mentions the original sender
      const { error, data } = await sendDirectCastMessage({
        auth: () => config.farcasterAuthToken,
        body: {
          conversationId,
          recipientFids: [message.senderFid],
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
