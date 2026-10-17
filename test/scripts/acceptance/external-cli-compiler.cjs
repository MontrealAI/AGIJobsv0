'use strict';
// Separate process releases the canonical parsed 48 MiB compiler build afterward.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const { ethers } = require('ethers');
const {
  createAuthoritySourceReader,
} = require('../../../scripts/deploy/authority-runtime.cjs');
const { loadTokenConfig } = require('../../../scripts/config/index.js');
const output = process.argv[2];
if (!output || !path.isAbsolute(output) || output.startsWith(root + path.sep))
  throw Error('Private external output required');
const { config: token } = loadTokenConfig({ network: 'localhost' });
const source = createAuthoritySourceReader(root)(
  'Deployer',
  ethers.ZeroAddress,
  { token: token.address }
);
fs.writeFileSync(
  output,
  JSON.stringify({
    compiler: source.compiler,
    compilerInputSha256: source.compilerInputSha256,
    coordinatorBytecodeHash: ethers.keccak256(source.bytecode),
    coordinatorRuntimeHash: ethers.keccak256(source.runtime),
  }) + '\n',
  { flag: 'wx', mode: 0o600 }
);
