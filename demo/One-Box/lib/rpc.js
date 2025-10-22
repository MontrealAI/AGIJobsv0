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
const WEI_PER_ETHER = 10n ** 18n;
const OWNER_SELECTOR = '0x8da5cb5b';
const PAUSED_SELECTOR = '0x5c975abb';

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

function normaliseAddress(address) {
  if (typeof address !== 'string') {
    return '';
  }
  return address.trim();
}

function evaluateAddressShape(address) {
  if (!address) {
    return 'missing';
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return 'invalid';
  }
  if (ZERO_ADDRESS_REGEX.test(address)) {
    return 'placeholder';
  }
  return 'candidate';
}

async function evaluateContractPresence({ rpcUrl, address, fetchImpl, timeoutMs }) {
  const shape = evaluateAddressShape(address);
  if (shape === 'missing' || shape === 'invalid' || shape === 'placeholder') {
    return { address: address || null, status: shape };
  }

  try {
    const code = await jsonRpcRequest(fetchImpl, rpcUrl, 'eth_getCode', [address, 'latest'], {
      timeoutMs,
    });
    const hasCode = typeof code === 'string' && code !== '0x';
    return {
      address,
      status: hasCode ? 'ok' : 'no_code',
    };
  } catch (error) {
    return {
      address,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown RPC error',
    };
  }
}

async function probeRpc({
  rpcUrl,
  jobRegistryAddress,
  stakeManagerAddress,
  systemPauseAddress,
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

  const jobRegistry = await evaluateContractPresence({
    rpcUrl,
    address: normaliseAddress(jobRegistryAddress),
    fetchImpl,
    timeoutMs,
  });

  const stakeManager = await evaluateContractPresence({
    rpcUrl,
    address: normaliseAddress(stakeManagerAddress),
    fetchImpl,
    timeoutMs,
  });

  const systemPause = await evaluateContractPresence({
    rpcUrl,
    address: normaliseAddress(systemPauseAddress),
    fetchImpl,
    timeoutMs,
  });

  return {
    status: 'ready',
    chain,
    jobRegistry,
    stakeManager,
    systemPause,
  };
}

function formatEtherFromHex(hexValue) {
  if (typeof hexValue !== 'string') {
    throw new TypeError('Balance must be a hex string.');
  }
  const normalized = hexValue === '0x' ? '0x0' : hexValue;
  const value = BigInt(normalized);
  const whole = value / WEI_PER_ETHER;
  const remainder = value % WEI_PER_ETHER;
  if (remainder === 0n) {
    return whole.toString();
  }
  let fractional = remainder.toString().padStart(18, '0');
  fractional = fractional.replace(/0+$/, '');
  return `${whole.toString()}.${fractional}`;
}

async function fetchAccountBalance({
  rpcUrl,
  address,
  fetchImpl = globalThis.fetch,
  timeoutMs,
} = {}) {
  if (!rpcUrl || typeof rpcUrl !== 'string') {
    return {
      status: 'missing_rpc',
      error: 'RPC_URL missing',
    };
  }
  const trimmedAddress = typeof address === 'string' ? address.trim() : '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmedAddress)) {
    return {
      status: 'invalid_address',
      error: 'Invalid address format',
    };
  }

  try {
    const balanceHex = await jsonRpcRequest(
      fetchImpl,
      rpcUrl,
      'eth_getBalance',
      [trimmedAddress, 'latest'],
      { timeoutMs }
    );
    const formatted = formatEtherFromHex(typeof balanceHex === 'string' ? balanceHex : '0x0');
    return {
      status: 'ok',
      balanceHex: typeof balanceHex === 'string' ? balanceHex : '0x0',
      balanceEther: formatted,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown RPC error',
    };
  }
}

function decodeAddressFromCallResult(result) {
  if (typeof result !== 'string' || !result.startsWith('0x')) {
    throw new Error('Call result is not a hex string');
  }
  if (result === '0x') {
    throw new Error('Call result empty');
  }
  const raw = result.slice(2);
  if (raw.length > 64) {
    throw new Error('Call result length unexpected');
  }
  const body = raw.padStart(64, '0');
  const candidate = `0x${body.slice(-40)}`;
  if (!/^0x[0-9a-fA-F]{40}$/.test(candidate)) {
    throw new Error('Call result did not encode an address');
  }
  return candidate;
}

