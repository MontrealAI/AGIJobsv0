const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const namehash = require('eth-ens-namehash');
const parseDuration = require('../utils/parseDuration.js');

const CONFIG_DIR = path.join(__dirname, '..', '..', 'config');
const DEPLOYMENT_CONFIG_DIR = path.join(
  __dirname,
  '..',
  '..',
  'deployment-config'
);

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
  if (typeof ethers.namehash === 'function' && ethers.namehash.normalize) {
    return ethers.namehash.normalize(trimmed);
  }
  return namehash.normalize(trimmed);
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
  if (/^[a-z0-9._-]+$/.test(lower)) {
    return lower;
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

function normaliseOptionalAddress(value, label) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const address = ensureAddress(value, label, { allowZero: true });
  return address === ethers.ZeroAddress ? undefined : address;
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

function ensureUint(
  value,
  label,
  { allowZero = false, optional = false } = {}
) {
  if (value === undefined || value === null || value === '') {
    if (optional) {
      return undefined;
    }
    throw new Error(`${label} is missing`);
  }
  const asString = typeof value === 'string' ? value.trim() : String(value);
  if (!asString) {
    if (optional) {
      return undefined;
    }
    throw new Error(`${label} is missing`);
  }
  if (!/^\d+$/.test(asString)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  const parsed = BigInt(asString);
  if (!allowZero && parsed === 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
  return parsed.toString();
}

function parseBooleanFlag(value, label) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const asString = String(value).trim().toLowerCase();
  if (!asString) {
    return undefined;
  }
  if (['true', '1', 'yes', 'y', 'on', 'enable', 'enabled'].includes(asString)) {
    return true;
  }
  if (
    ['false', '0', 'no', 'n', 'off', 'disable', 'disabled'].includes(asString)
  ) {
    return false;
  }
  throw new Error(`${label} must be a boolean value`);
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

  const labelName =
    alias.label || (alias.name ? alias.name.split('.')[0] : undefined);
  if (labelName) {
    const normalisedLabel = normaliseLabel(labelName, labelName);
    if (alias.label !== normalisedLabel) {
      alias.label = normalisedLabel;
      updated = true;
    }
    const labelhash = ethers.id(normalisedLabel);
    if (
      !alias.labelhash ||
      alias.labelhash.toLowerCase() !== labelhash.toLowerCase()
    ) {
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

  if (root.hash && !root.node) {
    root.node = root.hash;
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
    root.aliases = aliases.map(
      (entry, index) =>
        normaliseAliasEntry(entry, `${label} alias[${index}]`).alias
    );
  }

  return root;
}

function normalisePercentage(value, label) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be a finite number`);
  }
  let pct = numeric;
  if (numeric > 0 && numeric < 1) {
    pct = numeric * 100;
  }
  if (Math.abs(pct - Math.round(pct)) > 1e-6) {
    throw new Error(`${label} must resolve to a whole percentage (0-100)`);
  }
  pct = Math.round(pct);
  if (pct < 0 || pct > 100) {
    throw new Error(`${label} must be between 0 and 100`);
  }
  return pct;
}

function normaliseDuration(value, label) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${label} must be a non-negative duration`);
    }
    return Math.floor(value);
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = parseDuration(trimmed, 's');
  if (parsed === null || parsed === undefined) {
    throw new Error(`${label} duration string is invalid`);
  }
  if (parsed < 0) {
    throw new Error(`${label} must be non-negative`);
  }
  return Math.floor(parsed);
}

function normaliseTokenAmount(value, label, { max, decimals = 18 } = {}) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  let amount;
  if (typeof value === 'object' && value !== null) {
    if (value.raw !== undefined) {
      amount = BigInt(value.raw);
    } else if (value.amount !== undefined) {
      const targetDecimals =
        value.decimals !== undefined ? Number(value.decimals) : decimals;
      if (!Number.isFinite(targetDecimals) || targetDecimals < 0) {
        throw new Error(`${label} decimals must be a non-negative integer`);
      }
      amount = ethers.parseUnits(String(value.amount), targetDecimals);
    } else {
      throw new Error(`${label} object must include a raw or amount property`);
    }
  } else {
    const trimmed = String(value).trim();
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.startsWith('0x')) {
      amount = BigInt(trimmed);
    } else {
      amount = ethers.parseUnits(trimmed, decimals);
    }
  }

  if (amount < 0) {
    throw new Error(`${label} cannot be negative`);
  }
  if (max !== undefined && amount > max) {
    throw new Error(`${label} exceeds supported maximum`);
  }
  return amount.toString();
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

