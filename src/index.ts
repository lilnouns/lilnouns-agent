import {
  getDirectCastConversationRecentMessages,
  getDirectCastInbox,
  sendDirectCastMessage,
} from '@nekofar/warpcast';
import { DateTime } from 'luxon';
import { filter, last, pipe, sortBy } from 'remeda';
import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { getConfig } from './config';
import { agentSystemMessage } from './prompts';
import { aiTools, fetchActiveProposals, fetchCurrentAuction } from './tools';

export function createWagmiConfig(config: ReturnType<typeof getConfig>) {
  const wagmiConfig = createConfig({
    chains: [mainnet],
    transports: { [mainnet.id]: http(config.ethereumRpcUrl) },
  });

  return wagmiConfig;
}

// Retrieves group conversations with unread mentions for the Lil Nouns bot
async function retrieveUnreadMentionsInGroups(
  config: ReturnType<typeof getConfig>
) {
  console.log('[DEBUG] Starting retrieveUnreadMentionsInGroups');
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
async function retrieveLilNounsRelatedMessages(
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

// Main function that processes all conversations with unread mentions
async function processConversations(env: Env) {
  console.log('[DEBUG] Starting processConversations');

  const config = getConfig(env);

  // Retrieve the last processed timestamp (or epoch if none)
  const lastRetrievalKey = config.agent.cacheKeys.lastFetch;
  const fallbackDate = config.agent.defaults.fallbackDate;
  const lastRetrievalDate =
    (await env.AGENT_CACHE.get(lastRetrievalKey)) ?? fallbackDate;
  const lastRetrievalTime = DateTime.fromISO(lastRetrievalDate)
    .toUTC()
    .toMillis();

  // Gateway configuration for AI model calls:
  const gatewayConfig = {
    gateway: {
      id: config.agent.gatewayId,
      skipCache: false,
      cacheTtl: config.agent.cacheTtl,
    },
  };

  const { conversations } = await retrieveUnreadMentionsInGroups(config); // Get conversations to process
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
    const messages = await retrieveLilNounsRelatedMessages(
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
      const toolsMessage = [];

      // Generate AI response using Cloudflare AI with specific system prompt
      const { tool_calls } = await env.AI.run(
        config.agent.aiModel,
        {
          max_tokens: config.agent.maxTokens,
          messages: [
            ...[agentSystemMessage],
            {
              role: 'user',
              content: message.message, // The actual message content to respond to
            },
          ],
          tools: aiTools,
        },
        { ...gatewayConfig }
      );

      console.log(
        `[DEBUG] AI tool_calls:`,
        tool_calls ? JSON.stringify(tool_calls) : 'none'
      );

      // Handle any tool calls made by the AI (e.g., fetching proposals)
      // Process any tool calls requested by the AI, such as fetching current proposal information
      // This allows the AI to access real-time data about Lil Nouns governance when needed
      if (tool_calls !== undefined) {
        for (const toolCall of tool_calls) {
          switch (toolCall.name) {
            case 'fetchLilNounsActiveProposals': {
              const { proposals } = await fetchActiveProposals(config);
              toolsMessage.push({
                role: 'tool',
                name: toolCall.name,
                content: JSON.stringify({ proposals }),
              });
              break;
            }
            case 'fetchLilNounsCurrentAuction': {
              const { auction } = await fetchCurrentAuction(config);
              toolsMessage.push({
                role: 'tool',
                name: toolCall.name,
                content: JSON.stringify({ auction }),
              });
              break;
            }
            default:
              break;
          }
        }
      }

      // Generate a final AI response incorporating any tool call results
      const { response } = await env.AI.run(
        config.agent.aiModel,
        {
          messages: [
            ...[agentSystemMessage],
            {
              role: 'user',
              content: message.message, // The actual message content to respond to
            },
            ...toolsMessage,
          ],
        },
        { ...gatewayConfig }
      );

      console.log(`[DEBUG] AI response: "${response}"`);

      // Send response back to the conversation (currently commented out)
      // Send the AI-generated response back to the conversation on Farcaster
      // Includes the original message ID for proper threading and mentions the original sender
      const { error, data } = await sendDirectCastMessage({
        auth: () => config.farcasterAuthToken,
        body: {
          conversationId,
          recipientFids: [message.senderFid],
          messageId: crypto.randomUUID().replace(/-/g, ''),
          type: 'text',
          message: response ?? "I don't know",
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

export default {
  // Handle regular HTTP requests (used for testing scheduled functions)
  async fetch(req) {
    const url = new URL(req.url);
    url.pathname = '/__scheduled'; // Redirect to scheduled endpoint
    url.searchParams.append('cron', '* * * * *'); // Add cron parameter
    return new Response(
      `To test the scheduled handler, ensure you have used the "--test-scheduled" then try running "curl ${url.href}".`
    );
  },

  // The scheduled handler runs at intervals defined in wrangler.jsonc triggers
  async scheduled(event, env, ctx): Promise<void> {
    console.log(
      `[DEBUG] Lil Nouns Agent scheduled task executed at: ${new Date().toISOString()}`
    );
    try {
      await processConversations(env); // Process all relevant conversations
      console.log(`[DEBUG] Scheduled task completed successfully`);
    } catch (error) {
      console.error(`[ERROR] Scheduled task failed:`, error);
    }
  },
} satisfies ExportedHandler<Env>;
