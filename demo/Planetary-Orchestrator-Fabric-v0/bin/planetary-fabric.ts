#!/usr/bin/env tsx
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'node:path';
import chalk from 'chalk';
import { PlanetaryFabricOrchestrator } from '../src/orchestrator.js';
import { loadConfig } from '../src/config.js';

const CONFIG_PATH = path.resolve('demo/Planetary-Orchestrator-Fabric-v0/config/fabric.config.json');

const main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .command(
      'run',
      'Execute the high-load planetary orchestration drill',
      (y) =>
        y
          .option('jobs', {
            type: 'number',
            default: 2_000,
            describe: 'Number of jobs per shard to submit (use --jobs 10000 for acceptance drill)',
          })
          .option('seed', {
            type: 'string',
            default: 'planetary-fabric',
            describe: 'Deterministic seed used for the RNG',
          })
          .option('simulate-failure-tick', {
            type: 'number',
            describe: 'Tick on which to simulate orchestrator restart + node failure',
          })
          .option('spillover-target', {
            type: 'number',
            default: 0.35,
            describe: 'Override for spillover balance threshold',
          }),
      (args) => {
        const orchestrator = new PlanetaryFabricOrchestrator(CONFIG_PATH, args.seed);
        const config = loadConfig(CONFIG_PATH);
        const shards = config.shards.map((shard) => shard.id);
        console.log(chalk.cyan(`Submitting ${args.jobs} jobs across shards: ${shards.join(', ')}`));
        const result = orchestrator.simulateHighLoad(args.jobs, shards, {
          simulateNodeFailureAtTick: args['simulate-failure-tick'],
          spilloverBalanceTarget: args['spillover-target'],
        });
        printSummary(result);
      },
    )
    .command(
      'status',
      'Print the current fabric topology and owner controls',
      () => {},
      () => {
        const orchestrator = new PlanetaryFabricOrchestrator(CONFIG_PATH);
        const bundle = orchestrator.getState();
        console.log(chalk.bold('Mermaid Topology Diagram'));
        console.log(bundle.mermaid);
        console.log();
        console.log(chalk.bold('Owner Interventions'));
        if (!bundle.ownerLog.length) {
          console.log('  None yet. Use "owner set" to override parameters.');
        } else {
          for (const entry of bundle.ownerLog) {
            console.log(`  [tick ${entry.tick}] ${entry.actor} set ${entry.parameter} from ${JSON.stringify(entry.previous)} to ${JSON.stringify(entry.next)}`);
          }
        }
      },
    )
    .command(
      'owner set <parameter> <value>',
      'Update a configuration parameter with full owner control guarantees',
      (y) =>
        y
          .positional('parameter', {
            type: 'string',
            describe: 'Dot-notation parameter path (e.g. routers.spilloverBatch)',
          })
          .positional('value', {
            type: 'string',
            describe: 'JSON encoded value',
          })
          .option('actor', {
            type: 'string',
            describe: 'Address performing the intervention',
          }),
      (args) => {
        const orchestrator = new PlanetaryFabricOrchestrator(CONFIG_PATH);
        const value = JSON.parse(args.value);
        orchestrator.ownerAdjust(args.parameter, value, args.actor);
        orchestrator.getState();
        console.log(chalk.green(`Parameter ${args.parameter} updated to ${args.value}`));
      },
    )
    .demandCommand()
    .strict()
    .help().argv;
};

const printSummary = (result: ReturnType<PlanetaryFabricOrchestrator['simulateHighLoad']>) => {
  console.log();
  console.log(chalk.bold('Planetary Fabric Run Summary'));
  console.table({
    'Jobs Submitted': result.jobsSubmitted,
    'Jobs Completed': result.jobsCompleted,
    'Jobs Failed': result.jobsFailed,
    'Failure Rate': `${(result.failedAssignmentRate * 100).toFixed(2)}%`,
    'Spillovers Executed': result.spillovers,
    'Checkpoints Persisted': result.checkpoints,
    'Duration (ticks)': result.durationTicks,
    'Max Queue Skew': result.maxShardSkew,
  });
  console.log(chalk.gray(`Reports written to ${result.outputDirectory}`));
};

void main();
