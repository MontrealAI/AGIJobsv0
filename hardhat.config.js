require('@nomicfoundation/hardhat-toolbox');
require('hardhat-gas-reporter');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      { version: '0.8.25', settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true } },
      { version: '0.8.23', settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true } },
      { version: '0.8.21', settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true } }
    ]
  },
  paths: {
    sources: './contracts'
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true
    }
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
    showTimeSpent: true,
  }
};