function findDeploymentConfigPath(network) {
  if (!network) {
    return undefined;
  }
  return path.join(DEPLOYMENT_CONFIG_DIR, `${network}.json`);
}

function normaliseDeploymentPlan(plan = {}) {
  const result = {};

  if (plan.governance !== undefined && plan.governance !== null) {
    const governance = ensureAddress(plan.governance, 'governance', {
      allowZero: true,
    });
    if (governance !== ethers.ZeroAddress) {
      result.governance = governance;
    }
  }

  if (plan.agialpha !== undefined && plan.agialpha !== null) {
    const tokenAddress = ensureAddress(
      plan.agialpha,
      'AGIALPHA token address',
      { allowZero: true }
    );
    if (tokenAddress !== ethers.ZeroAddress) {
      result.agialpha = tokenAddress;
    }
  }

  if (plan.withTax !== undefined) {
    result.withTax = Boolean(plan.withTax);
  }

  const rawOverrides =
    plan.overrides && typeof plan.overrides === 'object' ? plan.overrides : {};

  const econ = {};
  const feePct = normalisePercentage(rawOverrides.feePct, 'feePct');
  if (feePct !== undefined) {
    econ.feePct = feePct;
  }
  const burnPct = normalisePercentage(rawOverrides.burnPct, 'burnPct');
  if (burnPct !== undefined) {
    econ.burnPct = burnPct;
  }
  const employerSlashPct = normalisePercentage(
    rawOverrides.employerSlashPct,
    'employerSlashPct'
  );
  if (employerSlashPct !== undefined) {
    econ.employerSlashPct = employerSlashPct;
  }
  const treasurySlashPct = normalisePercentage(
    rawOverrides.treasurySlashPct,
    'treasurySlashPct'
  );
  if (treasurySlashPct !== undefined) {
    econ.treasurySlashPct = treasurySlashPct;
  }
  const validatorSlashRewardPct = normalisePercentage(
    rawOverrides.validatorSlashRewardPct,
    'validatorSlashRewardPct'
  );
  if (validatorSlashRewardPct !== undefined) {
    econ.validatorSlashRewardPct = validatorSlashRewardPct;
  }

  const commitWindow = normaliseDuration(
    rawOverrides.commitWindow,
    'commitWindow'
  );
  if (commitWindow !== undefined) {
    econ.commitWindow = commitWindow;
  }
  const revealWindow = normaliseDuration(
    rawOverrides.revealWindow,
    'revealWindow'
  );
  if (revealWindow !== undefined) {
    econ.revealWindow = revealWindow;
  }

  const minStake = normaliseTokenAmount(rawOverrides.minStake, 'minStake');
  if (minStake !== undefined) {
    econ.minStake = minStake;
  }
  const jobStake = normaliseTokenAmount(rawOverrides.jobStake, 'jobStake', {
    max: MAX_UINT96,
  });
  if (jobStake !== undefined) {
    econ.jobStake = jobStake;
  }

  if (Object.keys(econ).length > 0) {
    result.econ = econ;
  }

  const ensRootsSource =
    rawOverrides.ensRoots || plan.ensRoots || (plan.ens && plan.ens.roots);
  if (ensRootsSource && typeof ensRootsSource === 'object') {
    const roots = {};
    for (const [key, value] of Object.entries(ensRootsSource)) {
      const root = normaliseIdentityRoot(value, `${key}`);
      if (root) {
        roots[key] = root;
      }
    }
    if (Object.keys(roots).length > 0) {
      result.ensRoots = roots;
    }
  }

  if (plan.ens && typeof plan.ens === 'object') {
    const ensConfig = {};
    if (plan.ens.registry !== undefined) {
      ensConfig.registry = ensureAddress(plan.ens.registry, 'ENS registry');
    }
    if (plan.ens.nameWrapper !== undefined) {
      ensConfig.nameWrapper = ensureAddress(
        plan.ens.nameWrapper,
        'ENS NameWrapper',
        { allowZero: true }
      );
    }
    if (Object.keys(ensConfig).length > 0) {
      result.ens = ensConfig;
    }
  }

  return result;
}

