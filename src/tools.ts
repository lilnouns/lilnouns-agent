import {
  readLilNounsAuctionFetchNextNoun,
  readLilNounsTokenTotalSupply,
} from '@nekofar/lilnouns/contracts';
import type { Query } from '@nekofar/lilnouns/subgraphs';
import { gql, request } from 'graphql-request';
import { DateTime } from 'luxon';
import { map, pipe } from 'remeda';
import { formatEther } from 'viem';
import { getBlockNumber } from 'wagmi/actions';
import type { getConfig } from './config';
import { createWagmiConfig } from './index';

/**
 * AI tools configuration for function calling
 */
export const aiTools = [
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
  {
    type: 'function',
    name: 'fetchLilNounsTokenTotalSupply',
    description: 'Fetch Lil Nouns token total supply',
    parameters: {},
  },
  {
    type: 'function',
    name: 'fetchLilNounsProposalSummary',
    description: 'Fetch Lil Nouns proposal summary',
    parameters: {
      type: 'object',
      properties: {
        proposalId: {
          type: 'number',
          description: 'Proposal ID',
        },
      },
      required: ['proposalId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'getCurrentIsoDateTimeUtc',
    description: 'Get current date and time in ISO format in UTC timezone',
    parameters: {},
  },
] as const;

/**
 * Fetches the current auction data for Lil Nouns.
 *
 * @param {Object} config - The configuration object returned by the `getConfig` function.
 * @return {Promise<Object>} A promise that resolves to an object containing the current auction details.
 */
export async function fetchCurrentAuction(
  config: ReturnType<typeof getConfig>
) {
  console.log('[DEBUG] Fetching current auction');

  const wagmiConfig = createWagmiConfig(config);
  const [nounId, seed, svg, price, hash, blockNumber] =
    await readLilNounsAuctionFetchNextNoun(wagmiConfig, {});

  const auction = {
    nounId: Number(nounId),
    price: `${formatEther(price)} ETH`,
  };

  console.log(
    '[DEBUG] Retrieved current auction: ',
    JSON.stringify({ auction })
  );

  return { auction };
}

/**
 * Fetches active proposals from the Lil Nouns subgraph based on the current Ethereum block number.
 *
 * Active proposals are those which have not been cancelled and have an ending block greater than or equal to the current block.
 * The retrieved proposals include their id, title, and creation timestamp, with timestamps formatted to ISO format.
 *
 * @param {ReturnType<typeof getConfig>} config - The configuration object used to initialize the Wagmi settings and subgraph query.
 * @return {Promise<{ proposals: Array<{ id: string, title: string, createdTimestamp: string }> }>} A promise that resolves to an object containing an array of active proposals. Each proposal includes its id, title, and formatted creation timestamp.
 */
export async function fetchActiveProposals(
  config: ReturnType<typeof getConfig>
) {
  console.log('[DEBUG] Fetching active proposals');
  const wagmiConfig = createWagmiConfig(config);
  const blockNumber = await getBlockNumber(wagmiConfig); // Get current Ethereum block number
  console.log(`[DEBUG] Current Ethereum block number: ${blockNumber}`);

  // Query the Lil Nouns subgraph for active proposals using current block number
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
    }))
  );

  console.log(
    `[DEBUG] Retrieved ${formattedProposals.length} active proposals`
  );
  return { proposals: formattedProposals };
}

/**
 * Fetches the total supply of Lil Nouns tokens.
 *
 * @param {Object} config - The configuration object obtained from the getConfig function.
 * @return {Promise<Object>} An object containing the total supply of tokens as a number.
 */
export async function fetchLilNounsTokenTotalSupply(
  config: ReturnType<typeof getConfig>
) {
  console.log('[DEBUG] Fetching token total supply');

  const wagmiConfig = createWagmiConfig(config);
  const totalSupply = await readLilNounsTokenTotalSupply(wagmiConfig, {});

  console.log(
    `[DEBUG] Retrieved token total supply: ${formatEther(totalSupply)}`
  );

  return { totalSupply: Number(totalSupply) };
}

/**
 * Fetches the summary of a specific "Lil Nouns" proposal by its ID.
 *
 * @param {object} config - The configuration object for the subgraph, obtained by calling the `getConfig` function. It contains the `lilNounsSubgraphUrl` for querying data.
 * @param {number} proposalId - The unique identifier of the proposal whose summary is to be fetched.
 * @return {Promise<object>} A promise that resolves to an object containing the proposal's summary, including id, title, description, status, and a formatted `createdTimestamp`.
 */
export async function fetchLilNounsProposalSummary(
  config: ReturnType<typeof getConfig>,
  proposalId: number
) {
  console.log('[DEBUG] Fetching proposal summary');

  const { proposal } = await request<Query>(
    config.lilNounsSubgraphUrl,
    gql`
      query GetProposal($proposalId: ID!) {
        proposal(id: $proposalId) {
          id
          title
          description
          status
          createdTimestamp
        }
      }
    `,
    { proposalId }
  );

  console.log(
    `[DEBUG] Retrieved proposal summary: ${JSON.stringify({
      proposal: {
        title: proposal?.title,
      },
    })}`
  );

  return {
    proposal: {
      ...proposal,
      createdTimestamp: DateTime.fromSeconds(
        Number(proposal?.createdTimestamp)
      ).toISO(),
    },
  };
}

/**
 * Gets the current date and time in ISO 8601 format in UTC.
 *
 * @return {string} The current date and time as an ISO 8601 formatted string in UTC.
 */
export function getCurrentIsoDateTimeUtc() {
  return DateTime.utc().toISO();
}
