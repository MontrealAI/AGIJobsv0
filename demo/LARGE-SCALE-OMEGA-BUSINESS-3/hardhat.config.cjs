require('ts-node/register/transpile-only');
require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
const path = require('node:path');
const { subtask } = require('hardhat/config');
const {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
} = require('hardhat/builtin-tasks/task-names');
const longVersion = require('solc').version();
if (!longVersion.startsWith('0.8.26+'))
  throw new Error('This fixture expects the repository lockfile solc 0.8.26');
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(
  async ({ solcVersion }) => {
    if (solcVersion !== '0.8.26')
      throw new Error('Unexpected fixture compiler');
    return {
      compilerPath: require.resolve('solc/soljson.js'),
      isSolcJs: true,
      version: solcVersion,
      longVersion,
    };
  }
);
module.exports = {
  defaultNetwork: 'hardhat',
  networks: { hardhat: { chainId: 31337 } },
  solidity: {
    version: '0.8.26',
    settings: { viaIR: true, optimizer: { enabled: true, runs: 200 } },
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
