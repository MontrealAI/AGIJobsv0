import { promises as fs } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import { FabricConfig, JobDefinition, JobBlueprint, JobBlueprintEntry, ShardConfig } from './types';

const jobEntrySchema = z
  .object({
    id: z.string().min(1).optional(),
    idPrefix: z.string().min(1).optional(),
    shard: z.string().min(1),
    requiredSkills: z.array(z.string().min(1)).optional(),
    skills: z.array(z.string().min(1)).optional(),
    estimatedDurationTicks: z.number().int().positive().optional(),
    duration: z.number().int().positive().optional(),
    value: z.number().positive().optional(),
    valueStep: z.number().nonnegative().optional(),
    submissionTick: z.number().int().nonnegative().optional(),
    count: z.number().int().positive().optional(),
    note: z.string().optional(),
  })
  .refine(
    (entry) => {
      if (entry.count && entry.count > 1) {
        return Boolean(entry.idPrefix || entry.id === undefined);
      }
      return true;
    },
    {
      message: 'Entries with count > 1 must omit id or provide idPrefix',
      path: ['idPrefix'],
    }
  );

const jobBlueprintSchema = z.object({
  metadata: z
    .object({
      label: z.string().optional(),
      description: z.string().optional(),
      author: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
  jobs: z.array(jobEntrySchema),
});

function normaliseEntry(entry: z.infer<typeof jobEntrySchema>): JobBlueprintEntry {
  const requiredSkills = entry.requiredSkills ?? entry.skills ?? ['general'];
  const estimatedDurationTicks = entry.estimatedDurationTicks ?? entry.duration ?? 1;
  return {
    id: entry.id,
    idPrefix: entry.idPrefix,
    shard: entry.shard,
    requiredSkills,
    estimatedDurationTicks,
    value: entry.value,
    valueStep: entry.valueStep,
    submissionTick: entry.submissionTick,
    count: entry.count ?? 1,
    note: entry.note,
  };
}

export async function loadJobBlueprint(path: string): Promise<JobBlueprint> {
  const blueprintPath = resolve(path);
  const raw = await fs.readFile(blueprintPath, 'utf8');
  const parsed = JSON.parse(raw);
  const result = jobBlueprintSchema.parse(parsed);
  return {
    metadata: result.metadata,
    jobs: result.jobs.map(normaliseEntry),
    source: blueprintPath,
  };
}

function ensureShard(config: FabricConfig, shardId: string): ShardConfig {
  const shard = config.shards.find((entry) => entry.id === shardId);
  if (!shard) {
    throw new Error(`Blueprint references unknown shard ${shardId}`);
  }
  return shard;
}

function generateJobId(
  entry: JobBlueprintEntry,
  shard: ShardConfig,
  counters: Map<string, number>
): string {
  if (entry.count === 1 && entry.id) {
    return entry.id;
  }
  const prefix = entry.idPrefix ?? entry.id ?? `${shard.id}-job`;
  const current = counters.get(prefix) ?? 0;
  counters.set(prefix, current + 1);
  const suffix = (current + 1).toString().padStart(4, '0');
  return `${prefix}-${suffix}`;
}

export function expandJobBlueprint(blueprint: JobBlueprint, config: FabricConfig): JobDefinition[] {
  const counters = new Map<string, number>();
  const jobs: JobDefinition[] = [];
  for (const entry of blueprint.jobs) {
    const shard = ensureShard(config, entry.shard);
    const count = entry.count ?? 1;
    for (let index = 0; index < count; index += 1) {
      const id = generateJobId(entry, shard, counters);
      const valueBase = entry.value ?? 1000;
      const value = valueBase + (entry.valueStep ?? 0) * index;
      jobs.push({
        id,
        shard: shard.id,
        requiredSkills: entry.requiredSkills.length > 0 ? [...new Set(entry.requiredSkills)] : ['general'],
        estimatedDurationTicks: Math.max(entry.estimatedDurationTicks ?? 1, 1),
        value,
        submissionTick: entry.submissionTick ?? 0,
      });
    }
  }
  return jobs;
}

export function countJobsInBlueprint(blueprint: JobBlueprint | undefined): number {
  if (!blueprint) {
    return 0;
  }
  return blueprint.jobs.reduce((total, entry) => total + (entry.count ?? 1), 0);
}

export function cloneJobBlueprint(blueprint: JobBlueprint | undefined): JobBlueprint | undefined {
  if (!blueprint) {
    return undefined;
  }
  return {
    metadata: blueprint.metadata ? { ...blueprint.metadata } : undefined,
    source: blueprint.source,
    jobs: blueprint.jobs.map((entry) => ({
      id: entry.id,
      idPrefix: entry.idPrefix,
      shard: entry.shard,
      requiredSkills: [...entry.requiredSkills],
      estimatedDurationTicks: entry.estimatedDurationTicks,
      value: entry.value,
      valueStep: entry.valueStep,
      submissionTick: entry.submissionTick,
      count: entry.count,
      note: entry.note,
    })),
  };
}

