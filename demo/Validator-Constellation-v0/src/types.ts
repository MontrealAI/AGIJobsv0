
export type Domain =
  | 'core'
  | 'governance'
  | 'alpha'
  | 'research'
  | 'external'
  | string;

export interface ValidatorIdentity {
  address: string;
  ensName: string;
  stake: bigint;
  domain: Domain;
  registeredAt: number;
  active: boolean;
}

export interface AgentIdentity {
  address: string;
  ensName: string;
  domain: Domain;
  budget: bigint;
}

export interface CommitRevealWindowConfig {
  commitWindowSeconds: number;
  revealWindowSeconds: number;
  vrfSeed: string;
  validatorsPerJob: number;
  revealQuorum: number;
  nonRevealPenaltyBps: number;
  incorrectVotePenaltyBps: number;
}

export type JobOutcome = 'approved' | 'rejected';

export interface JobValidationRound {
  jobId: string;
  domain: Domain;
  batchRoot: string;
  requestedAt: number;
  commitments: Map<string, string>;
  reveals: Map<string, { outcome: JobOutcome; salt: string }>;
  finalized: boolean;
  finalizedAt?: number;
  vrfRandomness: string;
  committee: string[];
}

export interface SentinelAlert {
  id: string;
  domain: Domain;
  triggeredAt: number;
  reason: string;
  severity: 'info' | 'warning' | 'critical';
  resolvedAt?: number;
}

export interface ZKBatchProof {
  jobRoot: string;
  proof: string;
  publicInputs: string[];
  submittedBy: string;
  submittedAt: number;
}

export interface BudgetOverrunSignal {
  agent: AgentIdentity;
  attemptedSpend: bigint;
  maxBudget: bigint;
  timestamp: number;
}

export interface UnsafeCallSignal {
  agent: AgentIdentity;
  callSignature: string;
  timestamp: number;
}

export interface DomainPauseState {
  domain: Domain;
  paused: boolean;
  pausedAt?: number;
  reason?: string;
  initiatedBy?: string;
}

export interface SubgraphEvent {
  type: 'ValidatorRegistered' | 'ValidatorSlashed' | 'JobFinalized' | 'DomainPaused' | 'DomainResumed' | 'SentinelAlert' | 'ZKProofSubmitted';
  data: Record<string, unknown>;
  blockNumber: number;
  txHash: string;
  emittedAt: number;
}

export interface GovernanceControl {
  owner: string;
  pausers: Set<string>;
  sentinels: Set<string>;
  ensAdmins: Set<string>;
}

export type ValidationVote = {
  outcome: JobOutcome;
  salt: string;
};

export interface CommitteeSelectionContext {
  entropy: string;
  validators: ValidatorIdentity[];
  committeeSize: number;
  domain: Domain;
}

export interface CommitteeSelectionResult {
  committee: ValidatorIdentity[];
  randomness: string;
}

export interface ValidatorSlashing {
  validator: ValidatorIdentity;
  penalty: bigint;
  reason: string;
  jobId: string;
  occurredAt: number;
}

export interface OperatorEventLogEntry {
  level: 'DEBUG' | 'INFO' | 'NOTICE' | 'WARN' | 'ALERT' | 'CRITICAL';
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

export interface ValidatorPerformanceSnapshot {
  validator: ValidatorIdentity;
  totalJobs: number;
  correctVotes: number;
  incorrectVotes: number;
  missedReveals: number;
}

export interface BatchAttestationRecord {
  jobIds: string[];
  aggregatedOutcome: JobOutcome;
  proof: ZKBatchProof;
  accepted: boolean;
}

export type NamePolicy = {
  mainnetRoots: string[];
  testnetRoots: string[];
  agentNamespace: string;
  nodeNamespace: string;
  validatorNamespace: string;
};

export interface IdentityProof {
  ensName: string;
  owner: string;
  signature: string;
  issuedAt: number;
  expiresAt: number;
}

export interface PolicyEvaluationResult {
  valid: boolean;
  reasons: string[];
}

export interface VRFProof {
  alpha: string;
  beta: string;
  gamma: string;
  hash: string;
}

export interface VRFProvider {
  generateProof: (input: string, secretKey: string) => VRFProof;
  verifyProof: (proof: VRFProof, input: string, publicKey: string) => boolean;
  deriveRandomness: (proof: VRFProof) => string;
}

export interface ENSVerificationReport {
  ensName: string;
  owner: string;
  root: string;
  namespace: string;
  approved: boolean;
  normalizedName: string;
  reason?: string;
}

export interface ValidationTelemetry {
  jobId: string;
  domain: Domain;
  committee: string[];
  commitDeadline: number;
  revealDeadline: number;
  vrfRandomness: string;
}

export interface StakeLedgerEntry {
  validator: string;
  previousStake: bigint;
  newStake: bigint;
  reason: string;
  timestamp: number;
}

export interface OperatorDashboardState {
  validators: ValidatorIdentity[];
  activeJobs: JobValidationRound[];
  pausedDomains: DomainPauseState[];
  sentinelAlerts: SentinelAlert[];
  zkBatches: BatchAttestationRecord[];
  slashes: ValidatorSlashing[];
  events: OperatorEventLogEntry[];
}

export type DemoScenarioConfig = {
  validators: Array<Pick<ValidatorIdentity, 'address' | 'ensName' | 'domain' | 'stake'>>;
  agents: AgentIdentity[];
  jobs: Array<{ jobId: string; domain: Domain; outcome: JobOutcome }>;
  anomalies: Array<BudgetOverrunSignal | UnsafeCallSignal>;
  committeeConfig: CommitRevealWindowConfig;
};

export interface DemoScenarioResult {
  batchProofs: BatchAttestationRecord[];
  slashes: ValidatorSlashing[];
  pausedDomains: DomainPauseState[];
  sentinelAlerts: SentinelAlert[];
  finalJobs: JobValidationRound[];
  dashboard: OperatorDashboardState;
}
