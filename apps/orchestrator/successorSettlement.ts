import type { Contract } from 'ethers';

type RecordValue = Record<string, unknown>;
const { loadSuccessorBridge } = require('./successor-runtime.cjs') as {
  loadSuccessorBridge(): Promise<{
    describeSettlementLink(
      value: unknown,
      deployment: unknown
    ): Promise<RecordValue>;
  }>;
};

/** Validate an economic observation; this function never sends a transaction. */
export async function describeSuccessorSettlement(
  value: unknown,
  trustedDeployment: unknown
): Promise<RecordValue> {
  const core = await loadSuccessorBridge();
  return core.describeSettlementLink(value, trustedDeployment);
}

export interface SuccessorSettlementRequest {
  missionId: string;
  workOrderDigest: string;
  jobId: string;
  transactionHash: string;
  committedSpec: string;
  completedDeliverable: string;
}

export interface SuccessorSettlementDeployment {
  mode: 'fixture';
  chainId: string;
  registryAddress: string;
  tokenAddress: string;
  tokenSymbol: 'AGIALPHA';
  decimals: 18;
  minConfirmations: number;
}

/** Read a real local-chain payout; never broadcast or interpret payment as proof. */
export async function reconcileSuccessorSettlement(
  registry: Contract,
  request: SuccessorSettlementRequest,
  deployment: SuccessorSettlementDeployment
): Promise<RecordValue> {
  return require('./successor-runtime.cjs').reconcileSuccessorSettlement(
    registry,
    request,
    deployment
  );
}
