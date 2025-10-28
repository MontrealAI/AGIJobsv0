#!/usr/bin/env node
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import { AlphaNode } from './node';
import { startAlphaNodeServer } from './server/httpServer';
import { defaultOpportunities } from './utils/opportunities';

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
  .demandCommand()
  .strict()
  .help().argv;
