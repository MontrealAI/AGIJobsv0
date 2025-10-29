export type Domain =
  | 'research'
  | 'governance'
  | 'operations'
  | 'compliance';

export interface ValidatorProfile {
  address: `0x${string}`;
  ensName: string;
  stake: bigint;
  active: boolean;
  slashed: boolean;
  reputation: number;
}

export interface AgentProfile {
  address: `0x${string}`;
  ensName: string;
  domain: Domain;
  budgetLimit: bigint;
}

export interface JobOutcome {
  jobId: string;
  domain: Domain;
  executedBy: string;
  success: boolean;
  cost: bigint;
  metadataHash: string;
}

export interface SentinelAlert {
  id: string;
  domain: Domain;
  reason: string;
  severity: 'warning' | 'critical';
  triggeredAt: number;
  jobId: string;
}

export interface CommitPayload {
  roundId: string;
  jobId: string;
  vote: boolean;
}

export interface RevealPayload extends CommitPayload {
  salt: string;
}

export interface CommitRecord {
  validator: `0x${string}`;
  commitHash: `0x${string}`;
  payload: CommitPayload;
  revealed: boolean;
}

export interface RevealRecord extends CommitRecord {
  revealHash: `0x${string}`;
  payload: RevealPayload;
}

export interface BatchProof {
  proofId: string;
  jobIds: string[];
  validityRoot: `0x${string}`;
  proofData: string;
}
