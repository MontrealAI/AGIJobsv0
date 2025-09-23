const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const CONFIG_DIR = path.join(__dirname, '..', '..', 'config');

const MAX_UINT96 = (1n << 96n) - 1n;

const NETWORK_ALIASES = new Map([
  ['mainnet', 'mainnet'],
  ['homestead', 'mainnet'],
  ['ethereum', 'mainnet'],
  ['l1', 'mainnet'],
  ['1', 'mainnet'],
  ['0x1', 'mainnet'],
  ['sepolia', 'sepolia'],
  ['sep', 'sepolia'],
  ['11155111', 'sepolia'],
  ['0xaa36a7', 'sepolia'],
]);

const DEFAULT_ENS_NAMES = {
  agent: 'agent.agi.eth',
  club: 'club.agi.eth',
  business: 'a.agi.eth',
};

function inferNetworkKey(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'object') {
    const maybeName = inferNetworkKey(value.name ?? value.network);
    if (maybeName) return maybeName;
    if (value.chainId !== undefined) {
      return inferNetworkKey(String(value.chainId));
    }
  }
  const raw = String(value).trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (NETWORK_ALIASES.has(lower)) {
    return NETWORK_ALIASES.get(lower);
  }
  if (lower.startsWith('0x')) {
    try {
      const numeric = BigInt(lower).toString();
      if (NETWORK_ALIASES.has(numeric)) {
        return NETWORK_ALIASES.get(numeric);
      }
    } catch (_) {}
  }
  return undefined;
}

function resolveNetwork(options = {}) {
  return (
    inferNetworkKey(options.network) ||
    inferNetworkKey(options.chainId) ||
    inferNetworkKey(options.name) ||
    inferNetworkKey(options.context) ||
    inferNetworkKey(process.env.AGJ_NETWORK) ||
    inferNetworkKey(process.env.AGIALPHA_NETWORK) ||
    inferNetworkKey(process.env.NETWORK) ||
    inferNetworkKey(process.env.HARDHAT_NETWORK) ||
    inferNetworkKey(process.env.TRUFFLE_NETWORK) ||
    inferNetworkKey(process.env.CHAIN_ID)
  );
}

function ensureAddress(value, label, { allowZero = false } = {}) {
  if (value === undefined || value === null) {
    if (allowZero) return ethers.ZeroAddress;
    throw new Error(`${label} is not configured`);
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    if (allowZero) return ethers.ZeroAddress;
    throw new Error(`${label} is not configured`);
  }
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  const address = ethers.getAddress(prefixed);
  if (!allowZero && address === ethers.ZeroAddress) {
    throw new Error(`${label} cannot be the zero address`);
  }
  return address;
}

function ensureBytes32(value) {
  if (value === undefined || value === null) {
    return ethers.ZeroHash;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return ethers.ZeroHash;
  }
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!ethers.isHexString(prefixed)) {
    throw new Error(`Value ${value} is not valid hex data`);
  }
  const bytes = ethers.getBytes(prefixed);
  if (bytes.length !== 32) {
    throw new Error(`Expected 32-byte value, got ${bytes.length} bytes`);
  }
  return ethers.hexlify(prefixed);
}

