import { PLAN_URL, EXEC_URL, AA_MODE, HISTORY_LENGTH } from "./config.js";
import { buildHistoryEnvelope, confirmSummary, ensureAttachmentCIDs, formatError, validateICS } from "./lib.js";

const feed = document.getElementById("feed");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const adv = document.getElementById("adv");
const toggleAdvanced = document.getElementById("toggle-advanced");

const history = [];
let awaitingFollowUp = null;

function push(role, text) {
  const node = document.createElement("article");
  node.className = `msg${role === "user" ? " me" : ""}`;
  node.textContent = text;
  feed.appendChild(node);
  feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
}

function setBusy(busy) {
  sendBtn.disabled = busy;
  input.disabled = busy;
  if (busy) {
    sendBtn.dataset.prev = sendBtn.textContent;
    sendBtn.textContent = "…";
  } else {
    sendBtn.textContent = sendBtn.dataset.prev || "Send";
  }
}

toggleAdvanced.addEventListener("click", (event) => {
  event.preventDefault();
  document.body.classList.toggle("adv-show");
});

async function requestPlan(message) {
  const envelope = buildHistoryEnvelope(history.slice(-HISTORY_LENGTH));
  const response = await fetch(PLAN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history: envelope })
  });
  if (!response.ok) {
    throw new Error(`Planner unavailable (${response.status})`);
  }
  const json = await response.json();
  return validateICS(json);
}

async function requestExecute(ics) {
  const response = await fetch(EXEC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ics, aa: AA_MODE })
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
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      try {
        onEvent(JSON.parse(chunk));
      } catch (error) {
        console.error("Bad event", error, chunk);
      }
    }
  }
  if (buffer.trim()) {
    try { onEvent(JSON.parse(buffer)); } catch (error) { console.error("Bad tail", error, buffer); }
  }
}

function onEvent(evt) {
  if (evt.advanced) {
    adv.textContent = evt.advanced;
  }
  switch (evt.type) {
    case "status":
    case "info":
      push("bot", evt.text);
      break;
    case "confirm":
      awaitingFollowUp = evt.followUp || null;
      push("bot", evt.text);
      break;
    case "receipt":
      push("bot", evt.text);
      break;
    case "error":
      push("bot", `❌ ${evt.text}`);
      break;
    default:
      console.warn("Unknown event", evt);
  }
}

async function handleSubmission(message) {
  setBusy(true);
  push("user", message);
  try {
    const ics = await requestPlan(message);
    if (ics.followUp) {
      push("bot", ics.followUp);
      history.push({ role: "user", content: message }, { role: "assistant", content: ics.followUp });
      return;
    }
    const enriched = await ensureAttachmentCIDs(ics);
    const summary = confirmSummary(enriched);
    if (summary) {
      setBusy(false);
      const accepted = await promptConfirmation(summary);
      if (!accepted) {
        push("bot", "Cancelled.");
        return;
      }
      setBusy(true);
    }
    await requestExecute(enriched);
    history.push({ role: "user", content: message }, { role: "assistant", content: JSON.stringify(enriched) });
  } catch (error) {
    push("bot", formatError(error));
  } finally {
    setBusy(false);
  }
}

function promptConfirmation(summary) {
  return new Promise((resolve) => {
    awaitingFollowUp = { summary, resolve };
    push("bot", summary);
    push("bot", "Type YES to confirm or NO to cancel.");
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  if (awaitingFollowUp?.resolve) {
    push("user", text);
    const accepted = /^y(es)?$/i.test(text);
    awaitingFollowUp.resolve(accepted);
    awaitingFollowUp = null;
    if (!accepted) {
      push("bot", "Cancelled.");
    }
    return;
  }

  await handleSubmission(text);
});

window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  push("bot", formatError(event.reason));
});

push("bot", "👋 Welcome to AGI Jobs v0. Describe what you need in plain language.");
