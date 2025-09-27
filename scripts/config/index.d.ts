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

export type OwnerControlModuleType = 'governable' | 'ownable' | 'ownable2step';

export interface OwnerControlModuleConfig {
  address?: string;
  governance?: string;
  owner?: string;
  type?: OwnerControlModuleType | string;
  label?: string;
  skip?: boolean;
  notes?: string[];
  [key: string]: unknown;
}

export interface OwnerControlConfig {
  governance?: string;
  owner?: string;
  modules?: Record<string, OwnerControlModuleConfig>;
  [key: string]: unknown;
}

export interface OwnerControlConfigResult {
  config: OwnerControlConfig;
  path: string;
  network?: SupportedNetwork;
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

export interface StakeRecommendationsConfig {
  min?: string;
  minTokens?: string | number;
  max?: string | null;
  maxTokens?: string | number | null;
  [key: string]: unknown;
}

export interface AutoStakeConfig {
  enabled?: boolean | string;
  threshold?: number | string;
  increasePct?: number | string;
  decreasePct?: number | string;
  windowSeconds?: number | string;
  floor?: string;
  floorTokens?: string | number;
  ceiling?: string | number | null;
  ceilingTokens?: string | number | null;
  temperatureThreshold?: number | string;
  hamiltonianThreshold?: number | string;
  disputeWeight?: number | string;
  temperatureWeight?: number | string;
  hamiltonianWeight?: number | string;
  [key: string]: unknown;
}

export interface StakeManagerConfig {
  minStake?: string;
  minStakeTokens?: string | number;
  feePct?: number | string;
  burnPct?: number | string;
  validatorRewardPct?: number | string;
  employerSlashPct?: number | string;
  treasurySlashPct?: number | string;
  treasury?: string | null;
  treasuryAllowlist?: Record<string, boolean>;
  unbondingPeriodSeconds?: number | string;
  maxStakePerAddress?: string;
  maxStakePerAddressTokens?: string | number;
  stakeRecommendations?: StakeRecommendationsConfig;
  autoStake?: AutoStakeConfig;
  pauser?: string | null;
  jobRegistry?: string | null;
  disputeModule?: string | null;
  validationModule?: string | null;
  thermostat?: string | null;
  hamiltonianFeed?: string | null;
  feePool?: string | null;
  maxAGITypes?: number | string;
  maxTotalPayoutPct?: number | string;
  [key: string]: unknown;
}

export interface StakeManagerConfigResult {
  config: StakeManagerConfig;
  path: string;
  network?: SupportedNetwork;
}

export interface FeePoolConfig {
  stakeManager?: string | null;
  rewardRole?: string | number | null;
  burnPct?: number | string;
  treasury?: string | null;
  treasuryAllowlist?: Record<string, boolean>;
  governance?: string | null;
  pauser?: string | null;
  taxPolicy?: string | null;
  rewarders?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface FeePoolConfigResult {
  config: FeePoolConfig;
  path: string;
  network?: SupportedNetwork;
}

export interface EnergyOracleConfig {
  signers: string[];
  retainUnknown?: boolean;
  [key: string]: unknown;
}

export interface EnergyOracleConfigResult {
  config: EnergyOracleConfig;
  path: string;
  network?: SupportedNetwork;
}

export interface PlatformIncentivesConfig {
  address?: string;
  stakeManager?: string | null;
  platformRegistry?: string | null;
  jobRouter?: string | null;
  [key: string]: unknown;
}

export interface PlatformIncentivesConfigResult {
  config: PlatformIncentivesConfig;
  path: string;
  network?: SupportedNetwork;
}

export interface PlatformRegistryConfig {
  address?: string;
  stakeManager?: string | null;
  reputationEngine?: string | null;
  minPlatformStake?: string | null;
  minPlatformStakeTokens?: string | number | null;
  pauser?: string | null;
  registrars?: Record<string, boolean>;
  blacklist?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface PlatformRegistryConfigResult {
  config: PlatformRegistryConfig;
  path: string;
  network?: SupportedNetwork;
}

export interface TaxPolicyConfig {
  address?: string;
  policyURI?: string;
  acknowledgement?: string;
  bumpVersion?: boolean;
  acknowledgers?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface TaxPolicyConfigResult {
  config: TaxPolicyConfig;
  path: string;
  network?: SupportedNetwork;
}

export type RoleShareInput =
  | number
  | string
  | {
      percent?: number | string;
      wad?: number | string;
    };

export interface RewardEngineThermoConfig {
  address?: string;
  treasury?: string | null;
  thermostat?: string | null;
  roleShares?: Record<string, RoleShareInput>;
  mu?: Record<string, number | string>;
  baselineEnergy?: Record<string, number | string>;
  kappa?: number | string;
  maxProofs?: number | string;
  temperature?: number | string;
  settlers?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface RewardEngineConfigResult {
  config: RewardEngineThermoConfig;
  path: string;
  network?: SupportedNetwork;
  source?: 'reward-engine' | 'thermodynamics';
}

export interface HamiltonianMonitorRecordConfig {
  d: string;
  u: string;
  timestamp?: string;
  note?: string;
  [key: string]: unknown;
}

export interface HamiltonianMonitorConfig {
  address?: string;
  window?: string;
  resetHistory?: boolean;
  records?: HamiltonianMonitorRecordConfig[];
  [key: string]: unknown;
}

export interface HamiltonianMonitorConfigResult {
  config: HamiltonianMonitorConfig;
  path: string;
  network?: SupportedNetwork;
}

export interface ThermostatConfigInput {
  address?: string | null;
  systemTemperature?: number | string;
  bounds?: {
    min?: number | string;
    max?: number | string;
  };
  pid?: {
    kp?: number | string;
    ki?: number | string;
    kd?: number | string;
  };
  kpiWeights?: {
    emission?: number | string;
    backlog?: number | string;
    sla?: number | string;
  };
  integralBounds?: {
    min?: number | string;
    max?: number | string;
  };
  roleTemperatures?: Record<string, number | string | null>;
  [key: string]: unknown;
}

export interface ThermodynamicsConfig {
  rewardEngine?: RewardEngineThermoConfig;
  thermostat?: ThermostatConfigInput;
  [key: string]: unknown;
}

export interface ThermodynamicsConfigResult {
  config: ThermodynamicsConfig;
  path: string;
  network?: SupportedNetwork;
}

export interface ThermostatConfigResult {
  config: ThermostatConfigInput;
  path: string;
  network?: SupportedNetwork;
  source?: 'thermostat' | 'thermodynamics';
  rewardEngineThermostat?: string;
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

export interface IdentityRootAliasConfig {
  name?: string;
  node: string;
  label?: string;
  labelhash?: string;
  [key: string]: unknown;
}

export interface IdentityRootConfig {
  name?: string;
  node?: string;
  aliases?: IdentityRootAliasConfig[];
  [key: string]: unknown;
}

export interface IdentityRegistryEnsConfig {
  registry?: string;
  nameWrapper?: string;
  agentRoot?: IdentityRootConfig;
  clubRoot?: IdentityRootConfig;
  agentAliases?: IdentityRootAliasConfig[];
  clubAliases?: IdentityRootAliasConfig[];
  [key: string]: unknown;
}

export interface IdentityRegistryMerkleConfig {
  agent?: string;
  validator?: string;
  [key: string]: unknown;
}

export interface IdentityRegistryAgentTypeConfig {
  value: number;
  label: 'Human' | 'AI';
}

export interface IdentityRegistryConfig {
  address?: string;
  ens?: IdentityRegistryEnsConfig;
  merkle?: IdentityRegistryMerkleConfig;
  reputationEngine?: string | null;
  attestationRegistry?: string | null;
  additionalAgents?: Record<string, boolean>;
  additionalValidators?: Record<string, boolean>;
  agentTypes?: Record<string, IdentityRegistryAgentTypeConfig>;
  agentProfiles?: Record<string, string>;
  [key: string]: unknown;
}

export interface IdentityRegistryConfigResult {
  config: IdentityRegistryConfig;
  path: string;
  network?: SupportedNetwork;
}

export interface DeploymentPlanEconConfig {
  feePct?: number;
  burnPct?: number;
  employerSlashPct?: number;
  treasurySlashPct?: number;
  commitWindow?: number;
  revealWindow?: number;
  minStake?: string;
  jobStake?: string;
  [key: string]: unknown;
}

export interface DeploymentPlanEnsConfig {
  registry?: string;
  nameWrapper?: string | null;
  [key: string]: unknown;
}

export interface DeploymentPlan {
  governance?: string;
  agialpha?: string;
  withTax?: boolean;
  econ?: DeploymentPlanEconConfig;
  ensRoots?: Record<string, IdentityRootConfig>;
  ens?: DeploymentPlanEnsConfig;
  [key: string]: unknown;
}

export interface DeploymentPlanResult {
  plan: DeploymentPlan;
  path?: string;
  network?: SupportedNetwork;
  exists?: boolean;
}

export interface DeploymentPlanOptions extends LoadOptions {
  optional?: boolean;
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
export function loadIdentityRegistryConfig(
  options?: LoadOptions
): IdentityRegistryConfigResult;
export function loadJobRegistryConfig(
  options?: LoadOptions
): JobRegistryConfigResult;
export function loadStakeManagerConfig(
  options?: LoadOptions
): StakeManagerConfigResult;
export function loadFeePoolConfig(options?: LoadOptions): FeePoolConfigResult;
export function loadEnergyOracleConfig(
  options?: LoadOptions
): EnergyOracleConfigResult;
export function loadPlatformIncentivesConfig(
  options?: LoadOptions
): PlatformIncentivesConfigResult;
export function loadPlatformRegistryConfig(
  options?: LoadOptions
): PlatformRegistryConfigResult;
export function loadTaxPolicyConfig(
  options?: LoadOptions
): TaxPolicyConfigResult;
export function loadOwnerControlConfig(
  options?: LoadOptions
): OwnerControlConfigResult;
export function loadThermodynamicsConfig(
  options?: LoadOptions
): ThermodynamicsConfigResult;
export function loadThermostatConfig(
  options?: LoadOptions & { path?: string }
): ThermostatConfigResult;
export function loadRewardEngineConfig(
  options?: LoadOptions
): RewardEngineConfigResult;
export function loadHamiltonianMonitorConfig(
  options?: LoadOptions
): HamiltonianMonitorConfigResult;
export function loadDeploymentPlan(
  options?: DeploymentPlanOptions
): DeploymentPlanResult;
