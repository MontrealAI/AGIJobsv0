import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import {
  FabricConfig,
  JobBlueprint,
  LoadedMissionPlan,
  MissionPlanFile,
  MissionPlanMetadata,
  MissionPlanRuntime,
  OwnerCommandSchedule,
  SpilloverPolicy,
} from './types';
import { loadJobBlueprint as loadBlueprint } from './job-blueprint';

function cloneSpilloverPolicies(policies: SpilloverPolicy[] | undefined): SpilloverPolicy[] | undefined {
  if (!policies) {
    return undefined;
  }
  return policies.map((policy) => ({ ...policy }));
}

export function cloneFabricConfig(config: FabricConfig): FabricConfig {
  return {
    owner: {
      ...config.owner,
      commandDeck: [...config.owner.commandDeck],
    },
    shards: config.shards.map((shard) => ({
      ...shard,
      spilloverTargets: [...shard.spilloverTargets],
      router: shard.router
        ? {
            queueAlertThreshold: shard.router.queueAlertThreshold,
            spilloverPolicies: cloneSpilloverPolicies(shard.router.spilloverPolicies),
          }
        : undefined,
    })),
    nodes: config.nodes.map((node) => ({
      ...node,
      specialties: [...node.specialties],
    })),
    checkpoint: { ...config.checkpoint },
    reporting: { ...config.reporting },
  };
}

export async function loadFabricConfig(path: string): Promise<FabricConfig> {
  const configPath = resolve(path);
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw) as FabricConfig;
  return cloneFabricConfig(parsed);
}

function normaliseOwnerCommands(input: unknown): OwnerCommandSchedule[] {
  const cloneSchedule = (schedule: OwnerCommandSchedule): OwnerCommandSchedule => ({
    tick: schedule.tick,
    command: JSON.parse(JSON.stringify(schedule.command)) as OwnerCommandSchedule['command'],
    note: schedule.note,
  });

  if (Array.isArray(input)) {
    return (input as OwnerCommandSchedule[]).map(cloneSchedule);
  }
  if (input && typeof input === 'object') {
    const maybe = (input as { commands?: OwnerCommandSchedule[] }).commands;
    if (Array.isArray(maybe)) {
      return maybe.map(cloneSchedule);
    }
  }
  throw new Error('Owner command file must be an array or an object with a "commands" array.');
}

export async function loadOwnerCommandSchedule(path: string): Promise<OwnerCommandSchedule[]> {
  const commandsPath = resolve(path);
  const raw = await fs.readFile(commandsPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  return normaliseOwnerCommands(parsed);
}

export function cloneOwnerCommandSchedule(
  commands: OwnerCommandSchedule[] | undefined
): OwnerCommandSchedule[] | undefined {
  if (!commands) {
    return undefined;
  }
  return commands.map((schedule) => ({
    tick: schedule.tick,
    note: schedule.note,
    command: JSON.parse(JSON.stringify(schedule.command)) as OwnerCommandSchedule['command'],
  }));
}

export async function loadJobBlueprint(path: string): Promise<JobBlueprint> {
  return loadBlueprint(path);
}

function cloneMissionPlanMetadata(metadata: MissionPlanMetadata | undefined): MissionPlanMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  return {
    label: metadata.label,
    description: metadata.description,
    author: metadata.author,
    version: metadata.version,
    tags: metadata.tags ? metadata.tags.map((tag) => tag) : undefined,
  };
}

function cloneMissionPlanRuntime(run: MissionPlanRuntime | undefined): MissionPlanRuntime | undefined {
  if (!run) {
    return undefined;
  }
  const checkpoint = run.checkpoint
    ? { path: run.checkpoint.path, intervalTicks: run.checkpoint.intervalTicks }
    : undefined;
  return {
    jobs: run.jobs,
    simulateOutage: run.simulateOutage,
    outageTick: run.outageTick,
    outputLabel: run.outputLabel,
    stopAfterTicks: run.stopAfterTicks,
    resume: run.resume,
    checkpoint,
    preserveReportDirOnResume: run.preserveReportDirOnResume,
    ciMode: run.ciMode,
    ownerCommandSource: run.ownerCommandSource,
  };
}

