require('ts-node/register/transpile-only');
require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');
require('hardhat-gas-reporter');
require('solidity-coverage');
require('hardhat-contract-sizer');

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
const isCoverageRun =
  process.env.HARDHAT_COVERAGE === 'true' ||
  process.env.HARDHAT_COVERAGE === '1';

const SOLIDITY_VERSIONS = ['0.8.25', '0.8.23', '0.8.21'];

const parsePositiveNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
};

const localGasCeiling = parsePositiveNumber(
  process.env.LOCAL_GAS_LIMIT,
  1000000000,
);

const solidityVersions = isCoverageRun
  ? [SOLIDITY_VERSIONS[0]]
  : SOLIDITY_VERSIONS;

const solidityConfig = {
  compilers: solidityVersions.map((version) => ({
    version,
    settings: {
      optimizer: { enabled: !isCoverageRun, runs: isCoverageRun ? 0 : 200 },
      viaIR: !isCoverageRun,
      evmVersion: 'cancun',
    },
  })),
};

const pathsConfig = coverageOnly
  ? { sources: './contracts/coverage', tests: './test' }
  : { sources: './contracts', tests: './test' };

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: solidityConfig,
  paths: pathsConfig,
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      gas: localGasCeiling,
      blockGasLimit: localGasCeiling,
    },
    anvil: {
      url: process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545',
      chainId: 31337,
    },
    coverage: {
      url: process.env.COVERAGE_RPC_URL || 'http://127.0.0.1:8555',
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
    optimismSepolia: {
      url: process.env.OP_SEPOLIA_RPC_URL || '',
      accounts: resolveAccounts([
        'OP_SEPOLIA_PRIVATE_KEY',
        'TESTNET_PRIVATE_KEY',
      ]),
      chainId: 11155420,
    },
  },
  mocha: {
    require: ['ts-node/register', './test/setup.js'],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
    currency: 'USD',
    showTimeSpent: true,
    noColors: true,
    outputFile: 'reports/gas/gas-report.txt',
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
    strict: true,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
