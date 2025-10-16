import { createConfig, http } from 'wagmi'
import { injected } from '@wagmi/core/connectors'
import { hardhat, mainnet, sepolia } from 'viem/chains'

export const chains = [hardhat, sepolia, mainnet] as const

export const transports = {
  [hardhat.id]: http('http://127.0.0.1:8545'),
  [sepolia.id]: http(),
  [mainnet.id]: http()
}

export const wagmiConfig = createConfig({ chains, transports, connectors: [injected()] })
