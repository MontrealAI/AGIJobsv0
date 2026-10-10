const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const PROTO_PATH = path.join(__dirname, "..", "proto", "alpha_bridge.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const loaded = grpc.loadPackageDefinition(packageDefinition);

const AlphaBridgeService =
  loaded?.agi?.alpha?.bridge?.v1?.AlphaBridge?.service;

if (!AlphaBridgeService) {
  throw new Error("Failed to load AlphaBridge service definition");
}

const HTTP_TO_GRPC = new Map([
  [400, grpc.status.INVALID_ARGUMENT],
  [401, grpc.status.UNAUTHENTICATED],
  [403, grpc.status.PERMISSION_DENIED],
  [404, grpc.status.NOT_FOUND],
  [409, grpc.status.ALREADY_EXISTS],
  [422, grpc.status.FAILED_PRECONDITION],
  [429, grpc.status.RESOURCE_EXHAUSTED],
  [500, grpc.status.INTERNAL],
  [502, grpc.status.UNAVAILABLE],
  [503, grpc.status.UNAVAILABLE],
]);

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }
  const output = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string" && value.trim()) {
      output[key] = value;
    }
  }
  return output;
}

function sanitizeHeaderKey(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseJsonOrThrow(label, value, { allowEmptyArray = false } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    if (allowEmptyArray) {
      return [];
    }
    const error = new Error(`${label} must be a non-empty JSON string`);
    error.code = grpc.status.INVALID_ARGUMENT;
    throw error;
  }
  try {
    const parsed = JSON.parse(value);
    if (allowEmptyArray && parsed === undefined) {
      return [];
    }
    return parsed;
  } catch (cause) {
    const error = new Error(`${label} is not valid JSON`);
    error.code = grpc.status.INVALID_ARGUMENT;
    error.cause = cause;
    throw error;
  }
}

async function fetchJson(url, body, headers) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const status = response.status;
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      const error = new Error(`AGI-Alpha responded with malformed JSON (${cause})`);
      error.httpStatus = status;
      error.details = text;
      throw error;
    }
  }

  if (!response.ok) {
    const error = new Error(
      `AGI-Alpha responded with HTTP ${status}${parsed?.error ? `: ${parsed.error}` : ""}`,
    );
    error.httpStatus = status;
    error.details = parsed ?? text;
    throw error;
  }

  if (parsed === null) {
    const error = new Error("AGI-Alpha returned an empty response body");
    error.httpStatus = status;
    throw error;
  }

  return parsed;
}

function buildHeaders({
  traceId,
  requireConsent,
  consentGranted,
  consentToken,
  metadata,
}) {
  const headers = {};
  if (traceId) {
    headers["x-agi-trace-id"] = traceId;
  }
  if (typeof requireConsent === "boolean") {
    headers["x-agi-require-consent"] = String(requireConsent);
  }
  if (typeof consentGranted === "boolean") {
    headers["x-agi-consent-granted"] = String(consentGranted);
  }
  if (consentToken) {
    headers["x-agi-consent-token"] = consentToken;
  }
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      const sanitizedKey = sanitizeHeaderKey(key);
      if (!sanitizedKey) {
        continue;
      }
      headers[`x-agi-meta-${sanitizedKey}`] = value;
    }
  }
  return headers;
}

function mapError(error) {
  const fallbackMessage = "Unexpected error";
  if (!error) {
    const unknown = new Error("Unknown error");
    unknown.code = grpc.status.UNKNOWN;
    return unknown;
  }

  let code = grpc.status.UNKNOWN;
  let message = error.message || fallbackMessage;
  if (typeof error.code === "number") {
    code = error.code;
    message = message || grpc.status[error.code] || fallbackMessage;
  } else if (error.httpStatus) {
    code = HTTP_TO_GRPC.get(error.httpStatus) ?? grpc.status.UNKNOWN;
  }

  const grpcError = new Error(message);
  grpcError.code = code;
  if (error.details !== undefined) {
    grpcError.details = error.details;
  }
  return grpcError;
}

