import { z } from 'zod';
import { FabricConfig, OwnerCommandSchedule, SimulationOptions } from './types';

const id = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/)
  .refine((s) => !s.includes('..'));
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const natural = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
// Job IDs are opaque keys, not paths or shard identifiers. Preserve names
// accepted by blueprints, including spaces and tenant-qualified IDs.
export const jobIdSchema = z.string().min(1);
const policy = z.object({
  target: id,
  threshold: natural,
  maxDrainPerTick: positive.optional(),
  requiredSkills: z.array(z.string().min(1)).optional(),
  weight: z.number().finite().optional(),
});
const router = z.object({
  queueAlertThreshold: natural.optional(),
  spilloverPolicies: z.array(policy).optional(),
});
const shard = z.object({
  id,
  displayName: z.string().min(1),
  latencyBudgetMs: positive,
  spilloverTargets: z.array(id),
  maxQueue: positive,
  router: router.optional(),
});
const node = z
  .object({
    id,
    region: id,
    capacity: positive,
    specialties: z.array(z.string().min(1)).min(1),
    heartbeatIntervalSec: positive,
    maxConcurrency: positive,
  })
  .passthrough();
const reporting = z.object({ directory: z.string().min(1), defaultLabel: id });
const checkpoint = z.object({
  path: z.string().min(1),
  intervalTicks: positive,
});
const configSchema = z.object({
  owner: z.object({
    name: z.string(),
    address: z.string(),
    multisig: z.string(),
    pauseRole: z.string(),
    commandDeck: z.array(z.string()),
  }),
  shards: z.array(shard).min(1),
  nodes: z.array(node),
  reporting,
  checkpoint,
});
const reason = { reason: z.string().optional() };
const locator = z.object({
  kind: z.literal('tail'),
  shard: id.optional(),
  offset: natural.optional(),
  includeInFlight: z.boolean().optional(),
});
const command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('system.pause'), ...reason }),
  ...(['system.resume', 'checkpoint.save'] as const).map((type) =>
    z.object({ type: z.literal(type), ...reason })
  ),
  ...(['shard.pause', 'shard.resume'] as const).map((type) =>
    z.object({ type: z.literal(type), shard: id, ...reason })
  ),
  z.object({ type: z.literal('shard.register'), shard, ...reason }),
  z.object({
    type: z.literal('shard.deregister'),
    shard: id,
    redistribution: z
      .discriminatedUnion('mode', [
        z.object({ mode: z.literal('spillover'), targetShard: id.optional() }),
        z.object({
          mode: z.literal('cancel'),
          cancelReason: z.string().optional(),
        }),
      ])
      .optional(),
    ...reason,
  }),
  z.object({
    type: z.literal('shard.update'),
    shard: id,
    update: shard.omit({ id: true }).partial(),
  }),
  z.object({ type: z.literal('node.register'), node, ...reason }),
  z.object({ type: z.literal('node.deregister'), nodeId: id, ...reason }),
  z.object({
    type: z.literal('node.update'),
    nodeId: id,
    update: node.omit({ id: true }).partial(),
    ...reason,
  }),
  z.object({
    type: z.literal('job.cancel'),
    jobId: jobIdSchema.optional(),
    locator: locator.optional(),
    ...reason,
  }),
  z.object({
    type: z.literal('job.reroute'),
    jobId: jobIdSchema.optional(),
    locator: locator.optional(),
    targetShard: id,
    ...reason,
  }),
  z.object({
    type: z.literal('checkpoint.configure'),
    update: checkpoint.partial(),
    ...reason,
  }),
  z.object({
    type: z.literal('reporting.configure'),
    update: reporting.partial(),
    ...reason,
  }),
]);
export function validateOwnerSchedule(
  value: unknown
): asserts value is OwnerCommandSchedule[] {
  z.array(
    z.object({ tick: natural, command, note: z.string().optional() })
  ).parse(value);
}
export function validateOwnerCommand(value: unknown): void {
  command.parse(value);
}
export function validateLabel(value: string): void {
  id.parse(value);
}
export function validateFabricConfig(
  value: unknown
): asserts value is FabricConfig {
  const c = configSchema.parse(value);
  const shards = new Set(c.shards.map((s) => s.id));
  if (
    shards.size !== c.shards.length ||
    new Set(c.nodes.map((n) => n.id)).size !== c.nodes.length
  )
    throw new Error('Duplicate shard or node ID');
  for (const s of c.shards)
    for (const target of [
      ...s.spilloverTargets,
      ...(s.router?.spilloverPolicies ?? []).map((p) => p.target),
    ])
      if (!shards.has(target) || target === s.id)
        throw new Error(`Invalid spillover target ${target}`);
  for (const n of c.nodes)
    if (!shards.has(n.region))
      throw new Error(`Unknown node region ${n.region}`);
}
export function validateSimulation(
  config: FabricConfig,
  options: SimulationOptions
): void {
  validateFabricConfig(config);
  positive.max(1000000).parse(options.jobs);
  if (options.outputLabel !== undefined) validateLabel(options.outputLabel);
  if (options.stopAfterTicks !== undefined)
    z.number().finite().positive().parse(options.stopAfterTicks);
  if (options.outageTick !== undefined) positive.parse(options.outageTick);
  if (
    options.simulateOutage &&
    !config.nodes.some((n) => n.id === options.simulateOutage)
  )
    throw new Error('Unknown outage node');
  validateOwnerSchedule(options.ownerCommands ?? []);
}
