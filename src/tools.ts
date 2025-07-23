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
  },
] as const;

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
    JSON.stringify(auction, null, 2)
  );

  return { auction };
}

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
