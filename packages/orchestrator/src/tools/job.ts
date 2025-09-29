import { ethers } from "ethers";
import type {
  ApplyJobIntent,
  CreateJobIntent,
  FinalizeIntent,
  SubmitWorkIntent,
} from "../router.js";
import { loadContracts } from "../chain/contracts.js";
import { getSignerForUser } from "../chain/provider.js";
import {
  buildDryRunResult,
  buildPolicyOverrides,
  formatError,
  hexlify,
  pinToIpfs,
  simulateContractCall,
  toWei,
  type DryRunResult,
  type ExecutionStepResult,
  type PreparedCallStep,
} from "./common.js";
import { policyManager } from "../policy/index.js";
import { CONTRACT_ADDRESSES } from "../chain/addresses.js";

const policy = policyManager();

type PreparedCreateJobParams = {
  rewardWei: bigint;
  deadline: bigint;
  specPayload: unknown;
  specHash: string;
  specUri: string;
  overrides: Record<string, unknown>;
  title?: string;
};

type FeeSettings = {
  feePct?: bigint;
  burnPct?: bigint;
  validatorRewardPct?: bigint;
};

function requireUserId(meta?: { userId?: string | null }): string {
  const candidate = meta?.userId?.trim();
  if (!candidate) {
    throw new Error("Missing meta.userId for signing.");
  }
  return candidate;
}

function isDeployed(address: string): boolean {
  return address !== ethers.ZeroAddress;
}

async function safeReadBigInt(
  contract: ethers.Contract,
  fn: string
): Promise<bigint | undefined> {
  try {
    const callable = contract.getFunction(fn);
    const value = await callable.staticCall();
    if (typeof value === "bigint") {
      return value;
    }
    if (typeof value === "number") {
      return BigInt(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      if (trimmed.startsWith("0x")) {
        return BigInt(trimmed);
      }
      return BigInt(trimmed);
    }
    return undefined;
  } catch (error) {
    console.warn(`Failed to read ${fn} from contract`, error);
    return undefined;
  }
}

async function gatherFeeSettings(
  jobRegistry: ethers.Contract,
  stakeManager: ethers.Contract,
  feePool: ethers.Contract
): Promise<FeeSettings> {
  const [registryFee, stakeBurn, stakeFee, registryValidator, feePoolBurn] = await Promise.all([
    safeReadBigInt(jobRegistry, "feePct"),
    isDeployed(CONTRACT_ADDRESSES.STAKE_MANAGER)
      ? safeReadBigInt(stakeManager, "burnPct")
      : Promise.resolve(undefined),
    isDeployed(CONTRACT_ADDRESSES.STAKE_MANAGER)
      ? safeReadBigInt(stakeManager, "feePct")
      : Promise.resolve(undefined),
    safeReadBigInt(jobRegistry, "validatorRewardPct"),
    isDeployed(CONTRACT_ADDRESSES.FEE_POOL)
      ? safeReadBigInt(feePool, "burnPct")
      : Promise.resolve(undefined),
  ]);

  const burnPct = stakeBurn ?? feePoolBurn;

  return {
    feePct: registryFee ?? stakeFee,
    burnPct: burnPct ?? undefined,
    validatorRewardPct: registryValidator,
  };
}

function serializeFeeSettings(settings: FeeSettings): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  if (settings.feePct !== undefined) {
    entries.feePct = settings.feePct.toString();
  }
  if (settings.burnPct !== undefined) {
    entries.burnPct = settings.burnPct.toString();
  }
  if (settings.validatorRewardPct !== undefined) {
    entries.validatorRewardPct = settings.validatorRewardPct.toString();
  }
  return entries;
}

function buildCallStep(
  label: string,
  contract: ethers.Contract,
  tx: ethers.TransactionRequest,
  gasEstimate: bigint,
  result?: unknown
): PreparedCallStep {
  return {
    label,
    to: (tx.to ?? (contract.target as string)) as string,
    data: tx.data ?? "0x",
    value: hexlify(tx.value ?? 0),
    gasEstimate: hexlify(gasEstimate),
    result,
  };
}