async function resolveOwnerCommands(
  baseDir: string,
  definition: MissionPlanFile['ownerCommands']
): Promise<{ commands?: OwnerCommandSchedule[]; source?: string }> {
  if (!definition) {
    return {};
  }
  if (typeof definition === 'string') {
    const path = resolve(baseDir, definition);
    return { commands: await loadOwnerCommandSchedule(path), source: path };
  }
  return { commands: cloneOwnerCommandSchedule(definition), source: undefined };
}

async function resolveJobBlueprint(
  baseDir: string,
  definition: MissionPlanFile['jobBlueprint']
): Promise<{ blueprint?: JobBlueprint; source?: string }> {
  if (!definition) {
    return {};
  }
  if (typeof definition === 'string') {
    const path = resolve(baseDir, definition);
    return { blueprint: await loadJobBlueprint(path), source: path };
  }
  return { blueprint: loadBlueprintInline(definition), source: undefined };
}

function loadBlueprintInline(blueprint: JobBlueprint): JobBlueprint {
  const metadata = blueprint.metadata
    ? {
        label: blueprint.metadata.label,
        description: blueprint.metadata.description,
        author: blueprint.metadata.author,
        version: blueprint.metadata.version,
      }
    : undefined;
  return {
    metadata,
    source: blueprint.source,
    jobs: blueprint.jobs.map((entry) => ({
      id: entry.id,
      idPrefix: entry.idPrefix,
      shard: entry.shard,
      requiredSkills: entry.requiredSkills.map((skill) => skill),
      estimatedDurationTicks: entry.estimatedDurationTicks,
      value: entry.value,
      valueStep: entry.valueStep,
      submissionTick: entry.submissionTick,
      count: entry.count,
      note: entry.note,
    })),
  };
}

export async function loadMissionPlan(path: string): Promise<LoadedMissionPlan> {
  const planPath = resolve(path);
  const raw = await fs.readFile(planPath, 'utf8');
  const parsed = JSON.parse(raw) as MissionPlanFile;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Mission plan must be a JSON object.');
  }

  const baseDir = dirname(planPath);

  let config: FabricConfig;
  let configSource: string | undefined;
  if (typeof parsed.config === 'string') {
    const resolvedConfig = resolve(baseDir, parsed.config);
    config = await loadFabricConfig(resolvedConfig);
    configSource = resolvedConfig;
  } else {
    config = cloneFabricConfig(parsed.config);
  }

  const { commands: ownerCommandsInitial, source: ownerCommandsResolvedSource } = await resolveOwnerCommands(
    baseDir,
    parsed.ownerCommands
  );
  const { blueprint: jobBlueprint, source: jobBlueprintSource } = await resolveJobBlueprint(
    baseDir,
    parsed.jobBlueprint
  );

  const run = cloneMissionPlanRuntime(parsed.run);
  if (run?.checkpoint) {
    if (run.checkpoint.intervalTicks !== undefined) {
      config.checkpoint.intervalTicks = run.checkpoint.intervalTicks;
    }
    if (run.checkpoint.path) {
      const resolvedCheckpoint = resolve(baseDir, run.checkpoint.path);
      config.checkpoint.path = resolvedCheckpoint;
      run.checkpoint.path = resolvedCheckpoint;
    }
  }

  if (parsed.reporting) {
    const reporting = { ...config.reporting };
    if (parsed.reporting.directory) {
      reporting.directory = resolve(baseDir, parsed.reporting.directory);
    }
    if (parsed.reporting.defaultLabel) {
      reporting.defaultLabel = parsed.reporting.defaultLabel;
    }
    config.reporting = reporting;
  }

  const metadata = cloneMissionPlanMetadata(parsed.metadata);
  if (metadata?.tags) {
    metadata.tags = metadata.tags.filter((tag) => typeof tag === 'string');
  }

  let ownerCommands = ownerCommandsInitial;
  let ownerCommandsSource = ownerCommandsResolvedSource;
  if (run?.ownerCommandSource) {
    const resolvedSource = resolve(baseDir, run.ownerCommandSource);
    run.ownerCommandSource = resolvedSource;
    if (!ownerCommandsSource) {
      ownerCommandsSource = resolvedSource;
    }
    if (!ownerCommands) {
      ownerCommands = await loadOwnerCommandSchedule(resolvedSource);
    }
  }

  return {
    source: planPath,
    metadata,
    config,
    configSource,
    ownerCommands,
    ownerCommandsSource,
    jobBlueprint,
    jobBlueprintSource,
    run,
  };
}
