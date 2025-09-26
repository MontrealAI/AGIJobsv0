const SUPPORTED_INTENTS = [
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

export function validateICS(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Planner returned an invalid response");
  }
  const { intent, params = {}, confirm = false, summary } = payload;
  if (!SUPPORTED_INTENTS.includes(intent)) {
    throw new Error(`Unsupported intent: ${intent}`);
  }
  if (confirm && summary && summary.length > 140) {
    console.warn("Summary exceeds 140 chars", summary);
  }
  return { ...payload, intent, params, confirm };
}

export function needsAttachmentPin(ics) {
  if (ics.intent === "create_job") {
    const uri = ics?.params?.job?.uri;
    return !uri;
  }
  if (ics.intent === "submit_work") {
    return !ics?.params?.resultUri;
  }
  return false;
}

export function prepareJobPayload(ics, attachmentCid) {
  const { intent, params = {} } = ics;
  const payload = { attachments: [] };
  if (intent === "create_job") {
    const job = params.job || {};
    const existingAttachments = Array.isArray(job.attachments)
      ? job.attachments.filter(Boolean)
      : [];
    payload.attachments.push(...existingAttachments);
    if (attachmentCid) {
      payload.attachments.push(`ipfs://${attachmentCid}`);
    }
    payload.title = job.title || "";
    payload.description = job.description || "";
    payload.deadlineDays = job.deadlineDays ?? null;
    payload.rewardAGIA = job.rewardAGIA ?? job.reward ?? null;
    return {
      payload,
      assign(cid) {
        if (!ics.params.job) ics.params.job = {};
        ics.params.job.uri = `ipfs://${cid}`;
      },
    };
  }
  if (intent === "submit_work") {
    if (!ics.params) ics.params = {};
    payload.note = "AGI Jobs work submission";
    const existing = Array.isArray(params?.attachments)
      ? params.attachments.filter(Boolean)
      : [];
    payload.attachments.push(...existing);
    if (attachmentCid) {
      payload.attachments.push(`ipfs://${attachmentCid}`);
    }
    return {
      payload,
      assign(cid) {
        ics.params.resultUri = `ipfs://${cid}`;
      },
    };
  }
  return {
    payload,
    assign() {},
  };
}

export function formatEvent(event) {
  if (!event || typeof event !== "object") {
    return { text: "(malformed event)", advanced: "" };
  }
  const { type = "status", text = "", advanced = "" } = event;
  if (type === "error") {
    return { text: `❌ ${text || "Unknown error"}`, advanced };
  }
  if (type === "receipt") {
    return { text: `✅ ${text}`, advanced };
  }
  return { text: text || "…", advanced };
}

export async function pinBlob(endpoint, token, file) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`IPFS upload failed (${response.status})`);
  }
  const body = await response.json();
  if (!body.cid) {
    throw new Error("IPFS response missing CID");
  }
  return { cid: body.cid };
}

export async function pinJSON(endpoint, token, json) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(json),
  });
  if (!response.ok) {
    throw new Error(`IPFS upload failed (${response.status})`);
  }
  const body = await response.json();
  if (!body.cid) {
    throw new Error("IPFS response missing CID");
  }
  return { cid: body.cid };
}

export function formatError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch (e) {
    return "Unexpected error";
  }
}
