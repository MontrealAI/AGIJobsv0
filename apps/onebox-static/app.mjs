import * as Config from "./config.mjs";
import { drainSSEBuffer, sanitizeSSEChunk } from "./sse-parser.mjs";

export { drainSSEBuffer, sanitizeSSEChunk } from "./sse-parser.mjs";
import {
  validateICS,
  needsAttachmentPin,
  prepareJobPayload,
  formatEvent,
  pinBlob,
  pinJSON,
  formatError,
  summarizeAAMode,
} from "./lib.mjs";

const {
  ORCHESTRATOR_BASE_URL,
  ORCHESTRATOR_ONEBOX_PREFIX,
  PLAN_URL,
  EXEC_URL,
  STATUS_URL,
  IPFS_ENDPOINT,
  IPFS_TOKEN_STORAGE_KEY,
  AA_MODE,
  ORCHESTRATOR_STORAGE_KEYS,
  ORCHESTRATOR_URL_PARAMS,
  ENABLE_DEMO_MODE,
} = Config;

const STORAGE_KEYS = {
  base:
    (ORCHESTRATOR_STORAGE_KEYS && ORCHESTRATOR_STORAGE_KEYS.base) ||
    "AGIJOBS_ONEBOX_ORCHESTRATOR_BASE",
  prefix:
    (ORCHESTRATOR_STORAGE_KEYS && ORCHESTRATOR_STORAGE_KEYS.prefix) ||
    "AGIJOBS_ONEBOX_ORCHESTRATOR_PREFIX",
};

const URL_PARAMS = {
  base: (ORCHESTRATOR_URL_PARAMS && ORCHESTRATOR_URL_PARAMS.base) || "orchestrator",
  prefix:
    (ORCHESTRATOR_URL_PARAMS && ORCHESTRATOR_URL_PARAMS.prefix) || "oneboxPrefix",
};

const DEMO_ENABLED = ENABLE_DEMO_MODE !== false;

const DEFAULT_ENDPOINTS = {
  base: sanitizeBaseUrl(ORCHESTRATOR_BASE_URL),
  prefix: sanitizePrefixSegment(ORCHESTRATOR_ONEBOX_PREFIX),
  plan: sanitizeUrlCandidate(PLAN_URL),
  exec: sanitizeUrlCandidate(EXEC_URL),
  status: sanitizeUrlCandidate(STATUS_URL),
};

const DEFAULT_WELCOME_MESSAGE =
  'Welcome! Describe what you want to do (e.g. "Post a job for 500 images rewarded 50 AGIALPHA").';
let currentWelcomeMessage = DEFAULT_WELCOME_MESSAGE;

const ORCHESTRATOR_TOKEN_STORAGE_KEY = 'AGIJOBS_ONEBOX_ORCHESTRATOR_TOKEN';
const AUTH_TOKEN_PATTERN = /^[A-Za-z0-9._~+/=:-]{1,512}$/;
const pendingAnnouncements = [];
let currentShortcutExamples = [];

const IPFS_GATEWAYS = Array.isArray(Config.IPFS_GATEWAYS) && Config.IPFS_GATEWAYS.length
  ? Config.IPFS_GATEWAYS
  : ["https://w3s.link/ipfs/"];

const MAX_HISTORY = (() => {
  const raw = Config.HISTORY_LENGTH;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 10;
})();
const STATUS_REFRESH_MS = (() => {
  const raw =
    Config.STATUS_REFRESH_MS ?? Config.STATUS_REFRESH_INTERVAL_MS ?? Config.STATUS_POLL_INTERVAL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
})();
const STATUS_MAX_ITEMS = (() => {
  const raw = Config.STATUS_MAX_ITEMS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 4;
})();

const hasDocument = typeof document !== "undefined";
const feed = hasDocument ? document.getElementById("feed") : null;
const composer = hasDocument ? document.getElementById("composer") : null;
const questionInput = hasDocument ? document.getElementById("question") : null;
const attachmentInput = hasDocument ? document.getElementById("attachment") : null;
const sendButton = hasDocument ? document.getElementById("send") : null;
const advancedToggle = hasDocument ? document.getElementById("advanced-toggle") : null;
const advancedPanel = hasDocument ? document.getElementById("advanced-panel") : null;
const statusBoard = hasDocument ? document.getElementById("status-board") : null;
const ownerConsole = hasDocument ? document.getElementById("owner-console") : null;
const ownerSnapshotEl = hasDocument ? document.getElementById("owner-snapshot") : null;
const ownerPreviewEl = hasDocument ? document.getElementById("owner-preview") : null;
const ownerRefreshBtn = hasDocument ? document.getElementById("owner-refresh") : null;
const ownerForm = hasDocument ? document.getElementById("owner-form") : null;
const ownerKeySelect = hasDocument ? document.getElementById("owner-key") : null;
const ownerValueInput = hasDocument ? document.getElementById("owner-value") : null;
const ownerValueHint = hasDocument ? document.getElementById("owner-value-hint") : null;
const shortcutsContainer = hasDocument ? document.getElementById("shortcuts") : null;

const storage = (() => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch (err) {
    // ignore storage failures (private browsing, etc.)
  }
  return null;
})();

if (hasDocument) {
  applyUrlOverrides();
}

if (ownerConsole) {
  initOwnerConsole();
}

let endpoints = resolveEndpoints();
let lastModeDescriptor = null;

const MAX_ATTACHMENT_QUEUE = 3;
const queuedAttachments = [];

let busy = false;
let history = [];
let confirmCallback = null;
let advancedLogEl = null;
let statusTimer = null;
let statusLoading = false;
let lastStatusFingerprint = "";

const OWNER_ACTIONS = {
  'stakeManager.setMinStake': {
    placeholder: '100',
    hint: 'AGIA amount converted to wei. Example: 250 for 250 AGIA.',
  },
  'stakeManager.setFeePct': {
    placeholder: '5',
    hint: 'Fee percentage (0-100).',
  },
  'stakeManager.setBurnPct': {
    placeholder: '2',
    hint: 'Burn percentage distributed from fees.',
  },
  'stakeManager.setValidatorRewardPct': {
    placeholder: '15',
    hint: 'Validator reward percentage (0-100).',
  },
  'stakeManager.setTreasury': {
    placeholder: '0x0000...dead',
    hint: 'Destination address or burn address.',
  },
  'jobRegistry.setJobStake': {
    placeholder: '50',
    hint: 'Minimum stake (AGIA) required per job.',
  },
  'jobRegistry.setMaxJobReward': {
    placeholder: '500',
    hint: 'Maximum reward allowed per job in AGIA.',
  },
  'jobRegistry.setJobDurationLimit': {
    placeholder: '{"days": 7}',
    hint: 'Provide seconds or JSON like {"days": 7}.',
  },
  'jobRegistry.setJobParameters': {
    placeholder: '{"maxReward": "500", "jobStake": "50"}',
    hint: 'JSON object with maxReward and jobStake fields (AGIA).',
  },
  'feePool.setBurnPct': {
    placeholder: '1',
    hint: 'Protocol burn percentage (0-100).',
  },
  'feePool.setTreasury': {
    placeholder: '0x0000...beef',
    hint: 'Treasury recipient address.',
  },
};

function sanitizeUrlCandidate(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sanitizeBaseUrl(value) {
  const candidate = sanitizeUrlCandidate(value);
  if (!candidate) return "";
  return candidate.replace(/\/+$/, "");
}

function sanitizePrefixSegment(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/^\/+|\/+$/g, "");
}

