import { z } from "zod";

export const address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((value) => value.toLowerCase());

export const hex32 = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/)
  .transform((value) => value.toLowerCase());

export const oversightSchema = z.object({
  overseer: z.string().min(1),
  cadenceHours: z.number().int().positive(),
  escalationMatrix: z.array(z.string().min(1)).min(1),
});

export const agentSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  safeLimitUSD: z.number().positive(),
  maxParallelJobs: z.number().int().positive(),
});

export const agentTeamSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  leadAgent: z.string().min(1),
  commandStream: z.string().min(1),
  l2Network: z.string().min(1),
  skills: z.array(z.string().min(1)).min(1),
  agents: z.array(agentSchema).min(1),
  usesIoTOracles: z.boolean(),
  humanOversight: oversightSchema,
});

export const operationsSchema = z.object({
  maxActiveJobs: z.number().int().positive(),
  maxQueueDepth: z.number().int().positive(),
  minStake: z.string().regex(/^\d+$/),
  treasuryShareBps: z.number().int().min(0).max(10_000),
  circuitBreakerBps: z.number().int().min(0).max(10_000),
  autopauseThresholdBps: z.number().int().min(0).max(10_000),
  requiresHumanValidation: z.boolean(),
  operatorSafe: address,
  escalationTopic: z.string().min(1),
  delegationLimit: z.number().int().positive(),
});

export const telemetrySchema = z.object({
  resilienceBps: z.number().int().min(0).max(10_000),
  automationBps: z.number().int().min(0).max(10_000),
  complianceBps: z.number().int().min(0).max(10_000),
  settlementLatencySeconds: z.number().int().positive(),
  usesL2Settlement: z.boolean(),
  sentinelOracle: address,
  settlementAsset: address,
  metricsDigest: hex32,
  manifestHash: hex32,
});

export const domainSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  metadataURI: z.string().min(1),
  validationModule: address,
  dataOracle: address,
  l2Gateway: address,
  l2NetworkSlug: z.string().min(1),
  subgraphEndpoint: z.string().url(),
  executionRouter: address,
  heartbeatSeconds: z.number().int().positive(),
  active: z.boolean(),
  operations: operationsSchema,
  telemetry: telemetrySchema,
  agentTeams: z.array(agentTeamSchema).min(1),
});

export const oracleFeedSchema = z.object({
  name: z.string().min(1),
  endpoint: z.string().url(),
  maintainedBy: z.string().min(1),
  heartbeatSeconds: z.number().int().positive(),
  domains: z.array(z.string().min(1)).min(1),
});

export const l2NetworkSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  rpcUrl: z.string().url(),
  gateway: address,
  bridge: address,
  settlement: z.enum(["optimistic", "zk", "validium", "sidechain"]),
});

export const globalSchema = z.object({
  iotOracleRouter: address,
  defaultL2Gateway: address,
  didRegistry: address,
  treasuryBridge: address,
  escalationBridge: address,
  l2SyncCadence: z.number().int().positive(),
  manifestURI: z.string().min(1),
  owner: address,
  expansionManager: address,
  systemPause: address,
  upgradeExecutor: address,
  governanceMultisig: address,
  docs: z.array(z.string().url()).min(1),
});

export const globalGuardsSchema = z.object({
  treasuryBufferBps: z.number().int().min(0).max(10_000),
  circuitBreakerBps: z.number().int().min(0).max(10_000),
  anomalyGracePeriod: z.number().int().positive(),
  autoPauseEnabled: z.boolean(),
  oversightCouncil: address,
});

export const globalTelemetrySchema = z.object({
  manifestHash: hex32,
  metricsDigest: hex32,
  resilienceFloorBps: z.number().int().min(0).max(10_000),
  automationFloorBps: z.number().int().min(0).max(10_000),
  oversightWeightBps: z.number().int().min(0).max(10_000),
  baselineLatencySeconds: z.number().int().positive(),
});

export const manifestSchema = z.object({
  global: globalSchema,
  globalGuards: globalGuardsSchema,
  globalTelemetry: globalTelemetrySchema,
  oracleFeeds: z.array(oracleFeedSchema).min(1),
  l2Networks: z.array(l2NetworkSchema).min(1),
  domains: z.array(domainSchema).min(3),
  ownerPlaybooks: z.record(z.string().min(1), z.string().min(1)).refine((value) => Object.keys(value).length >= 3, {
    message: "ownerPlaybooks requires at least three entries",
  }),
  dashboards: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.string().url(),
        description: z.string().min(1),
      }),
    )
    .min(1),
  education: z.object({
    walkthroughVideo: z.string().url(),
    interactiveGuide: z.string().url(),
    qaChannel: z.string().url(),
  }),
});

export type Phase6Manifest = z.infer<typeof manifestSchema>;
