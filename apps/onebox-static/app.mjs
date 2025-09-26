import {
  PLAN_URL,
  EXEC_URL,
  IPFS_ENDPOINT,
  IPFS_TOKEN_STORAGE_KEY,
  AA_MODE,
} from "./config.mjs";
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

const MAX_HISTORY = 10;

const hasDocument = typeof document !== "undefined";
const feed = hasDocument ? document.getElementById("feed") : null;
const composer = hasDocument ? document.getElementById("composer") : null;
const questionInput = hasDocument ? document.getElementById("question") : null;
const attachmentInput = hasDocument ? document.getElementById("attachment") : null;
const sendButton = hasDocument ? document.getElementById("send") : null;
const advancedToggle = hasDocument ? document.getElementById("advanced-toggle") : null;
const advancedPanel = hasDocument ? document.getElementById("advanced-panel") : null;

let busy = false;
let history = [];
let confirmCallback = null;
let advancedLogEl = null;

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
        <li>Value-moving intents require human confirmation (≤160 chars summary).</li>
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

function setAdvancedLog(text) {
  if (!advancedPanel) return;
  if (!advancedLogEl) {
    renderAdvancedPanel();
  }
  if (advancedLogEl) {
    advancedLogEl.textContent = text || "—";
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

async function maybePinAttachments(ics, file) {
  if (!needsAttachmentPin(ics)) return ics;
  const token = localStorage.getItem(IPFS_TOKEN_STORAGE_KEY);
  if (!token) {
    throw new Error("IPFS token missing. Provide a web3.storage token from the Advanced panel.");
  }

  let attachmentCid = null;
  if (file) {
    const result = await pinBlob(IPFS_ENDPOINT, token, file);
    attachmentCid = result.cid;
  }

  const prepared = prepareJobPayload(ics, attachmentCid);
  if (!prepared || !prepared.payload) {
    return ics;
  }
  const { cid } = await pinJSON(IPFS_ENDPOINT, token, prepared.payload);
  prepared.assign(cid);
  return ics;
}

export function drainSSEBuffer(buffer, onChunk) {
  let boundary = buffer.indexOf("\n\n");
  while (boundary !== -1) {
    const chunk = buffer.slice(0, boundary).trim();
    if (chunk) {
      onChunk(chunk);
    }
    buffer = buffer.slice(boundary + 2);
    boundary = buffer.indexOf("\n\n");
  }
  return buffer;
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
      const normalized = chunk.startsWith("data:") ? chunk.slice(5).trim() : chunk;
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
      buffer = buffer.replace(/\r\n/g, "\n");
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
  const file = attachmentInput.files?.[0] || null;
  if (!text) return;

  pushMessage("user", text);
  questionInput.value = "";
  attachmentInput.value = "";

  setBusy(true);

  try {
    const ics = await plannerRequest(text);
    const confirmed = await confirmFlow(ics);
    if (!confirmed) {
      setBusy(false);
      return;
    }

    await maybePinAttachments(ics, file);
    history = history
      .concat({ role: "user", text }, { role: "assistant", text: JSON.stringify(ics) })
      .slice(-MAX_HISTORY);

    await executeICS(ics);
  } catch (err) {
    const friendly = formatError(err);
    pushMessage("assistant", `❌ ${friendly}`);
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
