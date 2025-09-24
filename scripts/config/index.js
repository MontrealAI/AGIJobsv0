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

function normaliseEnsName(value, label) {
  if (value === undefined || value === null) {
    throw new Error(`${label} ENS name is missing`);
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    throw new Error(`${label} ENS name is empty`);
  }
  return ethers.namehash.normalize(trimmed);
}

function computeNamehash(value, label) {
  const normalised = normaliseEnsName(value, label);
  return {
    name: normalised,
    node: ethers.namehash(normalised),
  };
}

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

function normaliseAliasEntry(value, label) {
  if (value === undefined || value === null) {
    throw new Error(`${label} alias entry is undefined`);
  }

  if (typeof value === 'string') {
    const { name, node } = computeNamehash(value, label);
    const [labelPart] = name.split('.');
    return {
      name,
      node,
      label: labelPart || label,
      labelhash: ethers.id(labelPart || label),
    };
  }

  if (typeof value !== 'object') {
    throw new Error(`${label} alias entry must be a string or object`);
  }

  const alias = { ...value };
  let updated = false;

  if (alias.name) {
    const normalisedName = normaliseEnsName(alias.name, label);
    if (alias.name !== normalisedName) {
      alias.name = normalisedName;
      updated = true;
    }
  }

  if (!alias.node && alias.name) {
    alias.node = ethers.namehash(alias.name);
    updated = true;
  }

  if (!alias.node) {
    throw new Error(`${label} alias is missing a namehash`);
  }

  const node = ensureBytes32(alias.node);
  if (alias.node !== node) {
    alias.node = node;
    updated = true;
  }

  const labelName = alias.label || (alias.name ? alias.name.split('.')[0] : undefined);
  if (labelName) {
    const normalisedLabel = normaliseLabel(labelName, labelName);
    if (alias.label !== normalisedLabel) {
      alias.label = normalisedLabel;
      updated = true;
    }
    const labelhash = ethers.id(normalisedLabel);
    if (!alias.labelhash || alias.labelhash.toLowerCase() !== labelhash.toLowerCase()) {
      alias.labelhash = labelhash;
      updated = true;
    }
  }

  return { alias, changed: updated };
}

function normaliseIdentityRoot(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    if (ethers.isHexString(value)) {
      return { node: ensureBytes32(value) };
    }
    const { name, node } = computeNamehash(value, label);
    return { name, node };
  }

  if (typeof value !== 'object') {
    throw new Error(`${label} root must be a string or object`);
  }

  const root = { ...value };

  if (root.name) {
    root.name = normaliseEnsName(root.name, label);
  }

  if (!root.node && root.name) {
    root.node = ethers.namehash(root.name);
  }

  if (root.node) {
    root.node = ensureBytes32(root.node);
  }

  const aliases = Array.isArray(root.aliases)
    ? root.aliases
    : root.alias
    ? [root.alias]
    : [];

  if (aliases.length > 0) {
    root.aliases = aliases.map((entry, index) =>
      normaliseAliasEntry(entry, `${label} alias[${index}]`).alias
    );
  }

  return root;
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
  let source = root;
  if (typeof root === 'string') {
    const { name, node } = computeNamehash(root, `${key} root`);
    source = { name, node };
  }

  const result = { ...(source || {}) };
  let changed = false;

  const defaultLabel = key === 'business' ? 'a' : key;
  const label = normaliseLabel(source?.label, defaultLabel);
  if (result.label !== label) {
    result.label = label;
    changed = true;
  }

  const defaultName = DEFAULT_ENS_NAMES[key] || result.name;
  let nameCandidate = '';
  if (typeof source?.name === 'string') {
    nameCandidate = source.name.trim().toLowerCase();
  } else if (typeof source?.ens === 'string') {
    nameCandidate = source.ens.trim().toLowerCase();
  }
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

  const merkleRoot = ensureBytes32(source?.merkleRoot);
  if (!result.merkleRoot || result.merkleRoot.toLowerCase() !== merkleRoot.toLowerCase()) {
    result.merkleRoot = merkleRoot;
    changed = true;
  }

  if (source?.resolver !== undefined) {
    const resolver = ensureAddress(source.resolver, `${key} resolver`, { allowZero: true });
    if (!result.resolver || result.resolver.toLowerCase() !== resolver.toLowerCase()) {
      result.resolver = resolver;
      changed = true;
    }
  }

  const defaultRole =
    source?.role || (key === 'club' ? 'validator' : key === 'business' ? 'business' : 'agent');
  if (result.role !== defaultRole) {
    result.role = defaultRole;
    changed = true;
  }

  const aliasInput = Array.isArray(source?.aliases)
    ? source.aliases
    : source?.alias
    ? [source.alias]
    : [];

  if (aliasInput.length > 0 || (Array.isArray(result.aliases) && result.aliases.length > 0)) {
    const normalisedAliases = [];
    let aliasChanged = false;
    for (let i = 0; i < aliasInput.length; i += 1) {
      const { alias, changed: entryChanged } = normaliseAliasEntry(
        aliasInput[i],
        `${key} alias[${i}]`
      );
      normalisedAliases.push(alias);
      if (entryChanged) {
        aliasChanged = true;
      }
    }

    const previous = Array.isArray(result.aliases) ? result.aliases : [];
    const previousNodes = previous.map((entry) => ensureBytes32(entry.node).toLowerCase());
    const nextNodes = normalisedAliases.map((entry) =>
      ensureBytes32(entry.node).toLowerCase()
    );

    if (previousNodes.length !== nextNodes.length) {
      aliasChanged = true;
    } else {
      for (let i = 0; i < nextNodes.length; i += 1) {
        if (previousNodes[i] !== nextNodes[i]) {
          aliasChanged = true;
          break;
        }
      }
    }

    if (aliasChanged) {
      result.aliases = normalisedAliases;
      changed = true;
    } else if (normalisedAliases.length > 0 && !result.aliases) {
      result.aliases = normalisedAliases;
    }
  }

  return { root: result, changed };
}