function loadDeploymentPlan(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findDeploymentConfigPath(network);

  if (!configPath || !fs.existsSync(configPath)) {
    if (options.optional) {
      return { plan: {}, path: configPath, network, exists: false };
    }
    throw new Error(
      `Deployment configuration not found for network ${network || 'unknown'}`
    );
  }

  const plan = normaliseDeploymentPlan(readJson(configPath));
  return { plan, path: configPath, network, exists: true };
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

  const setAddress = (key, label, { allowZero = false } = {}) => {
    if (result[key] === undefined) {
      return;
    }
    const raw = result[key];
    if (raw === null || raw === '') {
      if (allowZero) {
        result[key] = ethers.ZeroAddress;
      } else {
        delete result[key];
      }
      return;
    }
    result[key] = ensureAddress(raw, label, { allowZero });
  };

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

  setAddress('pauser', 'JobRegistry pauser', { allowZero: true });
  setAddress('identityRegistry', 'JobRegistry identity registry');
  setAddress('disputeModule', 'JobRegistry dispute module');
  setAddress('validationModule', 'JobRegistry validation module');
  setAddress('stakeManager', 'JobRegistry stake manager');
  setAddress('reputationModule', 'JobRegistry reputation module');
  setAddress('certificateNFT', 'JobRegistry certificate NFT');
  setAddress('feePool', 'JobRegistry fee pool');

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

  if (result.agentRootNode !== undefined) {
    result.agentRootNode = ensureBytes32(result.agentRootNode);
  }

  if (result.agentMerkleRoot !== undefined) {
    result.agentMerkleRoot = ensureBytes32(result.agentMerkleRoot);
  }

  if (result.validatorRootNode !== undefined) {
    result.validatorRootNode = ensureBytes32(result.validatorRootNode);
  }

  if (result.validatorMerkleRoot !== undefined) {
    result.validatorMerkleRoot = ensureBytes32(result.validatorMerkleRoot);
  }

  if (result.agentAuthCacheDurationSeconds !== undefined) {
    result.agentAuthCacheDurationSeconds = ensureUint(
      result.agentAuthCacheDurationSeconds,
      'JobRegistry agentAuthCacheDurationSeconds',
      { allowZero: true, optional: true }
    );
  }

  if (result.bumpAgentAuthCacheVersion !== undefined) {
    const flag = parseBooleanFlag(
      result.bumpAgentAuthCacheVersion,
      'JobRegistry bumpAgentAuthCacheVersion'
    );
    if (flag === undefined) {
      delete result.bumpAgentAuthCacheVersion;
    } else {
      result.bumpAgentAuthCacheVersion = flag;
    }
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

function normaliseDisputeModuleConfig(config = {}) {
  const result = { ...config };

  if (result.address !== undefined) {
    if (result.address === null || result.address === '') {
      delete result.address;
    } else {
      const address = ensureAddress(result.address, 'DisputeModule address', {
        allowZero: true,
      });
      if (address === ethers.ZeroAddress) {
        delete result.address;
      } else {
        result.address = address;
      }
    }
  }

  const setAddress = (key, label, { allowZeroValue = false } = {}) => {
    if (result[key] === undefined) {
      return;
    }
    const raw = result[key];
    if (raw === null || raw === '') {
      if (allowZeroValue) {
        result[key] = ethers.ZeroAddress;
      } else {
        delete result[key];
      }
      return;
    }
    const address = ensureAddress(raw, label, { allowZero: true });
    if (!allowZeroValue && address === ethers.ZeroAddress) {
      delete result[key];
      return;
    }
    result[key] = address;
  };

  setAddress('jobRegistry', 'DisputeModule job registry');
  setAddress('stakeManager', 'DisputeModule stake manager');
  setAddress('committee', 'DisputeModule committee', { allowZeroValue: true });
  setAddress('pauser', 'DisputeModule pauser', { allowZeroValue: true });
  setAddress('taxPolicy', 'DisputeModule tax policy');

  if (result.disputeFee !== undefined) {
    const value = result.disputeFee;
    if (value === null || value === '') {
      delete result.disputeFee;
    } else {
      try {
        result.disputeFee = BigInt(value).toString();
      } catch (error) {
        throw new Error(
          `DisputeModule disputeFee must be an integer string: ${
            error?.message || error
          }`
        );
      }
    }
  }

  if (result.disputeFeeTokens !== undefined) {
    const value = result.disputeFeeTokens;
    if (value === null) {
      delete result.disputeFeeTokens;
    } else {
      result.disputeFeeTokens = String(value).trim();
      if (!result.disputeFeeTokens) {
        delete result.disputeFeeTokens;
      }
    }
  }

  return result;
}

function loadDisputeModuleConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('dispute-module', network);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Dispute module config not found at ${configPath}`);
  }
  const config = normaliseDisputeModuleConfig(readJson(configPath));
  return { config, path: configPath, network };
}

function normaliseOwnerControlModuleConfig(key, raw = {}) {
  if (raw === null || raw === undefined) {
    return undefined;
  }

  if (typeof raw === 'string') {
    const owner = normaliseOptionalAddress(raw, `ownerControl.modules.${key}`);
    return owner
      ? {
          owner,
        }
      : undefined;
  }

  if (typeof raw !== 'object') {
    throw new Error(`ownerControl.modules.${key} must be a string or object`);
  }

  const entry = { ...raw };
  const result = {};

  if (entry.address !== undefined) {
    const address = normaliseOptionalAddress(
      entry.address,
      `ownerControl.modules.${key}.address`
    );
    if (address) {
      result.address = address;
    }
  }

  if (entry.governance !== undefined) {
    const governance = normaliseOptionalAddress(
      entry.governance,
      `ownerControl.modules.${key}.governance`
    );
    if (governance) {
      result.governance = governance;
    }
  }

  if (entry.owner !== undefined) {
    const owner = normaliseOptionalAddress(
      entry.owner,
      `ownerControl.modules.${key}.owner`
    );
    if (owner) {
      result.owner = owner;
    }
  }

  if (entry.type !== undefined) {
    const type = String(entry.type).trim();
    if (type) {
      result.type = type;
    }
  }

  if (entry.label !== undefined) {
    const label = String(entry.label).trim();
    if (label) {
      result.label = label;
    }
  }

  if (entry.skip !== undefined) {
    result.skip = Boolean(entry.skip);
  }

  if (entry.notes !== undefined) {
    if (Array.isArray(entry.notes)) {
      result.notes = entry.notes.map((note) => String(note));
    } else {
      result.notes = [String(entry.notes)];
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normaliseOwnerControlConfig(config = {}) {
  const result = {};

  const governance = normaliseOptionalAddress(
    config.governance,
    'ownerControl.governance'
  );
  if (governance) {
    result.governance = governance;
  }

  const owner = normaliseOptionalAddress(config.owner, 'ownerControl.owner');
  if (owner) {
    result.owner = owner;
  }

  if (config.modules && typeof config.modules === 'object') {
    const modules = {};
    for (const [key, value] of Object.entries(config.modules)) {
      const entry = normaliseOwnerControlModuleConfig(key, value);
      if (entry) {
        modules[key] = entry;
      }
    }
    result.modules = modules;
  }

  return result;
}

function loadOwnerControlConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('owner-control', network);
  let rawConfig = {};
  if (fs.existsSync(configPath)) {
    rawConfig = readJson(configPath);
  }
  const config = normaliseOwnerControlConfig(rawConfig);
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

  if (
    result.treasuryAllowlist &&
    typeof result.treasuryAllowlist === 'object'
  ) {
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

  if (
    result.stakeRecommendations &&
    typeof result.stakeRecommendations === 'object'
  ) {
    result.stakeRecommendations = { ...result.stakeRecommendations };
  }

  if (result.roleMinimums && typeof result.roleMinimums === 'object') {
    result.roleMinimums = { ...result.roleMinimums };
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

  if (
    result.treasuryAllowlist &&
    typeof result.treasuryAllowlist === 'object'
  ) {
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
      const address = ensureAddress(key, `rewarder ${key}`, {
        allowZero: false,
      });
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

function normaliseEnergyOracleConfig(config = {}) {
  const result = {};

  const signersInput = config.signers;
  const signerSet = new Set();
  const signers = [];

  if (Array.isArray(signersInput)) {
    signersInput.forEach((value, index) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      const address = ensureAddress(value, `energy-oracle.signers[${index}]`);
      if (!signerSet.has(address)) {
        signerSet.add(address);
        signers.push(address);
      }
    });
  } else if (signersInput && typeof signersInput === 'object') {
    let index = 0;
    for (const [key, enabled] of Object.entries(signersInput)) {
      if (!enabled) {
        index += 1;
        continue;
      }
      const address = ensureAddress(key, `energy-oracle.signers[${index}]`);
      if (!signerSet.has(address)) {
        signerSet.add(address);
        signers.push(address);
      }
      index += 1;
    }
  } else if (signersInput !== undefined) {
    throw new Error('energy-oracle.signers must be an array or object');
  }

  signers.sort((a, b) => a.localeCompare(b));
  result.signers = signers;

  const retainUnknown =
    parseBooleanFlag(config.retainUnknown, 'energy-oracle.retainUnknown') ??
    parseBooleanFlag(config.keepUnknown, 'energy-oracle.keepUnknown') ??
    parseBooleanFlag(config.allowAdditional, 'energy-oracle.allowAdditional');

  if (retainUnknown !== undefined) {
    result.retainUnknown = retainUnknown;
  }

  return result;
}

function loadEnergyOracleConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('energy-oracle', network);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Energy oracle config not found at ${configPath}`);
  }
  const config = normaliseEnergyOracleConfig(readJson(configPath));
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

  if (Object.prototype.hasOwnProperty.call(result, 'maxDiscountPct')) {
    const value = result.maxDiscountPct;
    if (value === null || value === undefined || value === '') {
      delete result.maxDiscountPct;
    } else {
      result.maxDiscountPct = normalisePercentage(
        value,
        'PlatformIncentives maxDiscountPct'
      );
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

function normalisePlatformRegistryConfig(config = {}) {
  const result = { ...config };

  if (result.address !== undefined) {
    const value = result.address;
    if (value === null) {
      throw new Error('PlatformRegistry address cannot be null');
    }
    result.address = ensureAddress(value, 'PlatformRegistry address');
  }

  const addressKeys = ['stakeManager', 'reputationEngine', 'pauser'];
  for (const key of addressKeys) {
    if (result[key] !== undefined) {
      const value = result[key];
      if (value === null) {
        result[key] = ethers.ZeroAddress;
      } else {
        result[key] = ensureAddress(value, `PlatformRegistry ${key}`, {
          allowZero: key !== 'stakeManager' && key !== 'reputationEngine',
        });
      }
    }
  }

  result.registrars = normaliseAddressBooleanMap(
    result.registrars,
    'registrar'
  );
  result.blacklist = normaliseAddressBooleanMap(result.blacklist, 'blacklist');

  if (result.minPlatformStake !== undefined) {
    try {
      if (result.minPlatformStake === null) {
        delete result.minPlatformStake;
      } else {
        result.minPlatformStake = BigInt(result.minPlatformStake).toString();
      }
    } catch (error) {
      throw new Error(
        `minPlatformStake must be an integer string: ${error?.message || error}`
      );
    }
  }

  if (result.minPlatformStakeTokens !== undefined) {
    const value = result.minPlatformStakeTokens;
    if (value === null) {
      delete result.minPlatformStakeTokens;
    } else {
      result.minPlatformStakeTokens = String(value).trim();
    }
  }

  return result;
}

function loadPlatformRegistryConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('platform-registry', network);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Platform registry config not found at ${configPath}`);
  }
  const config = normalisePlatformRegistryConfig(readJson(configPath));
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

  if (Array.isArray(result.revokeAcknowledgements)) {
    const cleaned = [];
    for (let i = 0; i < result.revokeAcknowledgements.length; i += 1) {
      const value = result.revokeAcknowledgements[i];
      if (value === undefined || value === null || value === '') continue;
      cleaned.push(
        ensureAddress(value, `TaxPolicy revokeAcknowledgements[${i}]`, {
          allowZero: false,
        })
      );
    }
    result.revokeAcknowledgements = cleaned;
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

function normaliseRandaoCoordinatorConfig(config = {}) {
  if (!config || typeof config !== 'object') {
    return {};
  }

  const result = { ...config };

  if (result.address !== undefined) {
    if (result.address === null || result.address === '') {
      delete result.address;
    } else {
      result.address = ensureAddress(
        result.address,
        'RandaoCoordinator address'
      );
    }
  }

  const commitWindowSource =
    result.commitWindowSeconds ??
    result.commitWindow ??
    result.commitWindowDuration;
  const revealWindowSource =
    result.revealWindowSeconds ??
    result.revealWindow ??
    result.revealWindowDuration;

  const commitWindow = normaliseDuration(
    commitWindowSource,
    'RandaoCoordinator commitWindow'
  );
  if (commitWindow !== undefined) {
    result.commitWindow = commitWindow;
  }

  const revealWindow = normaliseDuration(
    revealWindowSource,
    'RandaoCoordinator revealWindow'
  );
  if (revealWindow !== undefined) {
    result.revealWindow = revealWindow;
  }

  if (
    result.deposit !== undefined &&
    result.deposit !== null &&
    result.deposit !== ''
  ) {
    const depositAmount = normaliseTokenAmount(
      result.deposit,
      'RandaoCoordinator deposit'
    );
    if (depositAmount !== undefined) {
      result.deposit = depositAmount.toString();
    } else {
      delete result.deposit;
    }
  }

  if (result.depositTokens !== undefined && result.depositTokens !== null) {
    const depositAmount = normaliseTokenAmount(
      { amount: result.depositTokens },
      'RandaoCoordinator depositTokens'
    );
    result.deposit = depositAmount.toString();
    delete result.depositTokens;
  }

  if (result.token !== undefined) {
    if (result.token === null || result.token === '') {
      delete result.token;
    } else {
      result.token = ensureAddress(result.token, 'RandaoCoordinator token');
    }
  }

  if (result.treasury !== undefined) {
    if (result.treasury === null || result.treasury === '') {
      result.treasury = ethers.ZeroAddress;
    } else {
      result.treasury = ensureAddress(
        result.treasury,
        'RandaoCoordinator treasury',
        { allowZero: true }
      );
    }
  }

  return result;
}

function loadRandaoCoordinatorConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('randao-coordinator', network);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Randao coordinator config not found at ${configPath}`);
  }
  const config = normaliseRandaoCoordinatorConfig(readJson(configPath));
  return { config, path: configPath, network };
}

