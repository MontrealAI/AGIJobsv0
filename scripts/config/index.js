const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const CONFIG_DIR = path.join(__dirname, '..', '..', 'config');

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
  const configPath = findConfigPath('agialpha', network);
  const config = readJson(configPath);
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
  inferNetworkKey,
};