function normaliseEnsConfig(config) {
  const updated = { ...config };
  let changed = false;

  if (!updated.roots || typeof updated.roots !== 'object') {
    updated.roots = {};
  }

  for (const legacyKey of Object.keys(updated)) {
    if (['agent', 'club', 'business'].includes(legacyKey) && !updated.roots[legacyKey]) {
      updated.roots[legacyKey] = updated[legacyKey];
      delete updated[legacyKey];
      changed = true;
    }
  }

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

function normaliseAddressBooleanMap(value, label, { allowZero = false } = {}) {
  const result = {};
  if (!value || typeof value !== 'object') {
    return result;
  }
  for (const [key, enabled] of Object.entries(value)) {
    if (enabled === undefined || enabled === null) continue;
    const address = ensureAddress(key, `${label} ${key}`, { allowZero });
    result[address] = Boolean(enabled);
  }
  return result;
}

function normaliseAgentType(value, label) {
  if (value === undefined || value === null) {
    throw new Error(`${label} agent type is undefined`);
  }
  if (typeof value === 'number') {
    if (value !== 0 && value !== 1) {
      throw new Error(`${label} agent type must be 0 (Human) or 1 (AI)`);
    }
    return { value, label: value === 1 ? 'AI' : 'Human' };
  }
  const raw = String(value).trim().toLowerCase();
  if (raw === '0' || raw === 'human') {
    return { value: 0, label: 'Human' };
  }
  if (raw === '1' || raw === 'ai' || raw === 'machine') {
    return { value: 1, label: 'AI' };
  }
  throw new Error(
    `${label} agent type must be one of: 0, 1, "human", "ai", "machine"`
  );
}

function normaliseAgentTypeMap(value) {
  const result = {};
  if (!value || typeof value !== 'object') {
    return result;
  }
  for (const [key, typeValue] of Object.entries(value)) {
    if (typeValue === undefined || typeValue === null) continue;
    const address = ensureAddress(key, `agentType ${key}`);
    result[address] = normaliseAgentType(typeValue, `agentType ${key}`);
  }
  return result;
}

function normaliseAliasArray(value, label) {
  if (value === undefined || value === null) {
    return [];
  }
  const list = Array.isArray(value) ? value : [value];
  return list.map((entry, index) =>
    normaliseAliasEntry(entry, `${label}[${index}]`).alias
  );
}

function mergeAliasSets(primary = [], secondary = []) {
  const deduped = new Map();
  for (const entry of [...primary, ...secondary]) {
    if (!entry || !entry.node) continue;
    const key = ensureBytes32(entry.node).toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, {
        ...entry,
        node: ensureBytes32(entry.node),
      });
    }
  }
  return Array.from(deduped.values());
}

