import { PLAN_URL, EXEC_URL, IPFS_API_URL, IPFS_GATEWAY, AA_MODE } from "./config.js";
import { validateICS, ensureSummary, pinJSON, pinFile } from "./lib.js";

const feed = document.getElementById("feed");
const advancedPanel = document.getElementById("advanced-panel");
const form = document.getElementById("composer");
const input = document.getElementById("question");
const send = document.getElementById("send");
const toggleAdvanced = document.getElementById("advanced-toggle");
const attachmentInput = document.getElementById("attachment");

const history = [];
let pendingConfirmation = null;
const queuedAttachments = [];

const advancedState = {
  latest: "",
};

function maskToken(token) {
  if (!token) return "Not set";
  if (token.length <= 6) return "••••";
  return `••••${token.slice(-4)}`;
}

function aaSummary() {
  if (!AA_MODE || !AA_MODE.enabled) {
    return "Account Abstraction disabled.";
  }
  const { bundler = "custom", chainId = "unknown" } = AA_MODE;
  return `Account Abstraction enabled (bundler: ${bundler}, chainId: ${chainId}).`;
}

function renderAdvancedPanel() {
  if (!advancedPanel) return;
  const token = (localStorage.getItem("W3S_TOKEN") || "").trim();
  const masked = maskToken(token);
  const latest = advancedState.latest || "No advanced details yet.";
  const aaDetail = JSON.stringify(AA_MODE, null, 2);
  advancedPanel.innerHTML = `
    <div class="card">
      <h2>Meta-agent endpoints</h2>
      <p class="status">Planner: ${PLAN_URL}</p>
      <p class="status">Executor: ${EXEC_URL}</p>
      <p class="status">IPFS Gateway: ${IPFS_GATEWAY}</p>
    </div>
    <div class="card">
      <h2>Execution mode</h2>
      <p>${aaSummary()}</p>
      <pre class="status">${aaDetail}</pre>
    </div>
    <div class="card">
      <h2>web3.storage token</h2>
      <p>Token is stored locally in this browser and used only for client-side pinning.</p>
      <p class="status">${masked}</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button type="button" class="inline" data-action="set-token">Set token</button>
        ${token ? '<button type="button" class="inline" data-action="clear-token">Clear token</button>' : ""}
      </div>
    </div>
    <div class="card">
      <h2>Latest advanced details</h2>
      <p class="status">${latest}</p>
    </div>
  `;
}

function setAdvanced(text) {
  advancedState.latest = text || "";
  renderAdvancedPanel();
}

function push(role, text) {
  if (!text) return;
  const bubble = document.createElement("div");
  bubble.className = role === "user" ? "msg me" : "msg";
  bubble.textContent = text;
  feed.appendChild(bubble);
  feed.scrollTop = feed.scrollHeight;
}

function trimHistory() {
  if (history.length > 10) {
    history.splice(0, history.length - 10);
  }
}

function recordHistory(entry) {
  history.push(entry);
  trimHistory();
}

function plannerBody(message) {
  return JSON.stringify({ message, history });
}

async function callPlanner(message) {
  const response = await fetch(PLAN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: plannerBody(message),
  });
  if (!response.ok) {
    throw new Error(`Planner error (${response.status})`);
  }
  const plan = await response.json();
  return validateICS(plan);
}

async function ensureStorageToken() {
  let token = (localStorage.getItem("W3S_TOKEN") || "").trim();
  if (token) {
    renderAdvancedPanel();
    return token;
  }
  const supplied = window.prompt(
    "Enter your web3.storage API token to enable IPFS uploads (stored locally)."
  );
  if (!supplied) {
    throw new Error("IPFS upload cancelled. Set a web3.storage token to continue.");
  }
  token = supplied.trim();
  localStorage.setItem("W3S_TOKEN", token);
  renderAdvancedPanel();
  push("bot", "Stored web3.storage token.");
  return token;
}

async function callExecutor(ics, attachments) {
  const needsIpfs =
    (ics.intent === "create_job" && ics.params?.job && !ics.params.job.uri) ||
    Boolean(attachments?.length);
  if (needsIpfs) {
    await ensureStorageToken();
  }

  const pinnedAttachments = [];
  if (attachments?.length) {
    for (const file of attachments) {
      const { cid } = await pinFile(file, IPFS_API_URL);
      pinnedAttachments.push(`ipfs://${cid}`);
    }
    push("bot", `📎 Pinned attachments: ${pinnedAttachments.join(", ")}`);
  }

  if (ics.intent === "create_job" && ics.params?.job && !ics.params.job.uri) {
    const payload = { ...ics.params.job };
    if (pinnedAttachments.length) {
      payload.attachments = [...new Set([...(payload.attachments ?? []), ...pinnedAttachments])];
    }
    const { cid } = await pinJSON(payload, IPFS_API_URL);
    ics.params.job.uri = `ipfs://${cid}`;
    if (pinnedAttachments.length && !ics.params.job.attachments) {
      ics.params.job.attachments = payload.attachments;
    }
    setAdvanced(JSON.stringify({ jobUri: ics.params.job.uri, attachments: payload.attachments ?? [] }, null, 2));
  } else if (pinnedAttachments.length) {
    ics.params = ics.params ?? {};
    ics.params.attachments = [...new Set([...(ics.params.attachments ?? []), ...pinnedAttachments])];
    setAdvanced(JSON.stringify({ attachments: ics.params.attachments }, null, 2));
  }

  const response = await fetch(EXEC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ics, aa: AA_MODE }),
  });

  if (!response.ok || !response.body) {
    throw new Error("Executor unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const segments = buffer.split("\n\n");
    while (segments.length > 1) {
      const segment = segments.shift();
      if (!segment) continue;
      processExecutorSegment(segment);
    }
    buffer = segments[0] ?? "";
  }

  if (buffer.trim()) {
    processExecutorSegment(buffer);
  }
}

