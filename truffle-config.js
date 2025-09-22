require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');

function normalisePrivateKey(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  let hex = trimmed;
  if (hex.startsWith('0x') || hex.startsWith('0X')) {
    hex = hex.slice(2);
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('Private key must be a hex string');
  }
  if (hex.length > 64) {
    throw new Error('Private key must be at most 32 bytes long');
  }
  const padded = hex.padStart(64, '0');
  if (/^0+$/.test(padded)) {
    throw new Error('Private key cannot be zero');
  }
  return `0x${padded}`;
}

function resolvePrivateKey(envKeys) {
  const keys = Array.isArray(envKeys) ? envKeys : [envKeys];
  for (const key of keys) {
    if (!key) {
      continue;
    }
    const value = process.env[key];
    if (value !== undefined) {
      const normalised = normalisePrivateKey(value);
      if (normalised) {
        return normalised;
      }
    }
  }
  return null;
}

function ensureRpcUrl(envKey) {
  const keys = Array.isArray(envKey) ? envKey : [envKey];
  for (const key of keys) {
    if (!key) {
      continue;
    }
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  throw new Error(`${keys.join(', ')} RPC URL is required`);
}

function buildProvider({ privateKeyEnv, rpcUrlEnv }) {
  const rpcUrl = ensureRpcUrl(rpcUrlEnv);
  const privateKey = resolvePrivateKey(privateKeyEnv);
  if (!privateKey) {
    throw new Error(
      `Missing private key for ${rpcUrlEnv} (env: ${privateKeyEnv})`
    );
  }
  return new HDWalletProvider({
    privateKeys: [privateKey],
    providerOrUrl: rpcUrl,
    pollingInterval: 8000,
  });
}

module.exports = {
  networks: {
    mainnet: {
      provider: () =>
        buildProvider({
          privateKeyEnv: 'MAINNET_PRIVATE_KEY',
          rpcUrlEnv: 'MAINNET_RPC_URL',
        }),
      network_id: 1,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true,
    },
    sepolia: {
      provider: () =>
        buildProvider({
          privateKeyEnv: ['SEPOLIA_PRIVATE_KEY', 'TESTNET_PRIVATE_KEY'],
          rpcUrlEnv: ['SEPOLIA_RPC_URL', 'TESTNET_RPC_URL'],
        }),
      network_id: 11155111,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true,
    },
  },
  compilers: {
    solc: {
      version: '0.8.25',
    },
  },
  plugins: ['truffle-plugin-verify'],
  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY,
  },
};
