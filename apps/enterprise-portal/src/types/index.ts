export type JobPhase =
  | 'Created'
  | 'Assigned'
  | 'Submitted'
  | 'InValidation'
  | 'Finalized'
  | 'Disputed'
  | 'Expired'
  | 'Cancelled';

export interface JobTimelineEvent {
  id: string;
  jobId: bigint;
  name: string;
  description: string;
  actor?: string;
  txHash?: string;
  timestamp: number;
  phase: JobPhase;
  meta?: Record<string, unknown>;
}

export interface JobSummary {
  jobId: bigint;
  employer: string;
  agent?: string;
  reward: bigint;
  stake: bigint;
  fee: bigint;
  deadline: number;
  specHash: string;
  uri: string;
  phase: JobPhase;
  lastUpdated: number;
  createdAt?: number;
  assignedAt?: number;
  resultSubmittedAt?: number;
  resultHash?: string;
  resultUri?: string;
  totalValidators?: number;
  validatorVotes?: number;
  validationEndsAt?: number;
  validationStartedAt?: number;
  stakedByValidators?: bigint;
}

export interface ValidatorInsight {
  jobId: bigint;
  validator: string;
  vote?: 'approve' | 'reject' | 'timeout';
  stake?: bigint;
  selectedAt?: number;
  committedAt?: number;
  commitTx?: string;
  revealedAt?: number;
  revealTx?: string;
  comment?: string;
}

export interface DeliverableRecord {
  jobId: bigint;
  cid: string;
  resultHash: string;
  signature: string;
  submittedBy: string;
  submittedAt: number;
  verified?: boolean;
}

export interface CertificateBadge {
  tokenId: bigint;
  jobId: bigint;
  metadataURI: string;
  slaURI?: string;
  issuedAt: number;
  employer: string;
  agent: string;
  description: string;
}

export interface SlaDocument {
  uri: string;
  version: number;
  issuedAt: number;
  obligations: string[];
  penalties: string[];
  successCriteria: string[];
}

export interface PortalConfiguration {
  chainId: number;
  jobRegistryAddress: string;
  taxPolicyAddress: string;
  certificateNFTAddress: string;
  validationModuleAddress?: string;
  stakingTokenSymbol?: string;
  rpcUrl: string;
  subgraphUrl?: string;
}
