export type SupportedNetwork = 'mainnet' | 'sepolia';

export interface TokenConfig {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  burnAddress?: string;
  governance?: GovernanceConfig;
  owners?: GovernanceConfig;
  modules?: Record<string, string>;
  contracts?: Record<string, string>;
  [key: string]: unknown;
}

export interface GovernanceConfig {
  govSafe?: string;
  timelock?: string;
  [key: string]: unknown;
}

export interface TokenConfigResult {
  config: TokenConfig;
  path: string;
  network?: SupportedNetwork;
}

export interface JobRegistryConfig {
  jobStake?: string;
  jobStakeTokens?: string | number;
  minAgentStake?: string;
  minAgentStakeTokens?: string | number;
  maxJobReward?: string;
  maxJobRewardTokens?: string | number;
  jobDurationLimitSeconds?: number | string;
  maxActiveJobsPerAgent?: number | string;
  expirationGracePeriodSeconds?: number | string;
  feePct?: number | string;
  validatorRewardPct?: number | string;
  treasury?: string | null;
  taxPolicy?: string | null;
  acknowledgers?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface JobRegistryConfigResult {
  config: JobRegistryConfig;
  path: string;
  network?: SupportedNetwork;
}

export interface EnsRootConfig {
  label: string;
  name: string;
  labelhash: string;
  node: string;
  merkleRoot: string;
  role?: string;
  resolver?: string;
  [key: string]: unknown;
}

export interface EnsConfig {
  registry?: string;
  nameWrapper?: string;
  reverseRegistrar?: string;
  roots: Record<string, EnsRootConfig>;
  [key: string]: unknown;
}

export interface EnsConfigResult {
  config: EnsConfig;
  path: string;
  network?: SupportedNetwork;
  updated: boolean;
}

export interface LoadOptions {
  network?: any;
  chainId?: number | string;
  name?: string;
  context?: any;
  persist?: boolean;
  path?: string;
}

export function inferNetworkKey(value: any): SupportedNetwork | undefined;
export function loadTokenConfig(options?: LoadOptions): TokenConfigResult;
export function loadEnsConfig(options?: LoadOptions): EnsConfigResult;
export function loadJobRegistryConfig(
  options?: LoadOptions
): JobRegistryConfigResult;
