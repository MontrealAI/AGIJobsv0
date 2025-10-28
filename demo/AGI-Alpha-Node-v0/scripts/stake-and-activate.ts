#!/usr/bin/env tsx
import { Command } from 'commander';
import { config as loadEnv } from 'dotenv';

import { DEFAULT_CONFIG } from '../config/defaults.js';
import { createLogger } from '../src/utils/telemetry.js';
import { StakingManager } from '../src/integration/stakingManager.js';
import { loadConfig } from '../src/utils/config.js';
import { ensurePrivateKey } from '../src/utils/security.js';

loadEnv();

const program = new Command();
program
  .name('stake-and-activate')
  .description('Stake $AGIALPHA and activate the Alpha Node in one motion')
  .option('--amount <amount>', 'Stake amount in $AGIALPHA', DEFAULT_CONFIG.staking.minimumStake)
  .option('--rpc <url>', 'Ethereum RPC URL', process.env.ALPHA_NODE_RPC)
  .option('--private-key <key>', 'Operator private key', process.env.ALPHA_NODE_PRIVATE_KEY)
  .parse(process.argv);

const options = program.opts();
const logger = createLogger('stake-and-activate');
const config = loadConfig();

async function main(): Promise<void> {
  const privateKey = ensurePrivateKey(options.privateKey);
  const staking = new StakingManager({
    providerUrl: options.rpc ?? process.env.ALPHA_NODE_RPC ?? 'http://localhost:8545',
    platformIncentives: config.contracts?.platformIncentives ?? DEFAULT_CONFIG.contracts.platformIncentives,
    stakeManager: config.contracts?.stakeManager ?? DEFAULT_CONFIG.contracts.stakeManager,
    tokenAddress: config.contracts?.token ?? DEFAULT_CONFIG.contracts.token,
    minimumStake: config.staking?.minimumStake ?? DEFAULT_CONFIG.staking.minimumStake,
    signerPrivateKey: privateKey
  });

  const amount = options.amount ?? DEFAULT_CONFIG.staking.minimumStake;
  logger.info({ amount }, 'Preparing stake and activation transaction');

  const result = await staking.stakeAndActivate(amount);
  if (result.success) {
    logger.info(result, 'Stake and activation complete – Alpha Node is live.');
  } else {
    logger.error(result, 'Stake and activation failed. Please review diagnostics.');
    process.exitCode = 1;
  }
}

void main();
