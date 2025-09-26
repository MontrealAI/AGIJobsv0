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
const AGIA_DECIMALS = 18n;
const TEN = 10n;

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

function normalizeDecimalInput(amount) {
  if (typeof amount === "bigint") {
    return amount;
  }
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) {
      throw new Error("Invalid AGIA amount");
    }
    return normalizeDecimalInput(amount.toString());
  }
  if (typeof amount !== "string") {
    return normalizeDecimalInput(String(amount));
  }
  const trimmed = amount.trim();
  if (!trimmed) {
    throw new Error("Invalid AGIA amount");
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  if (!/^\d*(?:\.\d*)?$/.test(unsigned)) {
    throw new Error("Invalid AGIA amount");
  }
  const [head = "0", tail = ""] = unsigned.split(".");
  const whole = head ? BigInt(head) : 0n;
  const paddedFraction = `${tail}`.padEnd(Number(AGIA_DECIMALS), "0").slice(0, Number(AGIA_DECIMALS));
  const fraction = paddedFraction ? BigInt(paddedFraction) : 0n;
  const value = whole * TEN ** AGIA_DECIMALS + fraction;
  return negative ? -value : value;
}

export function toWei(amount) {
  return normalizeDecimalInput(amount);
}

export function formatAGIA(value, { minimumFractionDigits = 0, maximumFractionDigits = 6 } = {}) {
  const amount = typeof value === "bigint" ? value : normalizeDecimalInput(value);
  const negative = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  const whole = absolute / (TEN ** AGIA_DECIMALS);
  const fraction = absolute % (TEN ** AGIA_DECIMALS);
  let fractionText = fraction.toString().padStart(Number(AGIA_DECIMALS), "0");
  if (maximumFractionDigits >= 0 && maximumFractionDigits < Number(AGIA_DECIMALS)) {
    fractionText = fractionText.slice(0, maximumFractionDigits);
  }
  fractionText = fractionText.replace(/0+$/, "");
  if (fractionText.length < minimumFractionDigits) {
    fractionText = fractionText.padEnd(minimumFractionDigits, "0");
  }
  return fractionText ? `${negative}${whole}.${fractionText}` : `${negative}${whole}`;
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

  let advanced = "";
  if (Object.prototype.hasOwnProperty.call(event, "advanced")) {
    if (typeof event.advanced === "string") {
      advanced = event.advanced.trim();
    } else if (event.advanced && typeof event.advanced === "object") {
      advanced = event.advanced;
    } else if (event.advanced !== undefined && event.advanced !== null) {
      advanced = String(event.advanced);
    }
  }

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

const ERROR_FIELDS_TO_FOLLOW = [
  "cause",
  "error",
  "errors",
  "data",
  "details",
  "body",
  "response",
  "info",
  "reason",
];

function pushUnique(array, value) {
  if (!value && value !== 0) return;
  const str = String(value).trim();
  if (!str) return;
  if (!array.includes(str)) {
    array.push(str);
  }
}

function collectErrorContext(err, state = { messages: [], codes: [], statuses: [] }, seen = new Set()) {
  if (err === null || err === undefined) {
    return state;
  }
  if (typeof err === "string" || typeof err === "number" || typeof err === "bigint") {
    pushUnique(state.messages, err);
    return state;
  }

  if (seen.has(err)) {
    return state;
  }
  seen.add(err);

  if (err instanceof Error) {
    pushUnique(state.messages, err.message || err.toString());
    if ("code" in err && err.code !== undefined) {
      pushUnique(state.codes, err.code);
    }
    if ("name" in err && err.name && err.name !== "Error") {
      pushUnique(state.codes, err.name);
    }
    if ("status" in err && Number.isFinite(err.status)) {
      const status = Number(err.status);
      if (!state.statuses.includes(status)) {
        state.statuses.push(status);
      }
    }
    if ("cause" in err) {
      collectErrorContext(err.cause, state, seen);
    }
  }

  if (typeof err === "object" && err) {
    if ("message" in err && err.message) {
      pushUnique(state.messages, err.message);
    }
    if ("status" in err && Number.isFinite(err.status)) {
      const status = Number(err.status);
      if (!state.statuses.includes(status)) {
        state.statuses.push(status);
      }
    }
    if ("statusCode" in err && Number.isFinite(err.statusCode)) {
      const status = Number(err.statusCode);
      if (!state.statuses.includes(status)) {
        state.statuses.push(status);
      }
    }
    if ("code" in err && err.code !== undefined) {
      pushUnique(state.codes, err.code);
    }
    if ("error" in err && typeof err.error === "string") {
      pushUnique(state.messages, err.error);
    }
    if ("statusText" in err && typeof err.statusText === "string") {
      pushUnique(state.messages, err.statusText);
    }
    for (const key of ERROR_FIELDS_TO_FOLLOW) {
      if (key in err && err[key] !== undefined) {
        collectErrorContext(err[key], state, seen);
      }
    }
  }

  return state;
}

function toLowerList(values) {
  return values.map((value) => value.toLowerCase());
}

export const FRIENDLY_ERROR_RULES = [
  {
    id: "insufficient_balance",
    summary: "You don’t have enough AGIALPHA to fund this job.",
    hint: "Lower the reward or top up your balance before trying again.",
    matches: (ctx) =>
      ctx.contains("insufficient balance") ||
      ctx.contains("insufficient funds") ||
      ctx.contains("transfer amount exceeds balance"),
  },
  {
    id: "insufficient_allowance",
    summary: "Your AGIALPHA allowance is too low for this request.",
    hint: "Ask me to refresh allowances or approve spending from Expert Mode.",
    matches: (ctx) =>
      ctx.contains("insufficient allowance") ||
      ctx.contains("insufficientallowance") ||
      ctx.contains("exceeds allowance") ||
      ctx.contains("allowance is not enough"),
  },
  {
    id: "reward_zero",
    summary: "Rewards must be greater than zero AGIALPHA.",
    hint: "Set a positive reward before posting the job.",
    matches: (ctx) =>
      ctx.contains("zero reward") || ctx.contains("reward == 0") || ctx.contains("reward must be greater than zero"),
  },
  {
    id: "deadline_invalid",
    summary: "The deadline needs to be at least one day in the future.",
    hint: "Pick a deadline that is 24 hours or more from now.",
    matches: (ctx) =>
      ctx.contains("deadline must be") || ctx.contains("deadline is in the past") || ctx.contains("deadline < now"),
  },
  {
    id: "deadline_not_reached",
    summary: "That step isn’t available until the job deadline passes.",
    hint: "Wait until the deadline or adjust the schedule before retrying.",
    matches: (ctx) =>
      ctx.contains("deadline notreached") || ctx.contains("deadline not reached") || ctx.contains("too early"),
  },
  {
    id: "job_not_found",
    summary: "I couldn’t find that job id on-chain.",
    hint: "Check the job number or ask me for your recent jobs.",
    matches: (ctx) => ctx.contains("jobnotfound") || ctx.contains("job not found") || ctx.contains("unknown job"),
  },
  {
    id: "role_employer_only",
    summary: "Only the employer can complete that action.",
    hint: "Sign in with the employer account or ask me to switch roles.",
    matches: (ctx) => ctx.contains("onlyemployer") || ctx.contains("notemployer"),
  },
  {
    id: "role_validator_only",
    summary: "This action is limited to assigned validators.",
    hint: "Ensure your validator ENS is registered and selected for the job.",
    matches: (ctx) =>
      ctx.contains("notvalidator") ||
      ctx.contains("validatorbanned") ||
      ctx.contains("unauthorizedvalidator"),
  },
  {
    id: "role_operator_only",
    summary: "Only the job operator can run that step.",
    hint: "Have the operator account confirm the action or ask for a reassignment.",
    matches: (ctx) => ctx.contains("notoperator") || ctx.contains("invalidcaller"),
  },
  {
    id: "role_governance_only",
    summary: "Governance approval is required for this operation.",
    hint: "Reach out to the governance team or use an approved governance key.",
    matches: (ctx) => ctx.contains("notgovernance") || ctx.contains("notgovernanceorpauser"),
  },
  {
    id: "identity_required",
    summary: "An ENS identity is required before continuing.",
    hint: "Register the appropriate *.agent.agi.eth or *.club.agi.eth subdomain and try again.",
    matches: (ctx) =>
      ctx.contains("ens name must") || ctx.contains("ens required") || ctx.contains("identityregistry not set"),
  },
  {
    id: "stake_missing",
    summary: "You need to stake before you can continue.",
    hint: "Stake the required AGIALPHA amount and retry the action.",
    matches: (ctx) => ctx.contains("nostake") || ctx.contains("stake required") || ctx.contains("stake missing"),
  },
  {
    id: "stake_too_high",
    summary: "The requested stake exceeds the allowed maximum.",
    hint: "Lower the stake amount or split it into smaller deposits.",
    matches: (ctx) => ctx.contains("stakeoverflow") || ctx.contains("amount too large"),
  },
  {
    id: "invalid_state",
    summary: "The job isn’t in the right state for that action yet.",
    hint: "Check the job status and try the step that matches the current phase.",
    matches: (ctx) =>
      ctx.contains("invalidstate") ||
      ctx.contains("cannotexpire") ||
      ctx.contains("alreadytallied") ||
      ctx.contains("revealpending"),
  },
  {
    id: "already_done",
    summary: "This step has already been completed.",
    hint: "No further action is needed unless circumstances change.",
    matches: (ctx) =>
      ctx.contains("already committed") ||
      ctx.contains("already revealed") ||
      ctx.contains("already applied") ||
      ctx.contains("alreadylisted"),
  },
  {
    id: "burn_evidence_missing",
    summary: "Burn evidence is missing or incomplete.",
    hint: "Upload the burn receipt or wait for the validator to finish the burn.",
    matches: (ctx) => ctx.contains("burnevidence") || ctx.contains("burnreceipt"),
  },
  {
    id: "validator_window_closed",
    summary: "The validation window has already closed.",
    hint: "Wait for the next cycle or escalate through disputes if needed.",
    matches: (ctx) =>
      ctx.contains("commitphaseclosed") ||
      ctx.contains("revealphaseclosed") ||
      ctx.contains("commit closed") ||
      ctx.contains("reveal closed"),
  },
  {
    id: "validator_window_open",
    summary: "Validation is still underway.",
    hint: "Let validators finish before finalizing the job.",
    matches: (ctx) =>
      ctx.contains("commitphaseactive") ||
      ctx.contains("reveal pending") ||
      ctx.contains("validators already selected"),
  },
  {
    id: "network_fetch",
    summary: "I couldn’t reach the orchestrator network.",
    hint: "Check your internet connection or try again in a few seconds.",
    matches: (ctx) =>
      ctx.contains("failed to fetch") ||
      ctx.contains("networkerror") ||
      ctx.contains("network request failed") ||
      ctx.contains("fetch event responded"),
  },
  {
    id: "timeout",
    summary: "The request timed out while waiting for the orchestrator.",
    hint: "Retry in a moment—the network might be congested.",
    matches: (ctx) => ctx.contains("timeout") || ctx.contains("timed out") || ctx.contains("etimedout"),
  },
  {
    id: "rate_limited",
    summary: "You’re sending requests too quickly.",
    hint: "Pause for a few seconds before trying again.",
    matches: (ctx) => ctx.status === 429 || ctx.contains("too many requests"),
  },
  {
    id: "service_unavailable",
    summary: "The orchestrator is temporarily unavailable.",
    hint: "We’ll keep watching—try again shortly.",
    matches: (ctx) => ctx.status === 503 || ctx.contains("service unavailable") || ctx.contains("maintenance"),
  },
  {
    id: "unauthorized",
    summary: "The orchestrator rejected our credentials.",
    hint: "Check that your API token is correct and hasn’t expired.",
    matches: (ctx) => ctx.status === 401 || ctx.status === 403 || ctx.contains("unauthorized"),
  },
  {
    id: "not_found",
    summary: "The orchestrator endpoint was not found.",
    hint: "Verify the /onebox URLs in your configuration.",
    matches: (ctx) => ctx.status === 404 || ctx.contains("not found"),
  },
  {
    id: "user_rejected",
    summary: "You cancelled the wallet prompt.",
    hint: "Restart the request and approve it when you’re ready.",
    matches: (ctx) =>
      ctx.hasCode("ACTION_REJECTED") ||
      ctx.contains("user rejected") ||
      ctx.contains("user denied") ||
      ctx.contains("request rejected"),
  },
  {
    id: "gas_estimation",
    summary: "I couldn’t estimate the gas for that transaction.",
    hint: "Double-check the inputs or try again with slightly different parameters.",
    matches: (ctx) =>
      ctx.hasCode("UNPREDICTABLE_GAS_LIMIT") ||
      ctx.contains("cannot estimate gas") ||
      ctx.contains("gas required exceeds allowance"),
  },
  {
    id: "invalid_argument",
    summary: "One of the inputs looks invalid.",
    hint: "Use plain numbers for amounts and ensure addresses or ENS names are correct.",
    matches: (ctx) =>
      ctx.hasCode("INVALID_ARGUMENT") ||
      ctx.contains("invalid bignumber") ||
      ctx.contains("invalid argument"),
  },
  {
    id: "json_parse",
    summary: "The orchestrator returned data in an unexpected format.",
    hint: "Reload the page or retry—this can happen during upgrades.",
    matches: (ctx) => ctx.contains("unexpected token") || ctx.contains("invalid json"),
  },
  {
    id: "quota_exceeded",
    summary: "This action exceeds the configured spend cap.",
    hint: "Reduce the reward or wait until the orchestrator refreshes its quota.",
    matches: (ctx) => ctx.contains("spend cap") || ctx.contains("quota exceeded"),
  },
  {
    id: "attachment_missing",
    summary: "Required attachments were missing from the request.",
    hint: "Re-upload the files or drop them into the chat before confirming.",
    matches: (ctx) => ctx.contains("attachment required") || ctx.contains("missing attachment"),
  },
  {
    id: "ipfs_failure",
    summary: "I couldn’t pin the payload to IPFS.",
    hint: "Check your IPFS token or retry the upload after a short pause.",
    matches: (ctx) =>
      ctx.contains("ipfs upload failed") || ctx.contains("ipfs response missing cid") || ctx.contains("pinning error"),
  },
  {
    id: "simulation_failed",
    summary: "Simulation failed before submission.",
    hint: "Review the planner output or switch to Expert Mode for a detailed trace.",
    matches: (ctx) => ctx.contains("simulation failed") || ctx.contains("failed simulation") || ctx.contains("sim revert"),
  },
];

function buildMatcher(context) {
  const lowerMessages = toLowerList(context.messages);
  const lowerCodes = toLowerList(context.codes);
  const status = context.statuses.length ? context.statuses[0] : undefined;
  return {
    primary: context.messages.find((value) => value && value.trim()),
    status,
    contains(fragment) {
      if (!fragment) return false;
      const needle = fragment.toLowerCase();
      return lowerMessages.some((message) => message.includes(needle));
    },
    hasCode(code) {
      if (!code) return false;
      const needle = String(code).toLowerCase();
      return lowerCodes.includes(needle);
    },
  };
}

export function formatError(err) {
  if (err === null || err === undefined) {
    return "Something went wrong, but the error was empty.";
  }
  if (typeof err === "string") {
    const trimmed = err.trim();
    return trimmed || "An unexpected error occurred.";
  }

  const context = collectErrorContext(err);
  const matcher = buildMatcher(context);

  for (const rule of FRIENDLY_ERROR_RULES) {
    try {
      if (rule.matches(matcher)) {
        const pieces = [rule.summary];
        if (rule.hint) {
          pieces.push(`Tip: ${rule.hint}`);
        }
        return pieces.join(" ");
      }
    } catch (matchErr) {
      // Ignore individual rule failures and continue to the next rule.
      console.warn(`Error rule ${rule.id} threw during evaluation`, matchErr);
    }
  }

  if (matcher.primary) {
    return matcher.primary;
  }

  try {
    return JSON.stringify(err);
  } catch (jsonErr) {
    return "An unexpected error occurred.";
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
