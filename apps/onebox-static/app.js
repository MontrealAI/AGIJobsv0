import { PLAN_URL, EXEC_URL, IPFS_GATEWAY, AA_MODE } from "./config.js";
import { validateICS, pinJSON, pinFile } from "./lib.js";

const feed = document.getElementById("feed");
const advLog = document.getElementById("adv-log");
const promptForm = document.getElementById("prompt-form");
const promptInput = document.getElementById("prompt-input");
const promptSubmit = document.getElementById("prompt-submit");
const toggleAdvanced = document.getElementById("toggle-advanced");
const w3sForm = document.getElementById("w3s-form");
const w3sTokenInput = document.getElementById("w3s-token");
const w3sStatus = document.getElementById("w3s-status");
const attachButton = document.getElementById("attach-button");
const fileInput = document.getElementById("prompt-file");
const attachmentName = document.getElementById("attachment-name");

const history = [];
let pendingAttachment = null;

function deepClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function addMessage(role, text) {
  const node = document.createElement("div");
  node.className = `msg${role === "user" ? " me" : ""}`;
  node.textContent = text;
  node.setAttribute("data-role", role);
  feed.appendChild(node);
  feed.scrollTop = feed.scrollHeight;
}

function setAdvanced(text) {
  if (!text) {
    advLog.textContent = "";
    return;
  }
  advLog.textContent = advLog.textContent
    ? `${advLog.textContent}\n${text}`
    : text;
}

toggleAdvanced.addEventListener("click", (event) => {
  event.preventDefault();
  document.body.classList.toggle("adv-show");
});

async function callPlanner(message) {
  const response = await fetch(PLAN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (!response.ok) {
    throw new Error("Planner unavailable (try again in a few moments)");
  }

  const payload = await response.json();
  return validateICS(payload);
}

async function runExecution(ics, attachments) {
  const enriched = await maybePinPayload(ics, attachments);
  setAdvanced("");
  if (enriched.meta?.clientPinned) {
    const pinned = enriched.meta.clientPinned;
    const sizeKb = pinned.size ? `${Math.round(pinned.size / 1024)} KB` : "unknown size";
    setAdvanced(`📦 Pinned ${pinned.name ?? "attachment"} → ${pinned.cid} (${sizeKb})`);
  }

  const response = await fetch(EXEC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ics: enriched, aa: AA_MODE }),
  });

  if (!response.ok || !response.body) {
    throw new Error("Executor unavailable (no response body)");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const segments = buffer.split("\n\n");
    while (segments.length > 1) {
      const raw = segments.shift();
      if (!raw) continue;
      try {
        const evt = JSON.parse(raw);
        dispatchEvent(evt);
      } catch (err) {
        console.warn("Malformed execution event", err, raw);
      }
    }
    buffer = segments[0] ?? "";
  }
}

async function maybePinPayload(ics, attachments) {
  const copy = deepClone(ics);
  const intent = copy.intent;
  let pinnedFile;

  async function ensureFileCid() {
    if (!attachments?.length) return undefined;
    if (!pinnedFile) {
      const file = attachments[0];
      const { cid } = await pinFile(file);
      pinnedFile = {
        cid,
        uri: `ipfs://${cid}`,
        gateway: `${IPFS_GATEWAY}${cid}`,
        name: file.name,
        size: file.size,
      };
    }
    return pinnedFile;
  }

  if (intent === "create_job" && copy.params?.job) {
    const job = copy.params.job;
    if (!job.uri) {
      const payload = {
        title: job.title ?? "Untitled job",
        description: job.description ?? "",
        deadlineDays: job.deadlineDays ?? null,
        rewardAGIA: job.rewardAGIA ?? null,
        attachments: [],
      };

      const file = await ensureFileCid();
      if (file) {
        payload.attachments.push(file.uri);
      }

      const { cid } = await pinJSON(payload);
      job.uri = `ipfs://${cid}`;
      job.gatewayUri = `${IPFS_GATEWAY}${cid}`;
      if (file) {
        job.attachments = payload.attachments;
      }
    }
  }

  if (intent === "submit_work") {
    const file = await ensureFileCid();
    if (file) {
      if (!copy.params.uri && !copy.params.resultUri) {
        copy.params.uri = file.uri;
      }
      copy.params.gatewayUri = copy.params.gatewayUri ?? file.gateway;
      copy.params.attachments = copy.params.attachments ?? [file.uri];
    }
  }

  if (intent === "dispute") {
    const file = await ensureFileCid();
    if (file) {
      copy.params.evidenceUri = copy.params.evidenceUri ?? file.uri;
      copy.params.attachments = copy.params.attachments ?? [file.uri];
    }
  }

  if (pinnedFile) {
    copy.meta = {
      ...(copy.meta ?? {}),
      clientPinned: {
        cid: pinnedFile.cid,
        uri: pinnedFile.uri,
        gateway: pinnedFile.gateway,
        name: pinnedFile.name,
        size: pinnedFile.size,
      },
    };
  }

  return copy;
}

