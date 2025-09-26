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
const META_VERSION = "agijobs.onebox/1.0.0";

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeTraceId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (err) {
    // ignore and fall through
  }
  return `trace-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function validateICS(payload) {
  if (!isObject(payload)) {
    throw new Error("Planner returned an invalid response");
  }
  const { intent, params, confirm = false, summary, meta } = payload;
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

  if (normalized.confirm) {
    if (typeof summary !== "string" || !summary.trim()) {
      throw new Error("Planner confirmation summary missing");
    }
    if (summary.length > CONFIRMATION_SUMMARY_LIMIT) {
      throw new Error(`Confirmation summary exceeds ${CONFIRMATION_SUMMARY_LIMIT} characters`);
    }
    normalized.summary = summary.trim();
  } else if (typeof summary === "string") {
    normalized.summary = summary.trim();
  }

  if (isObject(meta) && typeof meta.traceId === "string" && meta.traceId.trim()) {
    normalized.meta.traceId = meta.traceId.trim();
  } else {
    normalized.meta.traceId = makeTraceId();
  }

  return normalized;
}

export function needsAttachmentPin(ics) {
  if (!ics || !isObject(ics)) return false;
  const intent = ics.intent;
  if (intent === "create_job") {
    return !(ics?.params?.job && ics.params.job.uri);
  }
  if (intent === "submit_work") {
    return !ics?.params?.resultUri;
  }
  if (intent === "dispute") {
    const dispute = ics?.params?.dispute;
    if (isObject(dispute) && dispute.evidenceUri) {
      return false;
    }
    return !ics?.params?.evidenceUri;
  }
  return false;
}

function uniqueAttachments(existing = []) {
  return Array.from(new Set(existing.filter(Boolean)));
}

function baseMetadata() {
  return {
    version: META_VERSION,
    generatedAt: new Date().toISOString(),
  };
}

export function prepareJobPayload(ics, attachmentCid) {
  const uriFromCid = (cid) => (cid ? `ipfs://${cid}` : null);
  const fileUri = uriFromCid(attachmentCid);
  const base = baseMetadata();
  const attach = [];
  if (fileUri) attach.push(fileUri);

  if (ics.intent === "create_job") {
    const job = isObject(ics.params?.job) ? { ...ics.params.job } : {};
    const existing = uniqueAttachments(job.attachments);
    attach.push(...existing);
    const payload = {
      ...base,
      kind: "job",
      title: job.title || "",
      description: job.description || "",
      deadlineDays: job.deadlineDays ?? null,
      rewardAGIA: job.rewardAGIA ?? job.reward ?? null,
      attachments: uniqueAttachments(attach),
    };
    return {
      payload,
      assign(cid) {
        if (!ics.params) ics.params = {};
        if (!isObject(ics.params.job)) ics.params.job = {};
        ics.params.job.uri = `ipfs://${cid}`;
      },
    };
  }

  if (ics.intent === "submit_work") {
    const payload = {
      ...base,
      kind: "submission",
      note: ics.params?.note || "AGI Jobs work submission",
      attachments: uniqueAttachments(attach.concat(uniqueAttachments(ics.params?.attachments))),
    };
    return {
      payload,
      assign(cid) {
        if (!ics.params) ics.params = {};
        ics.params.resultUri = `ipfs://${cid}`;
      },
    };
  }

  if (ics.intent === "dispute") {
    const reason = ics.params?.reason || ics.params?.dispute?.reason || "";
    const payload = {
      ...base,
      kind: "dispute",
      reason,
      attachments: uniqueAttachments(attach.concat(uniqueAttachments(ics.params?.attachments))),
    };
    return {
      payload,
      assign(cid) {
        const uri = `ipfs://${cid}`;
        if (!ics.params) ics.params = {};
        ics.params.evidenceUri = uri;
        if (isObject(ics.params.dispute)) {
          ics.params.dispute.evidenceUri = uri;
        }
      },
    };
  }

  return {
    payload: null,
    assign() {},
  };
}

export function formatEvent(event) {
  if (!isObject(event)) {
    return { text: "(malformed event)", advanced: "" };
  }
  const type = event.type || "status";
  const text = typeof event.text === "string" && event.text.trim() ? event.text.trim() : "…";
  const advanced = typeof event.advanced === "string" ? event.advanced : "";

  if (type === "error") {
    return { text: `❌ ${text}`, advanced };
  }
  if (type === "receipt") {
    return { text: `✅ ${text}`, advanced };
  }
  if (type === "confirm") {
    return { text, advanced };
  }
  if (type === "guardrail") {
    return { text: `⚠️ ${text}`, advanced };
  }
  if (type === "ens_requirement") {
    return {
      text: `🔐 ENS required: ${text}`,
      advanced: advanced || "Ensure your agent or validator subdomain is active before continuing.",
    };
  }
  return { text, advanced };
}

export async function pinBlob(endpoint, token, file) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(file?.type ? { "Content-Type": file.type } : {}),
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`IPFS upload failed (${response.status})`);
  }
  const body = await response.json();
  if (!body.cid) {
    throw new Error("IPFS response missing CID");
  }
  return { cid: body.cid };
}

export async function pinJSON(endpoint, token, json) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(json),
  });
  if (!response.ok) {
    throw new Error(`IPFS upload failed (${response.status})`);
  }
  const body = await response.json();
  if (!body.cid) {
    throw new Error("IPFS response missing CID");
  }
  return { cid: body.cid };
}

export function formatError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch (e) {
    return "Unexpected error";
  }
}

export function summarizeAAMode(config) {
  if (config && config.enabled) {
    const bundler = config.bundler || "custom";
    const chain = config.chainId ?? "unknown";
    return {
      description: `Account Abstraction mode enabled (bundler: ${bundler}, chainId: ${chain}).`,
      detail: JSON.stringify({ ...config }, null, 2),
    };
  }
  return {
    description: "Relayer sponsorship mode active (e.g. OpenZeppelin Defender).",
    detail: JSON.stringify({ enabled: false, ...(config || {}) }, null, 2),
  };
}
