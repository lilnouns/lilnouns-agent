import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import type { getConfig } from './config';

/**
 * Creates a WAGMI configuration object using the provided configuration details.
 *
 * @param {ReturnType<typeof getConfig>} config - The configuration object containing necessary details such as the Ethereum RPC URL.
 * @return {Object} The generated WAGMI configuration object.
 */
export function createWagmiConfig(config: ReturnType<typeof getConfig>) {
  const wagmiConfig = createConfig({
    chains: [mainnet],
    transports: { [mainnet.id]: http(config.ethereumRpcUrl) },
  });

  return wagmiConfig;
}