async function prepareCreateJobParams(
  ics: CreateJobIntent
): Promise<PreparedCreateJobParams> {
  const job = ics.params.job;
  const rewardWei = toWei(job.rewardAGIA);
  policy.validateJobCreationBudget(rewardWei);
  const deadline = normalizeDeadline(job.deadline);
  const specPayload = job.spec;
  const serializedSpec = JSON.stringify(specPayload);
  const specHash = ethers.id(serializedSpec);
  const specUri = await pinToIpfs(specPayload);
  const overrides = buildPolicyOverrides(ics.meta, { jobBudgetWei: rewardWei });
  return {
    rewardWei,
    deadline,
    specPayload,
    specHash,
    specUri,
    overrides,
    title: job.title,
  };
}

export async function createJobDryRun(ics: CreateJobIntent): Promise<DryRunResult> {
  const userId = requireUserId(ics.meta);
  const prepared = await prepareCreateJobParams(ics);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { jobRegistry, stakeManager, feePool } = loadContracts(signer);

  const tx = await jobRegistry.createJob.populateTransaction(
    prepared.rewardWei,
    prepared.deadline,
    prepared.specHash,
    prepared.specUri,
    prepared.overrides
  );
  tx.from = await signer.getAddress();

  const simulation = await simulateContractCall(signer, tx, (raw) => {
    const decoded = jobRegistry.interface.decodeFunctionResult("createJob", raw);
    return decoded[0];
  });

  const jobPreview = simulation.decoded !== undefined ? BigInt(simulation.decoded as bigint).toString() : undefined;
  const call = buildCallStep(
    "JobRegistry.createJob",
    jobRegistry,
    tx,
    simulation.gasEstimate,
    jobPreview ? { jobIdPreview: jobPreview } : undefined
  );

  const feeSettings = await gatherFeeSettings(jobRegistry, stakeManager, feePool);
  const metadata: Record<string, unknown> = {
    rewardWei: prepared.rewardWei.toString(),
    rewardAGIA: ethers.formatEther(prepared.rewardWei),
    deadline: prepared.deadline.toString(),
    specHash: prepared.specHash,
    specUri: prepared.specUri,
    title: prepared.title,
    ...serializeFeeSettings(feeSettings),
  };

  return buildDryRunResult(tx.from as string, ics.meta?.txMode, [call], metadata);
}

export async function createJobExecute(
  ics: CreateJobIntent
): Promise<ExecutionStepResult[]> {
  const userId = requireUserId(ics.meta);
  const prepared = await prepareCreateJobParams(ics);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { jobRegistry, stakeManager, feePool } = loadContracts(signer);

  const tx = await jobRegistry.createJob(
    prepared.rewardWei,
    prepared.deadline,
    prepared.specHash,
    prepared.specUri,
    prepared.overrides
  );
  const receipt = await tx.wait();
  const jobId = extractJobId(jobRegistry, receipt);
  if (jobId) {
    policy.registerJobBudget(jobId, prepared.rewardWei);
  }

  const feeSettings = await gatherFeeSettings(jobRegistry, stakeManager, feePool);
  const metadata: Record<string, unknown> = {
    rewardWei: prepared.rewardWei.toString(),
    rewardAGIA: ethers.formatEther(prepared.rewardWei),
    deadline: prepared.deadline.toString(),
    specHash: prepared.specHash,
    specUri: prepared.specUri,
    title: prepared.title,
    jobId,
    ...serializeFeeSettings(feeSettings),
  };

  return [
    {
      label: "JobRegistry.createJob",
      txHash: tx.hash,
      receipt,
      metadata,
    },
  ];
}

