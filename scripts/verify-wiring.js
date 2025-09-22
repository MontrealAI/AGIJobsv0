#!/usr/bin/env node
'use strict';

const { loadTokenConfig, loadEnsConfig } = require('./config');
const { ethers } = require('ethers');
const { AGIALPHA } = require('./constants');

const ZERO_ADDRESS = ethers.ZeroAddress;
const ZERO_HASH = ethers.ZeroHash;

const MODULE_ABIS = {
  systemPause: [
    'function owner() view returns (address)',
    'function jobRegistry() view returns (address)',
    'function stakeManager() view returns (address)',
    'function validationModule() view returns (address)',
    'function disputeModule() view returns (address)',
    'function platformRegistry() view returns (address)',
    'function feePool() view returns (address)',
    'function reputationEngine() view returns (address)',
    'function arbitratorCommittee() view returns (address)',
  ],
  stakeManager: [
    'function owner() view returns (address)',
    'function jobRegistry() view returns (address)',
    'function disputeModule() view returns (address)',
    'function validationModule() view returns (address)',
    'function feePool() view returns (address)',
    'function token() view returns (address)',
  ],
  jobRegistry: [
    'function owner() view returns (address)',
    'function stakeManager() view returns (address)',
    'function validationModule() view returns (address)',
    'function reputationEngine() view returns (address)',
    'function disputeModule() view returns (address)',
    'function certificateNFT() view returns (address)',
    'function taxPolicy() view returns (address)',
    'function feePool() view returns (address)',
    'function identityRegistry() view returns (address)',
  ],
  validationModule: [
    'function owner() view returns (address)',
    'function jobRegistry() view returns (address)',
    'function stakeManager() view returns (address)',
    'function identityRegistry() view returns (address)',
    'function reputationEngine() view returns (address)',
  ],
  reputationEngine: [
    'function owner() view returns (address)',
    'function stakeManager() view returns (address)',
  ],
  disputeModule: [
    'function owner() view returns (address)',
    'function jobRegistry() view returns (address)',
    'function stakeManager() view returns (address)',
    'function committee() view returns (address)',
  ],
  arbitratorCommittee: [
    'function owner() view returns (address)',
    'function jobRegistry() view returns (address)',
    'function disputeModule() view returns (address)',
  ],
  certificateNFT: [
    'function owner() view returns (address)',
    'function jobRegistry() view returns (address)',
    'function stakeManager() view returns (address)',
  ],
  taxPolicy: ['function owner() view returns (address)'],
  feePool: [
    'function owner() view returns (address)',
    'function stakeManager() view returns (address)',
    'function taxPolicy() view returns (address)',
  ],
  platformRegistry: [
    'function owner() view returns (address)',
    'function stakeManager() view returns (address)',
    'function reputationEngine() view returns (address)',
  ],
  jobRouter: [
    'function owner() view returns (address)',
    'function platformRegistry() view returns (address)',
  ],
  platformIncentives: [
    'function owner() view returns (address)',
    'function stakeManager() view returns (address)',
    'function platformRegistry() view returns (address)',
    'function jobRouter() view returns (address)',
  ],
  identityRegistry: [
    'function owner() view returns (address)',
    'function reputationEngine() view returns (address)',
    'function attestationRegistry() view returns (address)',
    'function ens() view returns (address)',
    'function nameWrapper() view returns (address)',
    'function agentRootNode() view returns (bytes32)',
    'function clubRootNode() view returns (bytes32)',
    'function agentMerkleRoot() view returns (bytes32)',
    'function validatorMerkleRoot() view returns (bytes32)',
  ],
  attestationRegistry: [
    'function owner() view returns (address)',
    'function ens() view returns (address)',
    'function nameWrapper() view returns (address)',
  ],
};

function parseArgs(argv) {
  const result = { network: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--network' || arg === '-n') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        result.network = next;
        i += 1;
      }
    } else if (arg.startsWith('--network=')) {
      result.network = arg.split('=')[1];
    } else if (arg.startsWith('-n') && arg.length > 2) {
      result.network = arg.slice(2);
    }
  }
  return result;
}

