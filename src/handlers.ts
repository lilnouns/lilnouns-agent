import {
  type DirectCastMessage,
  sendDirectCastMessage,
} from '@nekofar/warpcast';
import { DateTime } from 'luxon';
import { filter, flatMap, join, last, map, pipe } from 'remeda';
import { getConfig } from './config';
import {
  fetchLilNounsRelatedMessages,
  fetchUnreadMentionsInGroups,
} from './farcaster';
import { agentSystemMessage } from './prompts';
import {
  aiTools,
  fetchActiveProposals,
  fetchCurrentAuction,
  fetchLilNounsProposalSummary,
  fetchLilNounsProposalsState,
  fetchLilNounsTokenTotalSupply,
  getCurrentIsoDateTimeUtc,
} from './tools';
import { stripMarkdown } from './utils/text';

async function generateContextText(
  env: Env,
  config: ReturnType<typeof getConfig>,
  directCastMessage: DirectCastMessage
) {
  // Search for relevant context using AutoRAG based on the user's directCastMessage content
  const answer = await env.AI.autorag(config.agent.autoRagId).search({
    query: directCastMessage.message,
    rewrite_query: false,
    max_num_results: 2,
    ranking_options: {
      score_threshold: 0.3,
    },
  });

  const contextContent = pipe(
    answer.data,
    flatMap(i => i.content),
    contents => filter(contents, c => c.type === 'text'),
    texts => map(texts, c => c.text),
    join('\n')
  );

  return contextContent;
}

async function processToolCalls(
  env: Env,
  config: ReturnType<typeof getConfig>,
  message: DirectCastMessage
) {
  const toolsMessage = [];

  // Generate AI response using Cloudflare AI with a specific system prompt
  const { tool_calls } = await env.AI.run(
    config.agent.aiModels.functionCalling,
    {
      max_tokens: config.agent.maxTokens,
      messages: [
        { role: 'system', content: agentSystemMessage },
        // The actual message content to respond to
        { role: 'user', content: message.message },
      ],
      tools: aiTools,
    },
    {
      gateway: {
        id: config.agent.gatewayId,
        skipCache: false,
        cacheTtl: config.agent.cacheTtl,
      },
    }
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
        case 'fetchLilNounsTokenTotalSupply': {
          const { totalSupply } = await fetchLilNounsTokenTotalSupply(config);
          toolsMessage.push({
            role: 'tool',
            name: toolCall.name,
            content: JSON.stringify({ totalSupply }),
          });
          break;
        }
        case 'getCurrentIsoDateTimeUtc': {
          const currentDateTime = getCurrentIsoDateTimeUtc();
          toolsMessage.push({
            role: 'tool',
            name: toolCall.name,
            content: JSON.stringify({ currentDateTime }),
          });
          break;
        }
        case 'fetchLilNounsProposalSummary': {
          const { proposalId } = toolCall?.arguments as {
            proposalId: number;
          };

          if (!proposalId) {
            console.log(
              `[DEBUG] fetchLilNounsProposalSummary tool call missing required argument: proposalId`
            );
          }

          const { proposal } = await fetchLilNounsProposalSummary(
            config,
            proposalId ?? 0
          );

          const response = await env.AI.run(
            config.agent.aiModels.summarization,
            {
              input_text: `# ${proposal?.title}${proposal?.description}`,
              max_length: 200,
            },
            {
              gateway: {
                id: config.agent.gatewayId,
                skipCache: false,
                cacheTtl: config.agent.cacheTtl,
              },
            }
          );

          toolsMessage.push({
            role: 'tool',
            name: toolCall.name,
            content: JSON.stringify({
              proposal: { ...proposal, description: response.summary },
            }),
          });
          break;
        }
        case 'fetchLilNounsProposalsState': {
          const { proposalId } = toolCall?.arguments as {
            proposalId: number;
          };

          if (!proposalId) {
            console.log(
              `[DEBUG] fetchProposalsState tool call missing required argument: proposalId`
            );
          }

          const result = await fetchLilNounsProposalsState(
            config,
            proposalId ?? 0
          );

          toolsMessage.push({
            role: 'tool',
            name: toolCall.name,
            content: JSON.stringify(result),
          });
          break;
        }
        default:
          console.log(`[DEBUG] Unhandled tool call: ${toolCall.name}`);
          break;
      }
    }
  }

  return toolsMessage;
}

async function processGroupConversations(env: Env) {
  console.log('[DEBUG] Starting processGroupConversations');

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

      const toolsMessage = await processToolCalls(env, config, message);

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

// Main function that processes all conversations with unread mentions
export async function processConversations(env: Env) {
  return Promise.all([processGroupConversations(env)]);
}
