const INTENTS = new Set([
  "create_job",
  "apply_job",
  "submit_work",
  "validate",
  "finalize",
  "dispute",
  "stake",
  "withdraw",
  "admin_set",
]);

const CONFIRMATION_LIMIT = 140;

function makeTraceId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (err) {
    // ignore and fall back to timestamp-based id
  }
  return `trace-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

export function validateICS(raw) {
  if (!isObject(raw)) {
    throw new Error("Planner returned an invalid payload");
  }
  if (!INTENTS.has(raw.intent)) {
    throw new Error(`Unsupported intent: ${raw.intent ?? "unknown"}`);
  }

  const normalized = {
    ...raw,
    params: isObject(raw.params) ? { ...raw.params } : {},
    confirm: Boolean(raw.confirm),
    meta: isObject(raw.meta) ? { ...raw.meta } : {},
  };

  const confirmationText = typeof raw.confirmationText === "string" ? raw.confirmationText.trim() : "";
  const summaryText = typeof raw.summary === "string" ? raw.summary.trim() : "";
  const chosenSummary = confirmationText || summaryText;

  if (normalized.confirm) {
    if (!chosenSummary) {
      throw new Error("Planner confirmation summary missing");
    }
    if (chosenSummary.length > CONFIRMATION_LIMIT) {
      throw new Error(`Confirmation summary must be ${CONFIRMATION_LIMIT} characters or fewer`);
    }
    normalized.summary = chosenSummary;
  } else if (chosenSummary) {
    normalized.summary = chosenSummary;
  }

  if (typeof normalized.meta.traceId !== "string" || !normalized.meta.traceId.trim()) {
    normalized.meta.traceId = makeTraceId();
  } else {
    normalized.meta.traceId = normalized.meta.traceId.trim();
  }

  return normalized;
}

export function ensureSummary(ics) {
  if (!ics || !ics.confirm) return ics;
  if (typeof ics.summary === "string" && ics.summary.trim().length > 0 && ics.summary.length <= CONFIRMATION_LIMIT) {
    ics.summary = ics.summary.trim();
    return ics;
  }
  ics.summary = "Confirm before executing value-moving action.";
  return ics;
}

export async function pinJSON(data, endpoint) {
  const token = localStorage.getItem("W3S_TOKEN") ?? "";
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to pin JSON to IPFS");
  }
  return response.json();
}

export async function pinFile(file, endpoint) {
  const token = localStorage.getItem("W3S_TOKEN") ?? "";
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: file,
  });
  if (!response.ok) {
    throw new Error("Failed to pin file to IPFS");
  }
  return response.json();
}

export function fmtAGIA(valueWei) {
  const wei = typeof valueWei === "bigint" ? valueWei : BigInt(valueWei ?? 0);
  const divisor = 10n ** 18n;
  const whole = wei / divisor;
  const fraction = wei % divisor;
  if (fraction === 0n) {
    return whole.toString();
  }
  const fractionStr = fraction.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fractionStr}`;
}
