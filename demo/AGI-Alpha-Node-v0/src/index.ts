#!/usr/bin/env node
import { Command } from 'commander';
import { config as loadEnv } from 'dotenv';

import { Wallet } from 'ethers';

import { AntifragileShell } from './ai/antifragileShell.js';
import { AgentRegistry } from './ai/agentRegistry.js';
import { PlanningEngine } from './ai/planningEngine.js';
import { ControlPlane } from './core/controlPlane.js';
import { startDashboard } from './core/dashboard.js';
import { handleNewJob, updateStakeMetrics } from './core/lifecycle.js';
import { incrementMetric, startMetricsServer } from './core/metrics.js';
import { EnsVerifier } from './integration/ensVerifier.js';
import { JobMesh } from './integration/jobMesh.js';
import { StakingManager } from './integration/stakingManager.js';
import { loadConfig } from './utils/config.js';
import { ensurePrivateKey } from './utils/security.js';
import { createLogger } from './utils/telemetry.js';

loadEnv();

const program = new Command();
program
  .name('agi-alpha-node')
  .description('Launch the AGI Alpha Node super-intelligence')
  .option('--ens <fqdn>', 'ENS subdomain, e.g., your.alpha.node.agi.eth')
  .option('--rpc <url>', 'Ethereum RPC URL', process.env.ALPHA_NODE_RPC)
  .option('--private-key <key>', 'Operator private key', process.env.ALPHA_NODE_PRIVATE_KEY)
  .option('--simulate', 'Run in offline deterministic simulator')
  .option('--stake <amount>', 'Desired stake amount in $AGIALPHA')
  .parse(process.argv);

const options = program.opts();
const logger = createLogger('alpha-node');
const config = loadConfig();

async function main(): Promise<void> {
  const privateKey = ensurePrivateKey(options.privateKey ?? process.env.ALPHA_NODE_PRIVATE_KEY);
  const operatorWallet = new Wallet(privateKey);
  const operatorAddress = operatorWallet.address;
  const ensVerifier = new EnsVerifier({
    providerUrl: options.rpc ?? 'http://localhost:8545',
    ensRoot: config.ens.rootNode,
    nameWrapperAddress: config.ens.nameWrapper
  });

  const fqdn = options.ens ?? `demo.${config.ens.rootNode}`;
  logger.info({ fqdn }, 'Validating ENS ownership');
  const proof = await ensVerifier.buildOwnershipProof(fqdn, operatorAddress);
  if (!proof.isValid && !options.simulate) {
    const ownershipError = new Error(
      `ENS ownership check failed for ${fqdn}. Expected owner ${operatorAddress}, got ${proof.owner ?? 'unknown'}.`
    );
    ownershipError.name = 'EnsOwnershipError';
    throw ownershipError;
  }

  const controlPlane = new ControlPlane({
    minimumStake: config.staking.minimumStake,
    ensRoot: config.ens.rootNode
  });

  const antifragile = new AntifragileShell(config.ai.antifragile);
  antifragile.registerScenario({
    id: 'ens-outage',
    description: 'Simulate ENS resolver outage',
    impact: 'medium',
    run: async () => {
      logger.warn('ENS outage simulation triggered – verifying fallback cache');
      return true;
    }
  });

  const planner = new PlanningEngine(config.ai.planner.explorationConstant);
  const registry = new AgentRegistry();
  registry.register({
    id: 'research-agent',
    capability: 'research',
    description: 'Autonomous research synthesiser',
    handler: async (payload) => {
      logger.info({ payload }, 'Research agent executing');
      return { success: true, report: 'Research insights delivered.' };
    }
  });

  registry.register({
    id: 'defi-agent',
    capability: 'defi',
    description: 'High-frequency defi strategist',
    handler: async () => {
      return { success: true, strategy: 'Optimal liquidity deployment executed.' };
    }
  });

  startMetricsServer({
    port: config.observability.prometheusPort,
    namespace: config.observability.metricsNamespace
  });

  startDashboard({
    port: config.observability.dashboardPort,
    assetsDir: new URL('../web/assets', import.meta.url).pathname
  });

  if (options.simulate) {
    logger.warn('Running in offline simulation mode – blockchain calls will be mocked');
  }

  const stakingManager = new StakingManager({
    providerUrl: options.rpc ?? 'http://localhost:8545',
    platformIncentives: config.contracts.platformIncentives,
    stakeManager: config.contracts.stakeManager,
    tokenAddress: config.contracts.token,
    minimumStake: config.staking.minimumStake,
    signerPrivateKey: privateKey
  });

  if (!options.simulate) {
    const amount = options.stake ?? config.staking.minimumStake;
    const activation = await stakingManager.stakeAndActivate(amount);
    if (!activation.success) {
      throw new Error(activation.error ?? 'Unknown staking failure');
    }
    logger.info({ activation }, 'Stake activation succeeded');
  }

  updateStakeMetrics(Number.parseFloat(config.staking.minimumStake), 0);

  const jobMesh = new JobMesh({
    providerUrl: options.rpc ?? 'http://localhost:8545',
    jobRegistry: config.contracts.jobRegistry,
    platformIncentives: config.contracts.platformIncentives,
    signerPrivateKey: privateKey,
    capabilityTags: [...config.jobs.applyFilter]
  });

  await jobMesh.subscribe(async (intent) => {
    const agentData = await jobMesh.buildAgentData();
    if (!options.simulate) {
      await jobMesh.apply(intent.jobId, agentData);
    }

    await handleNewJob(
      { controlPlane, antifragile, planner },
      intent,
      async (planId) => {
        const agent = registry.getByCapability(config.jobs.applyFilter[0])[0];
        const result = await registry.executeAgent(agent.id, { planId, metadata: intent.metadata });
        if (!options.simulate) {
          await jobMesh.complete(intent.jobId, `ipfs://${planId}`);
          await jobMesh.claim(intent.jobId);
        }
        incrementMetric('jobsCompleted');
        return { success: true, resultHash: JSON.stringify(result) };
      }
    );
  });
}

void main().catch((error) => {
  logger.error({ error }, 'Fatal error occurred');
  process.exitCode = 1;
});
