'use client';

export type OneboxContractDescriptor = {
  id: string;
  label: string;
  address: string;
};

export type OneboxRuntimeConfig = {
  orchestratorUrl?: string;
  apiToken?: string;
  explorerTxBase?: string;
  ipfsGatewayBase?: string;
  networkName?: string;
  chainId?: string;
  contracts?: OneboxContractDescriptor[];
};

type ResolvedOneboxConfig = {
  orchestratorUrl?: string;
  apiToken?: string;
  explorerTxBase?: string;
  ipfsGatewayBase?: string;
  networkName?: string;
  chainId?: string;
  contracts?: OneboxContractDescriptor[];
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

const sanitizeAddress = (value: string | undefined | null): string | undefined =>
  sanitize(value);

const sanitizeContracts = (
  contracts: unknown
): OneboxContractDescriptor[] => {
  if (!Array.isArray(contracts)) {
    return [];
  }
  return contracts.reduce<OneboxContractDescriptor[]>((acc, entry) => {
    if (!entry || typeof entry !== 'object') {
      return acc;
    }
    const { id, label, address } = entry as Partial<OneboxContractDescriptor>;
    const sanitizedId = sanitize(id);
    const sanitizedLabel = sanitize(label);
    const sanitizedAddress = sanitizeAddress(address);
    if (!sanitizedId || !sanitizedLabel || !sanitizedAddress) {
      return acc;
    }
    acc.push({
      id: sanitizedId,
      label: sanitizedLabel,
      address: sanitizedAddress,
    });
    return acc;
  }, []);
};

const CONTRACT_ENV_ENTRIES = [
  {
    envKey: 'NEXT_PUBLIC_AGIALPHA_TOKEN_ADDRESS',
    id: 'agialphaToken',
    label: 'AGI-Alpha token',
  },
  {
    envKey: 'NEXT_PUBLIC_JOB_REGISTRY_ADDRESS',
    id: 'jobRegistry',
    label: 'Job Registry',
  },
  {
    envKey: 'NEXT_PUBLIC_SYSTEM_PAUSE_ADDRESS',
    id: 'systemPause',
    label: 'System Pause',
  },
  {
    envKey: 'NEXT_PUBLIC_FEE_POOL_ADDRESS',
    id: 'feePool',
    label: 'Fee Pool',
  },
  {
    envKey: 'NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS',
    id: 'identityRegistry',
    label: 'Identity Registry',
  },
  {
    envKey: 'NEXT_PUBLIC_STAKE_MANAGER_ADDRESS',
    id: 'stakeManager',
    label: 'Stake Manager',
  },
  {
    envKey: 'NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS',
    id: 'validationModule',
    label: 'Validation Module',
  },
  {
    envKey: 'NEXT_PUBLIC_DISPUTE_MODULE_ADDRESS',
    id: 'disputeModule',
    label: 'Dispute Module',
  },
  {
    envKey: 'NEXT_PUBLIC_REPUTATION_ENGINE_ADDRESS',
    id: 'reputationEngine',
    label: 'Reputation Engine',
  },
] as const;

const buildEnvContracts = (): OneboxContractDescriptor[] =>
  CONTRACT_ENV_ENTRIES.reduce<OneboxContractDescriptor[]>((acc, entry) => {
    const raw = process.env[entry.envKey as keyof NodeJS.ProcessEnv];
    if (typeof raw !== 'string') {
      return acc;
    }
    const address = sanitizeAddress(raw);
    if (!address) {
      return acc;
    }
    acc.push({
      id: entry.id,
      label: entry.label,
      address,
    });
    return acc;
  }, []);

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
    networkName: process.env.NEXT_PUBLIC_AGJ_NETWORK,
    chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
  };
  const runtimeContracts = sanitizeContracts(runtime.contracts);
  const envContracts = runtimeContracts.length > 0 ? [] : buildEnvContracts();
  return {
    orchestratorUrl: sanitizeUrl(runtime.orchestratorUrl ?? envConfig.orchestratorUrl),
    apiToken: sanitize(runtime.apiToken ?? envConfig.apiToken),
    explorerTxBase: sanitizeUrl(runtime.explorerTxBase ?? envConfig.explorerTxBase),
    ipfsGatewayBase: sanitizeUrl(runtime.ipfsGatewayBase ?? envConfig.ipfsGatewayBase),
    networkName: sanitize(runtime.networkName ?? envConfig.networkName),
    chainId: sanitize(runtime.chainId ?? envConfig.chainId),
    contracts:
      runtimeContracts.length > 0
        ? runtimeContracts
        : envContracts.length > 0
        ? envContracts
        : undefined,
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

