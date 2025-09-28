export type ExecutionReceipt = {
  id: string;
  jobId?: number;
  planHash?: string;
  txHash?: string;
  txHashes?: string[];
  specCid?: string;
  specUrl?: string | null;
  deliverableCid?: string | null;
  deliverableUrl?: string | null;
  netPayout?: string;
  explorerUrl?: string;
  createdAt: number;
  reward?: string;
  token?: string;
};
