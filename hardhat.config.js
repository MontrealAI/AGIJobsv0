require('@nomicfoundation/hardhat-toolbox');
require('hardhat-gas-reporter');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
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
  },
  paths: {
    sources: './contracts',
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      gas: 100000000,
      blockGasLimit: 100000000,
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
