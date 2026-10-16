#!/usr/bin/env node
'use strict';

// An explicit disposable fixture, never a public-network signer fallback.
async function main() {
  if (process.argv.length !== 2)
    throw new Error(
      'deploy:local accepts no forwarded flags; use the reviewed staged workflow for another configuration.'
    );
  for (const key of [
    'DEPLOYER_ADDRESS',
    'DEPLOY_DEFAULTS_RESUME_EVIDENCE',
    'DEPLOY_DEFAULTS_CONFIG',
  ])
    if (process.env[key])
      throw new Error(
        `deploy:local refuses ${key}; it creates a fresh disposable fixture only.`
      );
  if (process.env.HARDHAT_NETWORK && process.env.HARDHAT_NETWORK !== 'hardhat')
    throw new Error('deploy:local requires the in-process hardhat network.');
  process.env.HARDHAT_NETWORK = 'hardhat';
  require('ts-node/register/transpile-only');
  const hre = require('hardhat');
  if (
    hre.network.name !== 'hardhat' ||
    (await hre.ethers.provider.getNetwork()).chainId !== 31337n ||
    (await hre.ethers.provider.getBlockNumber()) !== 0
  )
    throw new Error(
      'deploy:local requires a fresh in-process Hardhat chain 31337.'
    );
  // This in-process chain is a new instance, independent of other chain-31337 fixtures.
  process.env.DEPLOYMENT_LOCK_DIRECTORY = require('node:fs').mkdtempSync(
    require('node:path').join(
      require('node:os').tmpdir(),
      'agi-hardhat-fixture-locks-'
    )
  );
  const { main: deploy } = require('../../../scripts/v2/deployDefaults.ts');
  await deploy([
    '--config',
    'demo/aurora/config/deployer.hardhat.json',
    '--skip-verify',
  ]);
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main };