function normaliseRewardEngineConfig(config = {}) {
  if (!config || typeof config !== 'object') {
    return {};
  }

  const reward = { ...config };

  if (reward.address !== undefined) {
    if (reward.address === null || reward.address === '') {
      delete reward.address;
    } else {
      reward.address = ensureAddress(reward.address, 'RewardEngine address');
    }
  }

  if (reward.treasury !== undefined) {
    if (reward.treasury === null || reward.treasury === '') {
      reward.treasury = ethers.ZeroAddress;
    } else {
      reward.treasury = ensureAddress(
        reward.treasury,
        'RewardEngine treasury',
        {
          allowZero: true,
        }
      );
    }
  }

  if (reward.thermostat !== undefined) {
    const allowZero = reward.thermostat === null || reward.thermostat === '';
    reward.thermostat = allowZero
      ? ethers.ZeroAddress
      : ensureAddress(reward.thermostat, 'RewardEngine thermostat', {
          allowZero: true,
        });
  }

  if (reward.feePool !== undefined) {
    if (reward.feePool === null || reward.feePool === '') {
      delete reward.feePool;
    } else {
      reward.feePool = ensureAddress(reward.feePool, 'RewardEngine feePool', {
        allowZero: false,
      });
    }
  }

  if (reward.reputation !== undefined) {
    if (reward.reputation === null || reward.reputation === '') {
      delete reward.reputation;
    } else {
      reward.reputation = ensureAddress(
        reward.reputation,
        'RewardEngine reputation engine',
        { allowZero: false }
      );
    }
  }

  if (reward.energyOracle !== undefined) {
    if (reward.energyOracle === null || reward.energyOracle === '') {
      delete reward.energyOracle;
    } else {
      reward.energyOracle = ensureAddress(
        reward.energyOracle,
        'RewardEngine energy oracle',
        { allowZero: false }
      );
    }
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

  return reward;
}

const CLEAR_ROLE_TEMP_VALUES = new Set(['unset', 'remove', 'clear', 'none']);

function normaliseThermostatConfig(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Thermostat configuration must be an object');
  }

  const thermo = { ...config };

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
      if (value === undefined) continue;
      if (value === null) {
        mapped[key] = null;
        continue;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) continue;
        if (CLEAR_ROLE_TEMP_VALUES.has(trimmed.toLowerCase())) {
          mapped[key] = null;
          continue;
        }
      }
      mapped[key] = value;
    }
    thermo.roleTemperatures = mapped;
  }

  return thermo;
}

