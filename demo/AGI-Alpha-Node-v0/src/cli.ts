#!/usr/bin/env node
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import { AlphaNode } from './node';
import { startAlphaNodeServer } from './server/httpServer';
import { defaultOpportunities } from './utils/opportunities';
import { pausePlatform, resumePlatform } from './blockchain/control';

function parseProofOption(value: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === 'string') {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return undefined;
}

function parseJobId(jobId: unknown): bigint {
  if (typeof jobId === 'string') {
    return BigInt(jobId);
  }
  if (typeof jobId === 'number') {
    return BigInt(jobId);
  }
  throw new Error('Job identifier must be provided.');
}

function requirePrivateKey(): string {
  const key = process.env.ALPHA_NODE_PRIVATE_KEY;
  if (!key) {
    throw new Error('Set ALPHA_NODE_PRIVATE_KEY in your environment.');
  }
  if (!key.startsWith('0x')) {
    return `0x${key}`;
  }
  return key;
}

yargs(hideBin(process.argv))
  .command(
    '$0',
    'Bootstrap the AGI Alpha Node (verify identity, stake, launch dashboard)',
    (cmd) =>
      cmd.option('config', {
        type: 'string',
        describe: 'Path to the alpha node config JSON file.',
        default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
      }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      await node.verifyIdentity();
      await node.stake();
      await node.collectRewards();
      const servers = await startAlphaNodeServer(node, {
        dashboardPort: node.getConfig().monitoring.dashboardPort,
        metricsPort: node.getConfig().monitoring.metricsPort
      });
      node.getLogger().info('bootstrap_complete', {
        dashboardPort: node.getConfig().monitoring.dashboardPort,
        metricsPort: node.getConfig().monitoring.metricsPort
      });
      console.log(`Alpha Node live → dashboard http://localhost:${node.getConfig().monitoring.dashboardPort}`);
      console.log(`Metrics exposed at http://localhost:${node.getConfig().monitoring.metricsPort}/metrics`);
      servers.dashboard.on('close', () => node.getLogger().info('dashboard_shutdown'));
      servers.metrics.on('close', () => node.getLogger().info('metrics_shutdown'));
    }
  )
  .command(
    'verify',
    'Verify ENS ownership and text records',
    (cmd) =>
      cmd.option('config', {
        type: 'string',
        default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
      }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      const result = await node.verifyIdentity();
      console.log(JSON.stringify(result, null, 2));
    }
  )
  .command(
    'stake',
    'Ensure stake requirements are satisfied and activate the node',
    (cmd) =>
      cmd
        .option('config', {
          type: 'string',
          default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
        })
        .option('dry-run', {
          type: 'boolean',
          default: false
        })
        .option('no-ack', {
          type: 'boolean',
          default: false,
          describe: 'Skip tax acknowledgement helper.'
        }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      const report = await node.stake({
        dryRun: Boolean(args['dry-run']),
        acknowledgeTax: !Boolean(args['no-ack'])
      });
      console.log(JSON.stringify(report, null, 2));
    }
  )
  .command(
    'heartbeat',
    'Run a planning + staking + reward heartbeat without launching servers',
    (cmd) =>
      cmd.option('config', {
        type: 'string',
        default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
      }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      const heartbeat = await node.heartbeat(defaultOpportunities());
      console.log(JSON.stringify(heartbeat, null, 2));
    }
  )
  .command(
    'diagnostics',
    'Execute antifragile stress scenarios and print remediation guidance',
    (cmd) =>
      cmd.option('config', {
        type: 'string',
        default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
      }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      const stress = node.stressTest();
      console.log(JSON.stringify(stress, null, 2));
    }
  )
  .command(
    'dashboard',
    'Launch only the dashboard + metrics servers (skip staking actions)',
    (cmd) =>
      cmd.option('config', {
        type: 'string',
        default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
      }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      const servers = await startAlphaNodeServer(node, {
        dashboardPort: node.getConfig().monitoring.dashboardPort,
        metricsPort: node.getConfig().monitoring.metricsPort
      });
      console.log(`Dashboard http://localhost:${node.getConfig().monitoring.dashboardPort}`);
      console.log(`Metrics http://localhost:${node.getConfig().monitoring.metricsPort}/metrics`);
      servers.dashboard.on('close', () => node.getLogger().info('dashboard_shutdown'));
      servers.metrics.on('close', () => node.getLogger().info('metrics_shutdown'));
    }
  )
  .command(
    'jobs discover',
    'Discover open jobs and convert them into planner opportunities',
    (cmd) =>
      cmd
        .option('config', {
          type: 'string',
          default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
        })
        .option('limit', {
          type: 'number',
          describe: 'Maximum number of jobs to return.'
        })
        .option('from-block', {
          type: 'number',
          describe: 'Override the discovery start block.'
        })
        .option('to-block', {
          type: 'number',
          describe: 'Override the discovery end block.'
        })
        .option('include-completed', {
          type: 'boolean',
          default: false
        }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      const jobs = await node.discoverJobs({
        limit: args.limit as number | undefined,
        fromBlock: args['from-block'] as number | undefined,
        toBlock: args['to-block'] as number | undefined,
        includeCompleted: Boolean(args['include-completed'])
      });
      console.log(JSON.stringify({
        jobs,
        opportunities: node.toOpportunities(jobs)
      }, null, 2));
    }
  )
  .command(
    'jobs apply <jobId>',
    'Apply for a job with the configured ENS node identity',
    (cmd) =>
      cmd
        .positional('jobId', {
          type: 'string',
          demandOption: true
        })
        .option('config', {
          type: 'string',
          default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
        })
        .option('dry-run', {
          type: 'boolean',
          default: false
        })
        .option('proof', {
          type: 'string',
          describe: 'Comma-separated ENS merkle proof overrides.'
        }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      const receipt = await node.applyForJob(parseJobId(args.jobId), {
        dryRun: Boolean(args['dry-run']),
        proof: parseProofOption(args.proof)
      });
      console.log(JSON.stringify(receipt, null, 2));
    }
  )
  .command(
    'jobs submit <jobId>',
    'Submit job results to JobRegistry',
    (cmd) =>
      cmd
        .positional('jobId', { type: 'string', demandOption: true })
        .option('config', {
          type: 'string',
          default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
        })
        .option('result-uri', {
          type: 'string',
          describe: 'URI of the result artifact (defaults to config.jobs.execution.defaultResultUri).'
        })
        .option('result-hash', {
          type: 'string',
          describe: 'Precomputed hash of the result artifact.'
        })
        .option('dry-run', { type: 'boolean', default: false })
        .option('proof', { type: 'string', describe: 'Comma-separated ENS merkle proof overrides.' })
        .option('hash-algorithm', {
          type: 'string',
          choices: ['keccak256', 'sha256'] as const
        }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      const receipt = await node.submitJob(parseJobId(args.jobId), {
        dryRun: Boolean(args['dry-run']),
        proof: parseProofOption(args.proof),
        resultUri: (args['result-uri'] as string | undefined) ?? undefined,
        resultHash: (args['result-hash'] as string | undefined) ?? undefined,
        hashAlgorithm: (args['hash-algorithm'] as 'keccak256' | 'sha256' | undefined) ?? undefined
      });
      console.log(JSON.stringify(receipt, null, 2));
    }
  )
  .command(
    'jobs finalize <jobId>',
    'Finalize a completed job and release payment',
    (cmd) =>
      cmd
        .positional('jobId', { type: 'string', demandOption: true })
        .option('config', {
          type: 'string',
          default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
        })
        .option('dry-run', { type: 'boolean', default: false }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      const receipt = await node.finalizeJob(parseJobId(args.jobId), {
        dryRun: Boolean(args['dry-run'])
      });
      console.log(JSON.stringify(receipt, null, 2));
    }
  )
  .command(
    'jobs autopilot',
    'Full discovery → planning → execution cycle',
    (cmd) =>
      cmd
        .option('config', {
          type: 'string',
          default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
        })
        .option('limit', { type: 'number' })
        .option('dry-run', { type: 'boolean', default: false })
        .option('result-uri', { type: 'string' })
        .option('proof', { type: 'string' }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      const report = await node.autopilot({
        limit: args.limit as number | undefined,
        dryRun: Boolean(args['dry-run']),
        resultUri: args['result-uri'] as string | undefined,
        proof: parseProofOption(args.proof)
      });
      console.log(JSON.stringify(report, null, 2));
    }
  )
  .command(
    'owner pause',
    'Pause all core modules via SystemPause',
    (cmd) =>
      cmd.option('config', {
        type: 'string',
        default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
      }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      const receipt = await pausePlatform(node.getConfig(), node.getMetrics(), node.getLogger(), node.getSigner());
      console.log(JSON.stringify(receipt, null, 2));
    }
  )
  .command(
    'owner resume',
    'Resume all core modules via SystemPause',
    (cmd) =>
      cmd.option('config', {
        type: 'string',
        default: 'demo/AGI-Alpha-Node-v0/config/mainnet.guide.json'
      }),
    async (args) => {
      const node = await AlphaNode.fromConfig(args.config as string, requirePrivateKey());
      const receipt = await resumePlatform(node.getConfig(), node.getMetrics(), node.getLogger(), node.getSigner());
      console.log(JSON.stringify(receipt, null, 2));
    }
  )
  .demandCommand()
  .strict()
  .help().argv;