function normaliseLabel(value, fallback) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed) {
    return trimmed.toLowerCase();
  }
  if (fallback) {
    return String(fallback).toLowerCase();
  }
  throw new Error('ENS root label is missing');
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function findConfigPath(baseName, network) {
  const base = path.join(CONFIG_DIR, `${baseName}.json`);
  if (network) {
    const candidate = path.join(CONFIG_DIR, `${baseName}.${network}.json`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return base;
}

function loadTokenConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('agialpha', network);
  const config = readJson(configPath);
  return { config, path: configPath, network };
}

function normaliseJobRegistryConfig(config = {}) {
  const result = { ...config };

  if (result.treasury !== undefined) {
    result.treasury = ensureAddress(result.treasury, 'JobRegistry treasury', {
      allowZero: true,
    });
  }

  if (result.taxPolicy !== undefined) {
    const allowZero = result.taxPolicy === null || result.taxPolicy === '';
    result.taxPolicy = allowZero
      ? ethers.ZeroAddress
      : ensureAddress(result.taxPolicy, 'JobRegistry tax policy');
  }

  if (result.jobStake !== undefined) {
    const raw = BigInt(result.jobStake);
    if (raw < 0n || raw > MAX_UINT96) {
      throw new Error('jobStake must be between 0 and 2^96-1');
    }
    result.jobStake = raw.toString();
  }

  if (result.minAgentStake !== undefined) {
    const raw = BigInt(result.minAgentStake);
    if (raw < 0n || raw > MAX_UINT96) {
      throw new Error('minAgentStake must be between 0 and 2^96-1');
    }
    result.minAgentStake = raw.toString();
  }

  if (result.acknowledgers && typeof result.acknowledgers === 'object') {
    const mapped = {};
    for (const [key, value] of Object.entries(result.acknowledgers)) {
      if (value === undefined || value === null) continue;
      const address = ensureAddress(key, `acknowledger ${key}`);
      mapped[address] = Boolean(value);
    }
    result.acknowledgers = mapped;
  }

  return result;
}

function loadJobRegistryConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('job-registry', network);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Job registry config not found at ${configPath}`);
  }
  const config = normaliseJobRegistryConfig(readJson(configPath));
  return { config, path: configPath, network };
}

function normaliseStakeManagerConfig(config = {}) {
  const result = { ...config };

  const addressKeys = [
    'treasury',
    'pauser',
    'jobRegistry',
    'disputeModule',
    'validationModule',
    'thermostat',
    'hamiltonianFeed',
    'feePool',
  ];

  for (const key of addressKeys) {
    if (result[key] !== undefined) {
      const value = result[key];
      if (value === null) {
        result[key] = ethers.ZeroAddress;
      } else {
        result[key] = ensureAddress(value, `StakeManager ${key}`, {
          allowZero: true,
        });
      }
    }
  }

  if (result.treasuryAllowlist && typeof result.treasuryAllowlist === 'object') {
    const mapped = {};
    for (const [key, value] of Object.entries(result.treasuryAllowlist)) {
      if (value === undefined || value === null) continue;
      const address = ensureAddress(key, `treasuryAllowlist ${key}`);
      mapped[address] = Boolean(value);
    }
    result.treasuryAllowlist = mapped;
  }

  if (result.autoStake && typeof result.autoStake === 'object') {
    result.autoStake = { ...result.autoStake };
  }

  if (result.stakeRecommendations && typeof result.stakeRecommendations === 'object') {
    result.stakeRecommendations = { ...result.stakeRecommendations };
  }

  return result;
}

function loadStakeManagerConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('stake-manager', network);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Stake manager config not found at ${configPath}`);
  }
  const config = normaliseStakeManagerConfig(readJson(configPath));
  return { config, path: configPath, network };
}

function normaliseFeePoolConfig(config = {}) {
  const result = { ...config };

  const addressKeys = [
    'stakeManager',
    'treasury',
    'governance',
    'pauser',
    'taxPolicy',
  ];

  for (const key of addressKeys) {
    if (result[key] !== undefined) {
      const value = result[key];
      if (value === null) {
        result[key] = ethers.ZeroAddress;
      } else {
        result[key] = ensureAddress(value, `FeePool ${key}`, {
          allowZero: true,
        });
      }
    }
  }

  if (result.treasuryAllowlist && typeof result.treasuryAllowlist === 'object') {
    const mapped = {};
    for (const [key, value] of Object.entries(result.treasuryAllowlist)) {
      if (value === undefined || value === null) continue;
      const address = ensureAddress(key, `treasuryAllowlist ${key}`, {
        allowZero: true,
      });
      mapped[address] = Boolean(value);
    }
    result.treasuryAllowlist = mapped;
  }

  if (result.rewarders && typeof result.rewarders === 'object') {
    const mapped = {};
    for (const [key, value] of Object.entries(result.rewarders)) {
      if (value === undefined || value === null) continue;
      const address = ensureAddress(key, `rewarder ${key}`, { allowZero: false });
      mapped[address] = Boolean(value);
    }
    result.rewarders = mapped;
  }

  if (result.rewardRole !== undefined && result.rewardRole !== null) {
    result.rewardRole = String(result.rewardRole).trim();
  }

  return result;
}

function loadFeePoolConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('fee-pool', network);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Fee pool config not found at ${configPath}`);
  }
  const config = normaliseFeePoolConfig(readJson(configPath));
  return { config, path: configPath, network };
}

function normalisePlatformIncentivesConfig(config = {}) {
  const result = { ...config };

  const addressKeys = [
    'address',
    'stakeManager',
    'platformRegistry',
    'jobRouter',
  ];

  for (const key of addressKeys) {
    if (result[key] !== undefined) {
      const value = result[key];
      if (value === null) {
        if (key === 'address') {
          throw new Error('PlatformIncentives address cannot be null');
        }
        result[key] = ethers.ZeroAddress;
      } else {
        result[key] = ensureAddress(value, `PlatformIncentives ${key}`, {
          allowZero: key !== 'address',
        });
      }
    }
  }

  return result;
}

function loadPlatformIncentivesConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('platform-incentives', network);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Platform incentives config not found at ${configPath}`);
  }
  const config = normalisePlatformIncentivesConfig(readJson(configPath));
  return { config, path: configPath, network };
}

function normaliseTaxPolicyConfig(config = {}) {
  const result = { ...config };

  if (result.address !== undefined) {
    const value = result.address;
    if (value === null) {
      throw new Error('TaxPolicy address cannot be null');
    }
    result.address = ensureAddress(value, 'TaxPolicy address');
  }

  if (result.policyURI !== undefined && result.policyURI !== null) {
    result.policyURI = String(result.policyURI);
  }

  if (result.acknowledgement !== undefined && result.acknowledgement !== null) {
    result.acknowledgement = String(result.acknowledgement);
  }

  if (result.bumpVersion !== undefined) {
    result.bumpVersion = Boolean(result.bumpVersion);
  }

  if (result.acknowledgers && typeof result.acknowledgers === 'object') {
    const mapped = {};
    for (const [key, value] of Object.entries(result.acknowledgers)) {
      if (value === undefined || value === null) continue;
      const address = ensureAddress(key, `TaxPolicy acknowledger ${key}`, {
        allowZero: false,
      });
      mapped[address] = Boolean(value);
    }
    result.acknowledgers = mapped;
  }

  return result;
}

function loadTaxPolicyConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('tax-policy', network);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Tax policy config not found at ${configPath}`);
  }
  const config = normaliseTaxPolicyConfig(readJson(configPath));
  return { config, path: configPath, network };
}

function normaliseThermodynamicsConfig(config = {}) {
  const result = { ...config };

  if (result.rewardEngine && typeof result.rewardEngine === 'object') {
    const reward = { ...result.rewardEngine };

    if (reward.address !== undefined) {
      reward.address = ensureAddress(reward.address, 'RewardEngine address');
    }

    if (reward.treasury !== undefined) {
      reward.treasury = ensureAddress(reward.treasury, 'RewardEngine treasury', {
        allowZero: true,
      });
    }

    if (reward.thermostat !== undefined) {
      const allowZero = reward.thermostat === null || reward.thermostat === '';
      reward.thermostat = allowZero
        ? ethers.ZeroAddress
        : ensureAddress(reward.thermostat, 'RewardEngine thermostat', {
            allowZero: true,
          });
    }

    if (reward.settlers && typeof reward.settlers === 'object') {
      const mapped = {};
      for (const [key, value] of Object.entries(reward.settlers)) {
        if (value === undefined || value === null) continue;
        const address = ensureAddress(key, `RewardEngine settler ${key}`);
        mapped[address] = Boolean(value);
      }
      reward.settlers = mapped;
    }

    result.rewardEngine = reward;
  }

  if (result.thermostat && typeof result.thermostat === 'object') {
    const thermo = { ...result.thermostat };

    if (thermo.address !== undefined) {
      const allowZero = thermo.address === null || thermo.address === '';
      thermo.address = allowZero
        ? ethers.ZeroAddress
        : ensureAddress(thermo.address, 'Thermostat address', {
            allowZero: true,
          });
    }

    if (thermo.roleTemperatures && typeof thermo.roleTemperatures === 'object') {
      const mapped = {};
      for (const [key, value] of Object.entries(thermo.roleTemperatures)) {
        mapped[key] = value;
      }
      thermo.roleTemperatures = mapped;
    }

    result.thermostat = thermo;
  }

  return result;
}

function loadThermodynamicsConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('thermodynamics', network);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Thermodynamics config not found at ${configPath}`);
  }
  const config = normaliseThermodynamicsConfig(readJson(configPath));
  return { config, path: configPath, network };
}

