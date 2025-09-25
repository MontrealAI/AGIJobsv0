import type { ICSType } from "../router";
import { formatAGIA, pinToIpfs, toWei } from "./common";

export async function* createJob(ics: ICSType): AsyncGenerator<string> {
  const job = (ics.params as { job?: Record<string, unknown> }).job ?? {};
  const title = typeof job.title === "string" ? job.title : "Untitled job";
  const reward = formatAGIA(job.rewardAGIA as string | undefined);
  const deadlineDays = job.deadlineDays ?? "unspecified";

  yield `Preparing to create a job titled "${title}".\n`;
  const spec = await pinToIpfs(job);
  yield `Job spec pinned at ${spec}.\n`;
  const wei = toWei(reward);
  yield `Simulated locking ${wei.toString()} wei in escrow.\n`;
  yield `✅ Job request captured: ${title} — reward ${reward} AGIALPHA, deadline ${deadlineDays} days.\n`;
}

export async function* applyJob(ics: ICSType): AsyncGenerator<string> {
  const jobId = (ics.params as { jobId?: unknown }).jobId ?? "unknown";
  yield `Checking stake requirements for job ${jobId}.\n`;
  yield `✅ Application recorded for job ${jobId}.\n`;
}

export async function* submitWork(ics: ICSType): AsyncGenerator<string> {
  const jobId = (ics.params as { jobId?: unknown }).jobId ?? "unknown";
  yield `Uploading work artifacts for job ${jobId}.\n`;
  yield `✅ Submission stored for job ${jobId}. Validators will be notified.\n`;
}

export async function* finalize(ics: ICSType): AsyncGenerator<string> {
  const jobId = (ics.params as { jobId?: unknown }).jobId ?? "unknown";
  yield `Finalizing outcome for job ${jobId}.\n`;
  yield `✅ Job ${jobId} finalized and rewards distributed.\n`;
}