export async function applyJobDryRun(ics: ApplyJobIntent): Promise<DryRunResult> {
  const userId = requireUserId(ics.meta);
  const jobId = normalizeJobId(ics.params.jobId);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { jobRegistry, stakeManager, feePool } = loadContracts(signer);
  const proof = ics.params.ens.proof ?? [];

  const tx = await jobRegistry.applyForJob.populateTransaction(
    jobId,
    ics.params.ens.subdomain,
    proof,
    buildPolicyOverrides(ics.meta, { jobId })
  );
  tx.from = await signer.getAddress();

  const simulation = await simulateContractCall(signer, tx);
  const call = buildCallStep("JobRegistry.applyForJob", jobRegistry, tx, simulation.gasEstimate, {
    jobId: jobId.toString(),
    subdomain: ics.params.ens.subdomain,
  });

  const feeSettings = await gatherFeeSettings(jobRegistry, stakeManager, feePool);
  const metadata: Record<string, unknown> = {
    jobId: jobId.toString(),
    subdomain: ics.params.ens.subdomain,
    ...serializeFeeSettings(feeSettings),
  };

  return buildDryRunResult(tx.from as string, ics.meta?.txMode, [call], metadata);
}

export async function applyJobExecute(
  ics: ApplyJobIntent
): Promise<ExecutionStepResult[]> {
  const userId = requireUserId(ics.meta);
  const jobId = normalizeJobId(ics.params.jobId);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { jobRegistry, stakeManager, feePool } = loadContracts(signer);
  const proof = ics.params.ens.proof ?? [];

  const tx = await jobRegistry.applyForJob(
    jobId,
    ics.params.ens.subdomain,
    proof,
    buildPolicyOverrides(ics.meta, { jobId })
  );
  const receipt = await tx.wait();
  const feeSettings = await gatherFeeSettings(jobRegistry, stakeManager, feePool);

  return [
    {
      label: "JobRegistry.applyForJob",
      txHash: tx.hash,
      receipt,
      metadata: {
        jobId: jobId.toString(),
        subdomain: ics.params.ens.subdomain,
        ...serializeFeeSettings(feeSettings),
      },
    },
  ];
}

export async function submitWorkDryRun(ics: SubmitWorkIntent): Promise<DryRunResult> {
  const userId = requireUserId(ics.meta);
  const prepared = await prepareSubmitWorkParams(ics);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { jobRegistry, stakeManager, feePool } = loadContracts(signer);

  const tx = await jobRegistry.submit.populateTransaction(
    prepared.jobId,
    prepared.resultHash,
    prepared.resultUri,
    prepared.subdomain,
    prepared.proof,
    buildPolicyOverrides(ics.meta, { jobId: prepared.jobId })
  );
  tx.from = await signer.getAddress();

  const simulation = await simulateContractCall(signer, tx);
  const call = buildCallStep("JobRegistry.submit", jobRegistry, tx, simulation.gasEstimate, {
    jobId: prepared.jobId.toString(),
    resultUri: prepared.resultUri,
  });

  const feeSettings = await gatherFeeSettings(jobRegistry, stakeManager, feePool);
  const metadata: Record<string, unknown> = {
    jobId: prepared.jobId.toString(),
    resultHash: prepared.resultHash,
    resultUri: prepared.resultUri,
    subdomain: prepared.subdomain,
    ...serializeFeeSettings(feeSettings),
  };

  return buildDryRunResult(tx.from as string, ics.meta?.txMode, [call], metadata);
}

export async function submitWorkExecute(
  ics: SubmitWorkIntent
): Promise<ExecutionStepResult[]> {
  const userId = requireUserId(ics.meta);
  const prepared = await prepareSubmitWorkParams(ics);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { jobRegistry, stakeManager, feePool } = loadContracts(signer);

  const tx = await jobRegistry.submit(
    prepared.jobId,
    prepared.resultHash,
    prepared.resultUri,
    prepared.subdomain,
    prepared.proof,
    buildPolicyOverrides(ics.meta, { jobId: prepared.jobId })
  );
  const receipt = await tx.wait();
  const feeSettings = await gatherFeeSettings(jobRegistry, stakeManager, feePool);

  return [
    {
      label: "JobRegistry.submit",
      txHash: tx.hash,
      receipt,
      metadata: {
        jobId: prepared.jobId.toString(),
        resultHash: prepared.resultHash,
        resultUri: prepared.resultUri,
        subdomain: prepared.subdomain,
        ...serializeFeeSettings(feeSettings),
      },
    },
  ];
}

