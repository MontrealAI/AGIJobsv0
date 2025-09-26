function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAttachments(existing, uri) {
  const base = Array.isArray(existing)
    ? [...existing]
    : existing
        ? [existing]
        : [];
  if (!base.includes(uri)) {
    base.push(uri);
  }
  return base;
}

export function createMaybePinPayload({ deepClone, IPFS_GATEWAY, pinJSON, pinFile }) {
  return async function maybePinPayload(ics, attachments) {
    const copy = deepClone(ics);
    const intent = copy.intent;
    const params = (copy.params = copy.params ?? {});
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

    if (intent === "create_job" && isPlainObject(params.job)) {
      const job = params.job;
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
        const existingResult = isPlainObject(params.result) ? params.result : {};
        params.result = { ...existingResult, uri: file.uri };
        if ("resultUri" in params) delete params.resultUri;
        if ("uri" in params) delete params.uri;
        params.gatewayUri = params.gatewayUri ?? file.gateway;
        params.attachments = normalizeAttachments(params.attachments, file.uri);
      }
    }

    if (intent === "dispute") {
      const file = await ensureFileCid();
      if (file) {
        params.evidenceUri = params.evidenceUri ?? file.uri;
        params.attachments = normalizeAttachments(params.attachments, file.uri);
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
  };
}
