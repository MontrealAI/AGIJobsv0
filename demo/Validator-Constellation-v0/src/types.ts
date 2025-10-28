export type Domain = 'research.alpha' | 'operations.main' | 'marketplace.main';

export interface ValidatorConfig {
  ensRootDomains: string[];
  minStake: bigint;
  slashPenaltyBps: number;
  revealWindowSeconds: number;
  committeeSize: number;
  quorum: number;
}

export interface AgentConfig {
  ensRootDomains: string[];
}

export interface EpochEntropy {
  epoch: number;
  seed: string;
}

export interface ValidatorIdentity {
  address: string;
  ens: string;
  stake: bigint;
  active: boolean;
  misbehaviourCount: number;
}

export interface AgentIdentity {
  address: string;
  ens: string;
  domain: Domain;
  spendingLimit: bigint;
}

export interface NodeIdentity {
  address: string;
  ens: string;
  domain: Domain;
}

export interface JobResult {
  jobId: string;
  domain: Domain;
  outcome: 'success' | 'failure';
  proofHash: string;
  rewardWei: bigint;
}

export interface CommitmentRecord {
  jobId: string;
  validator: ValidatorIdentity;
  commitment: string;
  salt: string;
  revealed: boolean;
  vote?: 'truth' | 'fraud';
}

export interface SentinelAlert {
  id: string;
  domain: Domain;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  triggeredBy: string;
  timestamp: number;
}

export interface ZkBatchSubmission {
  proofId: string;
  jobs: JobResult[];
  proof: string;
  verified: boolean;
}

export interface SimulationReport {
  committee: ValidatorIdentity[];
  commitments: CommitmentRecord[];
  reveals: CommitmentRecord[];
  slashedValidators: ValidatorIdentity[];
  alerts: SentinelAlert[];
  pausedDomains: Domain[];
  resumedDomains: Domain[];
  zkBatch: ZkBatchSubmission;
}

export interface SentinelRule {
  id: string;
  description: string;
  evaluate(job: JobResult, agent: AgentIdentity): SentinelAlert | null;
}

export interface DomainPauseEvent {
  domain: Domain;
  reason: string;
  by: string;
  timestamp: number;
}

export interface OperatorConsoleSnapshot {
  epoch: number;
  pausedDomains: DomainPauseEvent[];
  validatorHealth: Array<{ ens: string; stake: bigint; misbehaviourCount: number }>;
  outstandingAlerts: SentinelAlert[];
  latestBatch: ZkBatchSubmission;
  nodeRoster: Array<{ ens: string; domain: Domain }>;
}