export async function finalizeDryRun(ics: FinalizeIntent): Promise<DryRunResult> {
  const userId = requireUserId(ics.meta);
  const jobId = normalizeJobId(ics.params.jobId);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { jobRegistry, stakeManager, feePool } = loadContracts(signer);

  const tx = await jobRegistry.finalizeAfterValidation.populateTransaction(
    jobId,
    ics.params.success,
    buildPolicyOverrides(ics.meta, { jobId })
  );
  tx.from = await signer.getAddress();

  const simulation = await simulateContractCall(signer, tx);
  const call = buildCallStep("JobRegistry.finalizeAfterValidation", jobRegistry, tx, simulation.gasEstimate, {
    jobId: jobId.toString(),
    success: ics.params.success,
  });

  const feeSettings = await gatherFeeSettings(jobRegistry, stakeManager, feePool);
  const metadata: Record<string, unknown> = {
    jobId: jobId.toString(),
    success: ics.params.success,
    ...serializeFeeSettings(feeSettings),
  };

  return buildDryRunResult(tx.from as string, ics.meta?.txMode, [call], metadata);
}

export async function finalizeExecute(
  ics: FinalizeIntent
): Promise<ExecutionStepResult[]> {
  const userId = requireUserId(ics.meta);
  const jobId = normalizeJobId(ics.params.jobId);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { jobRegistry, stakeManager, feePool } = loadContracts(signer);

  const tx = await jobRegistry.finalizeAfterValidation(
    jobId,
    ics.params.success,
    buildPolicyOverrides(ics.meta, { jobId })
  );
  const receipt = await tx.wait();
  const feeSettings = await gatherFeeSettings(jobRegistry, stakeManager, feePool);

  return [
    {
      label: "JobRegistry.finalizeAfterValidation",
      txHash: tx.hash,
      receipt,
      metadata: {
        jobId: jobId.toString(),
        success: ics.params.success,
        ...serializeFeeSettings(feeSettings),
      },
    },
  ];
}

