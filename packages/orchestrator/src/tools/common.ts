import { ethers } from "ethers";
import { rpc, resolveTxMode, type NormalizedTxMode } from "../chain/provider.js";

type PolicyMeta = {
  userId?: string;
  traceId?: string;
} | null | undefined;

type PolicyExtras = {
  jobId?: bigint | string;
  jobBudgetWei?: bigint;
};

export async function pinToIpfs(payload: unknown): Promise<string> {
  // Placeholder – integrate with IPFS or web3.storage in production.
  const serialized = JSON.stringify(payload);
  const digest = ethers.id(serialized).slice(2, 10);
  return `ipfs://stub-${digest}`;
}

export function toWei(amount: string | number | bigint): bigint {
  if (typeof amount === "bigint") {
    return amount;
  }
  const value = typeof amount === "number" ? amount.toString() : amount;
  return ethers.parseUnits(value, 18);
}

function serializeBigInt(value: bigint | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return ethers.toBeHex(value);
}

export function buildPolicyOverrides(meta: PolicyMeta, extras: PolicyExtras = {}) {
  const policy: Record<string, unknown> = {};
  if (meta?.userId) {
    policy.userId = meta.userId;
  }
  if (meta?.traceId) {
    policy.traceId = meta.traceId;
  }
  if (extras.jobId !== undefined) {
    policy.jobId = typeof extras.jobId === "string" ? extras.jobId : extras.jobId.toString();
  }
  if (extras.jobBudgetWei !== undefined) {
    policy.jobBudgetWei = serializeBigInt(extras.jobBudgetWei);
  }
  return {
    customData: {
      policy,
    },
  };
}

export type Yieldable = AsyncGenerator<string, void, unknown>;

export interface PreparedCallStep {
  label: string;
  to: string;
  data: string;
  value: string;
  gasEstimate?: string;
  result?: unknown;
}

export interface DryRunResult {
  from: string;
  txMode: NormalizedTxMode;
  calls: PreparedCallStep[];
  metadata?: Record<string, unknown>;
}

export interface ExecutionStepResult {
  label: string;
  txHash: string;
  receipt: ethers.TransactionReceipt;
  metadata?: Record<string, unknown>;
}

export async function* withSimulation<T>(
  step: string,
  runner: () => Promise<T>
): Yieldable {
  try {
    yield `${step}\n`;
    await runner();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    yield `❌ ${message}\n`;
    throw error;
  }
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `❌ ${error.message}\n`;
  }
  return "❌ Unknown error\n";
}

export function hexlify(value: ethers.BigNumberish | null | undefined): string {
  if (value === undefined || value === null) {
    return "0x0";
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return ethers.toBeHex(value);
  }
  return ethers.hexlify(value);
}

export async function simulateContractCall(
  signer: ethers.Signer,
  tx: ethers.TransactionRequest,
  decode?: (raw: string) => unknown
): Promise<{ gasEstimate: bigint; returnData: string; decoded?: unknown }> {
  const provider = signer.provider ?? rpc();
  const from = tx.from ?? (await signer.getAddress());
  const request: ethers.TransactionRequest = {
    ...tx,
    from,
  };
  const gasEstimate = await signer.estimateGas(request);
  const returnData = await provider.call(request);
  return {
    gasEstimate: BigInt(gasEstimate),
    returnData,
    decoded: decode ? decode(returnData) : undefined,
  };
}

export function buildDryRunResult(
  from: string,
  txMode: string | undefined,
  calls: PreparedCallStep[],
  metadata?: Record<string, unknown>
): DryRunResult {
  return {
    from,
    txMode: resolveTxMode(txMode),
    calls,
    metadata,
  };
}
