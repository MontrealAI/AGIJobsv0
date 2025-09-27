import { ethers } from "ethers";

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