function sanitizeAuthToken(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/[\r\n]/.test(trimmed)) return "";
  if (!AUTH_TOKEN_PATTERN.test(trimmed)) return "";
  return trimmed;
}

export function parseShortcutExamplesInput(input) {
  const collected = [];

  const addExample = (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    collected.push(trimmed);
  };

  const process = (candidate) => {
    if (candidate === undefined || candidate === null) return;
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        process(entry);
      }
      return;
    }
    if (typeof candidate !== "string") return;
    const trimmed = candidate.trim();
    if (!trimmed) return;
    const looksJson = trimmed.startsWith("[") && trimmed.endsWith("]");
    if (looksJson) {
      try {
        const parsed = JSON.parse(trimmed);
        process(parsed);
        return;
      } catch (error) {
        // fall through to delimiter parsing when JSON fails
      }
    }
    const segments = trimmed
      .split(/[\n\r]+|\s*\|\s*/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    for (const segment of segments) {
      addExample(segment);
    }
  };

  process(input);
  return [...new Set(collected)];
}

function queueAnnouncement(message) {
  if (typeof message !== "string") return;
  const trimmed = message.trim();
  if (!trimmed) return;
  pendingAnnouncements.push(trimmed);
}

function flushPendingAnnouncements() {
  if (!pendingAnnouncements.length) return;
  for (const message of pendingAnnouncements) {
    pushMessage("assistant", message);
  }
  pendingAnnouncements.length = 0;
}

function renderShortcutExamples(examples) {
  if (!shortcutsContainer) return;
  const normalized = Array.isArray(examples)
    ? examples.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim())
    : [];
  currentShortcutExamples = [...new Set(normalized)];
  shortcutsContainer.innerHTML = "";
  if (!currentShortcutExamples.length) {
    shortcutsContainer.hidden = true;
    return;
  }
  shortcutsContainer.hidden = false;
  for (const example of currentShortcutExamples) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shortcut-btn";
    button.dataset.example = example;
    button.textContent = example;
    shortcutsContainer.appendChild(button);
  }
}

function joinUrlSegments(base, ...segments) {
  if (!base) return "";
  let normalized = base.replace(/\/+$/, "");
  for (const segment of segments) {
    if (!segment) continue;
    const trimmed = segment.replace(/^\/+|\/+$/g, "");
    if (!trimmed) continue;
    normalized += `/${trimmed}`;
  }
  return normalized;
}

function readStoredValue(key) {
  if (!storage || !key) return null;
  try {
    const value = storage.getItem(key);
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  } catch (err) {
    return null;
  }
}

function readStoredBase() {
  const value = readStoredValue(STORAGE_KEYS.base);
  return value ? sanitizeBaseUrl(value) : null;
}

function readStoredPrefix() {
  const value = readStoredValue(STORAGE_KEYS.prefix);
  return value ? sanitizePrefixSegment(value) : null;
}

function setStoredBase(value) {
  if (!storage) return;
  const sanitized = sanitizeBaseUrl(value);
  try {
    if (sanitized) {
      storage.setItem(STORAGE_KEYS.base, sanitized);
    } else {
      storage.removeItem(STORAGE_KEYS.base);
    }
  } catch (err) {
    // ignore
  }
}

function setStoredPrefix(value) {
  if (!storage) return;
  const sanitized = sanitizePrefixSegment(value);
  try {
    if (sanitized) {
      storage.setItem(STORAGE_KEYS.prefix, sanitized);
    } else {
      storage.removeItem(STORAGE_KEYS.prefix);
    }
  } catch (err) {
    // ignore
  }
}

function getStoredApiToken() {
  if (!storage || typeof storage.getItem !== "function") return "";
  try {
    const raw = storage.getItem(ORCHESTRATOR_TOKEN_STORAGE_KEY);
    if (typeof raw !== "string") return "";
    return sanitizeAuthToken(raw);
  } catch (err) {
    return "";
  }
}

function setStoredApiToken(value) {
  if (!storage || typeof storage.setItem !== "function") return null;
  const sanitized = sanitizeAuthToken(value);
  try {
    if (sanitized) {
      storage.setItem(ORCHESTRATOR_TOKEN_STORAGE_KEY, sanitized);
    } else {
      storage.removeItem(ORCHESTRATOR_TOKEN_STORAGE_KEY);
    }
  } catch (err) {
    // ignore storage failures
  }
  return sanitized ? true : false;
}

function clearStoredApiToken() {
  if (!storage || typeof storage.removeItem !== "function") return;
  try {
    storage.removeItem(ORCHESTRATOR_TOKEN_STORAGE_KEY);
  } catch (err) {
    // ignore
  }
}

function clearStoredOrchestrator() {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEYS.base);
    storage.removeItem(STORAGE_KEYS.prefix);
  } catch (err) {
    // ignore
  }
}

export function computeAuthHeaders(base, token) {
  const sanitizedToken = sanitizeAuthToken(token);
  if (base instanceof Headers) {
    const headers = new Headers(base);
    if (sanitizedToken) {
      headers.set("Authorization", `Bearer ${sanitizedToken}`);
    } else {
      headers.delete("Authorization");
    }
    return headers;
  }
  if (Array.isArray(base)) {
    const entries = base.filter((entry) => {
      if (!Array.isArray(entry) || entry.length < 1) return false;
      const [key] = entry;
      return typeof key === "string" && key.toLowerCase() !== "authorization";
    });
    if (sanitizedToken) {
      entries.push(["Authorization", `Bearer ${sanitizedToken}`]);
    }
    return entries;
  }
  if (!sanitizedToken) {
    if (base && typeof base === "object") {
      return { ...base };
    }
    return base;
  }
  const headers = base && typeof base === "object" ? { ...base } : {};
  headers.Authorization = `Bearer ${sanitizedToken}`;
  return headers;
}

function buildAuthHeaders(base) {
  const token = getStoredApiToken();
  if (!token) {
    if (base instanceof Headers) {
      return new Headers(base);
    }
    if (Array.isArray(base)) {
      return [...base];
    }
    if (base && typeof base === "object") {
      return { ...base };
    }
    return base;
  }
  return computeAuthHeaders(base, token);
}

function withAuth(options = {}) {
  const next = { ...options };
  next.headers = buildAuthHeaders(options.headers);
  return next;
}

function computeEndpointsFromBase(base, prefix) {
  const sanitizedBase = sanitizeBaseUrl(base);
  const sanitizedPrefix = sanitizePrefixSegment(prefix);
  if (!sanitizedBase) {
    return {
      base: sanitizedBase,
      prefix: sanitizedPrefix,
      plan: null,
      exec: null,
      status: null,
    };
  }
  const root = joinUrlSegments(sanitizedBase, sanitizedPrefix);
  return {
    base: sanitizedBase,
    prefix: sanitizedPrefix,
    plan: joinUrlSegments(root, "plan"),
    exec: joinUrlSegments(root, "execute"),
    status: joinUrlSegments(root, "status"),
  };
}

function resolveEndpoints() {
  const baseOverride = readStoredBase();
  const prefixOverride = readStoredPrefix();
  const base = baseOverride !== null ? baseOverride : DEFAULT_ENDPOINTS.base || "";
  const prefix = prefixOverride !== null ? prefixOverride : DEFAULT_ENDPOINTS.prefix || "";
  const computed = computeEndpointsFromBase(base, prefix);
  return {
    base: computed.base,
    prefix: computed.prefix,
    plan: computed.plan || DEFAULT_ENDPOINTS.plan || null,
    exec: computed.exec || DEFAULT_ENDPOINTS.exec || null,
    status: computed.status || DEFAULT_ENDPOINTS.status || null,
  };
}

