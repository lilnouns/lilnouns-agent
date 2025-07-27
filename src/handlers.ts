import {
  type DirectCastConversation,
  sendDirectCast,
  sendDirectCastMessage,
} from '@nekofar/warpcast';
import { DateTime } from 'luxon';
import {
  filter,
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
  fetchLilNounsRelatedMessages,
  fetchLilNounsUnreadConversations,
} from './farcaster';
import { agentSystemMessage } from './prompts';
import { stripMarkdown } from './utils/text';

export async function handleUnreadConversations(env: Env) {
  console.log('[DEBUG] Starting handleUnreadConversations');

  const config = getConfig(env);
  const lastFetchTime = await getLastFetchTime(env, config);

  console.log(
    `[DEBUG] Last retrieval time: ${new Date(lastFetchTime).toISOString()}`
  );

  // Fetch all conversations with unread messages
  const { conversations } = await fetchLilNounsUnreadConversations(config);

  console.log(
    `[DEBUG] Found ${conversations.length} conversations with unread messages`
  );

  // Process each conversation individually
  const [groups, chats] = pipe(
    conversations,
    partition(c => c.isGroup)
  );

  console.log(
    `[DEBUG] Processing ${groups.length} group conversations and ${chats.length} one-to-one conversations`
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
  console.log('[DEBUG] Starting handleNewOneToOneMessages');

  // Process each conversation individually
  for (const { conversationId } of conversations) {
    console.log(`[DEBUG] Processing conversation: ${conversationId}`);

    // Fetch messages from this conversation
    const { messages } = await fetchLilNounsConversationMessages(
      config,
      conversationId
    );

    // If no messages found, skip this conversation or if the last message is from the agent
    if (last(messages)?.senderFid === config.agent.fid) {
      console.log(
        `[DEBUG] Skipping conversation: ${conversationId} because it's already handled by the agent`
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

    // Handle tool calls for the messages
    const toolsMessage = await handleAiToolCalls(
      env,
      config,
      pipe(
        messages,
        filter(m => Number(m.serverTimestamp ?? 0n) > lastFetchTime),
        map(m => {
          return {
            role: m.senderFid === config.agent.fid ? 'assistant' : 'user',
            content: m.message,
          };
        })
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

    console.log(`[DEBUG] AI response: "${response}"`);

    // Prepare a plain text message without markdown
    const messageContent = stripMarkdown(response ?? "I don't know");

    console.log(`[DEBUG] Sending message: "${messageContent}"`);

    // Send the AI-generated response back to the conversation on Farcaster
    const { error } = await sendDirectCast({
      auth: () => config.farcasterApiKey,
      body: {
        recipientFid: Number(conversationId.split('-')[0]),
        idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
        message: messageContent,
      },
    });

    if (error) {
      console.log(`[DEBUG] Error sending message:`, error);
    } else {
      console.log(`[DEBUG] Message sent successfully.`);
    }
  }

  console.log('[DEBUG] Completed handleNewOneToOneMessages');
}

async function handleNewMentionsInGroups(
  env: Env,
  config: ReturnType<typeof getConfig>,
  lastFetchTime: number,
  conversations: DirectCastConversation[]
) {
  console.log('[DEBUG] Starting handleNewMentionsInGroups');

  // Process each conversation individually
  for (const { conversationId } of conversations) {
    console.log(`[DEBUG] Processing conversation: ${conversationId}`);

    // Get Lil Nouns related messages from this conversation
    const { messages } = await fetchLilNounsRelatedMessages(
      config,
      conversationId
    );

    // Filter messages to only include those since last retrieval
    const filteredMessages = pipe(
      messages,
      filter(m => (m.serverTimestamp ?? 0) > lastFetchTime)
    );

    console.log(
      `[DEBUG] Found ${filteredMessages.length} unprocessed messages in conversation`
    );

    // Process each relevant message
    for (const message of filteredMessages) {
      console.log(
        `[DEBUG] Processing message: ${message.messageId} from sender: ${message.senderFid}`
      );

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

      console.log(`[DEBUG] AI response: "${response}"`);

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
        console.log(`[DEBUG] Error sending message:`, error);
      } else {
        console.log(
          `[DEBUG] Message sent successfully, messageId: ${data?.result?.messageId}`
        );
      }
    }
  }
}
