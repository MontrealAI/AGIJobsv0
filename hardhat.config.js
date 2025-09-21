require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');
require('hardhat-gas-reporter');
require('solidity-coverage');

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
    mainnet: {
      url: process.env.MAINNET_RPC_URL || '',
      accounts: process.env.MAINNET_PRIVATE_KEY
        ? [process.env.MAINNET_PRIVATE_KEY]
        : [],
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || '',
      accounts: process.env.SEPOLIA_PRIVATE_KEY
        ? [process.env.SEPOLIA_PRIVATE_KEY]
        : process.env.TESTNET_PRIVATE_KEY
        ? [process.env.TESTNET_PRIVATE_KEY]
        : [],
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
