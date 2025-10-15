export type JobPhase =
  | 'Created'
  | 'Assigned'
  | 'Submitted'
  | 'InValidation'
  | 'Validated'
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
  status: number;
  success?: boolean;
  burnConfirmed?: boolean;
  agentTypes?: number;
  feePct?: number;
  agentPct?: number;
  deadline: number;
  specHash: string;
  specUri?: string;
  uriHash?: string;
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
  metadataCid?: string;
  metadataGatewayURI?: string;
  metadataName?: string;
  metadataDescription?: string;
  uriHash?: string;
  slaUri?: string;
  issuedAt: number;
  employer: string;
  agent: string;
  description: string;
  resultHash?: string;
  metadataResultHash?: string;
  hashMatchesOnChain?: boolean;
  deliverableUri?: string;
  deliverableCid?: string;
  signature?: string;
  signatureVerified?: boolean;
  verification?: {
    normalizedHash?: string;
    recoveredAddress?: string;
    matchesAgent: boolean;
    matchesHash: boolean;
  };
  verificationMessage?: string;
  verificationError?: string;
  metadataError?: string;
}

export interface SlaDocument {
  uri: string;
  version: number;
  issuedAt: number;
  obligations: string[];
  penalties: string[];
  successCriteria: string[];
}

export interface JobSlaReference {
  uri?: string;
  title?: string;
  summary?: string;
  version?: string;
  requiresSignature?: boolean;
  obligations: string[];
  successCriteria: string[];
}

export interface JobSpecificationMetadata {
  title?: string;
  description?: string;
  requiredSkills: string[];
  deliverables: string[];
  attachments: string[];
  reward?: string;
  ttlHours?: number;
  sla?: JobSlaReference;
  raw: unknown;
}

export interface PortalConfiguration {
  chainId: number;
  jobRegistryAddress: string;
  taxPolicyAddress: string;
  certificateNFTAddress: string;
  validationModuleAddress?: string;
  stakeManagerAddress?: string;
  stakingTokenAddress?: string;
  stakingTokenSymbol?: string;
  rpcUrl: string;
  subgraphUrl?: string;
}
