import { PLAN_URL, EXEC_URL, IPFS_API_URL, IPFS_GATEWAY, AA_MODE } from "./config.js";
import { validateICS, ensureSummary, pinJSON, pinFile } from "./lib.js";

const feed = document.getElementById("feed");
const adv = document.getElementById("adv");
const form = document.getElementById("composer");
const input = document.getElementById("prompt");
const send = document.getElementById("send");
const toggleAdvanced = document.getElementById("toggle-advanced");

const history = [];
let pendingConfirmation = null;
const queuedAttachments = [];

function push(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `msg${role === "user" ? " me" : ""}`;
  bubble.textContent = text;
  feed.appendChild(bubble);
  feed.scrollTop = feed.scrollHeight;
}

function setAdvanced(text) {
  adv.textContent = text || "";
}

toggleAdvanced.addEventListener("click", (event) => {
  event.preventDefault();
  document.body.classList.toggle("adv-show");
});

async function callPlanner(message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(PLAN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Planner error (${response.status})`);
    }
    const plan = await response.json();
    return validateICS(plan);
  } finally {
    clearTimeout(timeout);
  }
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
  } else if (pinnedAttachments.length) {
    ics.params = ics.params ?? {};
    ics.params.attachments = [...new Set([...(ics.params.attachments ?? []), ...pinnedAttachments])];
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
      try {
        const dataLines = [];
        for (const line of segment.split("\n")) {
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        const payload = dataLines.length ? dataLines.join("\n") : segment;
        if (!payload) continue;
        const event = JSON.parse(payload);
        handleExecutorEvent(event);
      } catch (err) {
        console.warn("Bad executor segment", segment, err);
      }
    }
    buffer = segments[0] ?? "";
  }

  if (buffer.trim()) {
    try {
      const dataLines = [];
      for (const line of buffer.split("\n")) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      const payload = dataLines.length ? dataLines.join("\n") : buffer;
      if (payload) {
        handleExecutorEvent(JSON.parse(payload));
      }
    } catch (err) {
      console.warn("Trailing executor payload", buffer, err);
    }
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
    const confirmed = /^y(es)?$/i.test(text);
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

    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: JSON.stringify(ics) });

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

form.addEventListener("submit", handleSubmit);

// Warm welcome
push("bot", "Hi! I'm the AGI Jobs one-box. Describe what you need (e.g., \"Post a job for 500 images\").");
setAdvanced(`Planner: ${PLAN_URL}\nExecutor: ${EXEC_URL}\nIPFS Gateway: ${IPFS_GATEWAY}`);

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

async function ensureStorageToken() {
  let token = localStorage.getItem("W3S_TOKEN");
  if (token && token.trim()) {
    return token.trim();
  }
  const supplied = window.prompt(
    "Enter your web3.storage API token to enable IPFS uploads (stored locally)."
  );
  if (!supplied) {
    throw new Error("IPFS upload cancelled. Set a web3.storage token to continue.");
  }
  token = supplied.trim();
  localStorage.setItem("W3S_TOKEN", token);
  return token;
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

function queueAttachments(files) {
  const limited = files.slice(0, 3);
  queuedAttachments.splice(0, queuedAttachments.length, ...limited);
  const summary = limited
    .map((file) => `${file.name} (${formatBytes(file.size)})`)
    .join(", ");
  push("bot", `Attached for next request: ${summary}`);
}

