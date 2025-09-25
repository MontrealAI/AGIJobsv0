import { randomUUID } from "crypto";
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

  const confirmation = resolvePendingConfirmation(message, history);
  if (confirmation?.type === "confirm" && confirmation.ics) {
    yield "🔐 Confirmation received.\n";
    yield* route(confirmation.ics);
    return;
  }
  if (confirmation?.type === "decline") {
    yield "👍 Okay, I’ve cancelled that request.\n";
    return;
  }

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
    const decorated = ensureTraceId(ics);
    cachePendingIntent(decorated);
    yield `${nlConfirm(decorated)}\n`;
    return;
  }

  yield* route(ics);
}

type HistoryMessage = {
  role?: string;
  text?: string;
  content?: string;
};

function normalizeHistory(history: unknown[]): { role: string; content: string }[] {
  const entries = coerceHistory(history);
  return entries
    .map((item) => {
      const role = (item.role ?? "user").replace("assistant_pending", "assistant");
      const content = typeof item.content === "string" ? item.content : item.text ?? "";
      return { role, content };
    })
    .filter((item) => Boolean(item.content));
}

const pendingIntents = new Map<string, ICSType>();

type ConfirmationResolution =
  | { type: "confirm"; ics: ICSType }
  | { type: "decline" }
  | null;

function resolvePendingConfirmation(
  message: string,
  history: unknown[]
): ConfirmationResolution {
  const decision = parseConfirmationDecision(message);
  if (!decision) return null;

  const traceId = findTraceId(history);
  if (!traceId) return null;

  const pending = pendingIntents.get(traceId);
  if (!pending) return null;

  pendingIntents.delete(traceId);
  if (decision === "decline") {
    return { type: "decline" };
  }

  return { type: "confirm", ics: pending };
}

function parseConfirmationDecision(message: string): "confirm" | "decline" | null {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return null;
  if (/^(yes|y|confirm|sure|do it|go ahead|please proceed)\b/.test(normalized)) {
    return "confirm";
  }
  if (/^(no|n|cancel|stop|abort|never mind)\b/.test(normalized)) {
    return "decline";
  }
  return null;
}

function findTraceId(history: unknown[]): string | null {
  const entries = coerceHistory(history);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const role = (entry.role ?? "").replace("assistant_pending", "assistant");
    if (!role.startsWith("assistant")) continue;
    const text = typeof entry.content === "string" ? entry.content : entry.text ?? "";
    if (!text) continue;
    const match = text.match(/trace[:\s-]*([0-9a-fA-F-]{6,})/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function coerceHistory(history: unknown[]): HistoryMessage[] {
  if (!Array.isArray(history)) return [];
  return history.filter((item): item is HistoryMessage => typeof item === "object" && item !== null);
}

function ensureTraceId(ics: ICSType): ICSType {
  const traceId = ics.meta?.traceId ?? randomUUID();
  return {
    ...ics,
    meta: { ...(ics.meta ?? {}), traceId },
  };
}

function cachePendingIntent(ics: ICSType) {
  const traceId = ics.meta?.traceId;
  if (!traceId) return;
  const sanitized: ICSType = {
    ...ics,
    confirm: false,
    meta: { ...(ics.meta ?? {}), traceId },
  };
  pendingIntents.set(traceId, sanitized);
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
    case "withdraw": {
      const stake = ics.params?.stake ?? {};
      return !stake.amountAGIA || !stake.role;
    }
    default:
      return false;
  }
}

function requiresUserConsent(ics: ICSType): boolean {
  return Boolean(ics.confirm);
}

function nlConfirm(ics: ICSType): string {
  const serialized = JSON.stringify(ics.params, null, 2);
  const traceId = ics.meta?.traceId ? ` (trace:${ics.meta.traceId})` : "";
  return `I’m ready to ${ics.intent}. Reply \"yes\" to confirm these details${traceId}, or \"no\" to cancel.\n${serialized}`;
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
    case "withdraw": {
      const missing: string[] = [];
      if (!ics.params?.stake?.amountAGIA) {
        missing.push("a stake amount");
      }
      if (!ics.params?.stake?.role) {
        missing.push("a stake role");
      }
      return missing;
    }
    default:
      return [];
  }
}
