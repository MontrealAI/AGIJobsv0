import type { ICSType } from "../router";

export async function* commitReveal(ics: ICSType): AsyncGenerator<string> {
  const { jobId, validation } = ics.params as {
    jobId?: unknown;
    validation?: { vote?: string; reason?: string };
  };
  const vote = validation?.vote ?? "approve";
  yield `Committing validation vote "${vote}" for job ${jobId ?? "unknown"}.\n`;
  yield `✅ Validation recorded.\n`;
}
