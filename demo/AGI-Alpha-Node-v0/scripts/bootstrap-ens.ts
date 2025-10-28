#!/usr/bin/env tsx
import { Command } from 'commander';
import { config as loadEnv } from 'dotenv';
import { namehash } from 'ethers';

import { DEFAULT_CONFIG } from '../config/defaults.js';
import { createLogger } from '../src/utils/telemetry.js';
import { EnsVerifier } from '../src/integration/ensVerifier.js';
import { loadConfig } from '../src/utils/config.js';

loadEnv();

const program = new Command();
program
  .name('bootstrap-ens')
  .description('Guided ENS bootstrap for AGI Alpha Node operators')
  .requiredOption('--label <label>', 'ENS label, e.g., yourname')
  .option('--ens-root <root>', 'ENS root node', DEFAULT_CONFIG.ens.rootNode)
  .option('--rpc <url>', 'Ethereum RPC URL', process.env.ALPHA_NODE_RPC)
  .option('--address <address>', 'Expected operator address')
  .parse(process.argv);

const options = program.opts();

const logger = createLogger('bootstrap-ens');
const config = loadConfig();
const verifier = new EnsVerifier({
  providerUrl: options.rpc ?? process.env.ALPHA_NODE_RPC ?? 'http://localhost:8545',
  ensRoot: options.ensRoot,
  nameWrapperAddress: config.ens?.nameWrapper ?? DEFAULT_CONFIG.ens.nameWrapper
});

async function main(): Promise<void> {
  const fqdn = `${options.label}.${options.ensRoot}`;
  logger.info({ fqdn }, 'Checking ENS ownership and resolver records');

  const proof = await verifier.buildOwnershipProof(fqdn, options.address);
  if (!proof.isValid) {
    logger.error({ proof }, 'Ownership check failed. Please follow guided steps.');
    logger.info('1. Register the subdomain using the ENS NameWrapper.');
    logger.info('2. Set the ETH resolver address to your node wallet.');
    logger.info('3. Re-run this command.');
    process.exitCode = 1;
    return;
  }

  logger.info({ owner: proof.owner }, 'ENS ownership verified. Namehash recorded.');
  logger.info({ namehash: namehash(fqdn) }, 'Store this namehash in your control plane.');
}

void main();