function firstEnv(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    if (!key) continue;
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function resolveRpcUrl(network) {
  const generic = ['WIRE_VERIFY_RPC_URL', 'RPC_URL', 'ETH_RPC_URL'];
  if (!network) {
    return firstEnv(generic);
  }
  const lower = network.toLowerCase();
  if (lower === 'mainnet') {
    return firstEnv(['WIRE_VERIFY_RPC_URL', 'MAINNET_RPC_URL', ...generic]);
  }
  if (lower === 'sepolia') {
    return firstEnv([
      'WIRE_VERIFY_RPC_URL',
      'SEPOLIA_RPC_URL',
      'TESTNET_RPC_URL',
      ...generic,
    ]);
  }
  return firstEnv(generic);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unwrapError(err) {
  if (!err) return err;
  return err.error || err.info?.error || err.data?.error || err;
}

function errorMessage(err) {
  if (!err) return 'unknown error';
  const unwrapped = unwrapError(err);
  return (
    unwrapped?.message ||
    unwrapped?.reason ||
    err.message ||
    err.reason ||
    String(err)
  );
}

function errorCode(err) {
  if (!err) return undefined;
  const unwrapped = unwrapError(err);
  return unwrapped?.code ?? err.code ?? unwrapped?.status ?? err.status;
}

function isRateLimitError(err) {
  const code = errorCode(err);
  const message = errorMessage(err);
  if (code === -32603 || code === 429) {
    if (/too many requests/i.test(message) || /rate/i.test(message)) {
      return true;
    }
  }
  if (/too many requests/i.test(message)) return true;
  if (/rate limit/i.test(message)) return true;
  return false;
}

async function withRetry(task, description, options = {}) {
  const {
    attempts = 5,
    initialDelay = 500,
    backoff = 2,
    onError,
  } = options;
  let lastError;
  let delayMs = initialDelay;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err) || attempt === attempts) {
        if (typeof onError === 'function') {
          onError(err, attempt, attempts);
        }
        throw err;
      }
      const msg = errorMessage(err);
      console.warn(
        `Rate limited while ${description} (attempt ${attempt}/${attempts}): ${msg}. Retrying in ${delayMs}ms.`,
      );
      await delay(delayMs);
      delayMs *= backoff;
    }
  }
  throw lastError;
}

function eqAddress(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function normaliseAddress(value, { allowZero = true } = {}) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  const address = ethers.getAddress(prefixed);
  if (!allowZero && address === ZERO_ADDRESS) {
    return null;
  }
  return address;
}

function normaliseBytes32(value, label) {
  if (value === undefined || value === null) {
    return null;
  }
  let hex = value;
  if (typeof hex === 'object') {
    if (typeof hex.toHexString === 'function') {
      hex = hex.toHexString();
    } else if (typeof hex.toString === 'function') {
      const str = hex.toString();
      if (str.startsWith('0x') || str.startsWith('0X')) {
        hex = str;
      } else {
        try {
          hex = `0x${BigInt(str).toString(16)}`;
        } catch (err) {
          throw new Error(`Unable to normalise ${label || 'value'} to bytes32`);
        }
      }
    }
  }
  if (typeof hex === 'number' || typeof hex === 'bigint') {
    hex = ethers.hexlify(hex);
  }
  if (typeof hex !== 'string') {
    throw new Error(
      `Unsupported ${label || 'value'} type for bytes32 normalisation`,
    );
  }
  const trimmed = hex.trim();
  if (!trimmed) {
    return null;
  }
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!ethers.isHexString(prefixed)) {
    throw new Error(`Value ${prefixed} is not valid hex data`);
  }
  const bytes = ethers.getBytes(prefixed);
  if (bytes.length !== 32) {
    throw new Error(
      `${label || 'value'} must be 32 bytes, received ${bytes.length} bytes`,
    );
  }
  return ethers.hexlify(bytes).toLowerCase();
}

let failureCount = 0;

function logSkip(message) {
  console.log(`- ${message}`);
}

function logOk(message) {
  console.log(`\u2713 ${message}`);
}

function logFail(message) {
  failureCount += 1;
  console.error(`\u2717 ${message}`);
}

function resolveModuleAddress(modules, key) {
  try {
    return normaliseAddress(modules?.[key], { allowZero: false });
  } catch (err) {
    throw new Error(`Invalid address for modules.${key}: ${err.message}`);
  }
}

function resolveExpected(check) {
  if (check.expected === undefined) {
    return undefined;
  }
  return typeof check.expected === 'function'
    ? check.expected()
    : check.expected;
}

