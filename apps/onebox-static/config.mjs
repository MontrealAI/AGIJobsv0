const RAW_ORCHESTRATOR_BASE_URL = "https://alpha-orchestrator.example.com";
const RAW_ORCHESTRATOR_ONEBOX_PREFIX = "/onebox";
const RAW_IPFS_ENDPOINT = "https://api.web3.storage/upload";
const RAW_IPFS_GATEWAYS = [
  "https://w3s.link/ipfs/",
  "https://ipfs.io/ipfs/",
];
const RAW_HISTORY_LENGTH = 10;
const RAW_STATUS_REFRESH_MS = 15_000;
const RAW_STATUS_MAX_ITEMS = 4;

function trimTrailingSlash(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

function trimSlashes(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function joinUrlSegments(base, ...segments) {
  if (!base) return "";
  let normalized = trimTrailingSlash(base);
  for (const segment of segments) {
    if (!segment) continue;
    const trimmed = trimSlashes(segment);
    if (!trimmed) continue;
    normalized += `/${trimmed}`;
  }
  return normalized;
}

function toOrigin(value) {
  try {
    if (typeof value !== "string" || !value.trim()) return null;
    return new URL(value).origin;
  } catch (err) {
    return null;
  }
}

function unique(list) {
  return Array.from(new Set(list));
}

export const ORCHESTRATOR_BASE_URL = trimTrailingSlash(RAW_ORCHESTRATOR_BASE_URL);
export const ORCHESTRATOR_ONEBOX_PREFIX = RAW_ORCHESTRATOR_ONEBOX_PREFIX;
export const ORCHESTRATOR_ROOT = joinUrlSegments(
  ORCHESTRATOR_BASE_URL,
  trimSlashes(ORCHESTRATOR_ONEBOX_PREFIX),
);
export const PLAN_URL = joinUrlSegments(ORCHESTRATOR_ROOT, "plan");
export const EXEC_URL = joinUrlSegments(ORCHESTRATOR_ROOT, "execute");
export const STATUS_URL = joinUrlSegments(ORCHESTRATOR_ROOT, "status");
export const IPFS_ENDPOINT = RAW_IPFS_ENDPOINT;
export const IPFS_TOKEN_STORAGE_KEY = "AGIJOBS_W3S_TOKEN";
export const IPFS_GATEWAYS = RAW_IPFS_GATEWAYS.map((url) => url.trim()).filter(Boolean);
export const HISTORY_LENGTH = RAW_HISTORY_LENGTH;
export const STATUS_REFRESH_MS = RAW_STATUS_REFRESH_MS;
export const STATUS_REFRESH_INTERVAL_MS = RAW_STATUS_REFRESH_MS;
export const STATUS_POLL_INTERVAL_MS = RAW_STATUS_REFRESH_MS;
export const STATUS_MAX_ITEMS = RAW_STATUS_MAX_ITEMS;
export const CONNECT_SRC_ORIGINS = unique(
  [
    ORCHESTRATOR_BASE_URL,
    PLAN_URL,
    EXEC_URL,
    STATUS_URL,
    IPFS_ENDPOINT,
    ...IPFS_GATEWAYS,
  ]
    .map(toOrigin)
    .filter(Boolean),
);
export const AA_MODE = { enabled: true, bundler: "alchemy", chainId: 1 };
export const ORCHESTRATOR_STORAGE_KEYS = {
  base: "AGIJOBS_ONEBOX_ORCHESTRATOR_BASE",
  prefix: "AGIJOBS_ONEBOX_ORCHESTRATOR_PREFIX",
};
export const ORCHESTRATOR_URL_PARAMS = {
  base: "orchestrator",
  prefix: "oneboxPrefix",
};
export const ENABLE_DEMO_MODE = true;
