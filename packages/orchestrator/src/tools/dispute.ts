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
  reason: string;
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

function parseDisputeParams(ics: ICSType): DisputeParams {
  const jobId = normalizeJobId((ics.params as Record<string, unknown>).jobId);
  const reasonRaw = (ics.params as Record<string, unknown>).reason ?? (ics.params as Record<string, unknown>).evidence;
  if (!reasonRaw) {
    throw new Error("Dispute intent requires reason or evidence");
  }
  const reason = typeof reasonRaw === "string" ? reasonRaw : JSON.stringify(reasonRaw);
  return { jobId, reason };
}

export async function disputeDryRun(ics: ICSType): Promise<DryRunResult> {
  const userId = requireUserId(ics.meta);
  const params = parseDisputeParams(ics);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { jobRegistry } = loadContracts(signer);
  const from = await signer.getAddress();

  const tx = await jobRegistry.raiseDispute.populateTransaction(
    params.jobId,
    params.reason,
    buildPolicyOverrides(ics.meta, { jobId: params.jobId })
  );
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

  const tx = await jobRegistry.raiseDispute(
    params.jobId,
    params.reason,
    buildPolicyOverrides(ics.meta, { jobId: params.jobId })
  );
  const receipt = await tx.wait();

  return [
    {
      label: "JobRegistry.raiseDispute",
      txHash: tx.hash,
      receipt,
      metadata: {
        jobId: params.jobId.toString(),
        reason: params.reason,
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
