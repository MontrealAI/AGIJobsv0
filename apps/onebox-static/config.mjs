export const ORCHESTRATOR_BASE_URL = "https://alpha-orchestrator.example.com";
export const ORCHESTRATOR_ONEBOX_PREFIX = "/onebox";
export const PLAN_URL = `${ORCHESTRATOR_BASE_URL}${ORCHESTRATOR_ONEBOX_PREFIX}/plan`;
export const EXEC_URL = `${ORCHESTRATOR_BASE_URL}${ORCHESTRATOR_ONEBOX_PREFIX}/execute`;
export const STATUS_URL = `${ORCHESTRATOR_BASE_URL}${ORCHESTRATOR_ONEBOX_PREFIX}/status`;
export const IPFS_ENDPOINT = "https://api.web3.storage/upload";
export const IPFS_TOKEN_STORAGE_KEY = "AGIJOBS_W3S_TOKEN";
export const IPFS_GATEWAYS = [
  "https://w3s.link/ipfs/",
  "https://ipfs.io/ipfs/",
];
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