function normaliseIdentityRegistryConfig(config = {}) {
  const result = { ...config };

  if (result.address !== undefined) {
    const allowZero =
      result.address === null ||
      result.address === '' ||
      result.address === ethers.ZeroAddress;
    result.address = allowZero
      ? ethers.ZeroAddress
      : ensureAddress(result.address, 'IdentityRegistry address');
  }

  if (!result.ens || typeof result.ens !== 'object') {
    result.ens = {};
  } else {
    result.ens = { ...result.ens };
  }

  if (result.ens.registry !== undefined) {
    result.ens.registry = ensureAddress(
      result.ens.registry,
      'IdentityRegistry ENS registry'
    );
  }

  if (result.ens.nameWrapper !== undefined) {
    result.ens.nameWrapper = ensureAddress(
      result.ens.nameWrapper,
      'IdentityRegistry NameWrapper'
    );
  }

  const agentRoot = normaliseIdentityRoot(
    result.ens.agentRoot,
    'IdentityRegistry agentRoot'
  );
  const clubRoot = normaliseIdentityRoot(
    result.ens.clubRoot,
    'IdentityRegistry clubRoot'
  );

  const agentAliases = normaliseAliasArray(
    result.ens.agentAliases,
    'IdentityRegistry agentAliases'
  );
  const clubAliases = normaliseAliasArray(
    result.ens.clubAliases,
    'IdentityRegistry clubAliases'
  );

  if (agentRoot) {
    agentRoot.aliases = mergeAliasSets(agentRoot.aliases, agentAliases);
    result.ens.agentRoot = agentRoot;
  } else if (agentAliases.length > 0) {
    result.ens.agentAliases = agentAliases;
  }

  if (clubRoot) {
    clubRoot.aliases = mergeAliasSets(clubRoot.aliases, clubAliases);
    result.ens.clubRoot = clubRoot;
  } else if (clubAliases.length > 0) {
    result.ens.clubAliases = clubAliases;
  }

  if (result.ens.agentAlias) {
    delete result.ens.agentAlias;
  }
  if (result.ens.clubAlias) {
    delete result.ens.clubAlias;
  }

  if (!result.merkle || typeof result.merkle !== 'object') {
    result.merkle = {};
  } else {
    result.merkle = { ...result.merkle };
  }

  if (result.merkle.agent !== undefined) {
    result.merkle.agent = ensureBytes32(result.merkle.agent);
  }

  if (result.merkle.validator !== undefined) {
    result.merkle.validator = ensureBytes32(result.merkle.validator);
  }

  if (result.reputationEngine !== undefined) {
    result.reputationEngine = ensureAddress(
      result.reputationEngine,
      'IdentityRegistry reputationEngine',
      { allowZero: true }
    );
  }

  if (result.attestationRegistry !== undefined) {
    result.attestationRegistry = ensureAddress(
      result.attestationRegistry,
      'IdentityRegistry attestationRegistry',
      { allowZero: true }
    );
  }

  result.additionalAgents = normaliseAddressBooleanMap(
    result.additionalAgents,
    'additionalAgent'
  );
  result.additionalValidators = normaliseAddressBooleanMap(
    result.additionalValidators,
    'additionalValidator'
  );

  result.agentTypes = normaliseAgentTypeMap(result.agentTypes);

  if (result.agentProfiles && typeof result.agentProfiles === 'object') {
    const mapped = {};
    for (const [key, uri] of Object.entries(result.agentProfiles)) {
      if (uri === undefined || uri === null) continue;
      const address = ensureAddress(key, `agentProfile ${key}`);
      mapped[address] = String(uri);
    }
    result.agentProfiles = mapped;
  }

  return result;
}

function loadIdentityRegistryConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('identity-registry', network);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Identity registry config not found at ${configPath}`);
  }
  const rawConfig = readJson(configPath);
  const config = normaliseIdentityRegistryConfig(rawConfig);
  return { config, path: configPath, network };
}

module.exports = {
  loadTokenConfig,
  loadEnsConfig,
  loadIdentityRegistryConfig,
  loadJobRegistryConfig,
  loadStakeManagerConfig,
  loadFeePoolConfig,
  loadPlatformIncentivesConfig,
  loadTaxPolicyConfig,
  loadThermodynamicsConfig,
  inferNetworkKey,
};