function applyUrlOverrides() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    let tokenHandled = false;
    if (url.searchParams.has(URL_PARAMS.base)) {
      const baseValue = url.searchParams.get(URL_PARAMS.base);
      if (baseValue && baseValue.toLowerCase() !== "demo") {
        setStoredBase(baseValue);
      } else {
        setStoredBase("");
        if (baseValue && baseValue.toLowerCase() === "demo") {
          setStoredPrefix("");
        }
      }
      changed = true;
    }
    if (url.searchParams.has(URL_PARAMS.prefix)) {
      const prefixValue = url.searchParams.get(URL_PARAMS.prefix);
      setStoredPrefix(prefixValue || "");
      changed = true;
    }
    if (url.searchParams.has("token")) {
      const rawToken = url.searchParams.get("token");
      const stored = setStoredApiToken(rawToken || "");
      if (stored === true) {
        queueAnnouncement("🔐 API token applied for orchestrator requests.");
      } else if (!rawToken) {
        clearStoredApiToken();
        queueAnnouncement("🔓 Cleared orchestrator API token.");
      } else if (stored === false) {
        clearStoredApiToken();
        queueAnnouncement("⚠️ Ignored invalid orchestrator API token from URL parameters.");
      } else {
        queueAnnouncement("⚠️ Unable to persist orchestrator API token in this environment.");
      }
      tokenHandled = true;
      changed = true;
    }
    if (url.searchParams.has("welcome")) {
      const rawWelcome = url.searchParams.get("welcome");
      currentWelcomeMessage = rawWelcome && rawWelcome.trim() ? rawWelcome.trim() : DEFAULT_WELCOME_MESSAGE;
      changed = true;
    }
    if (url.searchParams.has("examples")) {
      const rawExamples = url.searchParams.get("examples");
      const parsedExamples = parseShortcutExamplesInput(rawExamples);
      renderShortcutExamples(parsedExamples);
      changed = true;
    }
    if (url.searchParams.has("mode")) {
      const rawMode = url.searchParams.get("mode");
      const lowered = rawMode ? rawMode.trim().toLowerCase() : "";
      if (lowered === "expert") {
        AA_MODE.enabled = false;
        queueAnnouncement("🛡️ Expert mode armed. Wallet calldata will be generated instead of relayer execution.");
      } else if (lowered === "guest") {
        AA_MODE.enabled = true;
        queueAnnouncement("🤝 Guest mode active. The relayer will sponsor orchestrated transactions.");
      }
      changed = true;
    }
    if (changed && typeof window.history?.replaceState === "function") {
      url.searchParams.delete(URL_PARAMS.base);
      url.searchParams.delete(URL_PARAMS.prefix);
      url.searchParams.delete("token");
      url.searchParams.delete("welcome");
      url.searchParams.delete("examples");
      url.searchParams.delete("mode");
      const nextSearch = url.searchParams.toString();
      const nextUrl = nextSearch ? `${url.pathname}?${nextSearch}${url.hash}` : `${url.pathname}${url.hash}`;
      window.history.replaceState({}, document.title, nextUrl);
    }
    if (!tokenHandled) {
      const token = getStoredApiToken();
      if (token) {
        queueAnnouncement("🔐 API token applied for orchestrator requests.");
      }
    }
  } catch (err) {
    // ignore invalid URL parsing
  }
}

function getOrchestratorBase() {
  return endpoints.base || "";
}

function getOrchestratorPrefix() {
  return endpoints.prefix || "";
}

function getPlanUrl() {
  return endpoints.plan || null;
}

function getExecUrl() {
  return endpoints.exec || null;
}

function getStatusUrl() {
  return endpoints.status || null;
}

function isDemoModeActive() {
  return DEMO_ENABLED && (!getPlanUrl() || !getExecUrl());
}

function formatPrefixDisplay(segment) {
  if (!segment) return "(none)";
  return `/${segment}`;
}

function formatOrchestratorDisplay() {
  const base = getOrchestratorBase();
  const prefix = getOrchestratorPrefix();
  if (base) {
    return joinUrlSegments(base, prefix);
  }
  if (DEFAULT_ENDPOINTS.plan) {
    try {
      const url = new URL(DEFAULT_ENDPOINTS.plan);
      const trimmedPath = url.pathname.replace(/\/?plan$/i, "").replace(/\/+$/, "");
      return `${url.origin}${trimmedPath}`;
    } catch (err) {
      return DEFAULT_ENDPOINTS.plan;
    }
  }
  return "Not configured";
}

function refreshEndpointState({ announce = false, immediateStatus = true } = {}) {
  endpoints = resolveEndpoints();
  if (!hasDocument) return;
  renderAdvancedPanel();
  updateStatusUI({ immediate: immediateStatus });
  if (announce) {
    maybeAnnounceMode({ force: true });
  } else {
    lastModeDescriptor = buildModeDescriptor();
  }
}

function demoPlan(prompt) {
  const text = typeof prompt === "string" ? prompt.trim() : "";
  const lowered = text.toLowerCase();
  let action = "post_job";
  if (lowered.includes("finalize")) {
    action = "finalize_job";
  } else if (lowered.includes("status")) {
    action = "check_status";
  } else if (lowered.includes("apply")) {
    action = "apply_job";
  } else if (lowered.includes("dispute")) {
    action = "dispute";
  }

  const jobIdMatch = text.match(/\d+/);
  const jobId = jobIdMatch ? Number(jobIdMatch[0]) : undefined;
  const payload = {};

  if (action === "post_job") {
    payload.title = text || "Demo job";
    payload.description = text || "Demo request";
    payload.rewardToken = "AGIALPHA";
    payload.reward = "5.0";
    payload.deadlineDays = 7;
  } else if (jobId !== undefined) {
    payload.jobId = jobId;
  }

  const friendlyAction =
    action === "post_job"
      ? "post a job"
      : action === "finalize_job"
        ? "finalize a job"
        : action === "check_status"
          ? "check a job status"
          : action.replace(/_/g, " ");

  const summary = text
    ? `I will simulate ${friendlyAction} for: ${text}. Proceed?`
    : `I will simulate ${friendlyAction}. Proceed?`;

  const warnings = [
    "Demo mode is active. Configure an orchestrator endpoint to run this on-chain.",
  ];

  return {
    kind: "job-intent",
    summary,
    requiresConfirmation: true,
    warnings,
    intent: {
      action,
      payload,
      constraints: { demo: true },
      userContext: { mode: "demo" },
    },
    raw: { summary, intent: { action, payload }, demo: true },
  };
}

async function runDemoExecution(intent) {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const action = typeof intent?.action === "string" ? intent.action : "request";
  const friendlyAction = action.replace(/_/g, " ");
  const response = {
    ok: true,
    demo: true,
    message: `Simulated ${friendlyAction} completed.`,
    warnings: [
      "Demo mode: no blockchain transaction was sent.",
      "Set an orchestrator URL in the Advanced panel to exit demo mode.",
    ],
  };
  if (action === "post_job") {
    response.jobId = pickDemoJobId();
  } else if (intent?.payload && intent.payload.jobId !== undefined) {
    response.jobId = intent.payload.jobId;
  }
  return response;
}