function normaliseThermodynamicsConfig(config = {}) {
  const result = { ...config };

  if (result.rewardEngine && typeof result.rewardEngine === 'object') {
    result.rewardEngine = normaliseRewardEngineConfig(result.rewardEngine);
  }

  if (result.thermostat && typeof result.thermostat === 'object') {
    result.thermostat = normaliseThermostatConfig(result.thermostat);
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

function loadRewardEngineConfig(options = {}) {
  const network = resolveNetwork(options);
  let configPath = options.path ? path.resolve(options.path) : undefined;
  let source = 'reward-engine';

  if (configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Reward engine config not found at ${configPath}`);
    }
  } else {
    const candidate = findConfigPath('reward-engine', network);
    if (fs.existsSync(candidate)) {
      configPath = candidate;
    } else {
      const thermoPath = findConfigPath('thermodynamics', network);
      if (!fs.existsSync(thermoPath)) {
        throw new Error(
          'Reward engine config not found. Create config/reward-engine.json or include a rewardEngine section in config/thermodynamics.json'
        );
      }
      configPath = thermoPath;
      source = 'thermodynamics';
    }
  }

  if (!configPath) {
    throw new Error('Unable to resolve reward engine config path');
  }

  const raw = readJson(configPath);

  let rewardConfig;
  if (raw && typeof raw === 'object' && raw.rewardEngine) {
    rewardConfig = normaliseRewardEngineConfig(raw.rewardEngine);
    source = 'thermodynamics';
  } else {
    rewardConfig = normaliseRewardEngineConfig(raw);
  }

  if (!rewardConfig || Object.keys(rewardConfig).length === 0) {
    throw new Error(
      `Reward engine configuration is empty in ${configPath}. Provide the required parameters.`
    );
  }

  return { config: rewardConfig, path: configPath, network, source };
}

function loadThermostatConfig(options = {}) {
  const network = resolveNetwork(options);
  let configPath = options.path ? path.resolve(options.path) : undefined;
  let source = 'thermostat';
  let rewardEngineThermostat;

  if (configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Thermostat config not found at ${configPath}`);
    }
  } else {
    const thermostatPath = findConfigPath('thermostat', network);
    if (fs.existsSync(thermostatPath)) {
      configPath = thermostatPath;
    } else {
      const thermoPath = findConfigPath('thermodynamics', network);
      if (!fs.existsSync(thermoPath)) {
        throw new Error(
          'Thermostat config not found. Create config/thermostat.json or include a thermostat section in config/thermodynamics.json'
        );
      }
      configPath = thermoPath;
      source = 'thermodynamics';
    }
  }

  if (!configPath) {
    throw new Error('Unable to resolve thermostat config path');
  }

  const raw = readJson(configPath);
  if (!raw || typeof raw !== 'object') {
    throw new Error(
      `Thermostat configuration in ${configPath} must be an object`
    );
  }

  let thermostatConfig;
  if (source === 'thermodynamics') {
    const thermoSection = raw.thermostat;
    if (!thermoSection || typeof thermoSection !== 'object') {
      throw new Error(
        `Thermodynamics config at ${configPath} is missing a thermostat section`
      );
    }
    thermostatConfig = normaliseThermostatConfig(thermoSection);
    if (
      raw.rewardEngine &&
      typeof raw.rewardEngine === 'object' &&
      raw.rewardEngine.thermostat !== undefined &&
      raw.rewardEngine.thermostat !== null &&
      raw.rewardEngine.thermostat !== ''
    ) {
      rewardEngineThermostat = ensureAddress(
        raw.rewardEngine.thermostat,
        'rewardEngine.thermostat',
        { allowZero: true }
      );
    }
  } else {
    thermostatConfig = normaliseThermostatConfig(raw);
  }

  if (!thermostatConfig || Object.keys(thermostatConfig).length === 0) {
    throw new Error(
      `Thermostat configuration is empty in ${configPath}. Provide the required parameters.`
    );
  }

  return {
    config: thermostatConfig,
    path: configPath,
    network,
    source,
    rewardEngineThermostat,
  };
}

