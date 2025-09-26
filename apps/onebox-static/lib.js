import { WEB3_STORAGE_API } from "./config.js";

const ALLOWED_INTENTS = [
  "create_job",
  "apply_job",
  "submit_work",
  "validate",
  "finalize",
  "dispute",
  "stake",
  "withdraw",
  "admin_set"
];

const BIG_TEN = 10n;
const DECIMALS = 18n;
const HISTORY_FORMAT_VERSION = 1;

export function buildHistoryEnvelope(history) {
  return history.map((entry) => ({
    role: entry.role,
    content: entry.content,
    version: HISTORY_FORMAT_VERSION
  }));
}

export function validateICS(json) {
  if (!json || typeof json !== "object") {
    throw new Error("Planner returned malformed ICS");
  }
  if (!ALLOWED_INTENTS.includes(json.intent)) {
    throw new Error(`Unsupported intent: ${json.intent}`);
  }
  if (json.confirm && json.summary && json.summary.length > 140) {
    console.warn("Summary exceeds 140 chars; truncating");
    json.summary = `${json.summary.slice(0, 137)}...`;
  }
  json.params = json.params ?? {};
  json.meta = json.meta ?? {};
  return json;
}

export function confirmSummary(ics) {
  if (!ics.confirm) return null;
  return ics.summary || "Please confirm before continuing.";
}

export async function ensureAttachmentCIDs(ics) {
  if (!ics?.meta?.attachments?.length) {
    if (ics.intent === "create_job" && ics.params?.job && !ics.params.job.uri && ics.params.job.description) {
      const jobPayload = {
        title: ics.params.job.title,
        description: ics.params.job.description,
        deadlineDays: ics.params.job.deadlineDays,
        rewardAGIA: ics.params.job.rewardAGIA,
        attachments: ics.params.job.attachments ?? []
      };
      const { cid } = await pinJSON(jobPayload);
      ics.params.job.uri = `ipfs://${cid}`;
    }
    return ics;
  }

  const uploads = Array.isArray(ics.meta.attachments) ? ics.meta.attachments : [];
  for (const request of uploads) {
    const file = await pickFile(request.prompt || "Select a file to upload");
    const { cid } = await pinFile(file);
    if (request.fieldPath) {
      applyFieldPath(ics, request.fieldPath, `ipfs://${cid}`);
    }
  }
  return ics;
}

function applyFieldPath(obj, path, value) {
  const segments = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cursor = obj;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    if (!(key in cursor)) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[segments[segments.length - 1]] = value;
}

async function pickFile(promptLabel) {
  if (promptLabel) {
    window.alert(promptLabel);
  }
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      excludeAcceptAllOption: false
    });
    return handle.getFile();
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "*";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const [file] = input.files || [];
      document.body.removeChild(input);
      if (!file) {
        reject(new Error("No file selected"));
        return;
      }
      resolve(file);
    });
    input.click();
  });
}

export function formatError(error) {
  if (!error) return "❌ Unknown error";
  if (typeof error === "string") return `❌ ${error}`;
  const message = error.message || error.toString();
  return message.startsWith("❌") ? message : `❌ ${message}`;
}

export function toWei(amount) {
  const [whole, fractional = ""] = String(amount).split(".");
  const safeFraction = fractional.padEnd(Number(DECIMALS), "0");
  const trimmedFraction = safeFraction.slice(0, Number(DECIMALS));
  return BigInt(whole || "0") * BIG_TEN ** DECIMALS + BigInt(trimmedFraction || "0");
}

export function formatAGIA(wei) {
  const value = BigInt(wei);
  const head = value / (BIG_TEN ** DECIMALS);
  const tail = value % (BIG_TEN ** DECIMALS);
  const decimals = tail.toString().padStart(Number(DECIMALS), "0").replace(/0+$/, "");
  return decimals ? `${head}.${decimals}` : head.toString();
}

export async function pinJSON(obj) {
  const token = await ensureWeb3StorageToken();
  const response = await fetch(WEB3_STORAGE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(obj)
  });
  if (!response.ok) {
    throw new Error("Failed to pin JSON to IPFS");
  }
  const data = await response.json();
  return { cid: data.cid };
}

export async function pinFile(file) {
  const token = await ensureWeb3StorageToken();
  const response = await fetch(WEB3_STORAGE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-NAME": encodeURIComponent(file.name)
    },
    body: file
  });
  if (!response.ok) {
    throw new Error("Failed to pin file to IPFS");
  }
  const data = await response.json();
  return { cid: data.cid };
}

async function ensureWeb3StorageToken() {
  let token = localStorage.getItem("W3S_TOKEN");
  if (token) return token;
  token = window.prompt("Enter your web3.storage API token (stored locally)");
  if (!token) throw new Error("web3.storage token required for uploads");
  localStorage.setItem("W3S_TOKEN", token.trim());
  return token.trim();
}
