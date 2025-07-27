import { sendDirectCastMessage } from '@nekofar/warpcast';
import { DateTime } from 'luxon';
import { filter, last, pipe } from 'remeda';
import { generateContextText, handleAiToolCalls } from './ai';
import { getConfig } from './config';
import {
  fetchLilNounsConversationMessages,
  fetchLilNounsOneToOneConversations,
  fetchLilNounsRelatedMessages,
  fetchUnreadMentionsInGroups,
} from './farcaster';
import { agentSystemMessage } from './prompts';
import { stripMarkdown } from './utils/text';

async function handleNewMentionsInGroups(env: Env) {
  console.log('[DEBUG] Starting handleNewMentionsInGroups');

  const config = getConfig(env);

  // Retrieve the last processed timestamp (or epoch if none)
  const lastRetrievalKey = config.agent.cacheKeys.lastFetch;
  const fallbackDate = config.agent.defaults.fallbackDate;
  const lastRetrievalDate =
    (await env.AGENT_CACHE.get(lastRetrievalKey)) ?? fallbackDate;
  const lastRetrievalTime = DateTime.fromISO(lastRetrievalDate)
    .toUTC()
    .toMillis();

  const { conversations } = await fetchUnreadMentionsInGroups(config); // Get conversations to process
  console.log(
    `[DEBUG] Last retrieval time: ${new Date(lastRetrievalTime).toISOString()}`
  );
  const filteredConversations = pipe(
    conversations,
    filter(c => (c.lastMessage?.serverTimestamp ?? 0) > lastRetrievalTime)
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
      filter(m => (m.serverTimestamp ?? 0) > lastRetrievalTime)
    );
    console.log(
      `[DEBUG] Found ${filteredMessages.length} unprocessed messages in conversation`
    );

    // Process each relevant message
    for (const message of filteredMessages) {
      console.log(
        `[DEBUG] Processing message: ${message.messageId} from sender: ${message.senderFid}`
      );
      const contextText = await generateContextText(env, config, message);

      const toolsMessage = await handleAiToolCalls(env, config, message);

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
    await env.AGENT_CACHE.put(
      lastRetrievalKey,
      formattedLastMessageDate ?? fallbackDate
    );
  } else {
    console.log(
      `[DEBUG] No last conversation found, keeping last retrieval date: ${lastRetrievalDate}`
    );
  }
}

async function handleNewOneToOneMessages(env: Env) {
  console.log('[DEBUG] Starting handleNewOneToOneMessages');

  const config = getConfig(env);

  // Retrieve the last processed timestamp (or epoch if none)
  const lastRetrievalKey = config.agent.cacheKeys.lastFetch;
  const fallbackDate = config.agent.defaults.fallbackDate;
  const lastRetrievalDate =
    (await env.AGENT_CACHE.get(lastRetrievalKey)) ?? fallbackDate;
  const lastRetrievalTime = DateTime.fromISO(lastRetrievalDate)
    .toUTC()
    .toMillis();

  // Fetch all conversations with unread messages
  const { conversations } = await fetchLilNounsOneToOneConversations(config);
  console.log(
    `[DEBUG] Last retrieval time: ${new Date(lastRetrievalTime).toISOString()}`
  );
  const filteredConversations = pipe(
    conversations,
    filter(c => (c.lastMessage?.serverTimestamp ?? 0) > lastRetrievalTime)
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
      filter(m => (m.serverTimestamp ?? 0) > lastRetrievalTime)
    );

    console.log(
      `[DEBUG] Found ${filteredMessages.length} unprocessed messages in conversation`
    );

    // Process each relevant message
    for (const message of filteredMessages) {
      console.log(
        `[DEBUG] Processing message: ${message.messageId} from sender: ${message.senderFid}`
      );
      const contextText = await generateContextText(env, config, message);

      const toolsMessage = await handleAiToolCalls(env, config, message);

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

// Main function that processes all conversations with unread mentions
export async function handleGroupConversations(env: Env) {
  return Promise.all([
    handleNewMentionsInGroups(env),
    handleNewOneToOneMessages(env),
  ]);
}