function normaliseHamiltonianRecord(entry, index) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Hamiltonian records[${index}] must be an object`);
  }

  const record = {};
  const dValue =
    entry.d ?? entry.dissipation ?? entry.delta ?? entry.energy ?? entry.D;
  const uValue = entry.u ?? entry.utility ?? entry.U;

  record.d = ensureUint(dValue, `records[${index}].d`, {
    allowZero: true,
  });
  record.u = ensureUint(uValue, `records[${index}].u`, {
    allowZero: true,
  });

  if (entry.timestamp !== undefined && entry.timestamp !== null) {
    record.timestamp = ensureUint(
      entry.timestamp,
      `records[${index}].timestamp`,
      {
        allowZero: true,
      }
    );
  }

  if (entry.note !== undefined && entry.note !== null) {
    record.note = String(entry.note);
  }

  return record;
}

function normaliseHamiltonianMonitorConfig(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Hamiltonian monitor config must be an object');
  }

  const config = {};

  if (raw.address !== undefined && raw.address !== null) {
    config.address = ensureAddress(raw.address, 'Hamiltonian monitor address', {
      allowZero: true,
    });
  }

  if (raw.window !== undefined && raw.window !== null && raw.window !== '') {
    config.window = ensureUint(raw.window, 'window', { allowZero: false });
  }

  const resetValue =
    raw.resetHistory ?? raw.reset ?? raw.clearHistory ?? raw.historyReset;
  if (resetValue !== undefined) {
    config.resetHistory = Boolean(resetValue);
  }

  if (Array.isArray(raw.records)) {
    config.records = raw.records.map((entry, index) =>
      normaliseHamiltonianRecord(entry, index)
    );
  }

  return config;
}

function loadHamiltonianMonitorConfig(options = {}) {
  const network = resolveNetwork(options);
  const configPath = options.path
    ? path.resolve(options.path)
    : findConfigPath('hamiltonian-monitor', network);
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Hamiltonian monitor config not found at ${configPath}. Create config/hamiltonian-monitor.json or pass --config <path>`
    );
  }
  const rawConfig = readJson(configPath);
  const config = normaliseHamiltonianMonitorConfig(rawConfig);
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
  const name =
    nameCandidate ||
    (defaultName ? defaultName.toLowerCase() : `${label}.agi.eth`);
  if (result.name !== name) {
    result.name = name;
    changed = true;
  }

  const labelhash = ethers.id(label);
  if (
    !result.labelhash ||
    result.labelhash.toLowerCase() !== labelhash.toLowerCase()
  ) {
    result.labelhash = labelhash;
    changed = true;
  }

  const node = ethers.namehash(name);
  if (!result.node || result.node.toLowerCase() !== node.toLowerCase()) {
    result.node = node;
    changed = true;
  }

  const merkleRoot = ensureBytes32(source?.merkleRoot);
  if (
    !result.merkleRoot ||
    result.merkleRoot.toLowerCase() !== merkleRoot.toLowerCase()
  ) {
    result.merkleRoot = merkleRoot;
    changed = true;
  }

  if (source?.resolver !== undefined) {
    const resolver = ensureAddress(source.resolver, `${key} resolver`, {
      allowZero: true,
    });
    if (
      !result.resolver ||
      result.resolver.toLowerCase() !== resolver.toLowerCase()
    ) {
      result.resolver = resolver;
      changed = true;
    }
  }

  const defaultRole =
    source?.role ||
    (key === 'club' ? 'validator' : key === 'business' ? 'business' : 'agent');
  if (result.role !== defaultRole) {
    result.role = defaultRole;
    changed = true;
  }

  const aliasInput = Array.isArray(source?.aliases)
    ? source.aliases
    : source?.alias
    ? [source.alias]
    : [];

  if (
    aliasInput.length > 0 ||
    (Array.isArray(result.aliases) && result.aliases.length > 0)
  ) {
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
    const previousNodes = previous.map((entry) =>
      ensureBytes32(entry.node).toLowerCase()
    );
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
    if (
      ['agent', 'club', 'business'].includes(legacyKey) &&
      !updated.roots[legacyKey]
    ) {
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
    const normalised = ensureAddress(updated.nameWrapper, 'ENS NameWrapper', {
      allowZero: true,
    });
    if (updated.nameWrapper !== normalised) {
      updated.nameWrapper = normalised;
      changed = true;
    }
  }
  if (updated.reverseRegistrar) {
    const normalised = ensureAddress(
      updated.reverseRegistrar,
      'ENS reverse registrar',
      {
        allowZero: true,
      }
    );
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
  return {
    config,
    path: configPath,
    network,
    updated: Boolean(changed && persist),
  };
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
  return list.map(
    (entry, index) => normaliseAliasEntry(entry, `${label}[${index}]`).alias
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
  loadEnergyOracleConfig,
  loadPlatformIncentivesConfig,
  loadPlatformRegistryConfig,
  loadTaxPolicyConfig,
  loadRandaoCoordinatorConfig,
  loadThermodynamicsConfig,
  loadThermostatConfig,
  loadRewardEngineConfig,
  loadHamiltonianMonitorConfig,
  loadOwnerControlConfig,
  loadDisputeModuleConfig,
  loadDeploymentPlan,
  inferNetworkKey,
};
