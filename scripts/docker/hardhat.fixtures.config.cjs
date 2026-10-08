'use strict';
const path = require('node:path');
const { subtask } = require('hardhat/config');
const {
  TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS,
} = require('hardhat/builtin-tasks/task-names');
const base = require('../../hardhat.config.js');
const root = path.resolve(__dirname, '../..');

// The positive gateway smoke deploys these real repository test contracts.
// Avoid feeding the entire production source tree to ARM's solcjs fallback;
// Solidity's WASM compiler has bounded input memory independent of Node's heap.
// The normal contract CI continues to compile and test the complete source tree.
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async () =>
  [
    'MockERC20.sol',
    'SimpleJobRegistry.sol',
    'DeterministicValidationModule.sol',
  ].map((file) => path.join(root, 'contracts/test', file))
);

module.exports = {
  ...base,
  paths: {
    ...base.paths,
    root,
    sources: path.join(root, 'contracts'),
    artifacts: path.join(root, 'cache/container-fixtures/artifacts'),
    cache: path.join(root, 'cache/container-fixtures/hardhat'),
  },
  typechain: {
    ...base.typechain,
    outDir: path.join(root, 'cache/container-fixtures/typechain'),
  },
};
