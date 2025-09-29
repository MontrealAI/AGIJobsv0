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
  type PreparedCallStep,
} from "./common.js";

interface ValidationParams {
  jobId: bigint;
  commit?: {
    hash: string;
    subdomain: string;
    proof: string[];
  };
  reveal?: {
    approve: boolean;
    burnTxHash: string;
    salt: string;
    subdomain: string;
    proof: string[];
  };
  finalize?: {
    force: boolean;
  };
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
  throw new Error("Missing jobId for validation intent");
}

function ensureBytes32(value: string | undefined, fallback = ethers.ZeroHash): string {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{64}$/u.test(trimmed)) {
    throw new Error(`Invalid bytes32 value: ${value}`);
  }
  return trimmed;
}

function parseProof(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("Proof must be an array");
  }
  return value.map((entry) => ensureBytes32(String(entry)));
}

function parseValidationParams(ics: ICSType): ValidationParams {
  const jobId = normalizeJobId((ics.params as Record<string, unknown>).jobId);
  const params: ValidationParams = { jobId };
  const rawCommit = (ics.params as Record<string, unknown>).commit as Record<string, unknown> | undefined;
  if (rawCommit) {
    if (!rawCommit.hash || !rawCommit.subdomain) {
      throw new Error("Validation commit requires hash and subdomain");
    }
    params.commit = {
      hash: ensureBytes32(String(rawCommit.hash)),
      subdomain: String(rawCommit.subdomain),
      proof: parseProof(rawCommit.proof),
    };
  }
  const rawReveal = (ics.params as Record<string, unknown>).reveal as Record<string, unknown> | undefined;
  if (rawReveal) {
    if (rawReveal.approve === undefined || rawReveal.salt === undefined || rawReveal.subdomain === undefined) {
      throw new Error("Validation reveal requires approve, salt, and subdomain");
    }
    params.reveal = {
      approve: Boolean(rawReveal.approve),
      burnTxHash: ensureBytes32(rawReveal.burnTxHash as string | undefined, ethers.ZeroHash),
      salt: ensureBytes32(String(rawReveal.salt)),
      subdomain: String(rawReveal.subdomain),
      proof: parseProof(rawReveal.proof),
    };
  }
  const rawFinalize = (ics.params as Record<string, unknown>).finalize as Record<string, unknown> | undefined;
  if (rawFinalize) {
    params.finalize = {
      force: Boolean(rawFinalize.force),
    };
  }
  if (!params.commit && !params.reveal && !params.finalize) {
    throw new Error("Validation intent must include commit, reveal, or finalize step");
  }
  return params;
}

function buildCall(
  label: string,
  tx: ethers.TransactionRequest,
  gasEstimate: bigint,
  result?: Record<string, unknown>
): PreparedCallStep {
  return {
    label,
    to: (tx.to ?? ethers.ZeroAddress) as string,
    data: tx.data ?? "0x",
    value: hexlify(tx.value ?? 0),
    gasEstimate: hexlify(gasEstimate),
    result,
  };
}

export async function validateDryRun(ics: ICSType): Promise<DryRunResult> {
  const userId = requireUserId(ics.meta);
  const params = parseValidationParams(ics);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { validationModule } = loadContracts(signer);
  const from = await signer.getAddress();

  const calls: PreparedCallStep[] = [];
  const stages: string[] = [];

  if (params.commit) {
    const tx = await validationModule.commitVote.populateTransaction(
      params.jobId,
      params.commit.hash,
      params.commit.subdomain,
      params.commit.proof,
      buildPolicyOverrides(ics.meta, { jobId: params.jobId })
    );
    tx.from = from;
    const simulation = await simulateContractCall(signer, tx);
    calls.push(
      buildCall("ValidationModule.commitVote", tx, simulation.gasEstimate, {
        stage: "commit",
      })
    );
    stages.push("commit");
  }

  if (params.reveal) {
    const tx = await validationModule.revealVote.populateTransaction(
      params.jobId,
      params.reveal.approve,
      params.reveal.burnTxHash,
      params.reveal.salt,
      params.reveal.subdomain,
      params.reveal.proof,
      buildPolicyOverrides(ics.meta, { jobId: params.jobId })
    );
    tx.from = from;
    const simulation = await simulateContractCall(signer, tx);
    calls.push(
      buildCall("ValidationModule.revealVote", tx, simulation.gasEstimate, {
        stage: "reveal",
        approve: params.reveal.approve,
      })
    );
    stages.push("reveal");
  }

  if (params.finalize) {
    const method = params.finalize.force ? "forceFinalize" : "finalize";
    const fn = validationModule.getFunction(method);
    const tx = await fn.populateTransaction(
      params.jobId,
      buildPolicyOverrides(ics.meta, { jobId: params.jobId })
    );
    tx.from = from;
    const simulation = await simulateContractCall(signer, tx);
    calls.push(
      buildCall(`ValidationModule.${method}`, tx, simulation.gasEstimate, {
        stage: params.finalize.force ? "forceFinalize" : "finalize",
      })
    );
    stages.push(params.finalize.force ? "forceFinalize" : "finalize");
  }

  const metadata: Record<string, unknown> = {
    jobId: params.jobId.toString(),
    stages,
  };

  return buildDryRunResult(from, ics.meta?.txMode, calls, metadata);
}

