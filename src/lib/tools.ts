import type { AiTextGenerationToolInput } from '@cloudflare/workers-types';
import {
  readLilNounsAuctionFetchNextNoun,
  readLilNounsGovernorState,
  readLilNounsTokenTotalSupply,
} from '@nekofar/lilnouns/contracts';
import type { Query } from '@nekofar/lilnouns/subgraphs';
import { gql, request } from 'graphql-request';
import { DateTime } from 'luxon';
import { map, pipe } from 'remeda';
import { formatEther } from 'viem';
import { getBlockNumber } from 'wagmi/actions';
import type { getConfig } from './config';
import { createLogger } from './logger';
import { createWagmiConfig } from './wagmi';

// Add BigInt serialization support to JSON.stringify
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

// Only add the method if it doesn't exist yet
if (typeof BigInt.prototype.toJSON !== 'function') {
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };
}

// Type definition for CoinGecko API response
interface CoinGeckoResponse {
  ethereum: {
    usd: number;
  };
}

/**
 * AI tools configuration for function calling
 * Enhanced for better AI model detection and understanding
 */
export const aiTools: AiTextGenerationToolInput['function'][] = [
  {
    name: 'fetchLilNounsActiveProposals',
    description: [
      'Retrieve all currently active Lil Nouns DAO governance proposals that are open for voting.',
      'Returns proposals with their IDs, titles, creation timestamps, and direct links.',
      'Use this when users ask about current proposals, what to vote on, or active governance matters.',
    ].join(' '),
  },
  {
    name: 'fetchLilNounsProposalsState',
    description: [
      'Get the current on-chain governance state of a specific Lil Nouns proposal by its numeric ID.',
      'Returns both the numeric state value (0-8) and human-readable text',
      '(Pending, Active, Canceled, Defeated, Succeeded, Queued, Expired, Executed, Vetoed).',
      'Essential for checking if a proposal can still be voted on.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        proposalId: {
          type: 'number',
          description:
            'The unique numeric identifier of the proposal to check (e.g., 123, 456)',
        },
      },
      required: ['proposalId'],
    },
  },
  {
    name: 'fetchLilNounsCurrentAuction',
    description: [
      'Get real-time information about the currently active Lil Nouns NFT auction,',
      'including the Noun ID being auctioned, current highest bid price in ETH,',
      'and the auction website link. Use this when users ask about current auctions,',
      'bidding, or want to participate in auctions.',
    ].join(' '),
  },
  {
    name: 'fetchLilNounsTokenTotalSupply',
    description: [
      'Retrieve the total number of Lil Nouns NFT tokens that have been minted to date.',
      'This represents the complete collection size and is useful for statistics, collection information,',
      'or when users ask about how many Lil Nouns exist.',
    ].join(' '),
  },
  {
    name: 'fetchLilNounsProposalSummary',
    description: [
      'Get comprehensive details about a specific Lil Nouns governance proposal including title,',
      'AI-generated summary of the description, current status, creation timestamp, and direct link',
      'to the proposal page. Use this when users ask for details about a specific proposal or',
      'want to understand what a proposal is about.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        proposalId: {
          type: 'number',
          description:
            'The unique numeric identifier of the proposal to fetch detailed information for',
        },
      },
      required: ['proposalId'],
    },
  },
  {
    name: 'getCurrentIsoDateTimeUtc',
    description: [
      'Get the current date and time in ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ) in UTC timezone.',
      'Essential for timestamping responses, determining if proposals or auctions are still active,',
      'and providing time-sensitive information to users.',
    ].join(' '),
  },
  {
    name: 'getEthPrice',
    description: [
      'Get the current real-time price of Ethereum (ETH) in USD from CoinGecko API.',
      'Returns the current market price as a float value. Use this when users ask about ETH price,',
      'current Ethereum value, or need pricing information for calculations.',
    ].join(' '),
  },
];

/**
 * Provides essential environment and configuration context for tool operations.
 * This interface encapsulates the necessary dependencies for executing tools,
 * interacting with external APIs, and accessing blockchain data.
 *
 * @property {Env} env - The environment object containing runtime configurations and service connections
 * @property {ReturnType<typeof getConfig>} config - Application configuration with agent settings and feature flags
 */
interface ToolContext {
  env: Env;
  config: ReturnType<typeof getConfig>;
}

