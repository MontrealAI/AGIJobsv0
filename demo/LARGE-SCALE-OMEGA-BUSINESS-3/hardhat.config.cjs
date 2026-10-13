require('ts-node/register/transpile-only');
require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
const path = require('node:path');
module.exports = {
  defaultNetwork: 'hardhat',
  networks: { hardhat: { chainId: 31337 } },
  solidity: {
    version: '0.8.37',
    settings: { evmVersion: "cancun", viaIR: true, optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    root: path.resolve(__dirname, '../..'),
    sources: path.join(__dirname, 'contracts'),
    tests: path.resolve(__dirname, '../../test/demo'),
    cache: path.join(__dirname, '.cache'),
    artifacts: path.join(__dirname, '.artifacts'),
  },
  mocha: { timeout: 120000 },
};
