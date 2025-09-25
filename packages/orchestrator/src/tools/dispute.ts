import type { ICSType } from "../router";

export async function* raise(ics: ICSType): AsyncGenerator<string> {
  const { jobId, evidence } = ics.params as { jobId?: unknown; evidence?: unknown };
  yield `Opening dispute for job ${jobId ?? "unknown"}.\n`;
  if (evidence) {
    yield `Evidence attached: ${JSON.stringify(evidence)}.\n`;
  }
  yield `✅ Dispute flow initiated.\n`;
}
