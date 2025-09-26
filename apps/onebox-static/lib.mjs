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
    const uri = ics?.params?.result?.uri ?? ics?.params?.resultUri;
    return !(typeof uri === "string" && uri.trim());
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

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function mergeStringLists(...lists) {
  const merged = [];
  const seen = new Set();
  for (const list of lists) {
    for (const value of toArray(list)) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      merged.push(trimmed);
    }
  }
  return merged;
}

function normalizeClientPin(entry) {
  if (!entry || typeof entry !== "object") return null;
  const cid = typeof entry.cid === "string" && entry.cid.trim();
  if (!cid) return null;
  const uri = typeof entry.uri === "string" && entry.uri.trim() ? entry.uri.trim() : `ipfs://${cid}`;
  const gateways = mergeStringLists(entry.gateways);
  const normalized = { cid, uri };
  if (gateways.length) normalized.gateways = gateways;
  const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : null;
  if (name) normalized.name = name;
  const size = typeof entry.size === "number" && Number.isFinite(entry.size) ? entry.size : null;
  if (size !== null) normalized.size = size;
  return normalized;
}

function mergeClientPinned(existing = [], additions = []) {
  const ordered = [];
  const indexByCid = new Map();

  const upsert = (entry) => {
    const normalized = normalizeClientPin(entry);
    if (!normalized) return;
    if (indexByCid.has(normalized.cid)) {
      const index = indexByCid.get(normalized.cid);
      const previous = ordered[index] || {};
      const gateways = mergeStringLists(previous.gateways, normalized.gateways);
      const merged = {
        cid: normalized.cid,
        uri: normalized.uri || previous.uri,
      };
      if (gateways.length) merged.gateways = gateways;
      const name = normalized.name || previous.name;
      if (name) merged.name = name;
      const size =
        normalized.size !== undefined
          ? normalized.size
          : previous.size !== undefined
            ? previous.size
            : undefined;
      if (size !== undefined) merged.size = size;
      ordered[index] = merged;
      return;
    }
    const next = { cid: normalized.cid, uri: normalized.uri };
    if (normalized.gateways && normalized.gateways.length) {
      next.gateways = normalized.gateways;
    }
    if (normalized.name) {
      next.name = normalized.name;
    }
    if (normalized.size !== undefined) {
      next.size = normalized.size;
    }
    const index = ordered.length;
    ordered.push(next);
    indexByCid.set(normalized.cid, index);
  };

  for (const entry of toArray(existing)) {
    upsert(entry);
  }
  for (const entry of toArray(additions)) {
    upsert(entry);
  }

  return ordered.filter(Boolean);
}

function baseMetadata() {
  return {
    version: META_VERSION,
    generatedAt: new Date().toISOString(),
  };
}

export function prepareJobPayload(ics, pinnedFiles = []) {
  const base = baseMetadata();
  if (!isObject(ics.meta)) {
    ics.meta = {};
  }

  const normalizedFiles = Array.isArray(pinnedFiles)
    ? pinnedFiles.map((entry) => normalizeClientPin(entry)).filter(Boolean)
    : [];
  const newAttachmentUris = normalizedFiles.map((entry) => entry.uri);

  const mergeMeta = (payloadCid, gateways) => {
    const additions = [...normalizedFiles];
    if (payloadCid) {
      const payloadEntry = {
        cid: payloadCid,
        uri: `ipfs://${payloadCid}`,
      };
      const payloadGateways = mergeStringLists(gateways);
      if (payloadGateways.length) {
        payloadEntry.gateways = payloadGateways;
      }
      additions.push(payloadEntry);
    }
    if (!additions.length) return;
    ics.meta.clientPinned = mergeClientPinned(ics.meta.clientPinned, additions);
  };

  if (ics.intent === "create_job") {
    const job = isObject(ics.params?.job) ? ics.params.job : {};
    const attachments = mergeStringLists(job?.attachments, newAttachmentUris);
    const payload = {
      ...base,
      kind: "job",
      title: job?.title || "",
      description: job?.description || "",
      deadlineDays: job?.deadlineDays ?? null,
      rewardAGIA: job?.rewardAGIA ?? job?.reward ?? null,
      attachments,
    };
    const applyAttachments = () => {
      if (!ics.params) ics.params = {};
      if (!isObject(ics.params.job)) ics.params.job = {};
      if (attachments.length) {
        ics.params.job.attachments = attachments;
      }
    };
    return {
      payload,
      applyAttachments,
      assign({ cid, gateways }) {
        if (!ics.params) ics.params = {};
        if (!isObject(ics.params.job)) ics.params.job = {};
        ics.params.job.uri = `ipfs://${cid}`;
        applyAttachments();
        mergeMeta(cid, gateways);
      },
      mergeClientPins(payloadCid, gateways) {
        mergeMeta(payloadCid, gateways);
      },
    };
  }

  if (ics.intent === "submit_work") {
    const attachments = mergeStringLists(ics.params?.attachments, newAttachmentUris);
    const payload = {
      ...base,
      kind: "submission",
      note: ics.params?.note || "AGI Jobs work submission",
      attachments,
    };
    const applyAttachments = () => {
      if (!ics.params) ics.params = {};
      if (attachments.length) {
        ics.params.attachments = attachments;
      }
    };
    return {
      payload,
      applyAttachments,
      assign({ cid, gateways }) {
        if (!ics.params) ics.params = {};
        const existing = isObject(ics.params.result) ? ics.params.result : {};
        const uri = `ipfs://${cid}`;
        ics.params.result = { ...existing, uri };
        if ("resultUri" in ics.params) {
          delete ics.params.resultUri;
        }
        if ("uri" in ics.params) {
          delete ics.params.uri;
        }
        applyAttachments();
        mergeMeta(cid, gateways);
      },
      mergeClientPins(payloadCid, gateways) {
        mergeMeta(payloadCid, gateways);
      },
    };
  }

  if (ics.intent === "dispute") {
    const reason = ics.params?.reason || ics.params?.dispute?.reason || "";
    const attachments = mergeStringLists(ics.params?.attachments, newAttachmentUris);
    const payload = {
      ...base,
      kind: "dispute",
      reason,
      attachments,
    };
    const applyAttachments = () => {
      if (!ics.params) ics.params = {};
      if (attachments.length) {
        ics.params.attachments = attachments;
      }
    };
    return {
      payload,
      applyAttachments,
      assign({ cid, gateways }) {
        const uri = `ipfs://${cid}`;
        if (!ics.params) ics.params = {};
        ics.params.evidenceUri = uri;
        if (isObject(ics.params.dispute)) {
          ics.params.dispute.evidenceUri = uri;
        }
        applyAttachments();
        mergeMeta(cid, gateways);
      },
      mergeClientPins(payloadCid, gateways) {
        mergeMeta(payloadCid, gateways);
      },
    };
  }

  return {
    payload: null,
    applyAttachments() {},
    assign() {},
    mergeClientPins(payloadCid, gateways) {
      mergeMeta(payloadCid, gateways);
    },
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
