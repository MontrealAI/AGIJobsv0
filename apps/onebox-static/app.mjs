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
  IPFS_ENDPOINT,
  IPFS_TOKEN_STORAGE_KEY,
  AA_MODE,
} = Config;

const IPFS_GATEWAYS = Array.isArray(Config.IPFS_GATEWAYS) && Config.IPFS_GATEWAYS.length
  ? Config.IPFS_GATEWAYS
  : ["https://w3s.link/ipfs/"];

const MAX_HISTORY = 10;

const hasDocument = typeof document !== "undefined";
const feed = hasDocument ? document.getElementById("feed") : null;
const composer = hasDocument ? document.getElementById("composer") : null;
const questionInput = hasDocument ? document.getElementById("question") : null;
const attachmentInput = hasDocument ? document.getElementById("attachment") : null;
const sendButton = hasDocument ? document.getElementById("send") : null;
const advancedToggle = hasDocument ? document.getElementById("advanced-toggle") : null;
const advancedPanel = hasDocument ? document.getElementById("advanced-panel") : null;

const MAX_ATTACHMENT_QUEUE = 3;
const queuedAttachments = [];

let busy = false;
let history = [];
let confirmCallback = null;
let advancedLogEl = null;

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

if (hasDocument) {
  renderAdvancedPanel();
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
      advancedLogEl.textContent = data;
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
  const body = JSON.stringify({ message: prompt, history });
  const response = await fetch(PLAN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Planner unavailable (${response.status})`);
  }
  const payload = await response.json();
  return validateICS(payload);
}

async function confirmFlow(ics) {
  if (!ics.confirm) return true;
  const summary = ics.summary || "Please confirm to continue.";
  pushMessage("assistant", summary);
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
    const ics = await plannerRequest(text);
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
