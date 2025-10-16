import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { WagmiConfig, createConfig } from 'wagmi';
import { mainnet, sepolia, hardhat } from 'wagmi/chains';

export const chains = [mainnet, sepolia, hardhat];

export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: 'α-AGI MARK',
    projectId: 'alpha-agi-mark-demo',
    chains,
    ssr: false,
  })
);

export { WagmiConfig };