function processExecutorSegment(segment) {
  try {
    const dataLines = [];
    for (const line of segment.split("\n")) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    const payload = dataLines.length ? dataLines.join("\n") : segment;
    if (!payload) return;
    const event = JSON.parse(payload);
    handleExecutorEvent(event);
  } catch (err) {
    console.warn("Bad executor segment", segment, err);
  }
}

function handleExecutorEvent(evt) {
  switch (evt.type) {
    case "confirm":
      {
        const previous = pendingConfirmation;
        pendingConfirmation = {
          ics: evt.ics ?? previous?.ics ?? null,
          attachments: evt.attachments ?? previous?.attachments ?? null,
        };
      }
      push("bot", evt.text ?? "Confirm action?");
      setAdvanced(evt.advanced ?? "");
      break;
    case "status":
      push("bot", evt.text);
      break;
    case "receipt":
      push("bot", evt.text);
      setAdvanced(evt.advanced ?? "");
      break;
    case "error":
      push("bot", `❌ ${evt.text ?? "Unknown executor error"}`);
      break;
    default:
      console.warn("Unhandled executor event", evt);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  push("user", text);

  if (pendingConfirmation) {
    const confirmed = /^(y|yes)$/i.test(text);
    if (!confirmed) {
      push("bot", "Cancelled.");
      if (pendingConfirmation.attachments?.length) {
        queuedAttachments.unshift(...pendingConfirmation.attachments);
        queuedAttachments.splice(3);
      }
      pendingConfirmation = null;
      return;
    }
    const { ics, attachments } = pendingConfirmation;
    send.disabled = true;
    pendingConfirmation = null;
    if (!ics) {
      push("bot", "No actionable request to execute.");
      send.disabled = false;
      return;
    }
    push("bot", "Confirmed. Executing...");
    try {
      await callExecutor(ics, attachments);
    } catch (err) {
      push("bot", `❌ ${err.message}`);
      if (attachments?.length) {
        queuedAttachments.unshift(...attachments);
        queuedAttachments.splice(3);
      }
    } finally {
      send.disabled = false;
    }
    return;
  }

  send.disabled = true;
  const attachments = queuedAttachments.splice(0, queuedAttachments.length);
  try {
    const ics = await callPlanner(text);
    ensureSummary(ics);

    recordHistory({ role: "user", content: text });
    recordHistory({ role: "assistant", content: JSON.stringify(ics) });

    if (ics.confirm) {
      pendingConfirmation = { ics, attachments };
      push("bot", ics.summary);
      push("bot", "Type YES to confirm or NO to cancel.");
      return;
    }

    await callExecutor(ics, attachments);
  } catch (err) {
    push("bot", `❌ ${err.message}`);
    if (attachments.length) {
      queuedAttachments.unshift(...attachments);
      queuedAttachments.splice(3);
    }
  } finally {
    send.disabled = false;
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

function queueAttachments(files) {
  const limited = files.slice(0, 3);
  queuedAttachments.splice(0, queuedAttachments.length, ...limited);
  if (!limited.length) return;
  const summary = limited.map((file) => `${file.name} (${formatBytes(file.size)})`).join(", ");
  push("bot", `Attached for next request: ${summary}`);
}

if (attachmentInput) {
  attachmentInput.addEventListener("change", () => {
    const files = Array.from(attachmentInput.files ?? []);
    queueAttachments(files);
    attachmentInput.value = "";
  });
}

document.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types?.includes("Files")) {
    event.preventDefault();
  }
});

document.addEventListener("drop", (event) => {
  if (!event.dataTransfer?.files?.length) return;
  event.preventDefault();
  queueAttachments(Array.from(event.dataTransfer.files));
});

document.addEventListener("paste", (event) => {
  const files = Array.from(event.clipboardData?.files ?? []);
  if (!files.length) return;
  queueAttachments(files);
});

if (advancedPanel) {
  advancedPanel.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "set-token") {
      ensureStorageToken().catch((err) => {
        push("bot", `❌ ${err.message}`);
      });
    } else if (action === "clear-token") {
      localStorage.removeItem("W3S_TOKEN");
      renderAdvancedPanel();
      push("bot", "Cleared stored web3.storage token.");
    }
  });
}

if (toggleAdvanced) {
  toggleAdvanced.addEventListener("click", (event) => {
    event.preventDefault();
    renderAdvancedPanel();
    document.body.classList.toggle("advanced");
  });
}

if (form) {
  form.addEventListener("submit", handleSubmit);
}

push("bot", "Hi! I'm the AGI Jobs one-box. Describe what you need (e.g., \"Post a job for 500 images\").");
setAdvanced(`Planner: ${PLAN_URL}\nExecutor: ${EXEC_URL}\nIPFS Gateway: ${IPFS_GATEWAY}`);
renderAdvancedPanel();
