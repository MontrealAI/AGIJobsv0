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

export function validateICS(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Planner returned an invalid payload");
  }
  if (!INTENTS.has(raw.intent)) {
    throw new Error(`Unsupported intent: ${raw.intent ?? "unknown"}`);
  }
  raw.params = raw.params ?? {};
  raw.confirm = Boolean(raw.confirm);
  return raw;
}

export function ensureSummary(ics) {
  if (!ics.confirm) return ics;
  if (typeof ics.summary === "string" && ics.summary.trim().length > 0 && ics.summary.length <= 140) {
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
