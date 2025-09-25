import type { ICSType } from "../router";

export async function* raise(ics: ICSType) {
  const jobId = (ics.params as any)?.jobId;
  const dispute = (ics.params as any)?.dispute ?? {};
  if (!jobId) {
    yield "Missing jobId.\n";
    return;
  }
  if (!dispute.reason) {
    yield "Missing dispute reason.\n";
    return;
  }

  yield "⚖️ Raising dispute (stub).\n";
  yield `✅ Dispute submitted for job #${jobId} (scaffolding stub).\n`;
}