function pickDemoJobId() {
  return Math.floor(100 + Math.random() * 900);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function formatGatewayLink(url, index) {
  if (!url) return null;
  let href = String(url).trim();
  if (!href) return null;
  try {
    const parsed = new URL(href);
    const label = parsed.hostname + parsed.pathname;
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  } catch (err) {
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>`;
  }
}

function formatAdvancedPin(entry) {
  if (!entry || typeof entry !== "object") return "";
  const label = entry.label ? escapeHtml(entry.label) : "Pinned CID";
  const cid = entry.cid ? `<code>${escapeHtml(entry.cid)}</code>` : "";
  const gateways = Array.isArray(entry.gateways) ? entry.gateways.map(formatGatewayLink).filter(Boolean) : [];
  const gatewayHtml = gateways.length
    ? `<div class="pin-gateways">${gateways.join(" ")}</div>`
    : "";
  return `<li><div class="pin-label">${label}</div><div class="pin-cid">${cid}</div>${gatewayHtml}</li>`;
}

function parseAdvancedJSON(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    return null;
  }
}

function formatAdvancedValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const joined = value
      .map((entry) => {
        if (entry === null || entry === undefined) return "—";
        if (typeof entry === "object") {
          return JSON.stringify(entry, null, 2);
        }
        return String(entry);
      })
      .join(", ");
    return joined;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch (err) {
      return String(value);
    }
  }
  return String(value);
}

function renderAdvancedKeyValue(data) {
  if (!data || typeof data !== "object") return "";
  const entries = Object.entries(data);
  if (!entries.length) return "";
  const rows = entries
    .map(([key, value]) => {
      const label = escapeHtml(key);
      const display = formatAdvancedValue(value);
      const isMultiline = /\n/.test(display);
      const valueMarkup = isMultiline
        ? `<pre>${escapeHtml(display)}</pre>`
        : `<code>${escapeHtml(display)}</code>`;
      return `<div class="advanced-kv-row"><span class="advanced-kv-key">${label}</span><span class="advanced-kv-value">${valueMarkup}</span></div>`;
    })
    .join("");
  return `<div class="advanced-kv">${rows}</div>`;
}

export function formatPinnedSummaryMessage(entries) {
  if (!Array.isArray(entries) || !entries.length) return "";
  const header = `📦 Pinned ${entries.length} item${entries.length === 1 ? "" : "s"} to IPFS:`;
  const body = entries
    .map((entry) => {
      const label = entry.label ? entry.label : "Pinned item";
      return `• ${label}: ${entry.cid}`;
    })
    .join("\n");
  return `${header}\n${body}`;
}

function gatewayUrlsFor(cid) {
  if (!cid) return [];
  return IPFS_GATEWAYS.map((base) => {
    const trimmed = typeof base === "string" ? base.trim() : "";
    if (!trimmed) return null;
    const normalized = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
    return `${normalized}/${cid}`;
  }).filter(Boolean);
}

function renderAdvancedPanel() {
  if (!advancedPanel) return;
  const token = storage?.getItem?.(IPFS_TOKEN_STORAGE_KEY) || "";
  const maskedToken = token ? `••••${token.slice(-4)}` : "Not set";
  const orchestratorToken = getStoredApiToken();
  const maskedOrchestratorToken = orchestratorToken ? `••••${orchestratorToken.slice(-4)}` : "Not set";
  const aaSummary = summarizeAAMode(AA_MODE);
  const orchestratorMode = isDemoModeActive() ? "Demo mode" : "Live orchestrator";
  const base = getOrchestratorBase();
  const prefix = getOrchestratorPrefix();
  const planUrl = getPlanUrl();
  const execUrl = getExecUrl();
  const statusUrl = getStatusUrl();
  const planMarkup = planUrl
    ? formatGatewayLink(planUrl)
    : escapeHtml(isDemoModeActive() ? "Demo (no network call)" : "Not configured");
  const execMarkup = execUrl
    ? formatGatewayLink(execUrl)
    : escapeHtml(isDemoModeActive() ? "Demo (no network call)" : "Not configured");
  const statusMarkup = statusUrl
    ? formatGatewayLink(statusUrl)
    : escapeHtml(isDemoModeActive() ? "Demo (disabled)" : "Disabled");
  const hasOverrides = Boolean(base) || Boolean(prefix);
  advancedPanel.innerHTML = `
    <div class="card">
      <h2>Orchestrator</h2>
      <p>Mode: ${escapeHtml(orchestratorMode)}</p>
      <p class="status">Target: ${escapeHtml(formatOrchestratorDisplay())}</p>
      <p class="status">Prefix: ${escapeHtml(formatPrefixDisplay(prefix))}</p>
      <p class="status">Plan: ${planMarkup}</p>
      <p class="status">Execute: ${execMarkup}</p>
      <p class="status">Status: ${statusMarkup}</p>
      <p class="status">API token: ${escapeHtml(maskedOrchestratorToken)}</p>
      <div>
        <button type="button" class="inline" data-action="set-orchestrator">Set base URL</button>
        <button type="button" class="inline" data-action="set-prefix">Set prefix</button>
        ${
          hasOverrides
            ? '<button type="button" class="inline" data-action="clear-orchestrator">Clear overrides</button>'
            : ""
        }
        <button type="button" class="inline" data-action="set-api-token">Set API token</button>
        ${
          orchestratorToken
            ? '<button type="button" class="inline" data-action="clear-api-token">Clear API token</button>'
            : ""
        }
      </div>
    </div>
    <div class="card">
      <h2>IPFS uploads</h2>
      <p>Attachments and specs are pinned client-side via web3.storage. Tokens stay local to this browser.</p>
      <p class="status">Token: ${maskedToken}</p>
      <div>
        <button type="button" class="inline" data-action="set-token">Set token</button>
        ${token ? '<button type="button" class="inline" data-action="clear-token">Clear token</button>' : ""}
      </div>
    </div>
    <div class="card">
      <h2>Execution mode</h2>
      <p>${aaSummary.description}</p>
      <pre class="status">${aaSummary.detail}</pre>
    </div>
    <div class="card">
      <h2>Runbook</h2>
      <ul>
        <li>Planner responses must comply with the Intent-Constraint Schema (ICS).</li>
        <li>Value-moving intents require human confirmation (≤140 chars summary).</li>
        <li>Simulations, paymaster sponsorship, and relayer limits run server-side.</li>
        <li>ENS enforcement notices appear inline when required.</li>
      </ul>
    </div>
    <div class="card">
      <h2>Latest advanced receipt</h2>
      <p class="status" data-role="advanced-log">No advanced data yet.</p>
    </div>
  `;
  advancedLogEl = advancedPanel.querySelector('[data-role="advanced-log"]');
}

function normalizePlannerWarnings(input) {
  const list = toArray(input);
  return list
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object" && typeof entry.message === "string") {
        return entry.message.trim();
      }
      return null;
    })
    .filter((value) => typeof value === "string" && value);
}

function normalizeJobIntentPlan(payload) {
  if (!isObject(payload)) return null;

  const container = isObject(payload.intent)
    ? payload
    : isObject(payload.data) && isObject(payload.data.intent)
      ? payload.data
      : null;

  if (!container || !isObject(container.intent)) {
    return null;
  }

  const intent = container.intent;
  if (typeof intent.action !== "string" || !intent.action.trim()) {
    return null;
  }

  const summarySource = typeof payload.summary === "string" && payload.summary.trim()
    ? payload.summary.trim()
    : typeof container.summary === "string" && container.summary.trim()
      ? container.summary.trim()
      : "";

  const requiresConfirmationRaw =
    payload.requiresConfirmation ?? container.requiresConfirmation;
  const requiresConfirmation =
    typeof requiresConfirmationRaw === "boolean" ? requiresConfirmationRaw : true;

  const warnings = normalizePlannerWarnings(
    payload.warnings ?? container.warnings ?? []
  );

  return {
    kind: "job-intent",
    summary: summarySource,
    requiresConfirmation,
    warnings,
    intent,
    raw: payload,
  };
}

if (hasDocument) {
  refreshEndpointState({ immediateStatus: true });
}

function setAdvancedLog(data) {
  if (!advancedPanel) return;
  if (!advancedLogEl) {
    renderAdvancedPanel();
  }
  if (advancedLogEl) {
    if (!data) {
      advancedLogEl.textContent = "—";
      return;
    }

    if (Array.isArray(data?.pins)) {
      const items = data.pins.map(formatAdvancedPin).filter(Boolean).join("");
      if (items) {
        advancedLogEl.innerHTML = `<div class="pin-summary">Pinned items</div><ul class="pin-list">${items}</ul>`;
        return;
      }
    }

    if (typeof data === "string") {
      const parsed = parseAdvancedJSON(data);
      if (parsed && !Array.isArray(parsed)) {
        const markup = renderAdvancedKeyValue(parsed);
        if (markup) {
          advancedLogEl.innerHTML = markup;
          return;
        }
      } else if (parsed && Array.isArray(parsed)) {
        advancedLogEl.innerHTML = `<pre>${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
        return;
      }
      advancedLogEl.textContent = data;
      return;
    }

    if (Array.isArray(data)) {
      if (!data.length) {
        advancedLogEl.textContent = "[]";
        return;
      }
      advancedLogEl.innerHTML = `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
      return;
    }

    if (typeof data === "object") {
      const markup = renderAdvancedKeyValue(data);
      if (markup) {
        advancedLogEl.innerHTML = markup;
        return;
      }
      advancedLogEl.innerHTML = `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
      return;
    }

    advancedLogEl.textContent = String(data);
  }
}

