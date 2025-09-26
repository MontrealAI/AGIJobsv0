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
  PLAN_URL,
  EXEC_URL,
  STATUS_URL,
  IPFS_ENDPOINT,
  IPFS_TOKEN_STORAGE_KEY,
  AA_MODE,
} = Config;

const IPFS_GATEWAYS = Array.isArray(Config.IPFS_GATEWAYS) && Config.IPFS_GATEWAYS.length
  ? Config.IPFS_GATEWAYS
  : ["https://w3s.link/ipfs/"];

const MAX_HISTORY = 10;
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

const MAX_ATTACHMENT_QUEUE = 3;
const queuedAttachments = [];

let busy = false;
let history = [];
let confirmCallback = null;
let advancedLogEl = null;
let statusTimer = null;
let statusLoading = false;
let lastStatusFingerprint = "";

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
  const token = localStorage.getItem(IPFS_TOKEN_STORAGE_KEY) || "";
  const maskedToken = token ? `••••${token.slice(-4)}` : "Not set";
  const aaSummary = summarizeAAMode(AA_MODE);
  advancedPanel.innerHTML = `
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
  renderAdvancedPanel();
}

if (hasDocument && statusBoard) {
  if (STATUS_URL) {
    renderStatusPlaceholder("Loading job status…");
    scheduleStatusRefresh(true);
  } else {
    renderStatusPlaceholder(
      "Status feed disabled. Set STATUS_URL in config.js to enable."
    );
  }
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
    if (action === "set-token") {
      const token = window.prompt("Enter your web3.storage API token");
      if (token) {
        localStorage.setItem(IPFS_TOKEN_STORAGE_KEY, token.trim());
        pushMessage("assistant", "Stored web3.storage token locally.");
        renderAdvancedPanel();
      }
    } else if (action === "clear-token") {
      localStorage.removeItem(IPFS_TOKEN_STORAGE_KEY);
      pushMessage("assistant", "Cleared stored web3.storage token.");
      renderAdvancedPanel();
    }
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

async function plannerRequest(prompt) {
  const requestBody = {
    message: prompt,
    text: prompt,
    history,
  };
  const response = await fetch(PLAN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
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
  const token = localStorage.getItem(IPFS_TOKEN_STORAGE_KEY);
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
  const response = await fetch(EXEC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ics, aa: AA_MODE }),
  });
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
  const response = await fetch(EXEC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent, mode: executionMode }),
  });

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

async function refreshStatus() {
  if (!STATUS_URL || !statusBoard) return;
  if (statusLoading) return;
  statusLoading = true;
  try {
    const response = await fetch(STATUS_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
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
  if (!STATUS_URL || !statusBoard) return;
  if (statusTimer) {
    clearInterval(statusTimer);
  }
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
  if (!STATUS_URL || !statusBoard) return;
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
  pushMessage(
    "assistant",
    'Welcome! Describe what you want to do (e.g. "Post a job for 500 images rewarded 50 AGIALPHA").'
  );
}
