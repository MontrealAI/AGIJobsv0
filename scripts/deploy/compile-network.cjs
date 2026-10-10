#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const network = process.argv[2];
if (process.argv.length !== 3 || !['mainnet', 'sepolia'].includes(network)) {
  console.error(
    'Usage: node scripts/deploy/compile-network.cjs mainnet|sepolia'
  );
  process.exitCode = 1;
} else {
  // Generate token constants for the target before compiling. Compilation is
  // local and never needs a public-network signer or sends RPC transactions.
  const env = {
    ...process.env,
    AGJ_NETWORK: network,
    HARDHAT_NETWORK: 'hardhat',
  };
  for (const args of [
    [
      require.resolve('ts-node/dist/bin'),
      '--compiler-options',
      '{"module":"commonjs"}',
      'scripts/generate-constants.ts',
      '--network',
      network,
    ],
    [require.resolve('hardhat/internal/cli/cli'), 'compile'],
    ['scripts/release/check-contract-size.js'],
  ]) {
    const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      process.exitCode = result.status || 1;
      break;
    }
  }
}