if (advancedPanel) {
  advancedPanel.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "set-orchestrator") {
      const current = getOrchestratorBase() || DEFAULT_ENDPOINTS.base || "";
      const value = window.prompt(
        "Enter the orchestrator base URL (leave blank or type DEMO to disable)",
        current
      );
      if (value !== null) {
        const trimmed = value.trim();
        if (!trimmed || trimmed.toLowerCase() === "demo") {
          clearStoredOrchestrator();
        } else {
          setStoredBase(trimmed);
        }
        refreshEndpointState({ announce: true });
      }
    } else if (action === "set-prefix") {
      const currentPrefix = getOrchestratorPrefix() || DEFAULT_ENDPOINTS.prefix || "";
      const formatted = currentPrefix ? `/${currentPrefix}` : "";
      const value = window.prompt(
        "Enter the orchestrator prefix (e.g., /onebox). Leave blank for none.",
        formatted
      );
      if (value !== null) {
        const trimmed = value.trim();
        if (!trimmed) {
          setStoredPrefix("");
        } else {
          setStoredPrefix(trimmed);
        }
        refreshEndpointState({ announce: true });
      }
    } else if (action === "clear-orchestrator") {
      clearStoredOrchestrator();
      refreshEndpointState({ announce: true });
    } else if (action === "set-token") {
      const token = window.prompt("Enter your web3.storage API token");
      if (token && storage) {
        storage.setItem(IPFS_TOKEN_STORAGE_KEY, token.trim());
        pushMessage("assistant", "Stored web3.storage token locally.");
        renderAdvancedPanel();
      }
    } else if (action === "clear-token") {
      storage?.removeItem?.(IPFS_TOKEN_STORAGE_KEY);
      pushMessage("assistant", "Cleared stored web3.storage token.");
      renderAdvancedPanel();
    } else if (action === "set-api-token") {
      const currentToken = getStoredApiToken();
      const value = window.prompt("Enter the orchestrator API token", currentToken);
      if (value !== null) {
        const trimmed = value.trim();
        if (!trimmed) {
          clearStoredApiToken();
          pushMessage("assistant", "Cleared orchestrator API token.");
        } else {
          const stored = setStoredApiToken(trimmed);
          if (stored === true) {
            queueAnnouncement("🔐 API token applied for orchestrator requests.");
            pushMessage("assistant", "Stored orchestrator API token locally.");
          } else if (stored === false) {
            clearStoredApiToken();
            queueAnnouncement("⚠️ Invalid characters removed from orchestrator API token. Nothing stored.");
            pushMessage(
              "assistant",
              "Ignored orchestrator API token because it contained invalid characters."
            );
          } else {
            queueAnnouncement("⚠️ Unable to persist orchestrator API token in this environment.");
            pushMessage(
              "assistant",
              "Could not store the orchestrator API token because local storage is unavailable."
            );
          }
        }
        flushPendingAnnouncements();
        renderAdvancedPanel();
        refreshOwnerSnapshot();
      }
    } else if (action === "clear-api-token") {
      clearStoredApiToken();
      pushMessage("assistant", "Cleared orchestrator API token.");
      flushPendingAnnouncements();
      renderAdvancedPanel();
      refreshOwnerSnapshot();
    }
  });
}

if (shortcutsContainer) {
  shortcutsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-example]");
    if (!button) return;
    const example = button.dataset.example;
    if (!example || !questionInput) return;
    questionInput.value = example;
    questionInput.focus();
  });
}

function toggleAdvanced(e) {
  e?.preventDefault();
  if (!hasDocument) return;
  if (!document.body.classList.contains("advanced")) {
    renderAdvancedPanel();
  }
  document.body.classList.toggle("advanced");
}
if (advancedToggle) {
  advancedToggle.addEventListener("click", toggleAdvanced);
}

if (attachmentInput) {
  attachmentInput.addEventListener("change", () => {
    const files = asFileArray(attachmentInput.files);
    if (!files.length) return;
    queueAttachments(files);
    attachmentInput.value = "";
  });
}

if (hasDocument) {
  document.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
    }
  });

  document.addEventListener("drop", (event) => {
    const files = asFileArray(event.dataTransfer?.files);
    if (!files.length) return;
    event.preventDefault();
    queueAttachments(files);
  });

  document.addEventListener("paste", (event) => {
    const files = asFileArray(event.clipboardData?.files);
    if (!files.length) return;
    queueAttachments(files);
  });
}

function scrollFeed() {
  if (!feed) return;
  feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
}

function pushMessage(role, text) {
  if (!text || !feed) return;
  const bubble = document.createElement("div");
  bubble.className = role === "user" ? "msg me" : "msg";
  bubble.textContent = text;
  feed.appendChild(bubble);
  scrollFeed();
}

function buildModeDescriptor() {
  if (isDemoModeActive()) {
    return "demo";
  }
  const plan = getPlanUrl();
  if (plan) {
    return `live:${plan}`;
  }
  return "unconfigured";
}

function maybeAnnounceMode({ force = false } = {}) {
  const descriptor = buildModeDescriptor();
  if (!force && descriptor === lastModeDescriptor) {
    return;
  }
  lastModeDescriptor = descriptor;
  let message;
  if (descriptor === "demo") {
    message =
      "Demo mode is active. Set an orchestrator base URL in the Advanced panel when you're ready to run on-chain.";
  } else if (descriptor === "unconfigured") {
    message =
      "No orchestrator endpoint configured yet. Provide one from the Advanced panel to talk to AGI-Alpha.";
  } else {
    message = `Connected to orchestrator: ${formatOrchestratorDisplay()}.`;
  }
  pushMessage("assistant", message);
}

