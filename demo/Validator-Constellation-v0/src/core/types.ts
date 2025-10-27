import { EventEmitter } from 'events';

export type Hex = `0x${string}`;

export interface DomainConfig {
  id: string;
  humanName: string;
  budgetLimit: bigint;
  unsafeOpcodes: Set<string>;
}

export interface GovernanceParameters {
  committeeSize: number;
  commitPhaseBlocks: number;
  revealPhaseBlocks: number;
  quorumPercentage: number;
  slashPenaltyBps: number;
  nonRevealPenaltyBps: number;
}

export interface ValidatorIdentity {
  address: Hex;
  ensName: string;
  stake: bigint;
}

export interface AgentIdentity {
  address: Hex;
  ensName: string;
  domainId: string;
  budget: bigint;
}

export interface NodeIdentity {
  address: Hex;
  ensName: string;
}

export interface AgentAction {
  agent: AgentIdentity;
  domainId: string;
  type: 'TRANSFER' | 'CALL' | 'DEPLOY';
  amountSpent: bigint;
  description: string;
  opcode?: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

export type VoteValue = 'APPROVE' | 'REJECT';

export interface CommitMessage {
  validator: ValidatorIdentity;
  commitment: Hex;
  round: number;
  submittedAtBlock: number;
  submittedAt: number;
}

export interface RevealMessage {
  validator: ValidatorIdentity;
  vote: VoteValue;
  salt: Hex;
  round: number;
  submittedAtBlock: number;
  submittedAt: number;
}

export interface JobResult {
  jobId: string;
  domainId: string;
  passed: boolean;
  reportCID: string;
}

export interface ZkBatchProof {
  proofId: string;
  jobRoot: Hex;
  witnessCommitment: Hex;
  sealedOutput: Hex;
  attestedJobCount: number;
  publicSignals: {
    committeeSignature: Hex;
    transcriptCommitment: Hex;
  };
}

export interface SentinelAlert {
  id: string;
  domainId: string;
  timestamp: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  rule: string;
  description: string;
  offender?: {
    ensName: string;
    address: Hex;
  };
  metadata?: Record<string, unknown>;
}

export interface PauseRecord {
  domainId: string;
  reason: string;
  triggeredBy: string;
  timestamp: number;
  resumedAt?: number;
}

export interface StakeAccount {
  identity: ValidatorIdentity;
  bonded: bigint;
  slashed: bigint;
  status: 'ACTIVE' | 'BANNED';
}

export interface SlashingEvent {
  validator: ValidatorIdentity;
  penalty: bigint;
  reason: string;
  txHash: Hex;
  timestamp: number;
}

export interface SubgraphRecord {
  id: string;
  type: 'SLASHING' | 'PAUSE' | 'COMMIT' | 'REVEAL' | 'ZK_BATCH';
  blockNumber: number;
  payload: Record<string, unknown>;
}

export type AuditFindingSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AuditFinding {
  id: string;
  severity: AuditFindingSeverity;
  title: string;
  details?: Record<string, unknown>;
}

export interface AuditMetrics {
  committeeSize: number;
  commitCount: number;
  revealCount: number;
  slashingCount: number;
  sentinelAlerts: number;
  quorumPercentage: number;
  quorumAchieved: boolean;
  attestedJobs: number;
}

export interface AuditCrossChecks {
  commitIntegrity: boolean;
  slashingIntegrity: boolean;
  timelineIntegrity: boolean;
  sentinelIntegrity: boolean;
  proofIntegrity: boolean;
  vrfIntegrity: boolean;
}

export interface AuditReport {
  pass: boolean;
  findings: AuditFinding[];
  metrics: AuditMetrics;
  crossChecks: AuditCrossChecks;
  summary: {
    outcome: VoteValue;
    majority: VoteValue;
  };
}

export interface DemoOrchestrationReport {
  round: number;
  domainId: string;
  committee: ValidatorIdentity[];
  vrfSeed: Hex;
  commits: CommitMessage[];
  reveals: RevealMessage[];
  voteOutcome: VoteValue;
  proof: ZkBatchProof;
  sentinelAlerts: SentinelAlert[];
  pauseRecords: PauseRecord[];
  slashingEvents: SlashingEvent[];
  nodes: NodeIdentity[];
  timeline: RoundTimeline;
  audit: AuditReport;
}

export interface DomainState {
  config: DomainConfig;
  paused: boolean;
  pauseReason?: PauseRecord;
}

export interface DomainSafetyUpdate {
  humanName?: string;
  budgetLimit?: bigint;
  unsafeOpcodes?: Iterable<string>;
}

export interface ValidatorEventBus extends EventEmitter {
  on(event: 'StakeSlashed', listener: (event: SlashingEvent) => void): this;
  on(event: 'SentinelAlert', listener: (alert: SentinelAlert) => void): this;
  on(event: 'DomainPaused', listener: (record: PauseRecord) => void): this;
  on(event: 'DomainResumed', listener: (record: PauseRecord) => void): this;
  on(event: 'CommitLogged', listener: (commit: CommitMessage) => void): this;
  on(event: 'RevealLogged', listener: (reveal: RevealMessage) => void): this;
  on(event: 'ZkBatchFinalized', listener: (proof: ZkBatchProof) => void): this;
}

export type GovernanceUpdatable = keyof GovernanceParameters;

export interface GovernanceController {
  updateParameter(key: GovernanceUpdatable, value: number): void;
  getParameters(): GovernanceParameters;
}

export interface RoundTimeline {
  commitStartBlock: number;
  commitDeadlineBlock: number;
  revealStartBlock?: number;
  revealDeadlineBlock?: number;
}

export type OrchestrationReportPayload = Omit<DemoOrchestrationReport, 'audit'>;

export interface AuditContext {
  report: OrchestrationReportPayload;
  jobBatch: JobResult[];
  governance: GovernanceParameters;
  verifyingKey: Hex;
  activeValidators: ValidatorIdentity[];
  onChainEntropy: Hex;
  recentBeacon: Hex;
  truthfulVote: VoteValue;
}