export async function* createJob(ics: CreateJobIntent) {
  try {
    const dryRun = await createJobDryRun(ics);
    yield renderDryRunSummary("Create job", dryRun);
    if (ics.confirm === false) {
      yield "🧪 Dry-run completed. Set confirm=true to execute.\n";
      return;
    }
    const [execution] = await createJobExecute(ics);
    const jobId = execution.metadata?.jobId as string | undefined;
    yield `⛓️ Tx submitted: ${execution.txHash}\n`;
    yield `✅ Job posted${jobId ? ` with ID ${jobId}` : ""}.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

export async function* applyJob(ics: ApplyJobIntent) {
  try {
    const dryRun = await applyJobDryRun(ics);
    yield renderDryRunSummary("Apply for job", dryRun);
    if (ics.confirm === false) {
      yield "🧪 Dry-run completed. Set confirm=true to execute.\n";
      return;
    }
    const [execution] = await applyJobExecute(ics);
    yield `⛓️ Tx submitted: ${execution.txHash}\n`;
    yield `✅ Application submitted for job #${execution.metadata?.jobId ?? "?"}.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

export async function* submitWork(ics: SubmitWorkIntent) {
  try {
    const dryRun = await submitWorkDryRun(ics);
    yield renderDryRunSummary("Submit work", dryRun);
    if (ics.confirm === false) {
      yield "🧪 Dry-run completed. Set confirm=true to execute.\n";
      return;
    }
    const [execution] = await submitWorkExecute(ics);
    yield `⛓️ Tx submitted: ${execution.txHash}\n`;
    yield `✅ Submission broadcast for job #${execution.metadata?.jobId ?? "?"}.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

export async function* finalize(ics: FinalizeIntent) {
  try {
    const dryRun = await finalizeDryRun(ics);
    yield renderDryRunSummary("Finalize job", dryRun);
    if (ics.confirm === false) {
      yield "🧪 Dry-run completed. Set confirm=true to execute.\n";
      return;
    }
    const [execution] = await finalizeExecute(ics);
    yield `⛓️ Tx submitted: ${execution.txHash}\n`;
    yield `✅ Job #${execution.metadata?.jobId ?? "?"} finalized.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

function renderDryRunSummary(title: string, result: DryRunResult): string {
  const lines: string[] = [];
  lines.push(`🔍 ${title} dry-run (${result.txMode})\n`);
  const primary = result.calls[0];
  if (primary?.gasEstimate) {
    try {
      const gas = BigInt(primary.gasEstimate);
      lines.push(`• Estimated gas: ${gas.toString()}\n`);
    } catch (error) {
      console.warn("Failed to parse gas estimate", error);
    }
  }
  const metadata = result.metadata ?? {};
  if (metadata.rewardAGIA) {
    lines.push(`• Reward: ${metadata.rewardAGIA} AGIA\n`);
  }
  if (metadata.feePct !== undefined) {
    lines.push(`• Fee pct: ${metadata.feePct}%\n`);
  }
  if (metadata.burnPct !== undefined) {
    lines.push(`• Burn pct: ${metadata.burnPct}%\n`);
  }
  if (metadata.specUri) {
    lines.push(`• Spec URI: ${metadata.specUri}\n`);
  }
  if (metadata.jobId) {
    lines.push(`• Job ID: ${metadata.jobId}\n`);
  }
  if (metadata.subdomain) {
    lines.push(`• ENS subdomain: ${metadata.subdomain}\n`);
  }
  return lines.join("");
}

function normalizeDeadline(input: CreateJobIntent["params"]["job"]["deadline"]): bigint {
  if (typeof input === "bigint") {
    return input;
  }
  if (input instanceof Date) {
    return BigInt(Math.floor(input.getTime() / 1000));
  }
  if (typeof input === "number") {
    return BigInt(Math.floor(input));
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error("Deadline string cannot be empty");
    }
    if (/^\d+$/u.test(trimmed)) {
      return BigInt(trimmed);
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return BigInt(Math.floor(parsed / 1000));
    }
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return BigInt(Math.floor(numeric));
    }
  }
  throw new Error("Unsupported deadline format");
}

function normalizeJobId(jobId: SubmitWorkIntent["params"]["jobId"]): bigint {
  if (typeof jobId === "bigint") {
    return jobId;
  }
  if (typeof jobId === "number") {
    return BigInt(Math.floor(jobId));
  }
  const trimmed = jobId.trim().replace(/^#/, "");
  return BigInt(trimmed);
}

async function prepareSubmitWorkParams(ics: SubmitWorkIntent) {
  const jobId = normalizeJobId(ics.params.jobId);
  const { result, ens } = ics.params;
  let resultURI = result.uri;
  let hashSource: string | undefined;
  if (result.payload !== undefined) {
    resultURI = await pinToIpfs(result.payload);
    hashSource = JSON.stringify(result.payload);
  } else if (resultURI) {
    hashSource = resultURI;
  }
  if (!resultURI) {
    throw new Error("Missing result URI.");
  }
  const resultHash = result.hash ?? ethers.id(hashSource ?? resultURI);
  const proof = ens.proof ?? [];
  return {
    jobId,
    resultUri: resultURI,
    resultHash,
    subdomain: ens.subdomain,
    proof,
  };
}

function extractJobId(contract: ethers.Contract, receipt: ethers.TransactionReceipt) {
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "JobCreated" && parsed.args?.jobId !== undefined) {
        return parsed.args.jobId.toString();
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        continue;
      }
      if (/no matching event/i.test(error.message)) {
        continue;
      }
      throw error;
    }
  }
  return undefined;
}