export async function validateExecute(ics: ICSType): Promise<ExecutionStepResult[]> {
  const userId = requireUserId(ics.meta);
  const params = parseValidationParams(ics);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { validationModule } = loadContracts(signer);

  const results: ExecutionStepResult[] = [];

  if (params.commit) {
    const tx = await validationModule.commitVote(
      params.jobId,
      params.commit.hash,
      params.commit.subdomain,
      params.commit.proof,
      buildPolicyOverrides(ics.meta, { jobId: params.jobId })
    );
    const receipt = await tx.wait();
    results.push({
      label: "ValidationModule.commitVote",
      txHash: tx.hash,
      receipt,
      metadata: {
        jobId: params.jobId.toString(),
        stage: "commit",
      },
    });
  }

  if (params.reveal) {
    const tx = await validationModule.revealVote(
      params.jobId,
      params.reveal.approve,
      params.reveal.burnTxHash,
      params.reveal.salt,
      params.reveal.subdomain,
      params.reveal.proof,
      buildPolicyOverrides(ics.meta, { jobId: params.jobId })
    );
    const receipt = await tx.wait();
    results.push({
      label: "ValidationModule.revealVote",
      txHash: tx.hash,
      receipt,
      metadata: {
        jobId: params.jobId.toString(),
        stage: "reveal",
        approve: params.reveal.approve,
      },
    });
  }

  if (params.finalize) {
    const method = params.finalize.force ? "forceFinalize" : "finalize";
    const fn = validationModule.getFunction(method);
    const tx = await fn(
      params.jobId,
      buildPolicyOverrides(ics.meta, { jobId: params.jobId })
    );
    const receipt = await tx.wait();
    results.push({
      label: `ValidationModule.${method}`,
      txHash: tx.hash,
      receipt,
      metadata: {
        jobId: params.jobId.toString(),
        stage: params.finalize.force ? "forceFinalize" : "finalize",
      },
    });
  }

  return results;
}

export async function* commitReveal(ics: ICSType) {
  try {
    const dryRun = await validateDryRun(ics);
    yield renderValidationDryRun(dryRun);
    if (ics.confirm === false) {
      yield "🧪 Dry-run completed. Set confirm=true to execute.\n";
      return;
    }
    const executions = await validateExecute(ics);
    for (const step of executions) {
      yield `⛓️ Tx submitted: ${step.txHash}\n`;
    }
    yield `✅ Validation steps completed for job #${executions[executions.length - 1]?.metadata?.jobId ?? dryRun.metadata?.jobId}.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

function renderValidationDryRun(result: DryRunResult): string {
  const lines: string[] = [];
  lines.push(`🔍 Validation dry-run (${result.txMode})\n`);
  if (result.metadata?.jobId) {
    lines.push(`• Job ID: ${result.metadata.jobId}\n`);
  }
  if (Array.isArray(result.metadata?.stages)) {
    lines.push(`• Stages: ${(result.metadata?.stages as string[]).join(", ")}\n`);
  }
  const primary = result.calls[0];
  if (primary?.gasEstimate) {
    try {
      const gas = BigInt(primary.gasEstimate);
      lines.push(`• Estimated gas (first step): ${gas.toString()}\n`);
    } catch (error) {
      console.warn("Failed to parse gas estimate", error);
    }
  }
  return lines.join("");
}
