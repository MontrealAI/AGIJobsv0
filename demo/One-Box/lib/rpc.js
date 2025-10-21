const NETWORK_NAMES = new Map([
  [1, 'Ethereum Mainnet'],
  [5, 'Goerli'],
  [10, 'Optimism'],
  [56, 'BNB Chain'],
  [100, 'Gnosis'],
  [137, 'Polygon'],
  [324, 'zkSync Era'],
  [8453, 'Base'],
  [42161, 'Arbitrum One'],
  [43114, 'Avalanche C-Chain'],
  [11155111, 'Ethereum Sepolia'],
  [17000, 'Holesky'],
]);

const ZERO_ADDRESS_REGEX = /^0x0{40}$/i;

function toHex(value) {
  if (typeof value === 'string') {
    return value.startsWith('0x') ? value : `0x${value}`;
  }
  if (typeof value === 'number') {
    return `0x${value.toString(16)}`;
  }
  throw new TypeError('Unsupported value type for hex conversion');
}

function parseChainId(hexValue) {
  if (typeof hexValue !== 'string' || !hexValue.startsWith('0x')) {
    throw new Error('Invalid chain id value received from RPC');
  }
  const numeric = Number.parseInt(hexValue, 16);
  if (!Number.isFinite(numeric)) {
    throw new Error('Unable to parse chain id value');
  }
  return {
    hex: hexValue,
    decimal: numeric,
    networkName: NETWORK_NAMES.get(numeric) ?? null,
  };
}

async function jsonRpcRequest(fetchImpl, url, method, params, { timeoutMs = 8000 } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is not available');
  }
  const payload = {
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 1_000_000),
    method,
    params,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`RPC responded with status ${response.status}`);
    }
    const body = await response.json();
    if (body.error) {
      throw new Error(body.error?.message ?? 'RPC returned an error');
    }
    return body.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function probeRpc({
  rpcUrl,
  jobRegistryAddress,
  fetchImpl = globalThis.fetch,
  timeoutMs,
} = {}) {
  if (!rpcUrl || typeof rpcUrl !== 'string') {
    return {
      status: 'missing',
      error: 'RPC_URL missing',
    };
  }

  let chain;
  try {
    const chainIdHex = await jsonRpcRequest(fetchImpl, rpcUrl, 'eth_chainId', [], {
      timeoutMs,
    });
    chain = parseChainId(chainIdHex);
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown RPC error',
    };
  }

  let jobRegistryStatus = 'missing';
  const normalisedAddress = typeof jobRegistryAddress === 'string' ? jobRegistryAddress.trim() : '';
  if (normalisedAddress) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(normalisedAddress)) {
      jobRegistryStatus = 'invalid';
    } else if (ZERO_ADDRESS_REGEX.test(normalisedAddress)) {
      jobRegistryStatus = 'placeholder';
    } else {
      try {
        const code = await jsonRpcRequest(
          fetchImpl,
          rpcUrl,
          'eth_getCode',
          [normalisedAddress, 'latest'],
          { timeoutMs }
        );
        const hasCode = typeof code === 'string' && code !== '0x';
        jobRegistryStatus = hasCode ? 'ok' : 'no_code';
      } catch (error) {
        jobRegistryStatus = 'error';
      }
    }
  }

  return {
    status: 'ready',
    chain,
    jobRegistry: {
      address: normalisedAddress || null,
      status: jobRegistryStatus,
    },
  };
}

module.exports = {
  NETWORK_NAMES,
  parseChainId,
  probeRpc,
  toHex,
};
