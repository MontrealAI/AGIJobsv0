require('ts-node/register/transpile-only');
require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');
require('solidity-coverage');

module.exports = {
  solidity: {
    version: '0.8.25',
    settings: {
      optimizer: { enabled: false, runs: 0 },
    },
  },
  paths: {
    sources: './contracts/coverage',
    tests: './test/coverage',
  },
  mocha: {
    require: ['ts-node/register/transpile-only', './test/setup.js'],
    timeout: 300000,
  },
};