function asFileArray(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.filter(Boolean);
  }
  try {
    return Array.from(input).filter(Boolean);
  } catch (err) {
    return [];
  }
}

function formatBytes(size) {
  if (!Number.isFinite(size)) return "unknown size";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function queueAttachments(files, { silent = false } = {}) {
  const normalized = asFileArray(files);
  if (!normalized.length) return [];
  const limited = normalized.slice(0, MAX_ATTACHMENT_QUEUE);
  queuedAttachments.splice(0, queuedAttachments.length, ...limited);
  if (!silent && limited.length) {
    const summary = limited
      .map((file) => {
        const name = typeof file?.name === "string" && file.name ? file.name : "attachment";
        const size = typeof file?.size === "number" ? formatBytes(file.size) : "unknown size";
        return `${name} (${size})`;
      })
      .join(", ");
    pushMessage("assistant", `Attached for next request: ${summary}`);
  }
  return limited;
}

function requeueAttachments(files) {
  const normalized = asFileArray(files);
  if (!normalized.length) return;
  const combined = [...normalized, ...queuedAttachments];
  const limited = combined.slice(0, MAX_ATTACHMENT_QUEUE);
  queuedAttachments.splice(0, queuedAttachments.length, ...limited);
}

function drainQueuedAttachments() {
  if (!queuedAttachments.length) return [];
  return queuedAttachments.splice(0, queuedAttachments.length);
}

function setBusy(state) {
  busy = state;
  if (sendButton) {
    sendButton.disabled = state;
  }
  if (questionInput) {
    questionInput.disabled = state;
  }
  if (attachmentInput) {
    attachmentInput.disabled = state;
  }
}

function ownerActionInfo(key) {
  const info = OWNER_ACTIONS[key];
  if (info) return info;
  return { placeholder: '', hint: 'Provide raw numbers or JSON for this action.' };
}

function updateOwnerHints() {
  if (!ownerKeySelect || !ownerValueInput) return;
  const selected = ownerActionInfo(ownerKeySelect.value);
  if (selected.placeholder !== undefined && ownerValueInput.value.trim() === '') {
    ownerValueInput.placeholder = selected.placeholder;
  }
  if (ownerValueHint) {
    ownerValueHint.textContent = selected.hint;
  }
}

function ownerApiUrl(...segments) {
  return joinUrlSegments(endpoints.base, endpoints.prefix, ...segments);
}

async function refreshOwnerSnapshot() {
  if (!ownerSnapshotEl) return;
  const url = ownerApiUrl('governance', 'snapshot');
  if (!url) {
    ownerSnapshotEl.textContent = 'Configure an orchestrator base URL to load governance parameters.';
    return;
  }
  ownerSnapshotEl.textContent = 'Loading snapshot…';
  try {
    const response = await fetch(
      url,
      withAuth({ method: 'GET', headers: { Accept: 'application/json' } })
    );
    if (!response.ok) {
      throw new Error(`Snapshot error (${response.status})`);
    }
    const payload = await response.json();
    ownerSnapshotEl.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    ownerSnapshotEl.textContent = `⚠️ ${error instanceof Error ? error.message : 'Snapshot unavailable'}`;
  }
}

function parseOwnerValue(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    if (/^(true|false)$/i.test(trimmed)) {
      return trimmed.toLowerCase() === 'true';
    }
    if (!Number.isNaN(Number(trimmed))) {
      return Number(trimmed);
    }
    return trimmed;
  }
}

async function submitOwnerPreview(event) {
  event.preventDefault();
  if (!ownerKeySelect || !ownerPreviewEl) return;
  const key = ownerKeySelect.value;
  const value = ownerValueInput ? parseOwnerValue(ownerValueInput.value) : null;
  const url = ownerApiUrl('governance', 'preview');
  if (!url) {
    ownerPreviewEl.textContent = 'Configure an orchestrator base URL to generate a preview.';
    return;
  }
  ownerPreviewEl.textContent = 'Preparing preview…';
  try {
    const response = await fetch(
      url,
      withAuth({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          value,
          meta: { traceId: crypto.randomUUID?.() },
        }),
      })
    );
    if (!response.ok) {
      throw new Error(`Preview error (${response.status})`);
    }
    const payload = await response.json();
    ownerPreviewEl.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    ownerPreviewEl.textContent = `⚠️ ${error instanceof Error ? error.message : 'Preview unavailable'}`;
  }
}

function initOwnerConsole() {
  updateOwnerHints();
  refreshOwnerSnapshot();
  ownerKeySelect?.addEventListener('change', updateOwnerHints);
  ownerRefreshBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    refreshOwnerSnapshot();
  });
  ownerForm?.addEventListener('submit', submitOwnerPreview);
}

async function plannerRequest(prompt) {
  const planUrl = getPlanUrl();
  if (!planUrl) {
    if (isDemoModeActive()) {
      return demoPlan(prompt);
    }
    throw new Error("Planner endpoint not configured");
  }
  const requestBody = {
    message: prompt,
    text: prompt,
    history,
  };
  const response = await fetch(
    planUrl,
    withAuth({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    })
  );
  if (!response.ok) {
    throw new Error(`Planner unavailable (${response.status})`);
  }
  const payload = await response.json();
  const jobIntent = normalizeJobIntentPlan(payload);
  if (jobIntent) {
    return jobIntent;
  }
  const ics = validateICS(payload);
  return { kind: "ics", ics };
}

async function requestConfirmation({ summary, required }) {
  const prompt = summary && summary.trim() ? summary.trim() : "Proceed?";
  if (!required) {
    if (prompt) {
      pushMessage("assistant", prompt);
    }
    return true;
  }

  const message = prompt || "Please confirm to continue.";
  pushMessage("assistant", message);
  pushMessage("assistant", "Type YES to confirm or NO to cancel.");
  setBusy(false);

  return new Promise((resolve) => {
    confirmCallback = (value) => {
      const ok = /^(y|yes)$/i.test(value);
      if (!ok) {
        pushMessage("assistant", "Cancelled.");
      }
      confirmCallback = null;
      setBusy(true);
      resolve(ok);
    };
  });
}

async function confirmFlow(ics) {
  if (!ics.confirm) {
    if (ics.summary) {
      pushMessage("assistant", ics.summary);
    }
    return true;
  }
  const summary = ics.summary || "Please confirm to continue.";
  return requestConfirmation({ summary, required: true });
}

