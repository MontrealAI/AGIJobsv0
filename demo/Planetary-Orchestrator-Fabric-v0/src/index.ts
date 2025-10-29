import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadFabricConfig, loadJobBlueprint, loadOwnerCommandSchedule } from './config-loader';
import { runSimulation } from './simulation';
import { OwnerCommandSchedule, SimulationOptions } from './types';
import { countJobsInBlueprint } from './job-blueprint';

function lastValue<T>(value: T | T[] | undefined): T | undefined {
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  return value;
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
    .option('owner-commands', {
      type: 'string',
      describe: 'Path to owner command schedule JSON',
    })
    .option('jobs-blueprint', {
      type: 'string',
      describe: 'Path to a job blueprint JSON file',
    })
    .option('stop-after-ticks', {
      type: 'number',
      describe: 'Stop the run after the provided number of ticks (for restart drills)',
    })
    .option('preserve-report-on-resume', {
      type: 'boolean',
      default: true,
      describe: 'Preserve existing reports when resuming from a checkpoint',
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

  const config = await loadFabricConfig(argv.config);
  const checkpointInterval = lastValue(argv['checkpoint-interval']);
  if (typeof checkpointInterval === 'number') {
    config.checkpoint.intervalTicks = checkpointInterval;
  }
  const checkpointPath = lastValue(argv.checkpoint);
  if (checkpointPath) {
    config.checkpoint.path = checkpointPath;
  }

  const ownerCommandsPath = lastValue(argv['owner-commands']);
  let ownerCommands: OwnerCommandSchedule[] | undefined;
  if (ownerCommandsPath) {
    ownerCommands = await loadOwnerCommandSchedule(ownerCommandsPath);
  }

  const blueprintPath = lastValue(argv['jobs-blueprint']);
  const jobBlueprint = blueprintPath ? await loadJobBlueprint(blueprintPath) : undefined;
  const plannedJobs = countJobsInBlueprint(jobBlueprint);
  const jobsOverride = plannedJobs > 0 ? plannedJobs : undefined;

  const options: SimulationOptions = {
    jobs: jobsOverride ?? (lastValue(argv.jobs) ?? 10000),
    simulateOutage: lastValue(argv['simulate-outage']),
    outageTick: lastValue(argv['outage-tick']),
    resume: lastValue(argv.resume) ?? false,
    checkpointPath: lastValue(argv.checkpoint),
    outputLabel: lastValue(argv['output-label']),
    ciMode: lastValue(argv.ci) ?? false,
    ownerCommands,
    ownerCommandSource: ownerCommandsPath,
    stopAfterTicks: lastValue(argv['stop-after-ticks']),
    preserveReportDirOnResume: lastValue(argv['preserve-report-on-resume']) ?? true,
    jobBlueprint,
    jobBlueprintSource: blueprintPath,
  };

  const result = await runSimulation(config, options);

  const log = {
    message: 'Planetary Orchestrator Fabric run complete',
    checkpointRestored: result.checkpointRestored,
    metrics: result.metrics,
    artifacts: result.artifacts,
    run: result.run,
    ownerCommands: {
      scheduled: ownerCommands?.length ?? 0,
      executed: result.executedOwnerCommands.length,
      pending: result.pendingOwnerCommands.length,
      skippedBeforeResume: result.skippedOwnerCommands.length,
    },
  };
  process.stdout.write(`${JSON.stringify(log, null, 2)}\n`);
}

main().catch((error) => {
  console.error('Planetary Orchestrator Fabric run failed', error);
  process.exitCode = 1;
});