function unary(handler) {
  return (call, callback) => {
    Promise.resolve()
      .then(() => handler(call))
      .then((result) => callback(null, result))
      .catch((error) => callback(mapError(error)));
  };
}

function createServer(options = {}) {
  const baseUrl = options.baseUrl || process.env.ALPHA_AGENT_URL || "http://localhost:8080";
  const server = new grpc.Server();

  server.addService(
    AlphaBridgeService,
    {
      Plan: unary(async (call) => {
        const request = call.request || {};
        const utterance = request.utterance || "";
        if (!utterance.trim()) {
          const error = new Error("utterance is required");
          error.code = grpc.status.INVALID_ARGUMENT;
          throw error;
        }

        let history = [];
        if (request.history_json) {
          history = parseJsonOrThrow("history_json", request.history_json, {
            allowEmptyArray: true,
          });
          if (!Array.isArray(history)) {
            const error = new Error("history_json must encode a JSON array");
            error.code = grpc.status.INVALID_ARGUMENT;
            throw error;
          }
        }

        const metadata = normalizeMetadata(request.metadata);
        const traceId = request.trace_id || "";
        const requireConsent = Boolean(request.require_consent);
        const consentToken = request.consent_token || "";

        const payload = {
          input: {
            text: utterance,
          },
          history,
          meta: {
            traceId: traceId || undefined,
            consent: {
              required: requireConsent,
              token: consentToken || undefined,
            },
            tags: Object.keys(metadata).length ? metadata : undefined,
          },
        };

        const headers = buildHeaders({
          traceId,
          requireConsent,
          consentToken,
          metadata,
        });

        const response = await fetchJson(`${baseUrl}/plan`, payload, headers);
        const meta = response.meta || {};
        const planPayload = response.plan ?? response;
        const consent = meta.consent || {};
        const planJson =
          typeof planPayload === "string"
            ? planPayload
            : JSON.stringify(planPayload);

        return {
          plan_json: planJson,
          trace_id: meta.traceId || traceId || "",
          requires_consent: Boolean(
            consent.required ?? response.requiresConsent ?? requireConsent,
          ),
          consent_token: consent.token || response.consentToken || consentToken || "",
        };
      }),
      Execute: unary(async (call) => {
        const request = call.request || {};
        const traceId = request.trace_id || "";
        const planJson = request.plan_json || "";
        let plan;
        try {
          plan = JSON.parse(planJson);
        } catch (cause) {
          const error = new Error("plan_json is not valid JSON");
          error.code = grpc.status.INVALID_ARGUMENT;
          error.cause = cause;
          throw error;
        }
        const consentToken = request.consent_token || "";
        const consentGranted = Boolean(request.consent_granted);
        const metadata = normalizeMetadata(request.metadata);

        const payload = {
          plan,
          meta: {
            traceId: traceId || undefined,
            consent: {
              granted: consentGranted,
              token: consentToken || undefined,
            },
            tags: Object.keys(metadata).length ? metadata : undefined,
          },
        };

        const headers = buildHeaders({
          traceId,
          consentGranted,
          consentToken,
          metadata,
        });

        const response = await fetchJson(`${baseUrl}/execute`, payload, headers);
        const meta = response.meta || {};
        const receiptPayload = response.receipt ?? response;
        const receiptJson =
          typeof receiptPayload === "string"
            ? receiptPayload
            : JSON.stringify(receiptPayload);

        return {
          receipt_json: receiptJson,
          trace_id: meta.traceId || traceId || "",
        };
      }),
    },
  );

  function listen(bindAddress = process.env.ALPHA_BRIDGE_BIND || "0.0.0.0:50052") {
    return new Promise((resolve, reject) => {
      server.bindAsync(
        bindAddress,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({ port });
        },
      );
    });
  }

  function shutdown() {
    return new Promise((resolve, reject) => {
      server.tryShutdown((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  return { server, listen, shutdown };
}

module.exports = { createServer };

if (require.main === module) {
  const instance = createServer();
  instance
    .listen()
    .then(({ port }) => {
      // eslint-disable-next-line no-console
      console.log(`alpha-bridge listening on port ${port}`);
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("alpha-bridge failed to start", error);
      process.exitCode = 1;
    });
}