/**
 * Fetches the current auction data for Lil Nouns.
 *
 * @param {ToolContext} context - The context object containing environment and configuration.
 * @return {Promise<Object>} A promise that resolves to an object containing the current auction details.
 */
export async function fetchCurrentAuction(context: ToolContext) {
  const { env, config } = context;

  // Create a logger instance for this function
  const logger = createLogger(env).child({
    module: 'tools',
    function: 'fetchCurrentAuction',
  });

  logger.debug('Fetching current auction');

  const wagmiConfig = createWagmiConfig(config);
  const [nounId, , , price] = await readLilNounsAuctionFetchNextNoun(
    wagmiConfig,
    {},
  );

  const auction = {
    nounId: Number(nounId),
    price: `${formatEther(price)} ETH`,
    link: `https://lilnouns.auction`,
  };

  logger.debug({ auction }, 'Retrieved current auction');

  return { auction };
}

/**
 * Fetches active proposals from the Lil Nouns subgraph based on the current Ethereum block number.
 *
 * Active proposals are those that have not been canceled and have an ending block greater than or equal to the current block.
 * The retrieved proposals include their id, title, and creation timestamp, with timestamps formatted to ISO format.
 *
 * @param {ToolContext} context - The context object containing environment and configuration.
 * @return {Promise<{ proposals: Array<{ id: string, title: string, createdTimestamp: string, link: string }> }>} A promise that resolves to an object containing an array of active proposals. Each proposal includes its id, title, formatted creation timestamp, and a link to view the proposal.
 */
export async function fetchActiveProposals(context: ToolContext) {
  const { env, config } = context;

  // Create a logger instance for this function
  const logger = createLogger(env).child({
    module: 'tools',
    function: 'fetchActiveProposals',
  });

  logger.debug('Fetching active proposals');

  const wagmiConfig = createWagmiConfig(config);
  const blockNumber = await getBlockNumber(wagmiConfig); // Get the current Ethereum block number

  logger.debug({ blockNumber }, 'Current Ethereum block number');

  // Query the Lil Nouns subgraph for active proposals using the current block number
  const getProposalsQuery = gql`
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
  `;
  const { proposals } = await request<Query>(
    config.lilNounsSubgraphUrl,
    getProposalsQuery,
    { blockNumber: blockNumber.toString() },
  );

  // Format timestamps to ISO using luxon and remeda
  const formattedProposals = pipe(
    proposals,
    map(proposal => ({
      ...proposal,
      createdTimestamp: DateTime.fromSeconds(
        Number(proposal.createdTimestamp),
      ).toISO(),
      link: `https://lilnouns.camp/proposals/${proposal.id}`,
    })),
  );

  logger.debug(
    { proposalCount: formattedProposals.length },
    'Retrieved active proposals',
  );

  return { proposals: formattedProposals };
}

/**
 * Fetches the total supply of Lil Nouns tokens.
 *
 * @param {ToolContext} context - The context object containing environment and configuration.
 * @return {Promise<{ totalSupply: number }>} An object containing the total supply of tokens as a number.
 */
export async function fetchLilNounsTokenTotalSupply(context: ToolContext) {
  const { env, config } = context;

  // Create a logger instance for this function
  const logger = createLogger(env).child({
    module: 'tools',
    function: 'fetchLilNounsTokenTotalSupply',
  });

  logger.debug('Fetching token total supply');

  const wagmiConfig = createWagmiConfig(config);
  const totalSupply = await readLilNounsTokenTotalSupply(wagmiConfig, {});

  const formattedSupply = formatEther(totalSupply);
  logger.debug(
    { totalSupply: formattedSupply },
    'Retrieved token total supply',
  );

  return { totalSupply: Number(totalSupply) };
}

/**
 * Fetches the current real-time price of Ethereum (ETH) in USD from CoinGecko API.
 *
 * @param {Env} env - The environment object containing runtime configurations and service connections.
 * @return {Promise<{ ethPrice: number }>} A promise that resolves to an object containing the ETH price in USD as a float.
 * @throws {Error} When the API request fails or the response data is invalid.
 */
