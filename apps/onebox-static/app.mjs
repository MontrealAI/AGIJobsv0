import { PLAN_URL, EXEC_URL, IPFS_ENDPOINT, IPFS_TOKEN_STORAGE_KEY, AA_MODE } from "./config.mjs";
import { validateICS, needsAttachmentPin, prepareJobPayload, formatEvent, pinBlob, pinJSON, formatError } from "./lib.mjs";

const feed = document.getElementById("feed");
const composer = document.getElementById("composer");
const questionInput = document.getElementById("question");
const attachmentInput = document.getElementById("attachment");
const sendButton = document.getElementById("send");
const advancedToggle = document.getElementById("advanced-toggle");
const advancedPanel = document.getElementById("advanced-panel");

let busy = false;
let history = [];
let confirmCallback = null;

function toggleAdvanced(e) {
  e?.preventDefault();
  document.body.classList.toggle("advanced");
}
advancedToggle.addEventListener("click", toggleAdvanced);

function scrollFeed() {
  feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
}

function pushMessage(role, text) {
  if (!text) return;
  const bubble = document.createElement("div");
  bubble.className = role === "user" ? "msg me" : "msg";
  bubble.textContent = text;
  feed.appendChild(bubble);
  scrollFeed();
}

function setBusy(state) {
  busy = state;
  sendButton.disabled = state;
  questionInput.disabled = state;
  attachmentInput.disabled = state;
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
  if (!file) return ics;
  if (!needsAttachmentPin(ics)) return ics;
  const token = localStorage.getItem(IPFS_TOKEN_STORAGE_KEY);
  if (!token) {
    throw new Error("IPFS token missing. Provide a web3.storage token via Advanced panel.");
  }
  const { cid } = await pinBlob(IPFS_ENDPOINT, token, file);
  const prepared = prepareJobPayload(ics, cid);
  const { cid: metaCid } = await pinJSON(IPFS_ENDPOINT, token, prepared.payload);
  prepared.assign(metaCid);
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
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      if (chunk) {
        try {
          const normalized = chunk.startsWith("data:") ? chunk.slice(5).trim() : chunk;
          if (!normalized) {
            continue;
          }
          const event = JSON.parse(normalized);
          const { text, advanced } = formatEvent(event);
          pushMessage("assistant", text);
          if (advanced) {
            advancedPanel.textContent = advanced;
          }
        } catch (err) {
          console.error("Bad event", err, chunk);
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

async function handleSubmit(event) {
  event.preventDefault();

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
  const file = attachmentInput.files?.[0];
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
    history = history.concat(
      { role: "user", text },
      { role: "assistant", text: JSON.stringify(ics) }
    ).slice(-10);

    await executeICS(ics);
  } catch (err) {
    const friendly = formatError(err);
    pushMessage("assistant", `❌ ${friendly}`);
  } finally {
    setBusy(false);
  }
}

composer.addEventListener("submit", handleSubmit);

// Surface helpers for Advanced panel token setup
advancedPanel.textContent = "Set your web3.storage token via localStorage: localStorage.setItem('AGIJOBS_W3S_TOKEN', '<token>')";