function dispatchEvent(evt) {
  if (!evt || typeof evt !== "object") return;

  switch (evt.type) {
    case "confirm":
      addMessage("assistant", evt.text);
      setAdvanced(evt.advanced ?? "");
      break;
    case "status":
      addMessage("assistant", evt.text);
      break;
    case "receipt":
      addMessage("assistant", evt.text);
      setAdvanced(evt.advanced ?? "");
      break;
    case "error":
      addMessage("assistant", `❌ ${evt.text}`);
      setAdvanced(evt.advanced ?? "");
      break;
    default:
      console.debug("Unknown event", evt);
  }
}

function waitForConfirmation() {
  return new Promise((resolve) => {
    addMessage("assistant", "Type YES to confirm or NO to cancel.");

    function handler(event) {
      event.preventDefault();
      const value = promptInput.value.trim();
      if (!value) return;

      addMessage("user", value);
      promptInput.value = "";
      promptForm.removeEventListener("submit", handler);
      resolve(value);
    }

    promptForm.addEventListener("submit", handler);
  });
}

promptForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = promptInput.value.trim();
  if (!value) return;

  promptInput.value = "";
  addMessage("user", value);
  promptSubmit.disabled = true;

  try {
    const ics = await callPlanner(value);

    if (ics.confirm) {
      addMessage("assistant", ics.summary || "Please confirm to continue.");
      const confirmation = await waitForConfirmation();
      if (!/^y(?:es)?$/i.test(confirmation)) {
        addMessage("assistant", "Cancelled.");
        return;
      }
    }

    const attachments = pendingAttachment ? [pendingAttachment] : [];
    await runExecution(ics, attachments);
    history.push({ role: "user", content: value });
    history.push({ role: "assistant", content: JSON.stringify(ics) });
  } catch (err) {
    console.error(err);
    addMessage("assistant", `❌ ${err.message ?? "Unexpected error"}`);
  } finally {
    promptSubmit.disabled = false;
    promptInput.focus();
    if (pendingAttachment) {
      attachmentName.textContent = "";
      pendingAttachment = null;
      fileInput.value = "";
    }
  }
});

addMessage(
  "assistant",
  "Welcome to AGI Jobs One-Box. Describe what you want to do and I will handle the chain-side steps for you."
);

// Advanced token persistence
const storedToken = localStorage.getItem("W3S_TOKEN");
if (storedToken) {
  w3sTokenInput.value = storedToken;
  w3sStatus.textContent = "Token loaded from previous session.";
}

w3sForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const token = w3sTokenInput.value.trim();
  if (!token) {
    localStorage.removeItem("W3S_TOKEN");
    w3sStatus.textContent = "Token cleared.";
    return;
  }
  localStorage.setItem("W3S_TOKEN", token);
  w3sStatus.textContent = "Token saved in this browser.";
});

attachButton.addEventListener("click", (event) => {
  event.preventDefault();
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) {
    pendingAttachment = file;
    attachmentName.textContent = `Attached: ${file.name} (${Math.round(file.size / 1024)} KB)`;
  } else {
    attachmentName.textContent = "";
    pendingAttachment = null;
  }
});
