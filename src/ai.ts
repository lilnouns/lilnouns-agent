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
} from './tools';

export async function generateContextText(
  env: Env,
  config: ReturnType<typeof getConfig>,
  query: string
) {
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
    join('\n')
  );

  logger.debug(
    { contentLength: contextContent.length },
    'Generated context content'
  );

  return contextContent;
}

export async function handleAiToolCalls(
  env: Env,
  config: ReturnType<typeof getConfig>,
  messages: { role: string; content: string }[]
) {
  const logger = createLogger(env).child({
    module: 'ai',
    function: 'handleAiToolCalls',
  });
  const toolsMessage = [];

  // Generate AI response using Cloudflare AI with a specific system prompt
  const { tool_calls } = await env.AI.run(
    config.agent.aiModels.functionCalling,
    {
      max_tokens: config.agent.maxTokens,
      messages: [{ role: 'system', content: agentSystemMessage }, ...messages],
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

  logger.debug(
    { tool_calls: tool_calls ? JSON.stringify(tool_calls) : 'none' },
    'AI tool calls result'
  );

  // Handle any tool calls made by the AI (e.g., fetching proposals)
  // Process any tool calls requested by the AI, such as fetching current proposal information
  // This allows the AI to access real-time data about Lil Nouns governance when needed
  if (tool_calls !== undefined) {
    for (const toolCall of tool_calls) {
      switch (toolCall.name) {
        case 'fetchLilNounsActiveProposals': {
          const { proposals } = await fetchActiveProposals(env, config);
          toolsMessage.push({
            role: 'tool',
            name: toolCall.name,
            content: JSON.stringify({ proposals }),
          });
          break;
        }
        case 'fetchLilNounsCurrentAuction': {
          const { auction } = await fetchCurrentAuction(env, config);
          toolsMessage.push({
            role: 'tool',
            name: toolCall.name,
            content: JSON.stringify({ auction }),
          });
          break;
        }
        case 'fetchLilNounsTokenTotalSupply': {
          const { totalSupply } = await fetchLilNounsTokenTotalSupply(
            env,
            config
          );
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
            logger.debug(
              'fetchLilNounsProposalSummary tool call missing required argument: proposalId'
            );
          }

          const { proposal } = await fetchLilNounsProposalSummary(
            env,
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
            logger.debug(
              'fetchProposalsState tool call missing required argument: proposalId'
            );
          }

          const result = await fetchLilNounsProposalsState(
            env,
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
          logger.debug({ toolName: toolCall.name }, 'Unhandled tool call');
          break;
      }
    }
  }

  return toolsMessage;
}