function normaliseExpectedValue(value, type, label) {
  if (value === undefined || value === null) {
    return null;
  }
  if (type === 'address') {
    try {
      return (
        normaliseAddress(value)?.toLowerCase() ?? ZERO_ADDRESS.toLowerCase()
      );
    } catch (err) {
      throw new Error(
        `Invalid address for ${label || 'expected value'}: ${err.message}`,
      );
    }
  }
  if (type === 'bytes32') {
    return normaliseBytes32(value, label);
  }
  return value;
}

function normaliseActualValue(value, type) {
  if (type === 'address') {
    return normaliseAddress(value)?.toLowerCase() ?? ZERO_ADDRESS.toLowerCase();
  }
  if (type === 'bytes32') {
    return normaliseBytes32(value);
  }
  return value;
}

async function verifyOwnership(name, contract, allowedOwners, provider) {
  if (!contract || typeof contract.owner !== 'function') {
    logSkip(`${name}: owner() not available`);
    return;
  }
  let ownerAddress;
  try {
    ownerAddress = await withRetry(
      () => contract.owner(),
      `${name}.owner()`,
    );
  } catch (err) {
    logFail(`${name}: failed to read owner() (${errorMessage(err)})`);
    return;
  }
  const normalisedOwner = normaliseAddress(ownerAddress);
  if (!normalisedOwner || normalisedOwner === ZERO_ADDRESS) {
    logFail(`${name}: owner() returned zero address`);
    return;
  }
  const ownerLower = normalisedOwner.toLowerCase();
  if (allowedOwners.size > 0 && !allowedOwners.has(ownerLower)) {
    logFail(
      `${name}: owner ${normalisedOwner} not in allowed set ${Array.from(
        allowedOwners,
      )
        .map((addr) => ethers.getAddress(addr))
        .join(', ')}`,
    );
    return;
  }
  if (provider) {
    try {
      const code = await withRetry(
        () => provider.getCode(normalisedOwner),
        `${name} owner bytecode`,
      );
      if (!code || code === '0x' || code === '0x0') {
        logFail(`${name}: owner ${normalisedOwner} has no bytecode (EOA?)`);
        return;
      }
    } catch (err) {
      logFail(
        `${name}: failed to fetch bytecode for owner ${normalisedOwner} (${errorMessage(
          err,
        )})`,
      );
      return;
    }
  } else {
    logSkip(`${name}: provider unavailable; skipped bytecode check for ${normalisedOwner}`);
  }
  logOk(`${name}: owner ${normalisedOwner}`);
}

async function verifyModule({
  key,
  displayName,
  address,
  checks = [],
  allowedOwners,
  provider,
}) {
  if (!address) {
    logSkip(`${displayName} (${key}) not configured; skipping`);
    return;
  }
  const abi = MODULE_ABIS[key];
  if (!abi) {
    logSkip(`${displayName}: no ABI registered; skipping`);
    return;
  }
  if (!provider) {
    logSkip(`${displayName}: provider unavailable; skipping on-chain checks`);
    return;
  }
  const contract = new ethers.Contract(address, abi, provider);
  for (const check of checks) {
    const expectedRaw = resolveExpected(check);
    if (expectedRaw === undefined) {
      logSkip(`${displayName}.${check.getter}: expected value missing; skipping`);
      continue;
    }
    let expected;
    try {
      expected = normaliseExpectedValue(
        expectedRaw,
        check.type || 'address',
        `${displayName}.${check.label || check.getter}`,
      );
    } catch (err) {
      logFail(err.message);
      continue;
    }
    if (expected === null) {
      logSkip(`${displayName}.${check.getter}: expected value not provided; skipping`);
      continue;
    }
    let actualRaw;
    try {
      actualRaw = await withRetry(
        () => contract[check.getter](),
        `${displayName}.${check.getter}`,
      );
    } catch (err) {
      logFail(
        `${displayName}.${check.getter}: call failed (${errorMessage(err)})`,
      );
      continue;
    }
    let actual;
    try {
      actual = normaliseActualValue(actualRaw, check.type || 'address');
    } catch (err) {
      logFail(
        `${displayName}.${check.getter}: failed to normalise value (${err.message})`,
      );
      continue;
    }
    if (actual !== expected) {
      logFail(
        `${displayName}.${check.getter} => ${actual} (expected ${expected})`,
      );
    } else {
      logOk(`${displayName}.${check.getter} = ${actual}`);
    }
  }

  if (allowedOwners) {
    await verifyOwnership(displayName, contract, allowedOwners, provider);
  }
}

