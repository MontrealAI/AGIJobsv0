require('ts-node/register/transpile-only');
require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');
require('hardhat-gas-reporter');
require('solidity-coverage');
require('hardhat-contract-sizer');

function parseMochaReporterOptions(name) {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const pairs = raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const options = {};
    for (const pair of pairs) {
      const [key, ...rest] = pair.split('=');
      if (!key || rest.length === 0) {
        continue;
      }
      options[key.trim()] = rest.join('=').trim();
    }

    if (Object.keys(options).length === 0) {
      throw new Error(`Invalid reporter options provided in ${name}: ${error.message}`);
    }

    return options;
  }
}

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
const isFastCompile = process.env.HARDHAT_FAST_COMPILE === '1';
const viaIROverride = process.env.HARDHAT_VIA_IR;
// Prefer viaIR to avoid stack-depth issues in larger contracts. Allow explicit
// opt-out via HARDHAT_VIA_IR=false. Fast compile runs keep viaIR enabled by
// default to preserve correctness while other toggles (like reduced compiler
// sets) keep turnaround times manageable.
const baseViaIR = viaIROverride === undefined ? !isCoverageRun : viaIROverride === 'true';
const compilerViaIR = baseViaIR;

// JobRegistry relies on viaIR to avoid stack depth issues in several
// configuration and settlement paths, so keep it enabled even during fast
// compiles.
const jobRegistryViaIR = compilerViaIR;

const SOLIDITY_VERSIONS = ['0.8.25', '0.8.23', '0.8.21'];

const solidityVersions = isCoverageRun || isFastCompile
  ? [SOLIDITY_VERSIONS[0]]
  : SOLIDITY_VERSIONS;

const solidityCompilers = solidityVersions.map((version) => ({
  version,
  settings: {
    optimizer: {
      enabled: !isCoverageRun,
      runs: isFastCompile ? 50 : isCoverageRun ? 0 : 200,
    },
    viaIR: compilerViaIR,
    evmVersion: 'cancun',
    metadata: isFastCompile ? { bytecodeHash: 'none' } : undefined,
  },
}));

const solidityConfig = {
  compilers: solidityCompilers,
};

if (isFastCompile && solidityCompilers.length > 0) {
  // Keep viaIR enabled for deeply nested contracts while allowing the majority
  // of the codebase to compile quickly without it during rapid test runs.
  const primaryCompiler = solidityCompilers[0];
  solidityConfig.overrides = {
    'contracts/v2/JobRegistry.sol': {
      version: primaryCompiler.version,
      settings: { ...primaryCompiler.settings, viaIR: jobRegistryViaIR },
    },
  };
}

const pathsConfig = coverageOnly
  ? { sources: './contracts/coverage', tests: './test' }
  : { sources: './contracts', tests: './test' };

const mochaReporter =
  process.env.MOCHA_REPORTER || process.env.npm_config_reporter;
const mochaReporterOptions =
  parseMochaReporterOptions('MOCHA_REPORTER_OPTIONS') ||
  parseMochaReporterOptions('npm_config_reporter_options');

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
    reporter: mochaReporter,
    reporterOptions: mochaReporterOptions,
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
