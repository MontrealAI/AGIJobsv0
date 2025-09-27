export type ExecutionReceipt = {
  id: string;
  jobId?: number;
  specCid?: string;
  specUrl?: string | null;
  deliverableCid?: string | null;
  deliverableUrl?: string | null;
  netPayout?: string;
  explorerUrl?: string;
  createdAt: number;
};