async function main() {
  const { network } = parseArgs(process.argv.slice(2));
  const { config: tokenConfig, path: tokenConfigPath } = loadTokenConfig({
    network,
  });
  const { config: ensConfig, path: ensConfigPath } = loadEnsConfig({
    network,
    persist: false,
  });

  console.log(
    `Loaded token config from ${tokenConfigPath}${
      network ? ` for ${network}` : ''
    }`,
  );
  console.log(`Loaded ENS config from ${ensConfigPath}`);

  const modules = tokenConfig.modules || tokenConfig.contracts || {};
  const governance = tokenConfig.governance || tokenConfig.owners || {};
  const allowedOwners = new Set();

  const govSafe =
    normaliseAddress(governance.govSafe, { allowZero: false }) ||
    normaliseAddress(process.env.GOV_SAFE, { allowZero: false });
  if (govSafe) {
    allowedOwners.add(govSafe.toLowerCase());
  }
  const timelock =
    normaliseAddress(governance.timelock, { allowZero: false }) ||
    normaliseAddress(process.env.TIMELOCK_ADDR, { allowZero: false });
  if (timelock) {
    allowedOwners.add(timelock.toLowerCase());
  }

  let provider = null;
  const rpcUrl = resolveRpcUrl(network);
  if (rpcUrl) {
    try {
      provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
        batchMaxCount: 1,
      });
      await withRetry(() => provider.getBlockNumber(), 'initial RPC handshake', {
        attempts: 3,
        onError: (err) => {
          console.warn(
            `RPC handshake failed (${errorMessage(err)}); falling back to offline mode`,
          );
        },
      });
    } catch (err) {
      console.warn(
        `Unable to connect to RPC at ${rpcUrl} (${errorMessage(
          err,
        )}); running in offline mode.`,
      );
      provider = null;
    }
  } else {
    console.log('No RPC URL configured; running in offline mode.');
  }

  const systemPauseAddress = resolveModuleAddress(modules, 'systemPause');
  if (systemPauseAddress) {
    allowedOwners.add(systemPauseAddress.toLowerCase());
  }

  const moduleList = [
    {
      key: 'systemPause',
      displayName: 'SystemPause',
      address: systemPauseAddress,
      allowedOwners,
      checks: [
        {
          getter: 'jobRegistry',
          expected: () => resolveModuleAddress(modules, 'jobRegistry'),
        },
        {
          getter: 'stakeManager',
          expected: () => resolveModuleAddress(modules, 'stakeManager'),
        },
        {
          getter: 'validationModule',
          expected: () => resolveModuleAddress(modules, 'validationModule'),
        },
        {
          getter: 'disputeModule',
          expected: () => resolveModuleAddress(modules, 'disputeModule'),
        },
        {
          getter: 'platformRegistry',
          expected: () => resolveModuleAddress(modules, 'platformRegistry'),
        },
        {
          getter: 'feePool',
          expected: () => resolveModuleAddress(modules, 'feePool'),
        },
        {
          getter: 'reputationEngine',
          expected: () => resolveModuleAddress(modules, 'reputationEngine'),
        },
        {
          getter: 'arbitratorCommittee',
          expected: () => resolveModuleAddress(modules, 'arbitratorCommittee'),
        },
      ],
    },
    {
      key: 'stakeManager',
      displayName: 'StakeManager',
      address: resolveModuleAddress(modules, 'stakeManager'),
      allowedOwners,
      checks: [
        {
          getter: 'jobRegistry',
          expected: () => resolveModuleAddress(modules, 'jobRegistry'),
        },
        {
          getter: 'disputeModule',
          expected: () => resolveModuleAddress(modules, 'disputeModule'),
        },
        {
          getter: 'validationModule',
          expected: () => resolveModuleAddress(modules, 'validationModule'),
        },
        {
          getter: 'feePool',
          expected: () => resolveModuleAddress(modules, 'feePool'),
        },
      ],
    },
    {
      key: 'jobRegistry',
      displayName: 'JobRegistry',
      address: resolveModuleAddress(modules, 'jobRegistry'),
      allowedOwners,
      checks: [
        {
          getter: 'stakeManager',
          expected: () => resolveModuleAddress(modules, 'stakeManager'),
        },
        {
          getter: 'validationModule',
          expected: () => resolveModuleAddress(modules, 'validationModule'),
        },
        {
          getter: 'reputationEngine',
          expected: () => resolveModuleAddress(modules, 'reputationEngine'),
        },
        {
          getter: 'disputeModule',
          expected: () => resolveModuleAddress(modules, 'disputeModule'),
        },
        {
          getter: 'certificateNFT',
          expected: () => resolveModuleAddress(modules, 'certificateNFT'),
        },
        {
          getter: 'taxPolicy',
          expected: () => resolveModuleAddress(modules, 'taxPolicy'),
        },
        {
          getter: 'feePool',
          expected: () => resolveModuleAddress(modules, 'feePool'),
        },
        {
          getter: 'identityRegistry',
          expected: () => resolveModuleAddress(modules, 'identityRegistry'),
        },
      ],
    },
    {
      key: 'validationModule',
      displayName: 'ValidationModule',
      address: resolveModuleAddress(modules, 'validationModule'),
      allowedOwners,
      checks: [
        {
          getter: 'jobRegistry',
          expected: () => resolveModuleAddress(modules, 'jobRegistry'),
        },
        {
          getter: 'stakeManager',
          expected: () => resolveModuleAddress(modules, 'stakeManager'),
        },
        {
          getter: 'identityRegistry',
          expected: () => resolveModuleAddress(modules, 'identityRegistry'),
        },
        {
          getter: 'reputationEngine',
          expected: () => resolveModuleAddress(modules, 'reputationEngine'),
        },
      ],
    },
    {
      key: 'reputationEngine',
      displayName: 'ReputationEngine',
      address: resolveModuleAddress(modules, 'reputationEngine'),
      allowedOwners,
      checks: [
        {
          getter: 'stakeManager',
          expected: () => resolveModuleAddress(modules, 'stakeManager'),
        },
      ],
    },
    {
      key: 'disputeModule',
      displayName: 'DisputeModule',
      address: resolveModuleAddress(modules, 'disputeModule'),
      allowedOwners,
      checks: [
        {
          getter: 'jobRegistry',
          expected: () => resolveModuleAddress(modules, 'jobRegistry'),
        },
        {
          getter: 'stakeManager',
          expected: () => resolveModuleAddress(modules, 'stakeManager'),
        },
        {
          getter: 'committee',
          expected: () => resolveModuleAddress(modules, 'arbitratorCommittee'),
        },
      ],
    },
    {
      key: 'arbitratorCommittee',
      displayName: 'ArbitratorCommittee',
      address: resolveModuleAddress(modules, 'arbitratorCommittee'),
      allowedOwners,
      checks: [
        {
          getter: 'jobRegistry',
          expected: () => resolveModuleAddress(modules, 'jobRegistry'),
        },
        {
          getter: 'disputeModule',
          expected: () => resolveModuleAddress(modules, 'disputeModule'),
        },
      ],
    },
    {
      key: 'certificateNFT',
      displayName: 'CertificateNFT',
      address: resolveModuleAddress(modules, 'certificateNFT'),
      allowedOwners,
      checks: [
        {
          getter: 'jobRegistry',
          expected: () => resolveModuleAddress(modules, 'jobRegistry'),
        },
        {
          getter: 'stakeManager',
          expected: () => resolveModuleAddress(modules, 'stakeManager'),
        },
      ],
    },
    {
      key: 'taxPolicy',
      displayName: 'TaxPolicy',
      address: resolveModuleAddress(modules, 'taxPolicy'),
      allowedOwners,
    },
    {
      key: 'feePool',
      displayName: 'FeePool',
      address: resolveModuleAddress(modules, 'feePool'),
      allowedOwners,
      checks: [
        {
          getter: 'stakeManager',
          expected: () => resolveModuleAddress(modules, 'stakeManager'),
        },
        {
          getter: 'taxPolicy',
          expected: () => resolveModuleAddress(modules, 'taxPolicy'),
        },
      ],
    },
    {
      key: 'platformRegistry',
      displayName: 'PlatformRegistry',
      address: resolveModuleAddress(modules, 'platformRegistry'),
      allowedOwners,
      checks: [
        {
          getter: 'stakeManager',
          expected: () => resolveModuleAddress(modules, 'stakeManager'),
        },
        {
          getter: 'reputationEngine',
          expected: () => resolveModuleAddress(modules, 'reputationEngine'),
        },
      ],
    },
    {
      key: 'jobRouter',
      displayName: 'JobRouter',
      address: resolveModuleAddress(modules, 'jobRouter'),
      allowedOwners,
      checks: [
        {
          getter: 'platformRegistry',
          expected: () => resolveModuleAddress(modules, 'platformRegistry'),
        },
      ],
    },
    {
      key: 'platformIncentives',
      displayName: 'PlatformIncentives',
      address: resolveModuleAddress(modules, 'platformIncentives'),
      allowedOwners,
      checks: [
        {
          getter: 'stakeManager',
          expected: () => resolveModuleAddress(modules, 'stakeManager'),
        },
        {
          getter: 'platformRegistry',
          expected: () => resolveModuleAddress(modules, 'platformRegistry'),
        },
        {
          getter: 'jobRouter',
          expected: () => resolveModuleAddress(modules, 'jobRouter'),
        },
      ],
    },
    {
      key: 'identityRegistry',
      displayName: 'IdentityRegistry',
      address: resolveModuleAddress(modules, 'identityRegistry'),
      allowedOwners,
      checks: [
        {
          getter: 'reputationEngine',
          expected: () => resolveModuleAddress(modules, 'reputationEngine'),
        },
        {
          getter: 'attestationRegistry',
          expected: () => resolveModuleAddress(modules, 'attestationRegistry'),
        },
        {
          getter: 'ens',
          expected: () => normaliseAddress(ensConfig.registry),
        },
        {
          getter: 'nameWrapper',
          expected: () => normaliseAddress(ensConfig.nameWrapper),
        },
        {
          getter: 'agentRootNode',
          type: 'bytes32',
          expected: () => ensConfig.roots?.agent?.node ?? ZERO_HASH,
        },
        {
          getter: 'clubRootNode',
          type: 'bytes32',
          expected: () => ensConfig.roots?.club?.node ?? ZERO_HASH,
        },
        {
          getter: 'agentMerkleRoot',
          type: 'bytes32',
          expected: () => ensConfig.roots?.agent?.merkleRoot ?? ZERO_HASH,
        },
        {
          getter: 'validatorMerkleRoot',
          type: 'bytes32',
          expected: () => ensConfig.roots?.club?.merkleRoot ?? ZERO_HASH,
        },
      ],
    },
    {
      key: 'attestationRegistry',
      displayName: 'AttestationRegistry',
      address: resolveModuleAddress(modules, 'attestationRegistry'),
      allowedOwners,
      checks: [
        {
          getter: 'ens',
          expected: () => normaliseAddress(ensConfig.registry),
        },
        {
          getter: 'nameWrapper',
          expected: () => normaliseAddress(ensConfig.nameWrapper),
        },
      ],
    },
  ];

  for (const moduleEntry of moduleList) {
    const ownerSet = moduleEntry.allowedOwners
      ? new Set(moduleEntry.allowedOwners)
      : new Set(allowedOwners);
    await verifyModule({
      ...moduleEntry,
      allowedOwners: ownerSet,
      provider,
    });
  }

  const stakeManagerAddress = resolveModuleAddress(modules, 'stakeManager');
  if (stakeManagerAddress && provider) {
    try {
      const stakeManager = new ethers.Contract(
        stakeManagerAddress,
        MODULE_ABIS.stakeManager,
        provider,
      );
      const stakeToken = await withRetry(
        () => stakeManager.token(),
        'StakeManager.token',
      );
      const chainId = await withRetry(
        () => provider.getNetwork().then((net) => net.chainId),
        'provider.getNetwork',
      );
      if (Number(chainId) === 1) {
        if (!eqAddress(stakeToken, AGIALPHA)) {
          logFail(
            `StakeManager.token mismatch on mainnet (expected ${AGIALPHA}, got ${stakeToken})`,
          );
        } else {
          logOk(`StakeManager.token matches canonical AGIALPHA ${AGIALPHA}`);
        }
      }
    } catch (err) {
      logFail(`Failed to verify StakeManager token: ${errorMessage(err)}`);
    }
  } else if (!provider) {
    logSkip('Skipping StakeManager token check; provider unavailable.');
  }

  if (failureCount > 0) {
    throw new Error(`${failureCount} wiring checks failed`);
  }
  console.log('All module wiring checks passed.');
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exitCode = 1;
});
