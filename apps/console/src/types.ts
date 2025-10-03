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
  kind: string;
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
