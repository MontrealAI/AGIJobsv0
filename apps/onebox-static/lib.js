const SUPPORTED_INTENTS = [
  "create_job",
  "apply_job",
  "submit_work",
  "validate",
  "finalize",
  "dispute",
  "stake",
  "withdraw",
  "admin_set",
];

const CONFIRMATION_SUMMARY_LIMIT = 140;

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeTraceId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (err) {
    // ignore and fall through to fallback
  }
  return `trace-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function validateICS(payload) {
  if (!isObject(payload)) {
    throw new Error("Planner returned an invalid response");
  }

  const {
    intent,
    params,
    confirm = false,
    summary,
    confirmationText,
    meta,
  } = payload;

  if (typeof intent !== "string" || !SUPPORTED_INTENTS.includes(intent)) {
    throw new Error(`Unsupported intent: ${intent}`);
  }

  const normalized = {
    ...payload,
    intent,
    params: isObject(params) ? { ...params } : {},
    confirm: Boolean(confirm),
    meta: {},
  };

  const confirmation =
    typeof confirmationText === "string" && confirmationText.trim()
      ? confirmationText.trim()
      : typeof summary === "string" && summary.trim()
        ? summary.trim()
        : "";

  if (normalized.confirm) {
    if (!confirmation) {
      throw new Error("Planner confirmation summary missing");
    }
    if (confirmation.length > CONFIRMATION_SUMMARY_LIMIT) {
      throw new Error(
        `Confirmation summary must be ${CONFIRMATION_SUMMARY_LIMIT} characters or fewer`,
      );
    }
    normalized.summary = confirmation;
  } else if (confirmation) {
    normalized.summary = confirmation;
  } else {
    delete normalized.summary;
  }

  if (isObject(meta) && typeof meta.traceId === "string" && meta.traceId.trim()) {
    normalized.meta.traceId = meta.traceId.trim();
  } else {
    normalized.meta.traceId = makeTraceId();
  }

  return normalized;
}

const DECIMALS = 18n;
const TEN = 10n;

export function toWei(amount) {
  const [wholeRaw, fracRaw = ""] = String(amount).split(".");
  const whole = BigInt(wholeRaw || "0");
  const frac = fracRaw.padEnd(18, "0").slice(0, 18);
  return whole * TEN ** DECIMALS + BigInt(frac || "0");
}

export function fmtAGIA(wei) {
  const asString = BigInt(wei).toString().padStart(19, "0");
  const head = asString.slice(0, -18) || "0";
  const tail = asString.slice(-18).replace(/0+$/, "");
  return tail ? `${head}.${tail}` : head;
}

async function postToW3S(body, contentType) {
  const token = localStorage.getItem("W3S_TOKEN");
  if (!token) {
    throw new Error("Missing web3.storage token. Add it in Advanced settings.");
  }

  const response = await fetch("https://api.web3.storage/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IPFS pin failed: ${text}`);
  }

  const { cid } = await response.json();
  return { cid };
}

export async function pinJSON(data) {
  return postToW3S(JSON.stringify(data), "application/json");
}

export async function pinFile(file) {
  const bytes = await file.arrayBuffer();
  return postToW3S(new Blob([bytes]));
}
