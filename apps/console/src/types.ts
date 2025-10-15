export interface GovernanceSnapshot {
  timestamp: string;
  chainId: string;
  onChain: {
    stakeManager: {
      address: string;
      minStake: string;
      minStakeLabel: string;
      feePct: string;
      feePctLabel: string;
      burnPct: string;
      burnPctLabel: string;
      validatorRewardPct: string;
      validatorRewardPctLabel: string;
      treasury: string;
    };
    jobRegistry: {
      address: string;
      jobStake: string;
      jobStakeLabel: string;
      maxJobReward: string;
      maxJobRewardLabel: string;
      maxJobDuration: string;
      maxJobDurationLabel: string;
      feePct: string;
      feePctLabel: string;
      validatorRewardPct: string;
      validatorRewardPctLabel: string;
    };
    feePool: {
      address: string;
      burnPct: string;
      burnPctLabel: string;
      treasury: string;
    };
    identityRegistry?: {
      address: string;
      agentRootNode: string;
      clubRootNode: string;
      agentMerkleRoot: string;
      validatorMerkleRoot: string;
    };
    [key: string]: Record<string, string> | undefined;
  };
  configs: Record<string, unknown> & {
    identity?: {
      agentRootNode?: string;
      clubRootNode?: string;
      agentMerkleRoot?: string;
      validatorMerkleRoot?: string;
      ens?: string;
      nameWrapper?: string;
    };
  };
}

export interface GovernancePreviewResult {
  key: string;
  module: string;
  method: string;
  args: unknown[];
  diff?: Record<string, unknown>;
  bundle: {
    digest: string;
  } & Record<string, unknown>;
  snapshot: GovernanceSnapshot;
  auditFile?: string;
}

export interface StoredReceiptRecord {
  kind: 'PLAN' | 'EXECUTION';
  planHash: string;
  jobId?: number;
  createdAt: string;
  txHashes?: string[];
  attestationUid?: string | null;
  attestationTxHash?: string | null;
  attestationCid?: string | null;
  receipt?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface DemoTokenAmount {
  raw: string;
  formatted: string;
}

export interface DemoBalanceEntry {
  name: string;
  address: string;
  role?: string;
  balance: DemoTokenAmount;
}

export interface DemoBalanceSnapshot {
  id: string;
  label: string;
  notes?: string;
  entries: DemoBalanceEntry[];
}

export interface DemoStepEvent {
  label: string;
  details?: string;
  metrics?: Record<string, string>;
}

export interface DemoStepRecord {
  title: string;
  events: DemoStepEvent[];
}

export type DemoSectionKind = 'setup' | 'scenario' | 'telemetry' | 'wrapup';

export interface DemoSectionRecord {
  id: string;
  title: string;
  kind: DemoSectionKind;
  summary?: string;
  outcome?: string;
  steps: DemoStepRecord[];
  snapshots: DemoBalanceSnapshot[];
}

export interface DemoActorProfile {
  id: string;
  name: string;
  role: string;
  address: string;
}

export interface DemoActorState extends DemoActorProfile {
  liquid?: DemoTokenAmount;
  staked?: DemoTokenAmount;
  locked?: DemoTokenAmount;
  reputation?: string;
  certificates?: string[];
}

export interface MintedCertificateRecord {
  jobId: string;
  owner: string;
  uri?: string;
}

export interface DemoTelemetry {
  totalJobs: number;
  totalBurned: DemoTokenAmount;
  feePct: string;
  validatorRewardPct: string;
  feePoolPending: DemoTokenAmount;
  totalAgentStake: DemoTokenAmount;
  totalValidatorStake: DemoTokenAmount;
  agentPortfolios: DemoActorState[];
  validatorPortfolios: DemoActorState[];
  certificates: MintedCertificateRecord[];
}

export interface GrandDemoReport {
  metadata: {
    generatedAt: string;
    network: {
      chainId: number;
      name: string;
    };
  };
  token: {
    symbol: string;
    decimals: number;
    initialSupply: DemoTokenAmount;
  };
  owner: {
    address: string;
  };
  actors: DemoActorProfile[];
  sections: DemoSectionRecord[];
  telemetry: DemoTelemetry | null;
}
