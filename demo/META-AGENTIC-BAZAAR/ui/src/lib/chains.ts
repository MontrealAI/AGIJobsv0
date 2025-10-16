import { http } from 'wagmi'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { mainnet, sepolia, hardhat } from 'viem/chains'

export const chains = [hardhat, sepolia, mainnet] as const
export const wagmiConfig = getDefaultConfig({
  appName: 'META-AGENTIC-BAZAAR',
  projectId: import.meta.env.VITE_WALLETCONNECT_ID || 'META-AGENTIC-BAZAAR-DEMO',
  chains,
  transports: {
    [hardhat.id]: http('http://127.0.0.1:8545'),
    [sepolia.id]: http(),
    [mainnet.id]: http()
  }
})
