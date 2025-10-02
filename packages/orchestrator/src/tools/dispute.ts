import { ethers } from "ethers";
import type { ICSType } from "../router.js";
import { loadContracts } from "../chain/contracts.js";
import { getSignerForUser } from "../chain/provider.js";
import {
  buildDryRunResult,
  buildPolicyOverrides,
  formatError,
  hexlify,
  simulateContractCall,
  type DryRunResult,
  type ExecutionStepResult,
} from "./common.js";

interface DisputeParams {
  jobId: bigint;
  reason?: string;
  evidenceHash?: string;
}

function requireUserId(meta?: { userId?: string | null }): string {
  const candidate = meta?.userId?.trim();
  if (!candidate) {
    throw new Error("Missing meta.userId for signing.");
  }
  return candidate;
}

function normalizeJobId(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(Math.floor(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/^#/, "");
    if (!trimmed) {
      throw new Error("Job ID cannot be empty");
    }
    return BigInt(trimmed);
  }
  throw new Error("Missing jobId for dispute intent");
}

function isBytes32Hash(value: unknown): value is string {
  return typeof value === "string" && ethers.isHexString(value, 32);
}

function parseDisputeParams(ics: ICSType): DisputeParams {
  const payload = ics.params as Record<string, unknown>;
  const jobId = normalizeJobId(payload.jobId);
  const result: DisputeParams = { jobId };

  const reasonRaw = payload.reason;
  if (typeof reasonRaw === "string" && reasonRaw.trim().length > 0) {
    result.reason = reasonRaw;
  } else if (reasonRaw !== undefined && reasonRaw !== null) {
    result.reason = JSON.stringify(reasonRaw);
  }

  const evidenceRaw = payload.evidence ?? payload.evidenceHash;
  if (typeof evidenceRaw === "string" && evidenceRaw.trim().length > 0) {
    const trimmed = evidenceRaw.trim();
    if (isBytes32Hash(trimmed)) {
      result.evidenceHash = ethers.zeroPadValue(trimmed, 32);
    } else if (!result.reason) {
      result.reason = trimmed;
    }
  }

  if (!result.reason && !result.evidenceHash) {
    throw new Error("Dispute intent requires reason or evidence");
  }

  return result;
}

function callRaiseDispute(
  jobRegistry: ethers.Contract,
  params: DisputeParams,
  overrides: Record<string, unknown> | undefined,
  mode: "populate" | "execute"
) {
  const hasOverrides =
    overrides && typeof overrides === "object" && Object.keys(overrides).length;

  if (params.evidenceHash && params.reason) {
    const args: unknown[] = [params.jobId, params.evidenceHash, params.reason];
    if (mode === "populate") {
      return hasOverrides
        ? jobRegistry.dispute.populateTransaction(...args, overrides)
        : jobRegistry.dispute.populateTransaction(...args);
    }
    return hasOverrides
      ? jobRegistry.dispute(...args, overrides)
      : jobRegistry.dispute(...args);
  }

  if (params.evidenceHash) {
    const method =
      (jobRegistry as unknown as Record<string, unknown>)[
        "raiseDispute(uint256,bytes32)"
      ];
    if (typeof method !== "function") {
      throw new Error("raiseDispute(uint256,bytes32) overload unavailable");
    }
    const args: unknown[] = [params.jobId, params.evidenceHash];
    if (mode === "populate") {
      return hasOverrides
        ? (method as any).populateTransaction(...args, overrides)
        : (method as any).populateTransaction(...args);
    }
    return hasOverrides
      ? (method as any)(...args, overrides)
      : (method as any)(...args);
  }

  if (!params.reason) {
    throw new Error("Dispute intent requires textual reason or evidence hash");
  }

  const method =
    (jobRegistry as unknown as Record<string, unknown>)[
      "raiseDispute(uint256,string)"
    ];
  if (typeof method !== "function") {
    throw new Error("raiseDispute(uint256,string) overload unavailable");
  }
  const args: unknown[] = [params.jobId, params.reason];
  if (mode === "populate") {
    return hasOverrides
      ? (method as any).populateTransaction(...args, overrides)
      : (method as any).populateTransaction(...args);
  }
  return hasOverrides
    ? (method as any)(...args, overrides)
    : (method as any)(...args);
}

export async function disputeDryRun(ics: ICSType): Promise<DryRunResult> {
  const userId = requireUserId(ics.meta);
  const params = parseDisputeParams(ics);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { jobRegistry } = loadContracts(signer);
  const from = await signer.getAddress();

  const overrides = buildPolicyOverrides(ics.meta, { jobId: params.jobId });
  const tx = await callRaiseDispute(jobRegistry, params, overrides, "populate");
  tx.from = from;
  const simulation = await simulateContractCall(signer, tx);

  return buildDryRunResult(from, ics.meta?.txMode, [
    {
      label: "JobRegistry.raiseDispute",
      to: (tx.to ?? (jobRegistry.target as string)) as string,
      data: tx.data ?? "0x",
      value: hexlify(tx.value ?? 0),
      gasEstimate: hexlify(simulation.gasEstimate),
      result: {
        jobId: params.jobId.toString(),
      },
    },
  ], {
    jobId: params.jobId.toString(),
    reason: params.reason,
  });
}

export async function disputeExecute(ics: ICSType): Promise<ExecutionStepResult[]> {
  const userId = requireUserId(ics.meta);
  const params = parseDisputeParams(ics);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { jobRegistry } = loadContracts(signer);

  const overrides = buildPolicyOverrides(ics.meta, { jobId: params.jobId });
  const tx = await callRaiseDispute(jobRegistry, params, overrides, "execute");
  const receipt = await tx.wait();

  return [
    {
      label: "JobRegistry.raiseDispute",
      txHash: tx.hash,
      receipt,
      metadata: {
        jobId: params.jobId.toString(),
        reason: params.reason,
        evidenceHash: params.evidenceHash,
      },
    },
  ];
}

export async function* raise(ics: ICSType) {
  try {
    const dryRun = await disputeDryRun(ics);
    yield renderDisputeDryRun(dryRun);
    if (ics.confirm === false) {
      yield "🧪 Dry-run completed. Set confirm=true to execute.\n";
      return;
    }
    const [execution] = await disputeExecute(ics);
    yield `⛓️ Tx submitted: ${execution.txHash}\n`;
    yield `✅ Dispute submitted for job #${execution.metadata?.jobId ?? dryRun.metadata?.jobId}.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

function renderDisputeDryRun(result: DryRunResult): string {
  const lines: string[] = [];
  lines.push(`🔍 Dispute dry-run (${result.txMode})\n`);
  if (result.metadata?.jobId) {
    lines.push(`• Job ID: ${result.metadata.jobId}\n`);
  }
  if (result.metadata?.reason) {
    lines.push(`• Reason: ${result.metadata.reason}\n`);
  }
  if (result.metadata?.evidenceHash) {
    lines.push(`• Evidence Hash: ${result.metadata.evidenceHash}\n`);
  }
  const primary = result.calls[0];
  if (primary?.gasEstimate) {
    try {
      const gas = BigInt(primary.gasEstimate);
      lines.push(`• Estimated gas: ${gas.toString()}\n`);
    } catch (error) {
      console.warn("Failed to parse gas estimate", error);
    }
  }
  return lines.join("");
}

export const __test__ = {
  isBytes32Hash,
  parseDisputeParams,
  callRaiseDispute,
};
