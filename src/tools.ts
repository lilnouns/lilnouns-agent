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

/**
 * AI tools configuration for function calling
 */
export const aiTools = [
  {
    type: 'function',
    name: 'fetchLilNounsActiveProposals',
    description:
      'Fetch Lil Nouns active proposals that are currently open for voting, ordered by creation time',
    parameters: {},
  },
  {
    type: 'function',
    name: 'fetchLilNounsProposalsState',
    description:
      'Fetch the current on-chain state of a Lil Nouns governance proposal by its ID, returning both the numeric state value and text representation (Pending, Active, Canceled, etc.)',
    parameters: {
      type: 'object',
      properties: {
        proposalId: {
          type: 'number',
          description: 'Unique identifier of the proposal to check state for',
        },
      },
      required: ['proposalId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'fetchLilNounsCurrentAuction',
    description:
      'Fetch details about the currently active Lil Nouns auction, including the Noun ID, current price in ETH, and auction link',
    parameters: {},
  },
  {
    type: 'function',
    name: 'fetchLilNounsTokenTotalSupply',
    description:
      'Fetch the total supply of Lil Nouns tokens that have been minted to date',
    parameters: {},
  },
  {
    type: 'function',
    name: 'fetchLilNounsProposalSummary',
    description:
      'Fetch comprehensive details about a specific Lil Nouns governance proposal by its ID, including title, description (AI-summarized), status, creation timestamp, and link to the proposal page',
    parameters: {
      type: 'object',
      properties: {
        proposalId: {
          type: 'number',
          description: 'Unique identifier of the proposal to fetch details for',
        },
      },
      required: ['proposalId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'getCurrentIsoDateTimeUtc',
    description:
      'Get the current date and time in ISO 8601 format in UTC timezone, useful for timestamping operations and determining time-based conditions',
    parameters: {},
  },
] as const;

/**
 * Fetches the current auction data for Lil Nouns.
 *
 * @param env
 * @param {Object} config - The configuration object returned by the `getConfig` function.
 * @return {Promise<Object>} A promise that resolves to an object containing the current auction details.
 */
export async function fetchCurrentAuction(
  env: Env,
  config: ReturnType<typeof getConfig>
) {
  const logger = createLogger(env).child({
    module: 'tools',
    function: 'fetchCurrentAuction',
  });

  logger.debug('Fetching current auction');

  const wagmiConfig = createWagmiConfig(config);
  const [nounId, , , price] = await readLilNounsAuctionFetchNextNoun(
    wagmiConfig,
    {}
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
 * @param env
 * @param {ReturnType<typeof getConfig>} config - The configuration object used to initialize the Wagmi settings and subgraph query.
 * @return {Promise<{ proposals: Array<{ id: string, title: string, createdTimestamp: string }> }>} A promise that resolves to an object containing an array of active proposals. Each proposal includes its id, title, and formatted creation timestamp.
 */
export async function fetchActiveProposals(
  env: Env,
  config: ReturnType<typeof getConfig>
) {
  const logger = createLogger(env).child({
    module: 'tools',
    function: 'fetchActiveProposals',
  });

  logger.debug('Fetching active proposals');

  const wagmiConfig = createWagmiConfig(config);
  const blockNumber = await getBlockNumber(wagmiConfig); // Get the current Ethereum block number

  logger.debug({ blockNumber }, 'Current Ethereum block number');

  // Query the Lil Nouns subgraph for active proposals using the current block number
  const { proposals } = await request<Query>(
    config.lilNounsSubgraphUrl,
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
      link: `https://lilnouns.camp/proposals/${proposal.id}`,
    }))
  );

  logger.debug(
    { proposalCount: formattedProposals.length },
    'Retrieved active proposals'
  );

  return { proposals: formattedProposals };
}

/**
 * Fetches the total supply of Lil Nouns tokens.
 *
 * @param env
 * @param {Object} config - The configuration object obtained from the getConfig function.
 * @return {Promise<Object>} An object containing the total supply of tokens as a number.
 */
export async function fetchLilNounsTokenTotalSupply(
  env: Env,
  config: ReturnType<typeof getConfig>
) {
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
    'Retrieved token total supply'
  );

  return { totalSupply: Number(totalSupply) };
}

/**
 * Fetches the summary of a specific "Lil Nouns" proposal by its ID.
 *
 * @param env
 * @param {object} config - The configuration object for the subgraph, obtained by calling the `getConfig` function. It contains the `lilNounsSubgraphUrl` for querying data.
 * @param {number} proposalId - The unique identifier of the proposal whose summary is to be fetched.
 * @return {Promise<object>} A promise that resolves to an object containing the proposal's summary, including id, title, description, status, and a formatted `createdTimestamp`.
 */
export async function fetchLilNounsProposalSummary(
  env: Env,
  config: ReturnType<typeof getConfig>,
  proposalId: number
) {
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
    { proposalId }
  );

  logger.debug(
    { proposalTitle: proposal?.title },
    'Retrieved proposal summary'
  );

  const state = await fetchLilNounsProposalsState(env, config, proposalId);

  return {
    proposal: {
      ...proposal,
      status: state.stateText,
      createdTimestamp: DateTime.fromSeconds(
        Number(proposal?.createdTimestamp)
      ).toISO(),
      link: `https://lilnouns.camp/proposals/${proposal?.id}`,
    },
  };
}

/**
 * Gets the current date and time in ISO 8601 format in UTC.
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
  Pending,
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
 * @param env
 * @param {Object} config - The configuration object obtained from the getConfig function.
 * @param {number} proposalId - The ID of the proposal to fetch the state for.
 * @return {Promise<Object>} An object containing the proposal state as both numeric value and string representation.
 */
export async function fetchLilNounsProposalsState(
  env: Env,
  config: ReturnType<typeof getConfig>,
  proposalId: number
) {
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