function decodeBooleanFromCallResult(result) {
  if (typeof result !== 'string' || !result.startsWith('0x')) {
    throw new Error('Call result is not a hex string');
  }
  if (result === '0x') {
    throw new Error('Call result empty');
  }
  const body = result.slice(2);
  if (body.length > 64) {
    throw new Error('Call result length unexpected');
  }
  const lastNibble = body.slice(-1);
  if (!/[0-9a-f]/i.test(lastNibble)) {
    throw new Error('Call result did not encode a boolean');
  }
  return parseInt(lastNibble, 16) !== 0;
}

async function fetchContractOwner({
  rpcUrl,
  address,
  fetchImpl = globalThis.fetch,
  timeoutMs,
} = {}) {
  if (!rpcUrl || typeof rpcUrl !== 'string') {
    return {
      status: 'missing_rpc',
      error: 'RPC_URL missing',
    };
  }
  const normalised = normaliseAddress(address);
  const shape = evaluateAddressShape(normalised);
  if (shape !== 'candidate') {
    return { status: shape };
  }
  try {
    const result = await jsonRpcRequest(
      fetchImpl,
      rpcUrl,
      'eth_call',
      [
        {
          to: normalised,
          data: OWNER_SELECTOR,
        },
        'latest',
      ],
      { timeoutMs }
    );
    const owner = decodeAddressFromCallResult(result);
    return {
      status: 'ok',
      owner,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown RPC error';
    if (/revert/i.test(message)) {
      return { status: 'reverted', error: message };
    }
    if (/Call result empty/i.test(message) || /did not encode/i.test(message)) {
      return { status: 'unsupported', error: message };
    }
    return { status: 'error', error: message };
  }
}

async function fetchPauseStatus({
  rpcUrl,
  address,
  fetchImpl = globalThis.fetch,
  timeoutMs,
} = {}) {
  if (!rpcUrl || typeof rpcUrl !== 'string') {
    return {
      status: 'missing_rpc',
      error: 'RPC_URL missing',
    };
  }
  const normalised = normaliseAddress(address);
  const shape = evaluateAddressShape(normalised);
  if (shape !== 'candidate') {
    return { status: shape };
  }
  try {
    const result = await jsonRpcRequest(
      fetchImpl,
      rpcUrl,
      'eth_call',
      [
        {
          to: normalised,
          data: PAUSED_SELECTOR,
        },
        'latest',
      ],
      { timeoutMs }
    );
    const paused = decodeBooleanFromCallResult(result);
    return {
      status: 'ok',
      paused,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown RPC error';
    if (/revert/i.test(message)) {
      return { status: 'unsupported', error: message };
    }
    if (/Call result empty/i.test(message) || /did not encode/i.test(message)) {
      return { status: 'unsupported', error: message };
    }
    return { status: 'error', error: message };
  }
}

async function inspectOwnerSurface({
  rpcUrl,
  jobRegistryAddress,
  stakeManagerAddress,
  systemPauseAddress,
  fetchImpl = globalThis.fetch,
  timeoutMs,
} = {}) {
  const jobRegistry = {
    owner: await fetchContractOwner({
      rpcUrl,
      address: jobRegistryAddress,
      fetchImpl,
      timeoutMs,
    }),
    paused: await fetchPauseStatus({
      rpcUrl,
      address: jobRegistryAddress,
      fetchImpl,
      timeoutMs,
    }),
  };

  const stakeManager = {
    owner: await fetchContractOwner({
      rpcUrl,
      address: stakeManagerAddress,
      fetchImpl,
      timeoutMs,
    }),
    paused: await fetchPauseStatus({
      rpcUrl,
      address: stakeManagerAddress,
      fetchImpl,
      timeoutMs,
    }),
  };

  const systemPause = {
    owner: await fetchContractOwner({
      rpcUrl,
      address: systemPauseAddress,
      fetchImpl,
      timeoutMs,
    }),
    paused: { status: 'unsupported' },
  };

  return {
    jobRegistry,
    stakeManager,
    systemPause,
  };
}

module.exports = {
  NETWORK_NAMES,
  normaliseAddress,
  evaluateAddressShape,
  evaluateContractPresence,
  parseChainId,
  probeRpc,
  toHex,
  formatEtherFromHex,
  fetchAccountBalance,
  fetchContractOwner,
  fetchPauseStatus,
  inspectOwnerSurface,
};
