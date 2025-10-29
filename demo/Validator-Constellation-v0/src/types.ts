export type Address = string;

export interface ValidatorProfile {
  address: Address;
  ensName: string;
  stake: bigint;
  active: boolean;
  slashCount: number;
}

export interface AgentProfile {
  address: Address;
  ensName: string;
  reputation: number;
}

export interface JobResult {
  jobId: string;
  outcomeHash: string;
  cost: bigint;
  safe: boolean;
}

export interface SentinelAlert {
  domain: string;
  type: "BUDGET" | "UNSAFE_CALL" | "CUSTOM";
  details: string;
  timestamp: number;
}

export interface BatchProof {
  proofId: string;
  jobIds: string[];
  verifierAddress: Address;
  timestamp: number;
}

export interface CommitPayload {
  jobId: string;
  voteHash: string;
  salt: string;
  truthful: boolean;
}

export interface CommitRecord {
  validator: Address;
  commitment: string;
  revealed?: boolean;
  truthful?: boolean;
  vote?: boolean;
  salt?: string;
}
