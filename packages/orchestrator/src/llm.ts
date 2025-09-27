import { randomUUID } from "crypto";
import { route } from "./router.js";
import { validateICS, type ICSType } from "./ics.js";
import { streamLLM } from "./providers/openai.js";

const SYSTEM_PROMPT = `
You are the AGI Jobs Meta-Orchestrator.
You strictly produce a single JSON ICS object per instruction.
Never invent values for money/time; ask concise clarification questions first.
When value moves, add "confirm": true and produce a friendly one-line confirmation in natural language.
`;

export type PlanAndExecuteArgs = {
  message: string;
  history?: unknown[];
  meta?: PlanMeta;
};

type PlanMeta = {
  traceId?: string;
  userId?: string;
  txMode?: string;
};

export async function* planAndExecute({
  message,
  history = [],
  meta,
}: PlanAndExecuteArgs) {
  yield "🤖 Planning…\n";

  const userId = resolveUserId(meta, history);

  const confirmation = resolvePendingConfirmation(message, history);
  if (confirmation?.type === "confirm" && confirmation.ics) {
    const confirmed = ensureUserId(confirmation.ics, userId);
    yield "🔐 Confirmation received.\n";
    yield* route(confirmed);
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

  const icsText = await streamLLM(prompt, { expect: "json", meta });
  let ics: ICSType;

  try {
    ics = validateICS(icsText);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown parsing error";
    yield `I could not understand that. (${msg})\n`;
    return;
  }

  const userScopedICS = ensureUserId(ics, userId);

  if (needsInfo(userScopedICS)) {
    yield `${askFollowUp(ics)}\n`;
    return;
  }

  if (requiresUserConsent(userScopedICS)) {
    const decorated = ensureTraceId(userScopedICS);
    cachePendingIntent(decorated);
    yield `${nlConfirm(decorated)}\n`;
    return;
  }

  yield* route(userScopedICS);
}

type HistoryMessage = {
  role?: string;
  text?: string;
  content?: string;
  meta?: Record<string, unknown>;
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

function resolveUserId(meta: PlanMeta | undefined, history: unknown[]): string | undefined {
  if (meta?.userId) return meta.userId;
  const entries = coerceHistory(history);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const rawMeta = entry?.meta;
    if (!rawMeta || typeof rawMeta !== "object") {
      continue;
    }
    const { userId } = rawMeta as Record<string, unknown>;
    if (typeof userId === "string" && userId.trim()) {
      return userId.trim();
    }
  }
  return undefined;
}

function ensureUserId(ics: ICSType, userId?: string): ICSType {
  if (!userId) return ics;
  const current = ics.meta?.userId;
  if (current === userId) return ics;
  return {
    ...ics,
    meta: { ...(ics.meta ?? {}), userId },
  };
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
      const hasSpec = job.spec && typeof job.spec === "object";
      return !job.title || !job.rewardAGIA || !job.deadline || !hasSpec;
    }
    case "apply_job": {
      const params = ics.params ?? {};
      const jobId = params.jobId;
      const subdomain = params.ens?.subdomain;
      return !jobId || !subdomain;
    }
    case "submit_work": {
      const params = ics.params ?? {};
      const result = params.result ?? {};
      const hasPayload = result.payload !== undefined || result.uri;
      const subdomain = params.ens?.subdomain;
      return !params.jobId || !hasPayload || !subdomain;
    }
    case "finalize": {
      const params = ics.params ?? {};
      return !params.jobId || typeof params.success !== "boolean";
    }
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
      if (!job.deadline) result.push("a deadline");
      if (!job.spec) result.push("a job spec");
      return result;
    }
    case "apply_job": {
      const result: string[] = [];
      if (!ics.params?.jobId) result.push("a jobId");
      if (!ics.params?.ens?.subdomain) result.push("an ENS subdomain");
      return result;
    }
    case "submit_work": {
      const params = ics.params ?? {};
      const result: string[] = [];
      if (!params.jobId) result.push("a jobId");
      if (!params.ens?.subdomain) result.push("an ENS subdomain");
      if (!(params.result?.payload || params.result?.uri)) {
        result.push("a result payload or URI");
      }
      return result;
    }
    case "finalize": {
      const result: string[] = [];
      if (!ics.params?.jobId) result.push("a jobId");
      if (typeof ics.params?.success !== "boolean") result.push("a validation outcome");
      return result;
    }
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