async function maybePinAttachments(ics, files) {
  const attachments = Array.isArray(files) ? files.filter(Boolean) : [];
  const shouldPinPayload = needsAttachmentPin(ics);
  if (!attachments.length && !shouldPinPayload) return ics;
  const token = storage?.getItem?.(IPFS_TOKEN_STORAGE_KEY);
  if (!token) {
    throw new Error("IPFS token missing. Provide a web3.storage token from the Advanced panel.");
  }

  const pinnedFiles = [];
  const pinSummaries = [];
  for (const [index, file] of attachments.entries()) {
    if (!file) continue;
    const result = await pinBlob(IPFS_ENDPOINT, token, file);
    const gateways = gatewayUrlsFor(result.cid);
    pinnedFiles.push({
      cid: result.cid,
      uri: `ipfs://${result.cid}`,
      gateways,
      name: typeof file?.name === "string" ? file.name : undefined,
      size: typeof file?.size === "number" ? file.size : undefined,
    });
    const fallbackLabel = `Attachment ${attachments.length > 1 ? `#${index + 1}` : ""}`.trim();
    pinSummaries.push({
      label: file?.name ? `Attachment (${file.name})` : fallbackLabel || "Attachment",
      cid: result.cid,
      gateways,
    });
  }

  const prepared = prepareJobPayload(ics, pinnedFiles);
  if (prepared && typeof prepared.applyAttachments === "function") {
    prepared.applyAttachments();
  }

  let payloadCid = null;
  let payloadGateways = [];
  if (shouldPinPayload && prepared?.payload) {
    const { cid } = await pinJSON(IPFS_ENDPOINT, token, prepared.payload);
    payloadCid = cid;
    payloadGateways = gatewayUrlsFor(cid);
    prepared.assign({ cid, gateways: payloadGateways });
    pinSummaries.push({
      label: `${prepared.payload.kind || "Payload"} JSON`,
      cid,
      gateways: payloadGateways,
    });
  }

  if (!payloadCid && prepared && typeof prepared.mergeClientPins === "function") {
    prepared.mergeClientPins();
  }

  if (pinSummaries.length) {
    pushMessage("assistant", formatPinnedSummaryMessage(pinSummaries));
    setAdvancedLog({ pins: pinSummaries });
  }
  return ics;
}

async function executeICS(ics) {
  const execUrl = getExecUrl();
  if (!execUrl) {
    const message = isDemoModeActive()
      ? "Demo mode: configure an orchestrator endpoint to execute jobs."
      : "Executor endpoint not configured";
    throw new Error(message);
  }
  const response = await fetch(
    execUrl,
    withAuth({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ics, aa: AA_MODE }),
    })
  );
  if (!response.ok || !response.body) {
    throw new Error(`Executor error (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handleChunk = (chunk) => {
    try {
      const normalized = sanitizeSSEChunk(chunk);
      if (!normalized) {
        return;
      }
      const event = JSON.parse(normalized);
      const { text, advanced } = formatEvent(event);
      pushMessage("assistant", text);
      if (advanced) {
        setAdvancedLog(advanced);
      }
    } catch (err) {
      console.error("Bad event", err, chunk);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
    }
    if (buffer) {
      buffer = drainSSEBuffer(buffer, handleChunk);
    }
    if (done) break;
  }

  const finalChunk = buffer.trim();
  if (finalChunk) {
    handleChunk(finalChunk);
  }

  refreshStatusSoon();
}

async function executeJobIntent(intent, { raw } = {}) {
  if (!isObject(intent)) {
    throw new Error("Planner returned an invalid intent");
  }
  pushMessage("assistant", "Working on it…");
  const executionMode = AA_MODE?.enabled === false ? "wallet" : "relayer";
  const execUrl = getExecUrl();
  if (!execUrl) {
    if (isDemoModeActive()) {
      const payload = await runDemoExecution(intent);
      const messages = [];
      if (payload?.jobId !== undefined && payload.jobId !== null) {
        messages.push(`Job #${payload.jobId}`);
      }
      if (payload?.receiptUrl) {
        messages.push(`receipt ${payload.receiptUrl}`);
      }
      const summary = payload?.message
        ? payload.message
        : messages.length
          ? `Completed: ${messages.join(" • ")}`
          : "Request completed.";
      pushMessage("assistant", `✅ ${summary}`);
      if (Array.isArray(payload?.warnings)) {
        for (const warning of payload.warnings) {
          if (typeof warning === "string" && warning.trim()) {
            pushMessage("assistant", `⚠️ ${warning.trim()}`);
          }
        }
      }
      if (raw || payload) {
        setAdvancedLog({ intent, response: payload, raw });
      }
      refreshStatusSoon();
      return;
    }
    throw new Error("Executor endpoint not configured");
  }
  const response = await fetch(
    execUrl,
    withAuth({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent, mode: executionMode }),
    })
  );

  let payload = null;
  try {
    payload = await response.json();
  } catch (err) {
    // ignore, handled below
  }

  if (!response.ok) {
    const errorMessage = payload?.error || `Execution failed (${response.status})`;
    throw new Error(errorMessage);
  }

  if (payload && payload.ok === false) {
    const message = payload.error || payload.message || "Execution failed";
    throw new Error(message);
  }

  const messages = [];
  if (payload?.jobId !== undefined && payload.jobId !== null) {
    messages.push(`Job #${payload.jobId}`);
  }
  if (payload?.txHash) {
    messages.push(`tx ${payload.txHash}`);
  }
  if (payload?.receiptUrl) {
    messages.push(`receipt ${payload.receiptUrl}`);
  }

  const summary = payload?.message
    ? payload.message
    : messages.length
      ? `Completed: ${messages.join(" • ")}`
      : "Request completed.";

  pushMessage("assistant", `✅ ${summary}`);

  if (Array.isArray(payload?.warnings)) {
    for (const warning of payload.warnings) {
      if (typeof warning === "string" && warning.trim()) {
        pushMessage("assistant", `⚠️ ${warning.trim()}`);
      }
    }
  }

  if (raw || payload) {
    setAdvancedLog({ intent, response: payload, raw });
  }

  refreshStatusSoon();
}

function normalizeStatusEntries(payload) {
  if (Array.isArray(payload)) return payload;
  if (!isObject(payload)) return [];
  if (Array.isArray(payload.jobs)) return payload.jobs;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function parseTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function formatRelativeTime(value) {
  const timestamp = parseTimestamp(value);
  if (timestamp === null) return null;
  const diff = Date.now() - timestamp;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  let label;
  if (abs >= day) {
    const days = Math.round(abs / day);
    label = `${days}d`;
  } else if (abs >= hour) {
    const hours = Math.round(abs / hour);
    label = `${hours}h`;
  } else if (abs >= minute) {
    const minutes = Math.round(abs / minute);
    label = `${minutes}m`;
  } else {
    label = `${Math.max(1, Math.round(abs / 1000))}s`;
  }
  return diff >= 0 ? `${label} ago` : `in ${label}`;
}

function formatDeadlineLabel(value) {
  const timestamp = parseTimestamp(value);
  if (timestamp === null) {
    return typeof value === "string" ? value : `Deadline ${String(value)}`;
  }
  const diff = timestamp - Date.now();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) {
    return diff >= 0 ? "Due now" : "Past due";
  }
  if (abs >= day) {
    const days = Math.floor(abs / day);
    const hours = Math.floor((abs % day) / hour);
    const parts = [days ? `${days}d` : null, hours ? `${hours}h` : null].filter(Boolean);
    const label = parts.join(" ");
    return diff >= 0 ? `Due in ${label}` : `${label} overdue`;
  }
  const hours = Math.floor(abs / hour);
  if (hours >= 1) {
    const minutes = Math.floor((abs % hour) / minute);
    const label = minutes ? `${hours}h ${minutes}m` : `${hours}h`;
    return diff >= 0 ? `Due in ${label}` : `${label} overdue`;
  }
  const minutes = Math.floor(abs / minute);
  return diff >= 0 ? `Due in ${minutes}m` : `${minutes}m overdue`;
}

function createStatusPill(label) {
  if (!label) return null;
  const pill = document.createElement("span");
  pill.className = "status-pill";
  pill.textContent = label;
  return pill;
}

