import type { JsonRpcProvider } from 'ethers';

export interface ComputeFromBlockOptions {
  jobId?: bigint;
}

export const computeFromBlock = async (
  provider: Pick<JsonRpcProvider, 'getBlockNumber'>,
  options: ComputeFromBlockOptions
): Promise<number | undefined> => {
  if (options.jobId) return undefined;
  const current = await provider.getBlockNumber();
  // Clamp the subtraction to zero so the hook works even on very small chains.
  return Math.max(0, current - 50_000);
};
