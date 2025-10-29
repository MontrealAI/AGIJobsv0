import { promises as fs } from 'fs';
import { resolve } from 'path';
import { FabricConfig, JobBlueprint, OwnerCommandSchedule, SpilloverPolicy } from './types';
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