function createStatusCard(entry) {
  const card = document.createElement("article");
  card.className = "status-card";
  const heading = document.createElement("h3");
  const jobId = entry?.jobId ?? entry?.id ?? entry?.jobID;
  const titleSource = entry?.title || entry?.name || entry?.action;
  heading.textContent = titleSource
    ? String(titleSource)
    : jobId !== undefined
      ? `Job #${jobId}`
      : "Recent activity";
  card.appendChild(heading);

  const summary = entry?.summary || entry?.message || entry?.description;
  if (summary) {
    const body = document.createElement("p");
    body.textContent = String(summary);
    card.appendChild(body);
  }

  const meta = document.createElement("div");
  meta.className = "status-meta";

  const stateLabel = entry?.status || entry?.state || entry?.phase;
  const statePill = createStatusPill(stateLabel ? String(stateLabel) : null);
  if (statePill) meta.appendChild(statePill);

  const rewardValue = entry?.reward ?? entry?.rewardAmount ?? entry?.payout;
  if (rewardValue !== undefined && rewardValue !== null) {
    const rewardText = `Reward ${String(rewardValue)}`;
    const rewardPill = createStatusPill(rewardText);
    if (rewardPill) meta.appendChild(rewardPill);
  }

  const tokenLabel = entry?.rewardToken || entry?.tokenSymbol || entry?.token;
  const tokenPill = createStatusPill(tokenLabel ? String(tokenLabel) : null);
  if (tokenPill) meta.appendChild(tokenPill);

  const deadlineValue = entry?.deadline ?? entry?.deadlineAt ?? entry?.deadlineDays ?? entry?.expiresAt;
  const deadlineLabel = formatDeadlineLabel(deadlineValue);
  if (deadlineLabel) {
    const deadlinePill = createStatusPill(deadlineLabel);
    if (deadlinePill) meta.appendChild(deadlinePill);
  }

  const updatedLabel = formatRelativeTime(entry?.updatedAt ?? entry?.timestamp);
  if (updatedLabel) {
    const updatedPill = createStatusPill(`Updated ${updatedLabel}`);
    if (updatedPill) meta.appendChild(updatedPill);
  }

  const link = entry?.link || entry?.url;
  if (typeof link === "string" && link.trim()) {
    const anchor = document.createElement("a");
    anchor.className = "status-pill";
    anchor.textContent = "Details";
    anchor.href = link;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    meta.appendChild(anchor);
  }

  if (meta.children.length) {
    card.appendChild(meta);
  }

  return card;
}

function renderStatusPlaceholder(message) {
  if (!statusBoard) return;
  statusBoard.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "status-empty";
  empty.textContent = message;
  statusBoard.appendChild(empty);
  lastStatusFingerprint = `placeholder:${message}`;
}

function renderStatusBoard(entries) {
  if (!statusBoard) return;
  statusBoard.innerHTML = "";
  if (!entries.length) {
    renderStatusPlaceholder("No recent jobs yet. I’ll update this feed as activity occurs.");
    lastStatusFingerprint = "empty";
    return;
  }

  const limited = entries.slice(0, STATUS_MAX_ITEMS);
  for (const entry of limited) {
    const card = createStatusCard(entry);
    statusBoard.appendChild(card);
  }
  lastStatusFingerprint = JSON.stringify(limited);
}

function renderStatusError(error) {
  const message =
    error instanceof Error && error.message
      ? `Status unavailable: ${error.message}`
      : "Status unavailable right now.";
  renderStatusPlaceholder(message);
  lastStatusFingerprint = `error:${message}`;
}

function updateStatusUI({ immediate = false } = {}) {
  if (!statusBoard) return;
  const statusUrl = getStatusUrl();
  if (!statusUrl) {
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    const message = isDemoModeActive()
      ? "Status feed disabled in demo mode. Set an orchestrator endpoint to enable live updates."
      : "Status feed disabled. Configure an orchestrator status endpoint.";
    renderStatusPlaceholder(message);
    return;
  }
  renderStatusPlaceholder("Loading job status…");
  scheduleStatusRefresh(immediate);
}

async function refreshStatus() {
  const statusUrl = getStatusUrl();
  if (!statusUrl || !statusBoard) return;
  if (statusLoading) return;
  statusLoading = true;
  try {
    const response = await fetch(
      statusUrl,
      withAuth({ method: "GET", headers: { Accept: "application/json" } })
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const entries = normalizeStatusEntries(payload);
    const fingerprint = JSON.stringify(entries.slice(0, STATUS_MAX_ITEMS));
    if (fingerprint !== lastStatusFingerprint) {
      renderStatusBoard(entries);
    }
  } catch (error) {
    renderStatusError(error);
  } finally {
    statusLoading = false;
  }
}

function scheduleStatusRefresh(immediate = false) {
  if (!statusBoard) return;
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  if (!getStatusUrl()) return;
  if (immediate) {
    refreshStatus().catch(() => {
      /* handled in renderStatusError */
    });
  }
  statusTimer = setInterval(() => {
    refreshStatus().catch(() => {
      /* handled */
    });
  }, STATUS_REFRESH_MS);
}

function refreshStatusSoon() {
  if (!statusBoard || !getStatusUrl()) return;
  refreshStatus().catch(() => {
    /* handled */
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!questionInput || !attachmentInput) return;

  if (confirmCallback) {
    const value = questionInput.value.trim();
    if (!value) return;
    pushMessage("user", value);
    questionInput.value = "";
    const callback = confirmCallback;
    confirmCallback = null;
    callback(value);
    return;
  }

  if (busy) return;

  const text = questionInput.value.trim();
  if (!text) return;

  const queued = drainQueuedAttachments();
  const selected = attachmentInput.files ? Array.from(attachmentInput.files).filter(Boolean) : [];
  const files = [...queued, ...selected];

  pushMessage("user", text);
  questionInput.value = "";
  attachmentInput.value = "";

  setBusy(true);

  try {
    const planResult = await plannerRequest(text);

    if (planResult && planResult.kind === "job-intent") {
      if (files.length) {
        requeueAttachments(files);
      }

      const warnings = Array.isArray(planResult.warnings)
        ? planResult.warnings
        : [];
      for (const warning of warnings) {
        if (typeof warning === "string" && warning.trim()) {
          pushMessage("assistant", `⚠️ ${warning.trim()}`);
        }
      }

      const confirmed = await requestConfirmation({
        summary:
          planResult.summary && planResult.summary.trim()
            ? planResult.summary
            : "Proceed with the plan?",
        required: planResult.requiresConfirmation,
      });

      if (!confirmed) {
        setBusy(false);
        return;
      }

      await executeJobIntent(planResult.intent, { raw: planResult.raw });
      history = history
        .concat(
          { role: "user", text },
          { role: "assistant", text: JSON.stringify(planResult.intent) }
        )
        .slice(-MAX_HISTORY);
    } else {
      const ics = planResult && planResult.kind === "ics" ? planResult.ics : planResult;
      const confirmed = await confirmFlow(ics);
      if (!confirmed) {
        if (files.length) {
          requeueAttachments(files);
        }
        setBusy(false);
        return;
      }

      await maybePinAttachments(ics, files);
      history = history
        .concat({ role: "user", text }, { role: "assistant", text: JSON.stringify(ics) })
        .slice(-MAX_HISTORY);

      await executeICS(ics);
    }
  } catch (err) {
    const friendly = formatError(err);
    pushMessage("assistant", `❌ ${friendly}`);
    if (files.length) {
      requeueAttachments(files);
    }
  } finally {
    setBusy(false);
  }
}

if (composer) {
  composer.addEventListener("submit", handleSubmit);
}

if (hasDocument) {
  pushMessage("assistant", currentWelcomeMessage);
  maybeAnnounceMode({ force: true });
  flushPendingAnnouncements();
  if (!currentShortcutExamples.length) {
    renderShortcutExamples([]);
  }
}
