import { CID } from "multiformats/cid";
import { sha256, sha512 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

const DEFAULT_FORM_FIELD = "file";
const DEFAULT_FILENAME = "payload";
const DEFAULT_SELF_HOSTED_PATH = "api/v0/add";
const MAX_BODY_PREVIEW = 2048;

class UploadError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "UploadError";
    this.cause = options.cause;
    this.provider = options.provider;
    this.status = options.status;
    this.transient = options.transient ?? false;
  }
}

const shaMap = new Map([
  [sha256.code, sha256],
  [sha512.code, sha512],
]);

const textEncoder = new TextEncoder();

function toUint8Array(payload) {
  if (payload instanceof Uint8Array) {
    return payload;
  }
  if (typeof payload === "string") {
    return textEncoder.encode(payload);
  }
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  if (payload && typeof payload === "object") {
    return textEncoder.encode(JSON.stringify(payload));
  }
  throw new TypeError("Unsupported payload type for IPFS upload");
}

function resolveContentType(payload, explicit) {
  if (explicit) return explicit;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      return "application/json";
    }
    return "text/plain";
  }
  if (payload && typeof payload === "object" && !(payload instanceof Uint8Array)) {
    return "application/json";
  }
  return "application/octet-stream";
}

function ensureFetch(fetchImpl) {
  if (typeof fetchImpl === "function") {
    return fetchImpl;
  }
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error("fetch is not available. Provide a custom implementation.");
}

function joinUrl(base, path) {
  if (!base) return path;
  const trimmed = base.replace(/\/+$/, "");
  if (!path) return trimmed;
  const suffix = path.replace(/^\/+/, "");
  return `${trimmed}/${suffix}`;
}

async function computeDigest(multihashCode, bytes) {
  const hasher = shaMap.get(multihashCode);
  if (!hasher) {
    throw new Error(`Unsupported multihash code: ${multihashCode}`);
  }
  const digest = await hasher.digest(bytes);
  return digest.digest;
}

async function verifyCidMatchesBytes(cid, bytes) {
  const parsed = CID.parse(cid);
  const digest = await computeDigest(parsed.multihash.code, bytes);
  return Buffer.compare(Buffer.from(digest), Buffer.from(parsed.multihash.digest)) === 0;
}

function stripCidPrefix(value) {
  return value.replace(/^ipfs:\/\//i, "").trim();
}

function extractCidCandidate(entry) {
  if (typeof entry === "string") {
    const trimmed = stripCidPrefix(entry);
    if (trimmed) {
      return trimmed;
    }
    return null;
  }
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const keys = [
    "cid",
    "Cid",
    "CID",
    "hash",
    "Hash",
    "IpfsHash",
    "ipfsHash",
    "IpfsCid",
    "ipfsCid",
  ];
  for (const key of keys) {
    const candidate = entry[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return stripCidPrefix(candidate);
    }
  }
  if (Array.isArray(entry.pins)) {
    for (const pin of entry.pins) {
      const nested = extractCidCandidate(pin);
      if (nested) return nested;
    }
  }
  if (entry.value) {
    const nested = extractCidCandidate(entry.value);
    if (nested) return nested;
  }
  return null;
}

function parseCidFromResponseBody(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const candidate = extractCidCandidate(parsed);
      if (candidate) {
        return candidate;
      }
    } catch {
      const match = line.match(/([A-Za-z0-9]{46,})/);
      if (match) {
        return stripCidPrefix(match[1]);
      }
    }
  }
  throw new Error("Response did not include a CID");
}

function limitPreview(text) {
  if (text.length <= MAX_BODY_PREVIEW) return text;
  return `${text.slice(0, MAX_BODY_PREVIEW)}…`;
}

async function readBodySafe(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    return response.text();
  }
  let remaining = MAX_BODY_PREVIEW;
  const chunks = [];
  while (remaining > 0) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    const allowed = chunk.slice(0, remaining);
    chunks.push(Buffer.from(allowed));
    remaining -= allowed.byteLength;
    if (chunk.byteLength > allowed.byteLength) {
      break;
    }
  }
  const collected = Buffer.concat(chunks);
  return collected.toString("utf-8");
}

