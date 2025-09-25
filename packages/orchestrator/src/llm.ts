import { validateICS, type ICSType, route } from "./router";

const SYSTEM_PROMPT = `You are the AGI Jobs Meta-Orchestrator. ` +
  `You convert user requests into the Intent-Constraint Schema (ICS). ` +
  `If you are unsure, ask a short clarification question.`;

type PlanArgs = {
  message: string;
  history?: unknown[];
};

function synthesizeICS(message: string): string {
  const normalized = message.trim().toLowerCase();
  if (normalized.startsWith("post")) {
    return JSON.stringify({
      intent: "create_job",
      params: { job: { title: message } },
      confirm: true
    });
  }
  if (normalized.startsWith("apply")) {
    return JSON.stringify({ intent: "apply_job", params: { jobId: 0 } });
  }
  return JSON.stringify({ intent: "clarify", params: { message } });
}

export async function planAndExecute({ message }: PlanArgs) {
  const synthetic = synthesizeICS(message);
  const generator = async function* (): AsyncGenerator<string> {
    yield `🤖 Planning…\n`;
    let ics: ICSType;
    try {
      ics = validateICS(synthetic);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      yield `I could not understand the request: ${reason}.\n`;
      return;
    }

    if (needsClarification(ics)) {
      yield `I need a bit more information to help with that.\n`;
      return;
    }

    yield* route(ics);
  };

  return generator();
}

function needsClarification(ics: ICSType) {
  if (ics.intent === "create_job") {
    const job = ics.params?.job;
    return !job?.title || !job?.rewardAGIA || !job?.deadlineDays;
  }
  if (ics.intent === "apply_job") {
    return typeof ics.params?.jobId !== "number";
  }
  return false;
}

export type { ICSType } from "./router";
