import { sendDirectCast, sendDirectCastMessage } from '@nekofar/warpcast';
import { DateTime } from 'luxon';
import {
  filter,
  flatMap,
  isNot,
  isTruthy,
  join,
  last,
  map,
  pipe,
  take,
} from 'remeda';
import { generateContextText, handleAiToolCalls } from './ai';
import { getLastFetchTime, setLastFetchTime } from './cache';
import { getConfig } from './config';
import {
  fetchLilNounsConversationMessages,
  fetchLilNounsRelatedMessages,
  fetchLilNounsUnreadConversations,
  fetchUnreadMentionsInGroups,
} from './farcaster';
import { agentSystemMessage } from './prompts';
import { stripMarkdown } from './utils/text';

async function handleNewMentionsInGroups(env: Env) {
  console.log('[DEBUG] Starting handleNewMentionsInGroups');

  const config = getConfig(env);
  const lastFetchTime = await getLastFetchTime(env, config);

  const { conversations } = await fetchUnreadMentionsInGroups(config); // Get conversations to process
  console.log(
    `[DEBUG] Last retrieval time: ${new Date(lastFetchTime).toISOString()}`
  );
  const filteredConversations = pipe(
    conversations,
    filter(c => (c.lastMessage?.serverTimestamp ?? 0) > lastFetchTime)
  );
  console.log(
    `[DEBUG] Filtered to ${filteredConversations.length} new conversations since last check`
  );

  // Process each conversation individually
  for (const { conversationId } of filteredConversations) {
    console.log(`[DEBUG] Processing conversation: ${conversationId}`);
    // Get Lil Nouns related messages from this conversation
    const messages = await fetchLilNounsRelatedMessages(config, conversationId);
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

  const lastConversation = last(filteredConversations);

  if (lastConversation?.lastMessage?.serverTimestamp) {
    const formattedLastMessageDate = DateTime.fromMillis(
      Number(lastConversation.lastMessage.serverTimestamp)
    ).toISO();
    console.log(
      `[DEBUG] Updating last retrieval date to: ${formattedLastMessageDate}`
    );
    await setLastFetchTime(env, config, formattedLastMessageDate);
  } else {
    console.log(
      `[DEBUG] No last conversation found, keeping last retrieval date: ${lastFetchTime}`
    );
  }
}

async function handleNewOneToOneMessages(env: Env) {
  console.log('[DEBUG] Starting handleNewOneToOneMessages');

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

  // Filter conversations to only include those with new messages since last retrieval
  const filteredConversations = pipe(
    conversations,
    filter(
      c =>
        isNot(isTruthy)(c.isGroup) &&
        Number(c.lastMessage?.serverTimestamp ?? 0n) > lastFetchTime
    )
  );
  console.log(
    `[DEBUG] Filtered to ${filteredConversations.length} new conversations since last check`
  );

  // Process each conversation individually
  for (const { conversationId } of filteredConversations) {
    console.log(`[DEBUG] Processing conversation: ${conversationId}`);

    const { messages } = await fetchLilNounsConversationMessages(
      config,
      conversationId
    );

    const filteredMessages = pipe(
      messages,
      filter(m => Number(m.serverTimestamp ?? 0n) > lastFetchTime),
      take(10)
    );

    console.log(
      `[DEBUG] Found ${filteredMessages.length} unprocessed messages in conversation`
    );

    // Generate context text from message content using AutoRAG search
    const contextText = await generateContextText(
      env,
      config,
      pipe(
        filteredMessages,
        flatMap(m => m.message),
        join('\n')
      )
    );

    // Process AI tool calls with conversation messages formatted as assistant/user roles
    const formattedMessages = pipe(
      filteredMessages,
      map(m => {
        return {
          role: m.senderFid === config.agent.fid ? 'assistant' : 'user',
          content: m.message,
        };
      })
    );

    const toolsMessage = await handleAiToolCalls(
      env,
      config,
      formattedMessages
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
          ...formattedMessages,
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
        recipientFid: Number(conversationId.split('-')[1]),
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
}

// Main function that processes all conversations with unread mentions
export async function handleGroupConversations(env: Env) {
  // handleNewMentionsInGroups(env),
  await handleNewOneToOneMessages(env);
}
