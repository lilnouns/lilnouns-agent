import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import type { getConfig } from './config';

export function createWagmiConfig(config: ReturnType<typeof getConfig>) {
  const wagmiConfig = createConfig({
    chains: [mainnet],
    transports: { [mainnet.id]: http(config.ethereumRpcUrl) },
  });

  return wagmiConfig;
}
