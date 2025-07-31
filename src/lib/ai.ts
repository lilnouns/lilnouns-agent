import type { RoleScopedChatInput } from '@cloudflare/workers-types';
import { filter, flatMap, join, map, pipe } from 'remeda';
import type { getConfig } from './config';
import { createLogger } from './logger';
import { agentSystemMessage } from './prompts';
import {
  aiTools,
  fetchActiveProposals,
  fetchCurrentAuction,
  fetchLilNounsProposalSummary,
  fetchLilNounsProposalsState,
  fetchLilNounsTokenTotalSupply,
  getCurrentIsoDateTimeUtc,
  getEthPrice,
} from './tools';

/**
 * Generates contextual text using AutoRAG based on a user query.
 *
 * Searches for relevant context using Cloudflare's AutoRAG service and returns
 * formatted text content that can be used to enhance AI responses.
 *
 * @param {Env} env - The environment object containing configuration and dependencies.
 * @param {ReturnType<typeof getConfig>} config - The configuration object with AutoRAG settings.
 * @param {string} query - The user query to search for relevant context.
 * @return {Promise<string>} A promise that resolves to the generated context text.
 */
export async function generateContextText(
  env: Env,
  config: ReturnType<typeof getConfig>,
  query: string,
): Promise<string> {
  const logger = createLogger(env).child({
    module: 'ai',
    function: 'generateContextText',
  });

  // If a query is empty, return empty context immediately
  if (!query || query.trim() === '') {
    logger.debug('Empty query provided, skipping context generation');
    return '';
  }

  logger.debug({ query }, 'Searching for relevant context using AutoRAG');
  // Search for relevant context using AutoRAG based on the user's directCastMessage content
  const answer = await env.AI.autorag(config.agent.autoRagId).search({
    query,
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
    join('\n'),
  );

  logger.debug(
    { contentLength: contextContent.length },
    'Generated context content',
  );

  return contextContent;
}

/**
 * Handles AI tool calls by processing messages and executing requested functions.
 *
 * Sends messages to the AI model with available tools, processes any tool calls
 * made by the AI (such as fetching proposals, auctions, or token data), and
 * returns the results formatted for further AI processing.
 *
 * @param {Env} env - The environment object containing configuration and dependencies.
 * @param {ReturnType<typeof getConfig>} config - The configuration object with AI model settings.
 * @param {Array<RoleScopedChatInput>} messages - Array of conversation messages to process.
 * @return {Promise<RoleScopedChatInput>} A promise that resolves to an array of tool response messages.
 */
export async function handleAiToolCalls(
  env: Env,
  config: ReturnType<typeof getConfig>,
  messages: RoleScopedChatInput[],
): Promise<RoleScopedChatInput[]> {
  const logger = createLogger(env).child({
    module: 'ai',
    function: 'handleAiToolCalls',
  });
  const toolsMessage: RoleScopedChatInput[] = [];

  try {
    // Generate AI response using Cloudflare AI with a specific system prompt
    const { tool_calls } = await env.AI.run(
      config.agent.aiModels.functionCalling,
      {
        max_tokens: config.agent.maxTokens,
        messages: [
          { role: 'system', content: agentSystemMessage },
          ...messages,
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

    logger.debug(
      { tool_calls: tool_calls ? JSON.stringify(tool_calls) : 'none' },
      'AI tool calls result',
    );

    // Handle any tool calls made by the AI (e.g., fetching proposals)
    // Process any tool calls requested by the AI, such as fetching current proposal information
    // This allows the AI to access real-time data about Lil Nouns governance when needed
    if (tool_calls !== undefined) {
      for (const toolCall of tool_calls) {
        try {
          switch (toolCall.name) {
            case 'fetchLilNounsActiveProposals': {
              const { proposals } = await fetchActiveProposals({ env, config });
              toolsMessage.push({
                role: 'tool',
                name: toolCall.name,
                content: JSON.stringify({ proposals }),
              });
              break;
            }
            case 'fetchLilNounsCurrentAuction': {
              const { auction } = await fetchCurrentAuction({ env, config });
              toolsMessage.push({
                role: 'tool',
                name: toolCall.name,
                content: JSON.stringify({ auction }),
              });
              break;
            }
            case 'fetchLilNounsTokenTotalSupply': {
              const { totalSupply } = await fetchLilNounsTokenTotalSupply({
                env,
                config,
              });
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
            case 'getEthPrice': {
              const { ethPrice } = await getEthPrice(env);
              toolsMessage.push({
                role: 'tool',
                name: toolCall.name,
                content: JSON.stringify({ ethPrice }),
              });
              break;
            }
            case 'fetchLilNounsProposalSummary': {
              const { proposalId } = toolCall?.arguments as {
                proposalId: number;
              };

              if (!proposalId) {
                logger.debug(
                  'fetchLilNounsProposalSummary tool call missing required argument: proposalId',
                );
                break; // Skip this tool call
              }

              const { proposal } = await fetchLilNounsProposalSummary(
                {
                  env,
                  config,
                },
                proposalId,
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
                },
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
                logger.debug(
                  'fetchProposalsState tool call missing required argument: proposalId',
                );
                break; // Skip this tool call
              }

              const result = await fetchLilNounsProposalsState(
                {
                  env,
                  config,
                },
                proposalId,
              );

              toolsMessage.push({
                role: 'tool',
                name: toolCall.name,
                content: JSON.stringify(result),
              });
              break;
            }
            default:
              logger.debug({ toolName: toolCall.name }, 'Unhandled tool call');
              break;
          }
        } catch (error) {
          logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              toolName: toolCall.name,
              toolArguments: toolCall.arguments,
            },
            'Tool call failed, skipping',
          );
        }
      }
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to generate AI tool calls',
    );
    // Return empty array if the initial AI call fails
    return [];
  }

  return toolsMessage;
}
