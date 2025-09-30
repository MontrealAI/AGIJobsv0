import { ethers } from "ethers";
import { rpc, resolveTxMode, type NormalizedTxMode } from "../chain/provider.js";
import {
  createIpfsUploader,
  resolveArweaveConfig,
  resolveProvidersFromEnv,
  type IpfsUploader,
  type PinResult,
} from "../../../../storage/ipfs/index.js";

export type { PinResult } from "../../../../storage/ipfs/index.js";

type PolicyMeta = {
  userId?: string;
  traceId?: string;
} | null | undefined;

type PolicyExtras = {
  jobId?: bigint | string;
  jobBudgetWei?: bigint;
};

let sharedUploader: IpfsUploader | null = null;

type PinToIpfsOptions = {
  mirrorToArweave?: boolean;
  filename?: string;
  contentType?: string;
};

function ensureUploader(): IpfsUploader {
  if (sharedUploader) {
    return sharedUploader;
  }
  const providers = resolveProvidersFromEnv(process.env);
  const arweave = resolveArweaveConfig(process.env);
  sharedUploader = createIpfsUploader({
    providers,
    mirrorToArweave: arweave?.enabled ?? false,
    arweave: arweave ?? undefined,
  });
  return sharedUploader;
}

export function setIpfsUploader(uploader: IpfsUploader | null) {
  sharedUploader = uploader;
}

function inferFilename(payload: unknown, preferred?: string): string | undefined {
  if (preferred) return preferred;
  if (payload && typeof payload === "object") {
    return "payload.json";
  }
  if (typeof payload === "string") {
    return payload.trim().startsWith("{") ? "payload.json" : "payload.txt";
  }
  return undefined;
}

export async function pinToIpfs(payload: unknown, options: PinToIpfsOptions = {}): Promise<PinResult> {
  const uploader = ensureUploader();
  const filename = inferFilename(payload, options.filename);
  return uploader.pin(payload, {
    mirrorToArweave: options.mirrorToArweave,
    filename,
    contentType: options.contentType,
  });
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
