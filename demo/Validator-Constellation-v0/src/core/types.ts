import { EventEmitter } from 'events';

export type Hex = `0x${string}`;

export interface EntropyWitness {
  sources: Hex[];
  domainHash: Hex;
  roundHash: Hex;
  keccakSeed: Hex;
  shaSeed: Hex;
  transcript: Hex;
  consistencyHash: Hex;
}

export interface DomainConfig {
  id: string;
  humanName: string;
  budgetLimit: bigint;
  unsafeOpcodes: Set<string>;
  allowedTargets: Set<string>;
  maxCalldataBytes: number;
  forbiddenSelectors: Set<string>;
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
  blockNumber?: number;
  opcode?: string;
  target?: string;
  calldataBytes?: number;
  functionSelector?: string;
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
  blockNumber?: number;
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
  blockNumber?: number;
  resumedAt?: number;
  resumedAtBlock?: number;
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
  treasuryRecipient: Hex;
  treasuryBalanceAfter: bigint;
}

export interface TreasuryDistributionEvent {
  recipient: Hex;
  amount: bigint;
  treasuryAddress: Hex;
  treasuryBalanceAfter: bigint;
  txHash: Hex;
  timestamp: number;
}

export interface ValidatorStatusEvent {
  validator: ValidatorIdentity;
  status: 'ACTIVE' | 'BANNED';
  reason: string;
  remainingStake: bigint;
  timestamp: number;
  txHash?: Hex;
}

export interface SubgraphRecord {
  id: string;
  type:
    | 'SLASHING'
    | 'PAUSE'
    | 'COMMIT'
    | 'REVEAL'
    | 'ZK_BATCH'
    | 'VRF_WITNESS'
    | 'VALIDATOR_STATUS'
    | 'TREASURY';
  blockNumber: number;
  payload: Record<string, unknown>;
}

export interface DemoOrchestrationReport {
  round: number;
  domainId: string;
  committee: ValidatorIdentity[];
  vrfSeed: Hex;
  vrfWitness: EntropyWitness;
  commits: CommitMessage[];
  reveals: RevealMessage[];
  voteOutcome: VoteValue;
  proof: ZkBatchProof;
  sentinelAlerts: SentinelAlert[];
  pauseRecords: PauseRecord[];
  slashingEvents: SlashingEvent[];
  nodes: NodeIdentity[];
  timeline: RoundTimeline;
  treasuryBalanceAfter: bigint;
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
  allowedTargets?: Iterable<string>;
  maxCalldataBytes?: number;
  forbiddenSelectors?: Iterable<string>;
}

export interface ValidatorEventBus extends EventEmitter {
  on(event: 'StakeSlashed', listener: (event: SlashingEvent) => void): this;
  on(event: 'SentinelAlert', listener: (alert: SentinelAlert) => void): this;
  on(event: 'DomainPaused', listener: (record: PauseRecord) => void): this;
  on(event: 'DomainResumed', listener: (record: PauseRecord) => void): this;
  on(event: 'CommitLogged', listener: (commit: CommitMessage) => void): this;
  on(event: 'RevealLogged', listener: (reveal: RevealMessage) => void): this;
  on(event: 'ZkBatchFinalized', listener: (proof: ZkBatchProof) => void): this;
  on(event: 'VrfWitnessComputed', listener: (witness: EntropyWitness) => void): this;
  on(event: 'ValidatorStatusChanged', listener: (event: ValidatorStatusEvent) => void): this;
  on(event: 'TreasuryDistribution', listener: (event: TreasuryDistributionEvent) => void): this;
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
