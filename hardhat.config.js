require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');
require('hardhat-gas-reporter');
require('solidity-coverage');

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

function resolveAccounts(envKeys) {
  const keys = Array.isArray(envKeys) ? envKeys : [envKeys];
  for (const key of keys) {
    if (!key) {
      continue;
    }
    const value = process.env[key];
    if (value !== undefined) {
      const normalised = normalisePrivateKey(value);
      if (normalised) {
        return [normalised];
      }
    }
  }
  return [];
}

const coverageOnly = process.env.COVERAGE_ONLY === '1';

const solidityConfig = coverageOnly
  ? {
      version: '0.8.25',
      settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
    }
  : {
      compilers: [
        {
          version: '0.8.25',
          settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
        },
        {
          version: '0.8.23',
          settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
        },
        {
          version: '0.8.21',
          settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
        },
      ],
    };

const pathsConfig = coverageOnly
  ? { sources: './contracts/coverage', tests: './test/coverage' }
  : { sources: './contracts' };

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: solidityConfig,
  paths: pathsConfig,
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      gas: 100000000,
      blockGasLimit: 100000000,
    },
    anvil: {
      url: process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545',
      chainId: 31337,
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || '',
      accounts: resolveAccounts('MAINNET_PRIVATE_KEY'),
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || '',
      accounts: resolveAccounts(['SEPOLIA_PRIVATE_KEY', 'TESTNET_PRIVATE_KEY']),
      chainId: 11155111,
    },
  },
  mocha: {
    require: ['./test/setup.js'],
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
    showTimeSpent: true,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
