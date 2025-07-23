import { readLilNounsAuctionFetchNextNoun } from '@nekofar/lilnouns/contracts';
import type { Query } from '@nekofar/lilnouns/subgraphs';
import {
  getDirectCastConversationRecentMessages,
  getDirectCastInbox,
  sendDirectCastMessage,
} from '@nekofar/warpcast';
import { gql, request } from 'graphql-request';
import { DateTime } from 'luxon';
import { filter, last, map, pipe, sortBy } from 'remeda';
import { formatEther } from 'viem';
import { createConfig, http } from 'wagmi';
import { getBlockNumber } from 'wagmi/actions';
import { mainnet } from 'wagmi/chains';

function createWagmiConfig(env: Env) {
  const wagmiConfig = createConfig({
    chains: [mainnet],
    transports: { [mainnet.id]: http(env.ETHEREUM_RPC_URL) },
  });

  return wagmiConfig;
}

// Retrieves group conversations with unread mentions for the Lil Nouns bot
async function retrieveUnreadMentionsInGroups(env: Env) {
  console.log('[DEBUG] Starting retrieveUnreadMentionsInGroups');
  // Fetch the DirectCast inbox using Farcaster authentication
  const { data, error, response } = await getDirectCastInbox({
    auth: () => env.FARCASTER_AUTH_TOKEN,
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
  env: Env,
  conversationId: string
) {
  console.log(
    `[DEBUG] Retrieving messages for conversation: ${conversationId}`
  );
  // Get recent messages from the specified conversation
  const { data, response, error } =
    await getDirectCastConversationRecentMessages({
      auth: () => env.FARCASTER_AUTH_TOKEN,
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
      const lilNounsFid = 20146; // Farcaster ID for the lilnouns account

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

async function fetchCurrentAuction(env: Env) {
  console.log('[DEBUG] Fetching current auction');

  const wagmiConfig = createWagmiConfig(env);
  const [nounId, seed, svg, price, hash, blockNumber] =
    await readLilNounsAuctionFetchNextNoun(wagmiConfig, {});

  const auction = {
    nounId: Number(nounId),
    price: `${formatEther(price)} ETH`,
  };

  console.log(
    '[DEBUG] Retrieved current auction: ',
    JSON.stringify(auction, null, 2)
  );

  return { auction };
}

async function fetchActiveProposals(env: Env) {
  console.log('[DEBUG] Fetching active proposals');
  const wagmiConfig = createWagmiConfig(env);
  const blockNumber = await getBlockNumber(wagmiConfig); // Get current Ethereum block number
  console.log(`[DEBUG] Current Ethereum block number: ${blockNumber}`);

  // Query the Lil Nouns subgraph for active proposals using current block number
  const { proposals } = await request<Query>(
    env.LILNOUNS_SUBGRAPH_URL,
    gql`
        query GetProposals($blockNumber: BigInt!) {
          proposals(
            orderBy: createdBlock,
            orderDirection: desc,
            where: {
              status_not_in: [CANCELLED],
              endBlock_gte: $blockNumber
            }
          ) {
            id
            title
            createdTimestamp
          }
        }
      `,
    { blockNumber: blockNumber.toString() }
  );

  // Format timestamps to ISO using luxon and remeda
  const formattedProposals = pipe(
    proposals,
    map(proposal => ({
      ...proposal,
      createdTimestamp: DateTime.fromSeconds(
        Number(proposal.createdTimestamp)
      ).toISO(),
    }))
  );

  console.log(
    `[DEBUG] Retrieved ${formattedProposals.length} active proposals`
  );
  return { proposals: formattedProposals };
}

// Main function that processes all conversations with unread mentions
async function processConversations(env: Env) {
  console.log('[DEBUG] Starting processConversations');
  // Retrieve the last processed timestamp (or epoch if none)
  const lastRetrievalKey = 'conversations:last-fetch';
  const fallbackDate = '1970-01-01T00:00:00.000Z';
  const lastRetrievalDate =
    (await env.AGENT_CACHE.get(lastRetrievalKey)) ?? fallbackDate;
  const lastRetrievalTime = DateTime.fromISO(lastRetrievalDate)
    .toUTC()
    .toMillis();

  // Define the AI system message that establishes the bot's personality and guidelines
  const systemMessage = {
    role: 'system',
    content: [
      'You are Lil Nouns Agent, an expert assistant for Lil Nouns DAO governance, proposals, community engagement, and technical questions.',
      '',
      'CORE GUIDELINES:',
      '• Stay strictly within Lil Nouns DAO topics (governance, proposals, auctions, community, tech stack)',
      '• Provide accurate, helpful information with a friendly, engaging tone',
      '• Keep responses concise: ≤2 sentences or 50 words maximum',
      '• Use tools when real-time data is needed (proposals, auctions)',
      '',
      'OFF-TOPIC RESPONSES (choose one randomly):',
      '• "Sorry, I only handle Lil Nouns DAO topics! How can I help with governance or proposals?"',
      '• "That\'s outside my Lil Nouns expertise. Got questions about the DAO or current auctions?"',
      '• "I focus on Lil Nouns DAO only. Need help with proposals, voting, or community info?"',
      '• "Oops, I\'m tuned specifically for Lil Nouns DAO! What can I help you with regarding governance?"',
      '',
      'COMMON ACTIONS:',
      '• Voting/reviewing proposals: "Visit lilnouns.camp or lilnouns.wtf to vote and review proposals."',
      '• Auction participation: "Join auctions at lilnouns.auction or lilnouns.wtf to bid on new Lil Nouns."',
      '• Community engagement: Direct users to official Discord, Twitter, or Farcaster channels.',
      '',
      'RESPONSE QUALITY:',
      '• If uncertain about facts: "I\'m not certain about that. Let me check the latest information."',
      '• For structured data: Return valid JSON format only',
      '• Be conversational but authoritative on DAO matters',
      '• Acknowledge when information might be time-sensitive',
    ].join('\n'),
  };

  // Gateway configuration for AI model calls:
  const gatewayConfig = {
    gateway: {
      id: 'lilnouns-agent',
      skipCache: false,
      cacheTtl: 3360, // Cache responses for performance
    },
  };

  const { conversations } = await retrieveUnreadMentionsInGroups(env); // Get conversations to process
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
    const messages = await retrieveLilNounsRelatedMessages(env, conversationId);
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
        '@hf/nousresearch/hermes-2-pro-mistral-7b',
        {
          max_tokens: 100,
          messages: [
            ...[systemMessage],
            {
              role: 'user',
              content: message.message, // The actual message content to respond to
            },
          ],
          tools: [
            {
              type: 'function',
              name: 'fetchLilNounsActiveProposals',
              description: 'Fetch Lil Nouns active proposals',
              parameters: {},
            },
            {
              type: 'function',
              name: 'fetchLilNounsCurrentAuction',
              description: 'Fetch Lil Nouns current auction',
              parameters: {},
            },
          ],
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
              const { proposals } = await fetchActiveProposals(env);
              toolsMessage.push({
                role: 'tool',
                name: toolCall.name,
                content: JSON.stringify({ proposals }),
              });
              break;
            }
            case 'fetchLilNounsCurrentAuction': {
              const { auction } = await fetchCurrentAuction(env);
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
        '@hf/nousresearch/hermes-2-pro-mistral-7b',
        {
          messages: [
            ...[systemMessage],
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
        auth: () => env.FARCASTER_AUTH_TOKEN,
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