async function uploadOnce({
  provider,
  bytes,
  contentType,
  filename,
  fetchImpl,
  timeoutMs,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 30000);
  const form = new FormData();
  const fieldName = provider.formField || DEFAULT_FORM_FIELD;
  const name = provider.filename || filename || DEFAULT_FILENAME;
  const blob = new Blob([bytes], { type: contentType });
  form.append(fieldName, blob, name);
  if (provider.kind === "self-hosted") {
    form.append("cid-version", "1");
    form.append("pin", "true");
  }

  try {
    let target = provider.endpoint;
    if (provider.kind === "self-hosted") {
      const normalized = provider.endpoint.replace(/\/+$/, "");
      if (/\/api\/v\d+\/add$/i.test(normalized)) {
        target = normalized;
      } else {
        target = joinUrl(provider.endpoint, DEFAULT_SELF_HOSTED_PATH);
      }
    }
    const response = await fetchImpl(target, {
      method: "POST",
      headers: provider.headers ?? undefined,
      body: form,
      signal: controller.signal,
    });
    const preview = await readBodySafe(response);
    if (!response.ok) {
      throw new UploadError(
        `Provider ${provider.name} responded with ${response.status}: ${limitPreview(preview)}`,
        { provider: provider.name, status: response.status, transient: response.status >= 500 || response.status === 429 }
      );
    }
    const cid = parseCidFromResponseBody(preview);
    const valid = await verifyCidMatchesBytes(cid, bytes);
    if (!valid) {
      throw new UploadError(`Provider ${provider.name} returned CID that does not match payload hash`, {
        provider: provider.name,
      });
    }
    return { cid, provider: provider.name };
  } catch (error) {
    if (error instanceof UploadError) {
      throw error;
    }
    const transient = error.name === "AbortError" || error instanceof TypeError;
    throw new UploadError(`Failed to upload via ${provider.name}: ${error.message}`, {
      provider: provider.name,
      cause: error,
      transient,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function withRetries(fn, { attempts, initialDelay }) {
  let delay = initialDelay;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!(error?.transient) || attempt === attempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw lastError ?? new Error("Operation failed after retries");
}

async function uploadWithProvider(provider, bytes, options) {
  const attempts = options.maxAttempts ?? 3;
  const initialDelay = options.initialBackoffMs ?? 250;
  try {
    return await withRetries(
      () =>
        uploadOnce({
          provider,
          bytes,
          contentType: options.contentType,
          filename: options.filename,
          fetchImpl: options.fetchImpl,
          timeoutMs: options.timeoutMs,
        }),
      { attempts, initialDelay }
    );
  } catch (error) {
    if (error instanceof UploadError) {
      return { error };
    }
    return {
      error: new UploadError(`Failed to upload via ${provider.name}: ${error?.message ?? error}`, {
        provider: provider.name,
        cause: error,
      }),
    };
  }
}

async function mirrorToArweave(bytes, config, options) {
  if (!config?.endpoint) {
    throw new Error("Arweave mirror endpoint not configured");
  }
  const attempts = options.maxAttempts ?? 3;
  const initialDelay = options.initialBackoffMs ?? 250;
  const fetchImpl = options.fetchImpl;
  const timeoutMs = config.timeoutMs ?? options.timeoutMs ?? 30000;

  const execute = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(config.endpoint, {
        method: "POST",
        headers: config.headers ?? { "Content-Type": "application/octet-stream" },
        body: bytes,
        signal: controller.signal,
      });
      const preview = await readBodySafe(response);
      if (!response.ok) {
        throw new UploadError(
          `Arweave mirror responded with ${response.status}: ${limitPreview(preview)}`,
          { provider: "arweave", status: response.status, transient: response.status >= 500 || response.status === 429 }
        );
      }
      const lines = preview
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const candidate =
            (typeof parsed.id === "string" && parsed.id.trim()) ||
            (typeof parsed.arweaveId === "string" && parsed.arweaveId.trim()) ||
            (typeof parsed.transactionId === "string" && parsed.transactionId.trim());
          if (candidate) {
            return candidate;
          }
        } catch {
          if (line) {
            return line;
          }
        }
      }
      throw new UploadError("Arweave mirror response did not include an id", { provider: "arweave" });
    } catch (error) {
      if (error instanceof UploadError) {
        throw error;
      }
      const transient = error.name === "AbortError" || error instanceof TypeError;
      throw new UploadError(`Failed to mirror to Arweave: ${error.message}`, {
        provider: "arweave",
        cause: error,
        transient,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  return withRetries(execute, { attempts, initialDelay });
}

async function createDeterministicCid(bytes) {
  const digest = await sha256.digest(bytes);
  return CID.createV1(raw.code, digest).toString();
}

export function createIpfsUploader(options = {}) {
  const providers = Array.isArray(options.providers) ? options.providers : [];
  const fetchImpl = ensureFetch(options.fetch ?? globalThis.fetch);
  const maxAttempts = options.maxAttempts ?? 3;
  const initialBackoffMs = options.initialBackoffMs ?? 250;
  const timeoutMs = options.timeoutMs ?? 30000;

  return {
    async pin(payload, pinOptions = {}) {
      const bytes = toUint8Array(payload);
      const contentType = resolveContentType(payload, pinOptions.contentType ?? options.contentType);
      const filename = pinOptions.filename ?? options.filename;
      if (providers.length === 0) {
        const cid = await createDeterministicCid(bytes);
        return {
          cid,
          uri: `ipfs://${cid}`,
          provider: "deterministic-local",
          size: bytes.byteLength,
        };
      }

      const errors = [];
      const arweaveConfig = options.arweave;
      for (const provider of providers) {
        const result = await uploadWithProvider(provider, bytes, {
          maxAttempts,
          initialBackoffMs,
          contentType,
          filename,
          fetchImpl,
          timeoutMs,
        });
        if (result?.cid) {
          const mirrorRequested =
            pinOptions.mirrorToArweave ??
            arweaveConfig?.enabled ??
            options.mirrorToArweave ??
            false;
          let arweaveId;
          if (mirrorRequested && arweaveConfig?.endpoint) {
            arweaveId = await mirrorToArweave(bytes, arweaveConfig, {
              maxAttempts,
              initialBackoffMs,
              fetchImpl,
              timeoutMs,
            });
          }
          return {
            cid: result.cid,
            uri: `ipfs://${result.cid}`,
            provider: result.provider ?? provider.name,
            size: bytes.byteLength,
            mirrors: arweaveId ? { arweave: { id: arweaveId, uri: `ar://${arweaveId}` } } : undefined,
          };
        }
        if (result?.error) {
          errors.push(result.error);
        }
      }
      if (errors.length) {
        throw new AggregateError(errors, "Failed to upload payload to all configured IPFS providers");
      }
      throw new Error("No IPFS providers configured");
    },
  };
}

function parseHeaders(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveProvidersFromEnv(env = process.env) {
  const providers = [];
  const apiUrl = env?.IPFS_API_URL?.trim();
  const apiHeadersRaw = env?.IPFS_API_HEADERS;
  const apiHeaders = parseHeaders(typeof apiHeadersRaw === "string" ? apiHeadersRaw.trim() : apiHeadersRaw);
  if (apiUrl) {
    providers.push({
      name: "self-hosted",
      kind: "self-hosted",
      endpoint: apiUrl,
      headers: apiHeaders ?? undefined,
    });
  }
  const pinning = env?.IPFS_PINNING_ENDPOINTS?.trim();
  const pinHeadersRaw = env?.IPFS_PINNING_HEADERS;
  const pinHeaders = parseHeaders(typeof pinHeadersRaw === "string" ? pinHeadersRaw.trim() : pinHeadersRaw);
  if (pinning) {
    for (const entry of pinning.split(",")) {
      const normalized = entry.trim();
      if (!normalized) continue;
      try {
        const parsed = new URL(normalized);
        const headersCandidate =
          (pinHeaders && typeof pinHeaders === "object" && pinHeaders[parsed.host]) ||
          (pinHeaders && typeof pinHeaders === "object" && pinHeaders[normalized]);
        providers.push({
          name: parsed.host || normalized,
          kind: "pinning",
          endpoint: normalized,
          headers:
            headersCandidate && typeof headersCandidate === "object"
              ? headersCandidate
              : undefined,
        });
      } catch {
        // Ignore invalid URLs.
      }
    }
  }
  return providers;
}

export function resolveArweaveConfig(env = process.env) {
  const endpoint = env?.ARWEAVE_MIRROR_URL?.trim();
  if (!endpoint) {
    return null;
  }
  const enabled = /^true$/i.test(env?.ARWEAVE_MIRROR_ENABLED ?? "");
  const headersRaw = env?.ARWEAVE_MIRROR_HEADERS;
  const headers = parseHeaders(typeof headersRaw === "string" ? headersRaw.trim() : headersRaw);
  return {
    endpoint,
    enabled,
    headers: headers ?? undefined,
  };
}
