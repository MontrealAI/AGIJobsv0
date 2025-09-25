import { validateICS, type ICSType, route } from "./router";
import { streamLLM } from "./providers/openai";

const SYSTEM_PROMPT = `
You are the AGI Jobs Meta-Orchestrator.
You strictly produce a single JSON ICS object per instruction.
Never invent values for money/time; ask concise clarification questions first.
When value moves, add "confirm": true and produce a friendly one-line confirmation in natural language.
`;

export type PlanAndExecuteArgs = {
  message: string;
  history?: unknown[];
};

export async function* planAndExecute({ message, history = [] }: PlanAndExecuteArgs) {
  yield "🤖 Planning…\n";

  const normalizedHistory = normalizeHistory(history);

  const prompt = [
    { role: "system", content: SYSTEM_PROMPT },
    ...normalizedHistory,
    { role: "user", content: message },
  ];

  const icsText = await streamLLM(prompt, { expect: "json" });
  let ics: ICSType;

  try {
    ics = validateICS(icsText);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown parsing error";
    yield `I could not understand that. (${msg})\n`;
    return;
  }

  if (needsInfo(ics)) {
    yield `${askFollowUp(ics)}\n`;
    return;
  }

  if (requiresUserConsent(ics)) {
    yield `${nlConfirm(ics)}\n`;
    return;
  }

  yield* route(ics);
}

function normalizeHistory(history: unknown[]): { role: string; content: string }[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item): item is { role: string; content: string } => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof (item as any).role === "string" &&
        typeof (item as any).content === "string"
      );
    })
    .map((item) => ({ role: item.role, content: item.content }));
}

function needsInfo(ics: ICSType): boolean {
  switch (ics.intent) {
    case "create_job": {
      const job = ics.params?.job ?? {};
      return !job.title || !job.rewardAGIA || !job.deadlineDays;
    }
    case "apply_job":
    case "submit_work":
    case "finalize":
    case "validate":
    case "dispute":
      return typeof ics.params?.jobId !== "number" && typeof ics.params?.jobId !== "string";
    case "stake":
    case "withdraw":
      return !ics.params?.stake || !ics.params?.stake?.amountAGIA;
    default:
      return false;
  }
}

function requiresUserConsent(ics: ICSType): boolean {
  return Boolean(ics.confirm);
}

function nlConfirm(ics: ICSType): string {
  const serialized = JSON.stringify(ics.params, null, 2);
  return `I’m ready to ${ics.intent}. Reply \"yes\" to confirm these details:\n${serialized}`;
}

function askFollowUp(ics: ICSType): string {
  const missing = missingFields(ics);
  if (!missing.length) return "I need a bit more information.";
  if (missing.length === 1) {
    return `I still need ${missing[0]} before I can continue.`;
  }
  return `I still need ${missing.slice(0, -1).join(", ")} and ${missing.slice(-1)} before I can continue.`;
}

function missingFields(ics: ICSType): string[] {
  switch (ics.intent) {
    case "create_job": {
      const job = ics.params?.job ?? {};
      const result: string[] = [];
      if (!job.title) result.push("a job title");
      if (!job.rewardAGIA) result.push("a reward amount");
      if (!job.deadlineDays) result.push("a deadline");
      return result;
    }
    case "apply_job":
    case "submit_work":
    case "finalize":
    case "validate":
    case "dispute":
      return ["a jobId"].filter(() => !ics.params?.jobId);
    case "stake":
    case "withdraw":
      if (!ics.params?.stake?.amountAGIA) {
        return ["a stake amount"];
      }
      return [];
    default:
      return [];
  }
}
