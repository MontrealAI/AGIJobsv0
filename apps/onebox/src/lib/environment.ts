'use client';

export type OneboxRuntimeConfig = {
  orchestratorUrl?: string;
  apiToken?: string;
  explorerTxBase?: string;
  ipfsGatewayBase?: string;
};

type ResolvedOneboxConfig = {
  orchestratorUrl?: string;
  apiToken?: string;
  explorerTxBase?: string;
  ipfsGatewayBase?: string;
};

type OneboxWindow = Window & { __ONEBOX_CONFIG__?: OneboxRuntimeConfig };

const sanitize = (value: string | undefined | null): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const sanitizeUrl = (value: string | undefined | null): string | undefined => {
  const sanitized = sanitize(value);
  if (!sanitized) {
    return undefined;
  }
  return sanitized.replace(/\s+/g, '').replace(/\/+$/, '');
};

const readRuntimeConfig = (): OneboxRuntimeConfig => {
  if (typeof window === 'undefined') {
    return {};
  }
  const runtime = (window as OneboxWindow).__ONEBOX_CONFIG__;
  if (!runtime || typeof runtime !== 'object') {
    return {};
  }
  return runtime;
};

export const readOneboxConfig = (): ResolvedOneboxConfig => {
  const runtime = readRuntimeConfig();
  const envConfig: OneboxRuntimeConfig = {
    orchestratorUrl:
      process.env.NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL ??
      process.env.NEXT_PUBLIC_ALPHA_ORCHESTRATOR_URL,
    apiToken:
      process.env.NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_TOKEN ??
      process.env.NEXT_PUBLIC_ALPHA_ORCHESTRATOR_TOKEN,
    explorerTxBase: process.env.NEXT_PUBLIC_ONEBOX_EXPLORER_TX_BASE,
    ipfsGatewayBase: process.env.NEXT_PUBLIC_ONEBOX_IPFS_GATEWAY_BASE,
  };
  return {
    orchestratorUrl: sanitizeUrl(runtime.orchestratorUrl ?? envConfig.orchestratorUrl),
    apiToken: sanitize(runtime.apiToken ?? envConfig.apiToken),
    explorerTxBase: sanitizeUrl(runtime.explorerTxBase ?? envConfig.explorerTxBase),
    ipfsGatewayBase: sanitizeUrl(runtime.ipfsGatewayBase ?? envConfig.ipfsGatewayBase),
  };
};

const joinUrl = (base: string, path: string): string => {
  const normalisedBase = base.replace(/\/+$/, '');
  const normalisedPath = path.replace(/^\/+/, '');
  return `${normalisedBase}/${normalisedPath}`;
};

export const resolveOrchestratorBase = (
  orchestratorUrl: string | undefined
): string | undefined => {
  if (!orchestratorUrl) {
    return undefined;
  }
  if (orchestratorUrl.endsWith('/onebox')) {
    return orchestratorUrl;
  }
  return `${orchestratorUrl}/onebox`;
};

export const createExplorerUrl = (
  hash: string | undefined,
  explorerTxBase: string | undefined
): string | undefined => {
  if (!hash || !explorerTxBase) {
    return undefined;
  }
  return joinUrl(explorerTxBase, hash);
};

export const createIpfsGatewayUrl = (
  cid: string | undefined,
  ipfsGatewayBase: string | undefined
): string | undefined => {
  if (!cid) {
    return undefined;
  }
  if (!ipfsGatewayBase) {
    return `https://ipfs.io/ipfs/${cid}`;
  }
  return joinUrl(ipfsGatewayBase, cid);
};

