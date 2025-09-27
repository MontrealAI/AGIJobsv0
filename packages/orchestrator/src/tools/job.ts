import { ethers } from "ethers";
import type {
  ApplyJobIntent,
  CreateJobIntent,
  FinalizeIntent,
  SubmitWorkIntent,
} from "../router.js";
import { loadContracts } from "../chain/contracts.js";
import { getSignerForUser } from "../chain/provider.js";
import { formatError, pinToIpfs, toWei, buildPolicyOverrides } from "./common.js";
import { policyManager } from "../policy/index.js";

const policy = policyManager();

export async function* createJob(ics: CreateJobIntent) {
  const userId = ics.meta?.userId;
  if (!userId) {
    yield "Missing meta.userId for signing.\n";
    return;
  }

  try {
    const job = ics.params.job;
    const reward = toWei(job.rewardAGIA);
    policy.validateJobCreationBudget(reward);
    const deadline = normalizeDeadline(job.deadline);
    yield "📦 Packaging job spec…\n";
    const specPayload = job.spec;
    const serializedSpec = JSON.stringify(specPayload);
    const specHash = ethers.id(serializedSpec);
    const uri = await pinToIpfs(specPayload);
    yield `📨 Spec pinned: ${uri}\n`;
    yield `🧾 specHash: ${specHash}\n`;

    const signer = await getSignerForUser(userId);
    const { jobRegistry } = loadContracts(signer);
    const tx = await jobRegistry.createJob(
      reward,
      deadline,
      specHash,
      uri,
      buildPolicyOverrides(ics.meta, { jobBudgetWei: reward })
    );
    yield `⛓️ Tx submitted: ${tx.hash}\n`;
    const receipt = await tx.wait();
    const jobId = extractJobId(jobRegistry, receipt);
    if (jobId) {
      policy.registerJobBudget(jobId, reward);
    }
    yield `✅ Job posted${jobId ? ` with ID ${jobId}` : ""}.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

export async function* applyJob(ics: ApplyJobIntent) {
  const userId = ics.meta?.userId;
  if (!userId) {
    yield "Missing meta.userId for signing.\n";
    return;
  }

  try {
    const jobId = normalizeJobId(ics.params.jobId);
    const signer = await getSignerForUser(userId);
    const { jobRegistry } = loadContracts(signer);
    const proof = ics.params.ens.proof ?? [];
    const tx = await jobRegistry.applyForJob(
      jobId,
      ics.params.ens.subdomain,
      proof,
      buildPolicyOverrides(ics.meta, { jobId })
    );
    yield `⛓️ Tx submitted: ${tx.hash}\n`;
    await tx.wait();
    yield `✅ Application submitted for job #${jobId.toString()}.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

export async function* submitWork(ics: SubmitWorkIntent) {
  const userId = ics.meta?.userId;
  if (!userId) {
    yield "Missing meta.userId for signing.\n";
    return;
  }

  try {
    const { jobId: rawJobId, result, ens } = ics.params;
    const jobId = normalizeJobId(rawJobId);

    let resultURI = result.uri;
    let hashSource: string | undefined;
    if (result.payload !== undefined) {
      yield "📦 Uploading result payload…\n";
      resultURI = await pinToIpfs(result.payload);
      hashSource = JSON.stringify(result.payload);
      yield `📡 Result pinned at ${resultURI}.\n`;
    } else if (resultURI) {
      hashSource = resultURI;
    }

    if (!resultURI) {
      yield "Missing result URI.\n";
      return;
    }

    const resultHash = result.hash ?? ethers.id(hashSource ?? resultURI);
    const signer = await getSignerForUser(userId);
    const { jobRegistry } = loadContracts(signer);
    const proof = ens.proof ?? [];
    const tx = await jobRegistry.submit(
      jobId,
      resultHash,
      resultURI,
      ens.subdomain,
      proof,
      buildPolicyOverrides(ics.meta, { jobId })
    );
    yield `⛓️ Tx submitted: ${tx.hash}\n`;
    await tx.wait();
    yield `✅ Submission broadcast for job #${jobId.toString()}.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

export async function* finalize(ics: FinalizeIntent) {
  const userId = ics.meta?.userId;
  if (!userId) {
    yield "Missing meta.userId for signing.\n";
    return;
  }

  try {
    const jobId = normalizeJobId(ics.params.jobId);
    const signer = await getSignerForUser(userId);
    const { jobRegistry } = loadContracts(signer);
    const tx = await jobRegistry.finalizeAfterValidation(
      jobId,
      ics.params.success,
      buildPolicyOverrides(ics.meta, { jobId })
    );
    yield `⛓️ Tx submitted: ${tx.hash}\n`;
    await tx.wait();
    yield `✅ Job #${jobId.toString()} finalized.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
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
    if (/^\d+$/.test(trimmed)) {
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

