import type { PortalConfiguration } from '../types';

const parseEnvNumber = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const loadPortalConfiguration = (): PortalConfiguration => {
  const chainId = parseEnvNumber(process.env.NEXT_PUBLIC_CHAIN_ID) ?? 11155111;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://sepolia.infura.io/v3/demo';
  const jobRegistryAddress = process.env.NEXT_PUBLIC_JOB_REGISTRY_ADDRESS ??
    '0x0000000000000000000000000000000000000000';
  const taxPolicyAddress = process.env.NEXT_PUBLIC_TAX_POLICY_ADDRESS ??
    '0x0000000000000000000000000000000000000000';
  const certificateNFTAddress = process.env.NEXT_PUBLIC_CERTIFICATE_NFT_ADDRESS ??
    '0x0000000000000000000000000000000000000000';
  const validationModuleAddress =
    process.env.NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS ?? undefined;
  const stakeManagerAddress =
    process.env.NEXT_PUBLIC_STAKE_MANAGER_ADDRESS ?? undefined;
  const stakingTokenAddress =
    process.env.NEXT_PUBLIC_STAKING_TOKEN_ADDRESS ?? undefined;
  const subgraphUrl = process.env.NEXT_PUBLIC_SUBGRAPH_URL ?? undefined;
  const stakingTokenSymbol = process.env.NEXT_PUBLIC_STAKING_TOKEN_SYMBOL ?? '$AGIALPHA';

  return {
    chainId,
    rpcUrl,
    jobRegistryAddress,
    taxPolicyAddress,
    certificateNFTAddress,
    validationModuleAddress,
    stakeManagerAddress,
    stakingTokenAddress,
    subgraphUrl,
    stakingTokenSymbol
  };
};
