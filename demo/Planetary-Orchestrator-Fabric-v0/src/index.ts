import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  loadFabricConfig,
  loadJobBlueprint,
  loadMissionPlan,
  loadOwnerCommandSchedule,
} from './config-loader';
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
    })
    .option('plan', {
      type: 'string',
      describe: 'Path to a mission plan JSON file',
    })
    .option('jobs', {
      type: 'number',
      describe: 'Total jobs to seed across shards',
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
      describe: 'Preserve existing reports when resuming from a checkpoint',
    })
    .option('resume', {
      type: 'boolean',
      describe: 'Resume from an existing checkpoint',
    })
    .option('ci', {
      type: 'boolean',
      describe: 'Run in CI mode (reduced output)',
    })
    .check((parsed) => {
      const hasConfig = parsed.config !== undefined;
      const hasPlan = parsed.plan !== undefined;
      if (!hasConfig && !hasPlan) {
        throw new Error('Provide either --config or --plan to launch the planetary fabric.');
      }
      if (hasConfig && hasPlan) {
        throw new Error('Use --config or --plan, but not both simultaneously.');
      }
      return true;
    })
    .parseAsync();

  const planPath = lastValue(argv.plan);
  const plan = planPath ? await loadMissionPlan(planPath) : undefined;
  const configPath = lastValue(argv.config);
  const config = configPath ? await loadFabricConfig(configPath) : plan!.config;

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
  let ownerCommandSource: string | undefined;
  if (ownerCommandsPath) {
    ownerCommands = await loadOwnerCommandSchedule(ownerCommandsPath);
    ownerCommandSource = ownerCommandsPath;
  } else if (plan?.ownerCommands) {
    ownerCommands = plan.ownerCommands;
    ownerCommandSource = plan.ownerCommandsSource;
  }

  const blueprintPath = lastValue(argv['jobs-blueprint']);
  let jobBlueprint = blueprintPath ? await loadJobBlueprint(blueprintPath) : undefined;
  let jobBlueprintSource = blueprintPath;
  if (!jobBlueprint && plan?.jobBlueprint) {
    jobBlueprint = plan.jobBlueprint;
    jobBlueprintSource = plan.jobBlueprintSource;
  }

  const missionPlanInfo = plan
    ? {
        source: plan.source,
        label: plan.metadata?.label,
        description: plan.metadata?.description,
        author: plan.metadata?.author,
        version: plan.metadata?.version,
        tags: plan.metadata?.tags,
        run: plan.run,
        configSource: plan.configSource,
        ownerCommandsSource: ownerCommandSource ?? plan.ownerCommandsSource,
        jobBlueprintSource: jobBlueprintSource ?? plan.jobBlueprintSource,
      }
    : undefined;

  const planRun = missionPlanInfo?.run;

  const plannedJobs = countJobsInBlueprint(jobBlueprint);
  const jobsOverride = plannedJobs > 0 ? plannedJobs : undefined;
  const jobsArg = lastValue(argv.jobs);

  const options: SimulationOptions = {
    jobs: jobsOverride ?? (jobsArg ?? planRun?.jobs ?? 10000),
    simulateOutage: lastValue(argv['simulate-outage']) ?? planRun?.simulateOutage,
    outageTick: lastValue(argv['outage-tick']) ?? planRun?.outageTick,
    resume: lastValue(argv.resume) ?? planRun?.resume ?? false,
    checkpointPath: lastValue(argv.checkpoint),
    outputLabel: lastValue(argv['output-label']) ?? planRun?.outputLabel,
    ciMode: lastValue(argv.ci) ?? planRun?.ciMode ?? false,
    ownerCommands,
    ownerCommandSource: ownerCommandSource ?? planRun?.ownerCommandSource,
    stopAfterTicks: lastValue(argv['stop-after-ticks']) ?? planRun?.stopAfterTicks,
    preserveReportDirOnResume:
      lastValue(argv['preserve-report-on-resume']) ?? planRun?.preserveReportDirOnResume ?? true,
    jobBlueprint,
    jobBlueprintSource: jobBlueprintSource ?? jobBlueprint?.source,
    missionPlan: missionPlanInfo,
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
    missionPlan: missionPlanInfo
      ? {
          label: missionPlanInfo.label,
          source: missionPlanInfo.source,
          run: missionPlanInfo.run,
        }
      : undefined,
  };
  process.stdout.write(`${JSON.stringify(log, null, 2)}\n`);
}

main().catch((error) => {
  console.error('Planetary Orchestrator Fabric run failed', error);
  process.exitCode = 1;
});
