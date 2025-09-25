import type { ICSType } from "../router";
import { pinToIpfs } from "./common";

export async function* createJob(ics: ICSType) {
  const job = (ics.params as any)?.job ?? {};
  if (!job.title || !job.rewardAGIA || !job.deadlineDays) {
    yield "Missing job title, reward, or deadline.\n";
    return;
  }

  yield "📦 Packaging job spec…\n";
  const uri = await pinToIpfs(job);
  yield `📨 Spec pinned: ${uri}\n`;
  yield "🔬 Simulation placeholder – integrate contract call.\n";
  yield "🚀 Submission placeholder – integrate with Account Abstraction or relayer.\n";
  yield "✅ Job posted (scaffolding stub).\n";
}

export async function* applyJob(ics: ICSType) {
  const jobId = (ics.params as any)?.jobId;
  if (!jobId) {
    yield "Missing jobId.\n";
    return;
  }

  yield "🔒 Ensuring agent stake is locked (stub).\n";
  yield "📝 Applying to job (stub).\n";
  yield `✅ You are assigned to job #${jobId} (scaffolding stub).\n`;
}

export async function* submitWork(ics: ICSType) {
  const jobId = (ics.params as any)?.jobId;
  const result = (ics.params as any)?.result ?? {};
  if (!jobId) {
    yield "Missing jobId.\n";
    return;
  }

  yield "📦 Uploading result payload…\n";
  const uri = await pinToIpfs(result);
  yield `📡 Result pinned at ${uri}.\n`;
  yield "🔔 Submitting work for validation (stub).\n";
  yield `✅ Job #${jobId} submitted; validators will be notified.\n`;
}

export async function* finalize(ics: ICSType) {
  const jobId = (ics.params as any)?.jobId;
  if (!jobId) {
    yield "Missing jobId.\n";
    return;
  }

  yield "🧮 Finalizing job (stub).\n";
  yield `✅ Job #${jobId} finalized. Rewards distributed (scaffolding stub).\n`;
}
