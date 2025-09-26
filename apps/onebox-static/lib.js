const INTENTS = [
  "create_job",
  "apply_job",
  "submit_work",
  "validate",
  "finalize",
  "dispute",
  "stake",
  "withdraw",
  "admin_set",
];

export function validateICS(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Planner returned invalid payload");
  }

  if (!INTENTS.includes(value.intent)) {
    throw new Error(`Unsupported intent: ${String(value.intent)}`);
  }

  if (value.confirm && value.summary && value.summary.length > 140) {
    throw new Error("Confirmation summary is too long");
  }

  value.params = value.params ?? {};
  return value;
}

const DECIMALS = 18n;
const TEN = 10n;

export function toWei(amount) {
  const [wholeRaw, fracRaw = ""] = String(amount).split(".");
  const whole = BigInt(wholeRaw || "0");
  const frac = fracRaw.padEnd(18, "0").slice(0, 18);
  return whole * TEN ** DECIMALS + BigInt(frac || "0");
}

export function fmtAGIA(wei) {
  const asString = BigInt(wei).toString().padStart(19, "0");
  const head = asString.slice(0, -18) || "0";
  const tail = asString.slice(-18).replace(/0+$/, "");
  return tail ? `${head}.${tail}` : head;
}

async function postToW3S(body, contentType) {
  const token = localStorage.getItem("W3S_TOKEN");
  if (!token) {
    throw new Error("Missing web3.storage token. Add it in Advanced settings.");
  }

  const response = await fetch("https://api.web3.storage/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IPFS pin failed: ${text}`);
  }

  const { cid } = await response.json();
  return { cid };
}

export async function pinJSON(data) {
  return postToW3S(JSON.stringify(data), "application/json");
}

export async function pinFile(file) {
  const bytes = await file.arrayBuffer();
  return postToW3S(new Blob([bytes]));
}
