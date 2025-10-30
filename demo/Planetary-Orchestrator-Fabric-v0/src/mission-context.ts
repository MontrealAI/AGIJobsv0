import { resolve } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadFabricConfig, loadMissionPlan } from './config-loader';
import { MissionPlanMetadata, MissionPlanRuntime } from './types';

export interface MissionPlanDescriptor {
  source: string;
  label?: string;
  description?: string;
  author?: string;
  version?: string;
  tags?: string[];
  run?: MissionPlanRuntime;
  configSource?: string;
  ownerCommandsSource?: string;
  jobBlueprintSource?: string;
}

export interface MissionContext {
  configSource?: string;
  reportingDirectory: string;
  reportingDefaultLabel?: string;
  checkpointPath: string;
  checkpointInterval: number;
  missionPlan?: MissionPlanDescriptor;
}

function buildDescriptor(
  metadata: MissionPlanMetadata | undefined,
  plan: MissionPlanDescriptor
): MissionPlanDescriptor {
  return {
    ...plan,
    label: metadata?.label,
    description: metadata?.description,
    author: metadata?.author,
    version: metadata?.version,
    tags: metadata?.tags ? [...metadata.tags] : undefined,
  };
}

export async function resolveMissionContext(options: {
  configPath?: string;
  planPath?: string;
}): Promise<MissionContext> {
  const hasConfig = options.configPath !== undefined;
  const hasPlan = options.planPath !== undefined;
  if (!hasConfig && !hasPlan) {
    throw new Error('Provide either a config path or a mission plan path.');
  }
  if (hasConfig && hasPlan) {
    throw new Error('Use --config or --plan, but not both.');
  }

  if (hasPlan) {
    const plan = await loadMissionPlan(options.planPath!);
    const descriptor: MissionPlanDescriptor = {
      source: plan.source,
      run: plan.run,
      configSource: plan.configSource ? resolve(plan.configSource) : undefined,
      ownerCommandsSource: plan.ownerCommandsSource ? resolve(plan.ownerCommandsSource) : undefined,
      jobBlueprintSource: plan.jobBlueprintSource ? resolve(plan.jobBlueprintSource) : undefined,
    };
    return {
      configSource: descriptor.configSource,
      reportingDirectory: plan.config.reporting.directory,
      reportingDefaultLabel: plan.config.reporting.defaultLabel,
      checkpointPath: plan.config.checkpoint.path,
      checkpointInterval: plan.config.checkpoint.intervalTicks,
      missionPlan: buildDescriptor(plan.metadata, descriptor),
    };
  }

  const config = await loadFabricConfig(options.configPath!);
  const configSource = options.configPath ? resolve(options.configPath) : undefined;
  return {
    configSource,
    reportingDirectory: config.reporting.directory,
    reportingDefaultLabel: config.reporting.defaultLabel,
    checkpointPath: config.checkpoint.path,
    checkpointInterval: config.checkpoint.intervalTicks,
  };
}

async function runFromCli(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('config', { type: 'string', describe: 'Path to fabric configuration JSON' })
    .option('plan', { type: 'string', describe: 'Path to mission plan JSON' })
    .option('pretty', { type: 'boolean', describe: 'Pretty-print JSON output', default: false })
    .check((parsed) => {
      const hasConfig = parsed.config !== undefined;
      const hasPlan = parsed.plan !== undefined;
      if (!hasConfig && !hasPlan) {
        throw new Error('Provide either --config or --plan.');
      }
      if (hasConfig && hasPlan) {
        throw new Error('Use --config or --plan, but not both.');
      }
      return true;
    })
    .parseAsync();

  const context = await resolveMissionContext({
    configPath: argv.config as string | undefined,
    planPath: argv.plan as string | undefined,
  });

  const output = argv.pretty ? JSON.stringify(context, null, 2) : JSON.stringify(context);
  process.stdout.write(`${output}\n`);
}

if (require.main === module) {
  runFromCli().catch((error) => {
    console.error('Failed to resolve mission context', error);
    process.exitCode = 1;
  });
}