export async function getEthPrice(env: Env): Promise<{ ethPrice: number }> {
  const logger = createLogger(env).child({
    module: 'tools',
    function: 'getEthPrice',
  });

  logger.debug('Fetching ETH price from CoinGecko API');

  const maxRetries = 3;
  const retryDelay = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'lilnouns-agent/1.0',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as unknown;

      // Validate response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format: expected object');
      }

      const typedData = data as CoinGeckoResponse;

      if (!typedData.ethereum || typeof typedData.ethereum !== 'object') {
        throw new Error('Invalid response format: missing ethereum data');
      }

      if (typeof typedData.ethereum.usd !== 'number') {
        throw new Error('Invalid response format: ETH price is not a number');
      }

      const ethPrice = typedData.ethereum.usd;

      logger.debug({ ethPrice, attempt }, 'Successfully retrieved ETH price');

      return { ethPrice };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      logger.warn(
        { attempt, maxRetries, error: errorMessage },
        `Failed to fetch ETH price (attempt ${attempt}/${maxRetries})`,
      );

      if (attempt === maxRetries) {
        logger.error(
          { error: errorMessage },
          'Failed to fetch ETH price after all retry attempts',
        );
        throw new Error(`Failed to fetch ETH price: ${errorMessage}`);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }

  // This should never be reached, but TypeScript requires it
  throw new Error('Unexpected error in getEthPrice function');
}

/**
 * Fetches the summary of a specific "Lil Nouns" proposal by its ID.
 *
 * @param {ToolContext} context - The context object containing environment and configuration.
 * @param {number} proposalId - The unique identifier of the proposal whose summary is to be fetched.
 * @return {Promise<{ proposal: { id: string, title: string, description: string, status: string, createdTimestamp: string, link: string } }>} A promise that resolves to an object containing the proposal's summary, including id, title, description, status, formatted creation timestamp, and a link to view the proposal.
 */
export async function fetchLilNounsProposalSummary(
  context: ToolContext,
  proposalId: number,
) {
  const { env, config } = context;

  // Create a logger instance for this function
  const logger = createLogger(env).child({
    module: 'tools',
    function: 'fetchLilNounsProposalSummary',
    proposalId,
  });

  logger.debug('Fetching proposal summary');

  const { proposal } = await request<Query>(
    config.lilNounsSubgraphUrl,
    gql`
      query GetProposal($proposalId: ID!) {
        proposal(id: $proposalId) {
          id
          title
          description
          createdTimestamp
        }
      }
    `,
    { proposalId },
  );

  logger.debug(
    { proposalTitle: proposal?.title },
    'Retrieved proposal summary',
  );

  const state = await fetchLilNounsProposalsState(context, proposalId);

  return {
    proposal: {
      ...proposal,
      status: state.stateText,
      createdTimestamp: DateTime.fromSeconds(
        Number(proposal?.createdTimestamp),
      ).toISO(),
      link: `https://lilnouns.camp/proposals/${proposal?.id}`,
    },
  };
}

/**
 * Gets the current date and time in ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ) in UTC timezone.
 *
 * @return {string} The current date and time as an ISO 8601 formatted string in UTC.
 */
export function getCurrentIsoDateTimeUtc(): string {
  return DateTime.utc().toISO();
}

/**
 * Enum representing the different states a proposal can be in.
 */
export enum ProposalState {
  Active,
  Canceled,
  Defeated,
  Succeeded,
  Queued,
  Expired,
  Executed,
  Vetoed,
}

/**
 * Fetches the on-chain state of a specific Lil Nouns proposal.
 *
 * @param {ToolContext} context - The context object containing environment and configuration.
 * @param {number} proposalId - The unique identifier of the proposal to fetch the state for.
 * @return {Promise<{ state: number, stateText: string }>} An object containing the proposal state as both numeric value and string representation.
 */
export async function fetchLilNounsProposalsState(
  context: ToolContext,
  proposalId: number,
) {
  const { env, config } = context;

  // Create a logger instance for this function
  const logger = createLogger(env).child({
    module: 'tools',
    function: 'fetchLilNounsProposalsState',
    proposalId,
  });

  logger.debug('Fetching proposal state');

  const wagmiConfig = createWagmiConfig(config);
  const state = await readLilNounsGovernorState(wagmiConfig, {
    args: [BigInt(proposalId)],
  });

  const stateNumber = Number(state);
  const stateText = ProposalState[stateNumber];

  logger.debug({ stateNumber, stateText }, 'Retrieved proposal state');

  return {
    state: stateNumber,
    stateText: stateText,
  };
}