function normaliseRootEntry(key, root) {
  const result = { ...root };
  let changed = false;

  const defaultLabel = key === 'business' ? 'a' : key;
  const label = normaliseLabel(root?.label, defaultLabel);
  if (result.label !== label) {
    result.label = label;
    changed = true;
  }

  const defaultName = DEFAULT_ENS_NAMES[key] || result.name;
  const nameCandidate = typeof root?.name === 'string' ? root.name.trim().toLowerCase() : '';
  const name = nameCandidate || (defaultName ? defaultName.toLowerCase() : `${label}.agi.eth`);
  if (result.name !== name) {
    result.name = name;
    changed = true;
  }

  const labelhash = ethers.id(label);
  if (!result.labelhash || result.labelhash.toLowerCase() !== labelhash.toLowerCase()) {
    result.labelhash = labelhash;
    changed = true;
  }

  const node = ethers.namehash(name);
  if (!result.node || result.node.toLowerCase() !== node.toLowerCase()) {
    result.node = node;
    changed = true;
  }

  const merkleRoot = ensureBytes32(root?.merkleRoot);
  if (!result.merkleRoot || result.merkleRoot.toLowerCase() !== merkleRoot.toLowerCase()) {
    result.merkleRoot = merkleRoot;
    changed = true;
  }

  if (root?.resolver !== undefined) {
    const resolver = ensureAddress(root.resolver, `${key} resolver`, { allowZero: true });
    if (!result.resolver || result.resolver.toLowerCase() !== resolver.toLowerCase()) {
      result.resolver = resolver;
      changed = true;
    }
  }

  const defaultRole =
    root?.role || (key === 'club' ? 'validator' : key === 'business' ? 'business' : 'agent');
  if (result.role !== defaultRole) {
    result.role = defaultRole;
    changed = true;
  }

  return { root: result, changed };
}

function normaliseEnsConfig(config) {
  const updated = { ...config };
  let changed = false;

  if (updated.registry) {
    const normalised = ensureAddress(updated.registry, 'ENS registry');
    if (updated.registry !== normalised) {
      updated.registry = normalised;
      changed = true;
    }
  }
  if (updated.nameWrapper) {
    const normalised = ensureAddress(updated.nameWrapper, 'ENS NameWrapper', { allowZero: true });
    if (updated.nameWrapper !== normalised) {
      updated.nameWrapper = normalised;
      changed = true;
    }
  }
  if (updated.reverseRegistrar) {
    const normalised = ensureAddress(updated.reverseRegistrar, 'ENS reverse registrar', {
      allowZero: true,
    });
    if (updated.reverseRegistrar !== normalised) {
      updated.reverseRegistrar = normalised;
      changed = true;
    }
  }

  if (!updated.roots || typeof updated.roots !== 'object') {
    updated.roots = {};
  }

  for (const [key, value] of Object.entries(updated.roots)) {
    const { root, changed: rootChanged } = normaliseRootEntry(key, value || {});
    if (rootChanged) {
      updated.roots[key] = root;
      changed = true;
    }
  }

  return { config: updated, changed };
}

function loadEnsConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = findConfigPath('ens', network);
  const rawConfig = readJson(configPath);
  const { config, changed } = normaliseEnsConfig(rawConfig);
  const persist = options.persist !== false;
  if (changed && persist) {
    writeJson(configPath, config);
  }
  return { config, path: configPath, network, updated: Boolean(changed && persist) };
}

module.exports = {
  loadTokenConfig,
  loadEnsConfig,
  loadJobRegistryConfig,
  loadStakeManagerConfig,
  loadFeePoolConfig,
  loadPlatformIncentivesConfig,
  loadTaxPolicyConfig,
  loadThermodynamicsConfig,
  inferNetworkKey,
};
