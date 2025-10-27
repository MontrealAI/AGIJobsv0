import { promises as fs } from 'fs';
import { resolve } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runSimulation } from './simulation';
import { FabricConfig, SimulationOptions } from './types';

function lastValue<T>(value: T | T[] | undefined): T | undefined {
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  return value;
}

async function loadConfig(path: string): Promise<FabricConfig> {
  const configPath = resolve(path);
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw) as FabricConfig;
  return parsed;
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('config', {
      type: 'string',
      describe: 'Path to the fabric configuration JSON',
      demandOption: true,
    })
    .option('jobs', {
      type: 'number',
      describe: 'Total jobs to seed across shards',
      default: 10000,
    })
    .option('simulate-outage', {
      type: 'string',
      describe: 'Node ID to simulate an outage for',
    })
    .option('outage-tick', {
      type: 'number',
      describe: 'Tick to trigger the outage',
    })
    .option('checkpoint', {
      type: 'string',
      describe: 'Override checkpoint path',
    })
    .option('checkpoint-interval', {
      type: 'number',
      describe: 'Override checkpoint interval in ticks',
    })
    .option('output-label', {
      type: 'string',
      describe: 'Label for generated artifacts',
    })
    .option('resume', {
      type: 'boolean',
      default: false,
      describe: 'Resume from an existing checkpoint',
    })
    .option('ci', {
      type: 'boolean',
      default: false,
      describe: 'Run in CI mode (reduced output)',
    })
    .parseAsync();

  const config = await loadConfig(argv.config);
  const checkpointInterval = lastValue(argv['checkpoint-interval']);
  if (typeof checkpointInterval === 'number') {
    config.checkpoint.intervalTicks = checkpointInterval;
  }
  const checkpointPath = lastValue(argv.checkpoint);
  if (checkpointPath) {
    config.checkpoint.path = checkpointPath;
  }

  const options: SimulationOptions = {
    jobs: lastValue(argv.jobs) ?? 10000,
    simulateOutage: lastValue(argv['simulate-outage']),
    outageTick: lastValue(argv['outage-tick']),
    resume: lastValue(argv.resume) ?? false,
    checkpointPath: lastValue(argv.checkpoint),
    outputLabel: lastValue(argv['output-label']),
    ciMode: lastValue(argv.ci) ?? false,
  };

  const result = await runSimulation(config, options);

  const log = {
    message: 'Planetary Orchestrator Fabric run complete',
    checkpointRestored: result.checkpointRestored,
    metrics: result.metrics,
    artifacts: result.artifacts,
  };
  process.stdout.write(`${JSON.stringify(log, null, 2)}\n`);
}

main().catch((error) => {
  console.error('Planetary Orchestrator Fabric run failed', error);
  process.exitCode = 1;
});
