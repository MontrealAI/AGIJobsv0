#!/usr/bin/env ts-node
/*
 * Phase 8 — Universal Value Dominance orchestration console.
 * Loads the manifest, synthesises calldata for governance, and emits a
 * ready-to-copy runbook for non-technical operators.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Interface, keccak256, toUtf8Bytes } from "ethers";
import { z, ZodError } from "zod";

const CONFIG_PATH = join(__dirname, "..", "config", "universal.value.manifest.json");
const OUTPUT_DIR = join(__dirname, "..", "output");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const RESILIENCE_ALERT_THRESHOLD = 0.9;

const MANAGER_ABI = ["function forwardPauseCall(bytes data)"];
const SYSTEM_PAUSE_ABI = ["function pauseAll()", "function unpauseAll()", "function pauseModule(bytes32)", "function unpauseModule(bytes32)"];

function normalizeAddress(value: unknown): string {
  if (typeof value !== "string") return ZERO_ADDRESS;
  const trimmed = value.trim();
  if (!HEX_ADDRESS_REGEX.test(trimmed)) return ZERO_ADDRESS;
  return trimmed.toLowerCase();
}

const AUTOMATION_INTERVALS: Record<string, number> = {
  hourly: 60 * 60,
  daily: 24 * 60 * 60,
  weekly: 7 * 24 * 60 * 60,
  monthly: 30 * 24 * 60 * 60,
};

type DominanceScoreInput = {
  totalMonthlyUSD: number;
  averageResilience: number;
  coverageRatio: number;
  averageDomainCoverageSeconds: number;
  guardianReviewWindowSeconds: number;
  maxAutonomyBps: number;
  autonomyGuardCapBps: number;
  cadenceSeconds: number;
};

function computeDominanceScore(input: DominanceScoreInput): number {
  const valueScore = input.totalMonthlyUSD <= 0 ? 0 : Math.min(1, input.totalMonthlyUSD / 500_000_000_000);
  const resilienceScore = Math.max(0, Math.min(1, input.averageResilience));
  const coverageRatioScore = input.coverageRatio <= 0 ? 0 : Math.min(1, input.coverageRatio);
  const coverageStrengthScore =
    input.guardianReviewWindowSeconds > 0
      ? Math.min(1, input.averageDomainCoverageSeconds / input.guardianReviewWindowSeconds)
      : 1;
  const coverageScore = Math.min(1, (coverageRatioScore + coverageStrengthScore) / 2);
  const autonomyScore =
    input.autonomyGuardCapBps > 0 ? Math.min(1, input.maxAutonomyBps / input.autonomyGuardCapBps) : 1;
  const cadenceScore =
    input.cadenceSeconds > 0
      ? Math.max(0, 1 - Math.min(1, input.cadenceSeconds / (24 * 60 * 60)))
      : 0.5;

  const weighted =
    0.3 * valueScore + 0.25 * resilienceScore + 0.2 * coverageScore + 0.15 * autonomyScore + 0.1 * cadenceScore;
  return Math.min(100, Math.round(weighted * 1000) / 10);
}

const AddressSchema = z
  .string({ invalid_type_error: "Address must be provided as a string" })
  .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid 20-byte hex address")
  .transform((value) => value.toLowerCase());

const BigNumberishSchema = z
  .union([z.string(), z.number(), z.bigint(), z.undefined(), z.null()])
  .transform((value) => {
    if (value === undefined || value === null) return "0";
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("BigInt fields must be finite and non-negative");
      }
      return Math.trunc(value).toString();
    }
    if (typeof value !== "string") {
      throw new Error("BigInt fields must be provided as a string, number, or bigint");
    }
    const trimmed = value.trim();
    if (trimmed === "") return "0";
    if (!/^\d+$/.test(trimmed)) {
      throw new Error("BigInt fields must be provided as a base-10 string");
    }
    return trimmed;
  });

const ChainIdSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return undefined;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : trimmed;
    }
    return value;
  }, z
    .number({ invalid_type_error: "Chain ID must be a number" })
    .int("Chain ID must be a whole number")
    .positive("Chain ID must be positive")
    .optional())
  .default(1);

const EnvironmentSchema = z
  .object({
    chainId: ChainIdSchema,
    managerAddress: z
      .union([z.string(), z.undefined(), z.null()])
      .transform((value) => {
        if (value === undefined || value === null || value === "") return ZERO_ADDRESS;
        return value;
      })
      .refine((value) => /^0x[a-fA-F0-9]{40}$/.test(value), {
        message: "Manager address must be a valid 20-byte hex string",
      })
      .transform((value) => value.toLowerCase()),
  })
  .transform((value) => ({
    chainId: value.chainId,
    managerAddress: value.managerAddress,
  }));

const AutonomySessionSchema = z.object({
  maxHours: z
    .number({ invalid_type_error: "Autonomy session maxHours must be a number" })
    .positive("Autonomy session maxHours must be positive"),
  contextWindowTokens: z
    .number({ invalid_type_error: "Autonomy session contextWindowTokens must be a number" })
    .int("Autonomy session contextWindowTokens must be an integer")
    .positive("Autonomy session contextWindowTokens must be positive"),
  checkpointCadenceMinutes: z
    .number({ invalid_type_error: "Autonomy session checkpointCadenceMinutes must be a number" })
    .int("Autonomy session checkpointCadenceMinutes must be an integer")
    .positive("Autonomy session checkpointCadenceMinutes must be positive"),
  memoryBacking: z
    .string({ required_error: "Autonomy session memoryBacking is required" })
    .min(1, "Autonomy session memoryBacking is required"),
  environment: z
    .string({ required_error: "Autonomy session environment is required" })
    .min(1, "Autonomy session environment is required"),
  persistence: z
    .string({ required_error: "Autonomy session persistence is required" })
    .min(1, "Autonomy session persistence is required"),
});

const AutonomyCheckpointSchema = z.object({
  name: z.string({ required_error: "Autonomy checkpoint name is required" }).min(1),
  description: z
    .string({ required_error: "Autonomy checkpoint description is required" })
    .min(1),
  intervalMinutes: z
    .number({ invalid_type_error: "Autonomy checkpoint intervalMinutes must be a number" })
    .int("Autonomy checkpoint intervalMinutes must be an integer")
    .positive("Autonomy checkpoint intervalMinutes must be positive"),
  outputs: z.array(z.string()).default([]),
});

const AutonomySchema = z.object({
  session: AutonomySessionSchema,
  persistentExecution: z
    .object({
      runtime: z
        .string({ required_error: "Autonomy persistentExecution.runtime is required" })
        .min(1, "Autonomy persistentExecution.runtime is required"),
      image: z
        .string({ required_error: "Autonomy persistentExecution.image is required" })
        .min(1, "Autonomy persistentExecution.image is required"),
      resources: z
        .object({
          cpu: z.string().optional(),
          memory: z.string().optional(),
          storage: z.string().optional(),
        })
        .default({}),
      stateMount: z.string().optional(),
    })
    .optional(),
  progressCheckpoints: z.array(AutonomyCheckpointSchema).default([]),
  memoryStrategy: z
    .string({ required_error: "Autonomy memoryStrategy is required" })
    .min(1, "Autonomy memoryStrategy is required"),
});

const AiSpecialistSchema = z.object({
  role: z.string({ required_error: "AI specialist role is required" }).min(1),
  agent: AddressSchema,
  model: z.string({ required_error: "AI specialist model is required" }).min(1),
  capabilities: z.array(z.string()).default([]),
  contextWindowTokens: z
    .number({ invalid_type_error: "AI specialist contextWindowTokens must be a number" })
    .int("AI specialist contextWindowTokens must be an integer")
    .positive("AI specialist contextWindowTokens must be positive"),
  maxAutonomyMinutes: z
    .number({ invalid_type_error: "AI specialist maxAutonomyMinutes must be a number" })
    .int("AI specialist maxAutonomyMinutes must be an integer")
    .positive("AI specialist maxAutonomyMinutes must be positive"),
});

const AiTeamSchema = z.object({
  slug: z.string({ required_error: "AI team slug is required" }).min(1),
  name: z.string({ required_error: "AI team name is required" }).min(1),
  mission: z.string({ required_error: "AI team mission is required" }).min(1),
  leadAgent: AddressSchema,
  leadModel: z.string({ required_error: "AI team leadModel is required" }).min(1),
  collaborationProtocol: z
    .string({ required_error: "AI team collaborationProtocol is required" })
    .min(1),
  memoryChannel: z.string().optional(),
  escalationContact: z.string().optional(),
  cadenceMinutes: z
    .number({ invalid_type_error: "AI team cadenceMinutes must be a number" })
    .int("AI team cadenceMinutes must be an integer")
    .positive("AI team cadenceMinutes must be positive"),
  domains: z.array(z.string()).default([]),
  specialists: z.array(AiSpecialistSchema).default([]),
});

const SafetyTripwireSchema = z.object({
  name: z.string({ required_error: "Safety tripwire name is required" }).min(1),
  trigger: z.string({ required_error: "Safety tripwire trigger is required" }).min(1),
  action: z.string({ required_error: "Safety tripwire action is required" }).min(1),
  severity: z.enum(["critical", "high", "medium", "low"]).default("high"),
});

const SafetyLoggingSinkSchema = z.object({
  name: z.string({ required_error: "Safety logging sink name is required" }).min(1),
  target: z.string({ required_error: "Safety logging sink target is required" }).min(1),
  retentionDays: z
    .number({ invalid_type_error: "Safety logging sink retentionDays must be a number" })
    .int("Safety logging sink retentionDays must be an integer")
    .positive("Safety logging sink retentionDays must be positive"),
  piiHandling: z.string().optional(),
});

const SafetySchema = z.object({
  autonomyThresholdMinutes: z
    .number({ invalid_type_error: "Safety autonomyThresholdMinutes must be a number" })
    .int("Safety autonomyThresholdMinutes must be an integer")
    .positive("Safety autonomyThresholdMinutes must be positive"),
  checkInCadenceMinutes: z
    .number({ invalid_type_error: "Safety checkInCadenceMinutes must be a number" })
    .int("Safety checkInCadenceMinutes must be an integer")
    .positive("Safety checkInCadenceMinutes must be positive"),
  logging: z
    .object({
      sinks: z.array(SafetyLoggingSinkSchema).default([]),
      traceSampling: z
        .number({ invalid_type_error: "Safety logging traceSampling must be a number" })
        .min(0, "Safety logging traceSampling cannot be negative")
        .max(1, "Safety logging traceSampling cannot exceed 1"),
      auditConsole: z.string().optional(),
    })
    .default({ sinks: [], traceSampling: 0 }),
  tripwires: z.array(SafetyTripwireSchema).default([]),
  validatorConsoles: z
    .array(
      z.object({
        name: z.string({ required_error: "Safety validator console name is required" }).min(1),
        url: z.string({ required_error: "Safety validator console url is required" }).min(1),
        capabilities: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

const EconomyStakeTierSchema = z.object({
  name: z.string({ required_error: "Economy stake tier name is required" }).min(1),
  durationHours: z
    .number({ invalid_type_error: "Economy stake tier durationHours must be a number" })
    .int("Economy stake tier durationHours must be an integer")
    .positive("Economy stake tier durationHours must be positive"),
  minimumStake: BigNumberishSchema,
  slashMultiplier: z
    .number({ invalid_type_error: "Economy stake tier slashMultiplier must be a number" })
    .positive("Economy stake tier slashMultiplier must be positive"),
});

const EconomyMilestoneSchema = z.object({
  name: z.string({ required_error: "Economy milestone name is required" }).min(1),
  description: z.string({ required_error: "Economy milestone description is required" }).min(1),
  payoutBps: z
    .number({ invalid_type_error: "Economy milestone payoutBps must be a number" })
    .int("Economy milestone payoutBps must be an integer")
    .min(0, "Economy milestone payoutBps cannot be negative")
    .max(10_000, "Economy milestone payoutBps cannot exceed 10000"),
});

const EconomySchema = z.object({
  stakeTiers: z.array(EconomyStakeTierSchema).default([]),
  milestoneTemplates: z.array(EconomyMilestoneSchema).default([]),
  budgetCaps: z
    .object({
      maxComputeUSD: z.number({ invalid_type_error: "Economy budget maxComputeUSD must be a number" }).min(0),
      maxApiSpendUSD: z.number({ invalid_type_error: "Economy budget maxApiSpendUSD must be a number" }).min(0),
      maxTokenSpendUSD: z.number({ invalid_type_error: "Economy budget maxTokenSpendUSD must be a number" }).min(0),
    })
    .optional(),
  rewardCurves: z
    .object({
      longTaskBonusBps: z
        .number({ invalid_type_error: "Economy reward longTaskBonusBps must be a number" })
        .int("Economy reward longTaskBonusBps must be an integer")
        .min(0)
        .max(10_000),
      validatorPremiumBps: z
        .number({ invalid_type_error: "Economy reward validatorPremiumBps must be a number" })
        .int("Economy reward validatorPremiumBps must be an integer")
        .min(0)
        .max(10_000),
    })
    .optional(),
});

const ModelAdapterSchema = z.object({
  name: z.string({ required_error: "Model adapter name is required" }).min(1),
  provider: z.string({ required_error: "Model adapter provider is required" }).min(1),
  modality: z.string({ required_error: "Model adapter modality is required" }).min(1),
  maxContextTokens: z
    .number({ invalid_type_error: "Model adapter maxContextTokens must be a number" })
    .int("Model adapter maxContextTokens must be an integer")
    .positive("Model adapter maxContextTokens must be positive"),
  costPer1kTokensUSD: z
    .number({ invalid_type_error: "Model adapter costPer1kTokensUSD must be a number" })
    .min(0, "Model adapter costPer1kTokensUSD cannot be negative"),
  strengths: z.array(z.string()).default([]),
  evalScore: z
    .number({ invalid_type_error: "Model adapter evalScore must be a number" })
    .min(0, "Model adapter evalScore cannot be negative")
    .max(100, "Model adapter evalScore cannot exceed 100")
    .optional(),
});

const ModelSchema = z.object({
  adapters: z.array(ModelAdapterSchema).default([]),
  evaluationCadenceHours: z
    .number({ invalid_type_error: "Model evaluationCadenceHours must be a number" })
    .int("Model evaluationCadenceHours must be an integer")
    .positive("Model evaluationCadenceHours must be positive"),
  evaluationBenchmarks: z.array(z.string()).default([]),
  dynamicRouting: z
    .object({
      strategy: z.string({ required_error: "Model dynamicRouting.strategy is required" }).min(1),
      metrics: z.array(z.string()).default([]),
    })
    .optional(),
  safetyTests: z
    .array(
      z.object({
        name: z.string({ required_error: "Model safety test name is required" }).min(1),
        frequencyHours: z
          .number({ invalid_type_error: "Model safety test frequencyHours must be a number" })
          .int("Model safety test frequencyHours must be an integer")
          .positive("Model safety test frequencyHours must be positive"),
      }),
    )
    .default([]),
});

const GovernanceProposalSchema = z.object({
  title: z.string({ required_error: "Governance proposal title is required" }).min(1),
  summary: z.string({ required_error: "Governance proposal summary is required" }).min(1),
  executionEtaHours: z
    .number({ invalid_type_error: "Governance proposal executionEtaHours must be a number" })
    .int("Governance proposal executionEtaHours must be an integer")
    .positive("Governance proposal executionEtaHours must be positive"),
});

const GovernanceSchema = z.object({
  interface: z
    .string({ required_error: "Governance interface description is required" })
    .min(1, "Governance interface description is required"),
  validatorTools: z
    .array(
      z.object({
        name: z.string({ required_error: "Governance validator tool name is required" }).min(1),
        url: z.string({ required_error: "Governance validator tool url is required" }).min(1),
        capabilities: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  proposalTemplates: z.array(GovernanceProposalSchema).default([]),
  humanPolicyControls: z
    .array(
      z.object({
        name: z.string({ required_error: "Governance human policy control name is required" }).min(1),
        requirement: z.string({ required_error: "Governance human policy control requirement is required" }).min(1),
        enforcement: z.string({ required_error: "Governance human policy control enforcement is required" }).min(1),
      }),
    )
    .default([]),
});

const DomainSchema = z.object({
  slug: z.string({ required_error: "Domain slug is required" }).min(1, "Domain slug is required"),
  name: z.string({ required_error: "Domain name is required" }).min(1, "Domain name is required"),
  metadataURI: z.string({ required_error: "Domain metadataURI is required" }).min(1, "Domain metadataURI is required"),
  orchestrator: AddressSchema,
  capitalVault: AddressSchema,
  validatorModule: AddressSchema,
  policyKernel: AddressSchema,
  heartbeatSeconds: z
    .number({ invalid_type_error: "Domain heartbeatSeconds must be a number" })
    .int("Domain heartbeatSeconds must be an integer")
    .positive("Domain heartbeatSeconds must be positive"),
  tvlLimit: BigNumberishSchema,
  autonomyLevelBps: z
    .number({ invalid_type_error: "Domain autonomyLevelBps must be a number" })
    .int("Domain autonomyLevelBps must be an integer")
    .nonnegative("Domain autonomyLevelBps cannot be negative"),
  skillTags: z.array(z.string()).default([]),
  resilienceIndex: z
    .number({ invalid_type_error: "Domain resilienceIndex must be a number" })
    .min(0, "Domain resilienceIndex cannot be negative"),
  valueFlowMonthlyUSD: z
    .number({ invalid_type_error: "Domain valueFlowMonthlyUSD must be a number" })
    .nonnegative("Domain valueFlowMonthlyUSD cannot be negative")
    .default(0),
  autonomyNarrative: z.string().optional(),
  active: z.boolean().default(true),
});

const SentinelSchema = z.object({
  slug: z.string({ required_error: "Sentinel slug is required" }).min(1, "Sentinel slug is required"),
  name: z.string({ required_error: "Sentinel name is required" }).min(1, "Sentinel name is required"),
  uri: z.string({ required_error: "Sentinel uri is required" }).min(1, "Sentinel uri is required"),
  agent: AddressSchema,
  coverageSeconds: z
    .number({ invalid_type_error: "Sentinel coverageSeconds must be a number" })
    .int("Sentinel coverageSeconds must be an integer")
    .positive("Sentinel coverageSeconds must be positive"),
  sensitivityBps: z
    .number({ invalid_type_error: "Sentinel sensitivityBps must be a number" })
    .int("Sentinel sensitivityBps must be an integer")
    .nonnegative("Sentinel sensitivityBps cannot be negative"),
  domains: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

const StreamSchema = z.object({
  slug: z.string({ required_error: "Capital stream slug is required" }).min(1, "Capital stream slug is required"),
  name: z.string({ required_error: "Capital stream name is required" }).min(1, "Capital stream name is required"),
  uri: z.string({ required_error: "Capital stream uri is required" }).min(1, "Capital stream uri is required"),
  vault: AddressSchema,
  annualBudget: z
    .number({ invalid_type_error: "Capital stream annualBudget must be a number" })
    .nonnegative("Capital stream annualBudget cannot be negative")
    .default(0),
  expansionBps: z
    .number({ invalid_type_error: "Capital stream expansionBps must be a number" })
    .int("Capital stream expansionBps must be an integer")
    .nonnegative("Capital stream expansionBps cannot be negative"),
  domains: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

const GuardianProtocolSchema = z.object({
  scenario: z.string({ required_error: "Guardian protocol scenario is required" }).min(1, "Guardian protocol scenario is required"),
  severity: z
    .enum(["critical", "high", "medium", "low"], {
      required_error: "Guardian protocol severity must be provided",
      invalid_type_error: "Guardian protocol severity must be critical, high, medium, or low",
    })
    .default("high"),
  trigger: z.string({ required_error: "Guardian protocol trigger is required" }).min(1, "Guardian protocol trigger is required"),
  linkedSentinels: z.array(z.string()).default([]),
  linkedDomains: z.array(z.string()).default([]),
  immediateActions: z
    .array(z.string({ required_error: "Guardian protocol immediate action is required" }).min(1, "Guardian protocol immediate action is required"))
    .min(1, "Guardian protocol requires at least one immediate action"),
  stabilizationActions: z
    .array(z.string({ required_error: "Guardian protocol stabilization action is required" }).min(1, "Guardian protocol stabilization action is required"))
    .min(1, "Guardian protocol requires at least one stabilization action"),
  communications: z
    .array(z.string({ required_error: "Guardian protocol communication step is required" }).min(1, "Guardian protocol communication step is required"))
    .min(1, "Guardian protocol requires at least one communications step"),
  successCriteria: z
    .array(z.string({ required_error: "Guardian protocol success criteria entry is required" }).min(1, "Guardian protocol success criteria entry is required"))
    .min(1)
    .optional(),
});

const KernelChecksumSchema = z.object({
  algorithm: z
    .string({ required_error: "Guardrail checksum algorithm is required" })
    .min(1, "Guardrail checksum algorithm is required"),
  value: z
    .string({ required_error: "Guardrail checksum value is required" })
    .regex(/^0x[a-fA-F0-9]{64}$/, "Guardrail checksum must be a 32-byte hex value"),
});

const KernelZkProofSchema = z.object({
  circuit: z
    .string({ required_error: "Guardrail zk-proof circuit label is required" })
    .min(1, "Guardrail zk-proof circuit label is required"),
  artifactURI: z
    .string({ required_error: "Guardrail zk-proof artifact URI is required" })
    .min(1, "Guardrail zk-proof artifact URI is required"),
  status: z
    .enum(["pending", "verified", "disabled"], {
      required_error: "Guardrail zk-proof status must be provided",
      invalid_type_error: "Guardrail zk-proof status must be pending, verified, or disabled",
    })
    .default("pending"),
  notes: z.string().optional(),
  lastVerifiedAt: z
    .number({ invalid_type_error: "Guardrail zk-proof lastVerifiedAt must be a number" })
    .int("Guardrail zk-proof lastVerifiedAt must be an integer")
    .nonnegative("Guardrail zk-proof lastVerifiedAt cannot be negative")
    .optional(),
});

const KernelGuardrailsSchema = z.object({
  checksum: KernelChecksumSchema,
  zkProof: KernelZkProofSchema,
});

const SelfImprovementSchema = z.object({
  plan: z
    .object({
      planURI: z.string({ required_error: "Self-improvement planURI is required" }).min(1, "Self-improvement planURI is required"),
      planHash: z
        .string({ required_error: "Self-improvement planHash is required" })
        .regex(/^0x[a-fA-F0-9]{64}$/, "Self-improvement planHash must be a 32-byte hex value"),
      cadenceSeconds: z
        .number({ invalid_type_error: "Self-improvement cadenceSeconds must be a number" })
        .int("Self-improvement cadenceSeconds must be an integer")
        .positive("Self-improvement cadenceSeconds must be positive"),
      lastExecutedAt: z
        .number({ invalid_type_error: "Self-improvement lastExecutedAt must be a number" })
        .int("Self-improvement lastExecutedAt must be an integer")
        .nonnegative("Self-improvement lastExecutedAt cannot be negative")
        .optional(),
      lastReportURI: z.string().optional(),
    })
    .optional(),
  playbooks: z
    .array(
      z.object({
        name: z.string({ required_error: "Playbook name is required" }).min(1, "Playbook name is required"),
        description: z.string({ required_error: "Playbook description is required" }).min(1, "Playbook description is required"),
        owner: AddressSchema,
        automation: z.string({ required_error: "Playbook automation cadence is required" }).min(1, "Playbook automation cadence is required"),
        guardrails: z.array(z.string()).default([]),
      })
    )
    .default([]),
  autonomyGuards: z
    .object({
      maxAutonomyBps: z
        .number({ invalid_type_error: "Autonomy guard maxAutonomyBps must be a number" })
        .int("Autonomy guard maxAutonomyBps must be an integer")
        .nonnegative("Autonomy guard maxAutonomyBps cannot be negative"),
      humanOverrideMinutes: z
        .number({ invalid_type_error: "Autonomy guard humanOverrideMinutes must be a number" })
        .int("Autonomy guard humanOverrideMinutes must be an integer")
        .nonnegative("Autonomy guard humanOverrideMinutes cannot be negative"),
      pausable: z.boolean().default(false),
      escalationChannels: z.array(z.string()).default([]),
    })
    .optional(),
  guardrails: KernelGuardrailsSchema,
});

const ManifestSchema = z
  .object({
    global: z.object({
      treasury: AddressSchema,
      universalVault: AddressSchema,
      upgradeCoordinator: AddressSchema,
      validatorRegistry: AddressSchema,
      missionControl: AddressSchema,
      knowledgeGraph: AddressSchema,
      guardianCouncil: AddressSchema,
      systemPause: AddressSchema,
      phase8Manager: AddressSchema.optional(),
      heartbeatSeconds: z
        .number({ invalid_type_error: "Global heartbeatSeconds must be a number" })
        .int("Global heartbeatSeconds must be an integer")
        .positive("Global heartbeatSeconds must be positive"),
      guardianReviewWindow: z
        .number({ invalid_type_error: "Global guardianReviewWindow must be a number" })
        .int("Global guardianReviewWindow must be an integer")
        .nonnegative("Global guardianReviewWindow cannot be negative"),
      maxDrawdownBps: z
        .number({ invalid_type_error: "Global maxDrawdownBps must be a number" })
        .int("Global maxDrawdownBps must be an integer")
        .nonnegative("Global maxDrawdownBps cannot be negative"),
      manifestoURI: z
        .string({ required_error: "Global manifestoURI is required" })
        .min(1, "Global manifestoURI is required"),
      manifestoHash: z
        .string({ required_error: "Global manifestoHash is required" })
        .regex(/^0x[a-fA-F0-9]{64}$/, "Global manifestoHash must be a 32-byte hex value"),
      guardianCouncilLabel: z.string().optional(),
    }),
    domains: z.array(DomainSchema).default([]),
    sentinels: z.array(SentinelSchema).default([]),
    capitalStreams: z.array(StreamSchema).default([]),
    guardianProtocols: z.array(GuardianProtocolSchema).default([]),
    selfImprovement: SelfImprovementSchema.optional(),
    autonomy: AutonomySchema.optional(),
    aiTeams: z.array(AiTeamSchema).default([]),
    safety: SafetySchema.optional(),
    economy: EconomySchema.optional(),
    models: ModelSchema.optional(),
    governance: GovernanceSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const domains = value.domains ?? [];
    const domainSlugMap = new Map<string, number>();
    domains.forEach((domain, index) => {
      const slug = String(domain?.slug ?? "").toLowerCase();
      if (!slug) return;
      if (domainSlugMap.has(slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate domain slug detected: ${slug}`,
          path: ["domains", index, "slug"],
        });
        return;
      }
      domainSlugMap.set(slug, index);
    });

    const sentinels = value.sentinels ?? [];
    const sentinelSlugMap = new Map<string, number>();
    const sentinelDomainsBySlug = new Map<string, string[]>();
    sentinels.forEach((sentinel, index) => {
      const slug = String(sentinel?.slug ?? "").toLowerCase();
      if (!slug) return;
      if (sentinelSlugMap.has(slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate sentinel slug detected: ${slug}`,
          path: ["sentinels", index, "slug"],
        });
        return;
      }
      sentinelSlugMap.set(slug, index);
      const sentinelDomains = Array.from(
        new Set((sentinel.domains ?? []).map((domain) => String(domain || "").toLowerCase()).filter(Boolean)),
      );
      sentinelDomainsBySlug.set(slug, sentinelDomains);
    });

    const streams = value.capitalStreams ?? [];
    const streamSlugMap = new Map<string, number>();
    streams.forEach((stream, index) => {
      const slug = String(stream?.slug ?? "").toLowerCase();
      if (!slug) return;
      if (streamSlugMap.has(slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate capital stream slug detected: ${slug}`,
          path: ["capitalStreams", index, "slug"],
        });
        return;
      }
      streamSlugMap.set(slug, index);
    });

    const guardrail = value.selfImprovement?.autonomyGuards?.maxAutonomyBps;
    if (domains.length > 0 && guardrail === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Autonomy guard maxAutonomyBps is required when domains are defined",
        path: ["selfImprovement", "autonomyGuards", "maxAutonomyBps"],
      });
    }
    if (guardrail !== undefined) {
      domains.forEach((domain, index) => {
        const autonomy = Number(domain?.autonomyLevelBps ?? 0);
        if (autonomy > guardrail) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Domain autonomy ${autonomy}bps exceeds guardrail cap ${guardrail}bps — reduce autonomy or raise the guard before shipping`,
            path: ["domains", index, "autonomyLevelBps"],
          });
        }
      });
    }

    const teamSlugs = new Set<string>();
    (value.aiTeams ?? []).forEach((team, index) => {
      const slug = String(team?.slug ?? "").toLowerCase();
      if (!slug) return;
      if (teamSlugs.has(slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate aiTeams slug detected: ${slug}`,
          path: ["aiTeams", index, "slug"],
        });
      }
      teamSlugs.add(slug);
      (team.domains ?? []).forEach((domainSlug, domainIndex) => {
        const normalized = String(domainSlug || "").toLowerCase();
        if (!normalized) return;
        if (!domainSlugMap.has(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `AI team ${team.slug ?? index} references unknown domain ${domainSlug}`,
            path: ["aiTeams", index, "domains", domainIndex],
          });
        }
      });
    });

    if (value.autonomy?.session && value.safety?.autonomyThresholdMinutes) {
      const sessionMinutes = Number(value.autonomy.session.maxHours ?? 0) * 60;
      if (sessionMinutes > value.safety.autonomyThresholdMinutes * 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Autonomy session maxHours significantly exceed safety autonomy threshold — adjust thresholds or cadence",
          path: ["autonomy", "session", "maxHours"],
        });
      }
    }

    const stakeTiers = value.economy?.stakeTiers ?? [];
    const sortedDurations = [...stakeTiers].sort((a, b) => Number(a.durationHours) - Number(b.durationHours));
    for (let index = 0; index < stakeTiers.length; index += 1) {
      if (stakeTiers[index] !== sortedDurations[index]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Economy stake tiers must be ordered by durationHours ascending",
          path: ["economy", "stakeTiers"],
        });
        break;
      }
    }
  
    const guardianWindow = Number(value.global?.guardianReviewWindow ?? 0);
    const domainSlugs = Array.from(domainSlugMap.keys());

    sentinels.forEach((sentinel, index) => {
      (sentinel.domains ?? []).forEach((domain, domainIndex) => {
        const normalized = String(domain || "").toLowerCase();
        if (!normalized) return;
        if (!domainSlugMap.has(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Sentinel ${sentinel.slug ?? index} references unknown domain ${domain}`,
            path: ["sentinels", index, "domains", domainIndex],
          });
        }
      });
    });

    streams.forEach((stream, index) => {
      (stream.domains ?? []).forEach((domain, domainIndex) => {
        const normalized = String(domain || "").toLowerCase();
        if (!normalized) return;
        if (!domainSlugMap.has(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Capital stream ${stream.slug ?? index} references unknown domain ${domain}`,
            path: ["capitalStreams", index, "domains", domainIndex],
          });
        }
      });
    });

    if (guardianWindow > 0) {
      const coverage = (value.sentinels ?? []).reduce((acc, sentinel) => {
        const raw = Number(sentinel?.coverageSeconds ?? 0);
        return acc + (Number.isFinite(raw) && raw > 0 ? raw : 0);
      }, 0);
      if (coverage < guardianWindow) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Total sentinel coverage ${coverage}s is below guardian review window ${guardianWindow}s — expand monitoring lattice for CI to pass`,
          path: ["sentinels"],
        });
      }

      const domainCoverage = new Map<string, number>();
      if (domainSlugs.length !== domains.length) {
        return;
      }
      const domainSlugSet = new Set(domainSlugs);
      for (const sentinel of value.sentinels ?? []) {
        const sentinelCoverage = Number(sentinel?.coverageSeconds ?? 0);
        if (!Number.isFinite(sentinelCoverage) || sentinelCoverage <= 0) continue;
        const sentinelDomains = Array.from(
          new Set((sentinel.domains ?? []).map((domain) => String(domain || "").toLowerCase()).filter(Boolean)),
        );
        const targets = sentinelDomains.length > 0 ? sentinelDomains : domainSlugs;
        for (const target of targets) {
          if (!domainSlugSet.has(target)) continue;
          domainCoverage.set(target, (domainCoverage.get(target) ?? 0) + sentinelCoverage);
        }
      }

      const insufficient = domainSlugs.filter((slug) => (domainCoverage.get(slug) ?? 0) < guardianWindow);
      if (insufficient.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Domains below guardian window ${guardianWindow}s: ${insufficient.join(", ")}`,
          path: ["sentinels"],
        });
      }
    }

    const protocolCoverage = new Map<string, number>();
    const protocols = value.guardianProtocols ?? [];
    protocols.forEach((protocol, index) => {
      const sentinelRefs = Array.from(
        new Set((protocol.linkedSentinels ?? []).map((entry) => String(entry || "").toLowerCase()).filter(Boolean)),
      );
      const domainRefs = Array.from(
        new Set((protocol.linkedDomains ?? []).map((entry) => String(entry || "").toLowerCase()).filter(Boolean)),
      );

      if (!sentinelRefs.length && !domainRefs.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Guardian protocol must target at least one sentinel or domain",
          path: ["guardianProtocols", index, "linkedDomains"],
        });
      }

      const sentinelDomainTargets = new Set<string>();
      for (const sentinelSlug of sentinelRefs) {
        if (!sentinelSlugMap.has(sentinelSlug)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Guardian protocol ${protocol.scenario} references unknown sentinel ${sentinelSlug}`,
            path: ["guardianProtocols", index, "linkedSentinels"],
          });
          continue;
        }
        const assignedDomains = sentinelDomainsBySlug.get(sentinelSlug) ?? [];
        assignedDomains.forEach((domain) => sentinelDomainTargets.add(domain));
      }

      if (!domainRefs.length && sentinelRefs.length > 0 && sentinelDomainTargets.size === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Guardian protocol ${protocol.scenario} references sentinels without domain assignments — specify linkedDomains to declare coverage`,
          path: ["guardianProtocols", index, "linkedDomains"],
        });
      }

      const targets = domainRefs.length > 0 ? domainRefs : Array.from(sentinelDomainTargets);
      for (const target of targets) {
        if (!domainSlugMap.has(target)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Guardian protocol ${protocol.scenario} references unknown domain ${target}`,
            path: ["guardianProtocols", index, "linkedDomains"],
          });
          continue;
        }
        protocolCoverage.set(target, (protocolCoverage.get(target) ?? 0) + 1);
      }
    });

    const missingProtocols = domainSlugs.filter((slug) => (protocolCoverage.get(slug) ?? 0) === 0);
    if (missingProtocols.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `All domains require at least one guardian response protocol — missing coverage for: ${missingProtocols.join(", ")}`,
        path: ["guardianProtocols"],
      });
    }
  });

export type Phase8Config = z.infer<typeof ManifestSchema>;
export type EnvironmentConfig = z.infer<typeof EnvironmentSchema>;
const SKIP_SINGLE_CALL_KEYS = new Set([
  "registerDomain",
  "registerSentinel",
  "registerCapitalStream",
  "removeDomain",
  "removeSentinel",
  "removeCapitalStream",
  "setSentinelDomains",
  "setCapitalStreamDomains",
]);
const LABEL_MAP: Record<string, string> = {
  registerDomains: "registerDomain",
  registerSentinels: "registerSentinel",
  registerCapitalStreams: "registerCapitalStream",
  sentinelDomainCalls: "setSentinelDomains",
  streamDomainCalls: "setCapitalStreamDomains",
  removeDomains: "removeDomain",
  removeSentinels: "removeSentinel",
  removeCapitalStreams: "removeCapitalStream",
};

type ChecklistCopy = {
  title: string;
  summary: string;
  verification: string;
  emphasis?: string;
};

type ChecklistGroup = {
  count: number;
  slugs: Set<string>;
};

const CHECKLIST_CALL_ORDER = [
  "setGlobalParameters",
  "setGuardianCouncil",
  "setSystemPause",
  "registerDomain",
  "registerSentinel",
  "setSentinelDomains",
  "registerCapitalStream",
  "setCapitalStreamDomains",
  "setSelfImprovementPlan",
  "recordSelfImprovementExecution",
  "removeDomain",
  "removeSentinel",
  "removeCapitalStream",
];

const CHECKLIST_COPY: Record<string, ChecklistCopy> = {
  setGlobalParameters: {
    title: "Prime global parameters",
    summary:
      "Commit treasury, vault, upgrade, validator, mission control, and knowledge graph endpoints alongside heartbeat, review window, drawdown guard, and manifesto URI.",
    verification: "Cross-check every address against the guardian roster and confirm the manifesto hash matches the signed directive before execution.",
    emphasis: "This call unlocks the rest of the run — treat it as the canonical source of truth for the superintelligence's operating map.",
  },
  setGuardianCouncil: {
    title: "Authorize guardian council multisig",
    summary:
      "Hands the emergency override lever to the council so human governance can veto or pause any subsystem within minutes.",
    verification: "Confirm quorum participants are online and that timelock policies (if any) reflect the latest governance resolution.",
  },
  setSystemPause: {
    title: "Wire emergency pause relay",
    summary:
      "Routes forwardPauseCall payloads to the SystemPause contract, ensuring circuit breakers halt or resume every module instantly.",
    verification: "Validate the pause contract address on-chain and confirm guardians rehearsed the pause/unpause sequence with this target.",
  },
  registerDomain: {
    title: "Activate dominion orchestrators",
    summary:
      "Registers each value domain with orchestrator, validator, policy kernel, heartbeat, TVL cap, and autonomy guardrails.",
    verification: "Compare autonomy bps, heartbeat seconds, and vault limits with the manifest briefing for each domain before confirming.",
  },
  setSentinelDomains: {
    title: "Bind sentinel coverage",
    summary:
      "Links each sentinel to the domains it must supervise, enforcing lattice coverage guarantees over the economy.",
    verification: "Ensure every domain slug listed here is covered ≥ guardian review window seconds and aligns with the telemetry report.",
  },
  registerSentinel: {
    title: "Commission sentinel agents",
    summary:
      "Authorizes watchdog agents with coverage cadences, sensitivity thresholds, and policy URIs so anomalies trigger guardians immediately.",
    verification: "Confirm agent addresses correspond to deployed sentinel contracts and that sensitivity bps matches guardian expectations.",
  },
  registerCapitalStream: {
    title: "Spin up capital conduits",
    summary:
      "Allocates annual budgets and expansion curves that fund the dominions autonomously via dedicated vaults.",
    verification: "Verify annual budget totals sum to the treasury directive and that vault addresses have multisig control or timelock protections.",
  },
  setCapitalStreamDomains: {
    title: "Aim capital flows",
    summary:
      "Targets each capital stream at specific dominions so funding ratios stay synchronized with resilience and performance signals.",
    verification: "Confirm every funded domain matches the cycle report ledger and that no required dominion is omitted.",
  },
  setSelfImprovementPlan: {
    title: "Publish self-improvement plan",
    summary:
      "Updates cadence, checksum, and URI for the automated upgrade charter governing the self-improvement kernel.",
    verification: "Have guardians re-hash the payload locally and ensure cadence seconds honour human override windows before committing.",
  },
  recordSelfImprovementExecution: {
    title: "Record latest improvement cycle",
    summary:
      "Appends timestamp + report URI so every retraining run is immutably logged for auditors and mission control.",
    verification: "Confirm the referenced report is uploaded (IPFS or archive) and that the timestamp reflects finalized evaluation sign-off.",
  },
  removeDomain: {
    title: "Teardown dominions (optional)",
    summary:
      "Removes legacy dominions from the registry when decommissioning or rotating orchestrators.",
    verification: "Only execute after capital streams are retargeted and sentinel coverage migrates — document rationale in guardian minutes.",
  },
  removeSentinel: {
    title: "Decommission sentinels (optional)",
    summary:
      "Clears sentinel agents from the lattice once replacements are confirmed or coverage is rebalanced.",
    verification: "Ensure a successor sentinel already covers the affected dominions so coverage adequacy never drops below 100%.",
  },
  removeCapitalStream: {
    title: "Retire capital streams (optional)",
    summary:
      "Stops legacy funding programs once treasuries are merged or mandates expire.",
    verification: "Validate that remaining streams keep every dominion at or above the mandated funding floor before removal.",
  },
};

function formatZodError(context: string, error: ZodError) {
  const issues = error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `  • ${path}: ${issue.message}`;
    })
    .join("\n");
  return `${context}:\n${issues}`;
}

export function parseManifest(raw: unknown): Phase8Config {
  const result = ManifestSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatZodError("Manifest validation failed", result.error));
  }
  return result.data;
}

type SentinelRecord = {
  slug?: string | null;
  coverageSeconds?: number;
  domains?: string[];
};

function coverageMap(sentinels: SentinelRecord[], domainSlugs: string[]): Map<string, number> {
  const map = new Map<string, number>();
  const normalizedDomains = Array.from(
    new Set(domainSlugs.map((domain) => String(domain || "").toLowerCase()).filter(Boolean)),
  );

  for (const sentinel of sentinels) {
    const coverage = Number(sentinel.coverageSeconds ?? 0);
    if (!Number.isFinite(coverage) || coverage <= 0) continue;

    const sentinelDomains = Array.from(
      new Set((sentinel.domains ?? []).map((domain) => String(domain || "").toLowerCase()).filter(Boolean)),
    );

    const targets = sentinelDomains.length > 0 ? sentinelDomains : normalizedDomains;
    if (targets.length === 0) continue;

    for (const domain of targets) {
      map.set(domain, (map.get(domain) ?? 0) + coverage);
    }
  }

  return map;
}

type CapitalStreamRecord = {
  slug?: string | null;
  annualBudget?: number;
  domains?: string[];
};

function capitalCoverageMap(streams: CapitalStreamRecord[], domainSlugs: string[]): Map<string, number> {
  const map = new Map<string, number>();
  const normalizedDomains = Array.from(
    new Set(domainSlugs.map((domain) => String(domain || "").toLowerCase()).filter(Boolean)),
  );

  for (const stream of streams) {
    const budget = Number(stream.annualBudget ?? 0);
    if (!Number.isFinite(budget) || budget <= 0) continue;

    const streamDomains = Array.from(
      new Set((stream.domains ?? []).map((domain) => String(domain || "").toLowerCase()).filter(Boolean)),
    );

    const targets = streamDomains.length > 0 ? streamDomains : normalizedDomains;
    if (targets.length === 0) continue;

    for (const domain of targets) {
      map.set(domain, (map.get(domain) ?? 0) + budget);
    }
  }

  return map;
}

function sentinelNameMap(config: Phase8Config): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const sentinel of config.sentinels ?? []) {
    const label = sentinel.name ?? sentinel.slug ?? "sentinel";
    for (const domain of sentinel.domains ?? []) {
      const slug = String(domain || "").toLowerCase();
      if (!slug) continue;
      const entries = map.get(slug) ?? [];
      if (!entries.includes(label)) {
        entries.push(label);
        map.set(slug, entries);
      }
    }
  }
  return map;
}

function streamNameMap(config: Phase8Config): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const stream of config.capitalStreams ?? []) {
    const label = stream.name ?? stream.slug ?? "stream";
    for (const domain of stream.domains ?? []) {
      const slug = String(domain || "").toLowerCase();
      if (!slug) continue;
      const entries = map.get(slug) ?? [];
      if (!entries.includes(label)) {
        entries.push(label);
        map.set(slug, entries);
      }
    }
  }
  return map;
}

export type ScheduledPlaybook = {
  name: string;
  automation: string;
  owner: string;
  guardrails: string[];
  nextRun?: string;
  intervalSeconds?: number;
  requiresManualScheduling: boolean;
};

export function schedulePlaybooks(config: Phase8Config, now: number = Math.floor(Date.now() / 1000)): ScheduledPlaybook[] {
  const plan = config.selfImprovement?.plan;
  const anchor = Number(plan?.lastExecutedAt ?? 0) > 0 ? Number(plan?.lastExecutedAt ?? 0) : now;
  const playbooks = config.selfImprovement?.playbooks ?? [];
  return playbooks.map((playbook) => {
    const automation = String(playbook.automation ?? "").toLowerCase();
    const interval = AUTOMATION_INTERVALS[automation];
    if (!interval) {
      return {
        name: playbook.name,
        automation: playbook.automation ?? "unspecified",
        owner: playbook.owner,
        guardrails: playbook.guardrails ?? [],
        requiresManualScheduling: true,
      };
    }
    const nextRunEpoch = anchor + interval;
    return {
      name: playbook.name,
      automation: playbook.automation ?? automation,
      owner: playbook.owner,
      guardrails: playbook.guardrails ?? [],
      intervalSeconds: interval,
      nextRun: new Date(nextRunEpoch * 1000).toISOString(),
      requiresManualScheduling: false,
    };
  });
}

export function guardrailDiagnostics(config: Phase8Config): string[] {
  const diagnostics: string[] = [];
  const domains = config.domains ?? [];
  const guardianWindow = Number(config.global?.guardianReviewWindow ?? 0);
  const globalHeartbeat = Number(config.global?.heartbeatSeconds ?? 0);
  const guardrailCap = Number(config.selfImprovement?.autonomyGuards?.maxAutonomyBps ?? NaN);
  const sentinelCoverage = coverageMap(
    config.sentinels ?? [],
    domains.map((domain) => String(domain.slug ?? "")),
  );
  const fundingCoverage = capitalCoverageMap(
    config.capitalStreams ?? [],
    domains.map((domain) => String(domain.slug ?? "")),
  );

  for (const domain of domains) {
    const slug = String(domain.slug ?? "").toLowerCase();
    const coverage = sentinelCoverage.get(slug) ?? 0;
    const funding = fundingCoverage.get(slug) ?? 0;
    if (guardianWindow > 0 && coverage < guardianWindow) {
      diagnostics.push(
        `${domain.name ?? slug} has ${coverage}s of sentinel coverage but guardian review window requires ${guardianWindow}s`,
      );
    }
    const resilience = Number(domain.resilienceIndex ?? 0);
    if (resilience > 0 && resilience < RESILIENCE_ALERT_THRESHOLD) {
      diagnostics.push(
        `${domain.name ?? slug} resilience ${resilience.toFixed(3)} is below threshold ${RESILIENCE_ALERT_THRESHOLD.toFixed(3)}`,
      );
    }
    const heartbeat = Number(domain.heartbeatSeconds ?? 0);
    if (globalHeartbeat > 0 && heartbeat > globalHeartbeat) {
      diagnostics.push(
        `${domain.name ?? slug} heartbeat ${heartbeat}s exceeds global heartbeat ${globalHeartbeat}s — review watchdog readiness`,
      );
    }
    const autonomy = Number(domain.autonomyLevelBps ?? 0);
    if (Number.isFinite(guardrailCap) && guardrailCap >= 0 && autonomy > guardrailCap) {
      diagnostics.push(
        `${domain.name ?? slug} autonomy ${autonomy}bps exceeds guardrail cap ${guardrailCap}bps`,
      );
    }
    if (funding <= 0) {
      diagnostics.push(`${domain.name ?? slug} lacks active capital stream funding`);
    }
  }

  return diagnostics;
}

export function loadConfig(path: string = CONFIG_PATH): Phase8Config {
  try {
    const file = readFileSync(path, "utf-8");
    const json = JSON.parse(file);
    return parseManifest(json);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse manifest JSON at ${path}: ${error.message}`);
    }
    throw error;
  }
}

export function resolveEnvironment(env: NodeJS.ProcessEnv = process.env): EnvironmentConfig {
  const result = EnvironmentSchema.safeParse({
    chainId: env.PHASE8_CHAIN_ID,
    managerAddress: env.PHASE8_MANAGER_ADDRESS,
  });
  if (!result.success) {
    throw new Error(formatZodError("Environment validation failed", result.error));
  }
  return result.data;
}

function banner(title: string) {
  const pad = "=".repeat(title.length + 8);
  console.log();
  console.log(`\x1b[38;5;213m${pad}\x1b[0m`);
  console.log(`\x1b[38;5;51m>>> ${title} <<<\x1b[0m`);
  console.log(`\x1b[38;5;213m${pad}\x1b[0m`);
}

function shortAddress(label: string, address?: string) {
  if (!address) return `${label}: —`;
  return `${label}: ${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function computeMetrics(config: Phase8Config) {
  const domains = config.domains ?? [];
  const sentinels = config.sentinels ?? [];
  const streams = config.capitalStreams ?? [];
  const protocols = config.guardianProtocols ?? [];
  const plan = config.selfImprovement?.plan ?? {};
  const autonomy = config.autonomy;
  const aiTeams = config.aiTeams ?? [];
  const safety = config.safety;
  const economy = config.economy;
  const models = config.models;
  const governance = config.governance;

  const domainSlugs = domains.map((domain) => String(domain.slug ?? ""));
  const domainCoverageMap = coverageMap(sentinels, domainSlugs);
  const domainFundingMap = capitalCoverageMap(streams, domainSlugs);

  const totalMonthlyUSD = domains.reduce((acc: number, domain: any) => acc + Number(domain.valueFlowMonthlyUSD ?? 0), 0);
  const maxAutonomy = domains.reduce((acc: number, domain: any) => Math.max(acc, Number(domain.autonomyLevelBps ?? 0)), 0);
  const averageResilience =
    domains.length === 0
      ? 0
      : domains.reduce((acc: number, domain: any) => acc + Number(domain.resilienceIndex ?? 0), 0) / domains.length;
  const guardianCoverageMinutes = sentinels.reduce((acc: number, sentinel: any) => acc + Number(sentinel.coverageSeconds ?? 0), 0) / 60;
  const annualBudget = streams.reduce((acc: number, stream: any) => acc + Number(stream.annualBudget ?? 0), 0);

  const coverageSet = new Set<string>();
  const fundedSet = new Set<string>();
  const protocolCoverageSet = new Set<string>();
  const severityWeight: Record<string, number> = { critical: 1, high: 0.75, medium: 0.5, low: 0.25 };
  let protocolSeverityTotal = 0;
  let totalDomainCoverageSeconds = 0;
  let minDomainCoverageSeconds = domains.length === 0 ? 0 : Number.POSITIVE_INFINITY;
  let minDomainFundingUSD = domains.length === 0 ? 0 : Number.POSITIVE_INFINITY;

  const domainSlugSet = new Set(domainSlugs.map((slug) => String(slug ?? "").toLowerCase()));

  for (const slug of domainSlugs) {
    const normalized = String(slug ?? "").toLowerCase();
    const coverage = domainCoverageMap.get(normalized) ?? 0;
    const funding = domainFundingMap.get(normalized) ?? 0;
    if (coverage > 0) {
      coverageSet.add(normalized);
    }
    if (funding > 0) {
      fundedSet.add(normalized);
    }
    totalDomainCoverageSeconds += coverage;
    if (coverage < minDomainCoverageSeconds) {
      minDomainCoverageSeconds = coverage;
    }
    if (funding < minDomainFundingUSD) {
      minDomainFundingUSD = funding;
    }
  }

  for (const protocol of protocols) {
    protocolSeverityTotal += severityWeight[protocol.severity ?? "high"] ?? 0.5;
    const domainRefs = Array.from(
      new Set((protocol.linkedDomains ?? []).map((entry) => String(entry || "").toLowerCase()).filter(Boolean)),
    );
    const targets = domainRefs.length > 0 ? domainRefs : Array.from(domainSlugSet.values());
    for (const target of targets) {
      if (!target || !domainSlugSet.has(target)) continue;
      protocolCoverageSet.add(target);
    }
  }

  const coverageRatio = domains.length === 0 ? 0 : coverageSet.size / domains.length;
  const fundingRatio = domains.length === 0 ? 0 : fundedSet.size / domains.length;
  const guardianWindowSeconds = Number(config.global?.guardianReviewWindow ?? 0);
  const averageDomainCoverageSeconds = domains.length === 0 ? 0 : totalDomainCoverageSeconds / domains.length;

  if (!Number.isFinite(minDomainCoverageSeconds)) {
    minDomainCoverageSeconds = 0;
  }
  if (!Number.isFinite(minDomainFundingUSD)) {
    minDomainFundingUSD = 0;
  }

  const minimumCoverageAdequacy =
    guardianWindowSeconds > 0 && Number.isFinite(minDomainCoverageSeconds)
      ? minDomainCoverageSeconds / guardianWindowSeconds
      : 0;

  const cadenceSeconds = Number(plan.cadenceSeconds ?? 0);
  const cadenceHours = cadenceSeconds / 3600;
  const lastExecutedAt = Number(plan.lastExecutedAt ?? 0);
  const autonomyGuardCap = Number(config.selfImprovement?.autonomyGuards?.maxAutonomyBps ?? 0);

  const sessionMaxHours = Number(autonomy?.session?.maxHours ?? 0);
  const sessionContextTokens = Number(autonomy?.session?.contextWindowTokens ?? 0);
  const checkpointCadenceMinutes = Number(autonomy?.session?.checkpointCadenceMinutes ?? 0);
  const checkpointCount = (autonomy?.progressCheckpoints ?? []).length;
  const aiTeamDomainSet = new Set<string>();
  aiTeams.forEach((team) => {
    (team.domains ?? []).forEach((domain) => {
      const normalized = String(domain ?? "").toLowerCase();
      if (normalized) {
        aiTeamDomainSet.add(normalized);
      }
    });
  });
  const aiTeamCoverageRatio =
    domains.length === 0 ? 0 : Math.min(1, aiTeamDomainSet.size / Math.max(domains.length, 1));
  const safetyTripwireCount = (safety?.tripwires ?? []).length;
  const validatorConsoleCount = (safety?.validatorConsoles ?? []).length;
  const stakeTierCount = (economy?.stakeTiers ?? []).length;
  const milestoneTemplateCount = (economy?.milestoneTemplates ?? []).length;
  const modelAdapterCount = (models?.adapters ?? []).length;
  const modelEvaluationCadenceHours = Number(models?.evaluationCadenceHours ?? 0);
  const modelSafetyTestCount = (models?.safetyTests ?? []).length;
  const governanceProposalTemplateCount = (governance?.proposalTemplates ?? []).length;
  const humanPolicyControlCount = (governance?.humanPolicyControls ?? []).length;

  const dominanceScore = computeDominanceScore({
    totalMonthlyUSD,
    averageResilience,
    coverageRatio,
    averageDomainCoverageSeconds,
    guardianReviewWindowSeconds: guardianWindowSeconds,
    maxAutonomyBps: maxAutonomy,
    autonomyGuardCapBps: autonomyGuardCap,
    cadenceSeconds,
  });

  const fundingObject: Record<string, number> = {};
  for (const domain of domains) {
    const normalized = String(domain.slug ?? "").toLowerCase();
    fundingObject[normalized] = domainFundingMap.get(normalized) ?? 0;
  }

  return {
    totalMonthlyUSD,
    maxAutonomy,
    averageResilience,
    guardianCoverageMinutes,
    annualBudget,
    coverageRatio: coverageRatio * 100,
    fundedDomainRatio: fundingRatio * 100,
    cadenceHours,
    lastExecutedAt,
    dominanceScore,
    averageDomainCoverageSeconds,
    guardianWindowSeconds,
    minDomainCoverageSeconds,
    minimumCoverageAdequacy,
    minDomainFundingUSD,
    guardianProtocolCount: protocols.length,
    guardianProtocolCoverageRatio: domains.length === 0 ? 0 : (protocolCoverageSet.size / domains.length) * 100,
    guardianProtocolSeverityScore: protocols.length === 0 ? 0 : protocolSeverityTotal / protocols.length,
    domainFundingMap: fundingObject,
    sessionMaxHours,
    sessionContextTokens,
    checkpointCadenceMinutes,
    checkpointCount,
    aiTeamCount: aiTeams.length,
    aiTeamCoverageRatio,
    safetyTripwireCount,
    validatorConsoleCount,
    stakeTierCount,
    milestoneTemplateCount,
    modelAdapterCount,
    modelEvaluationCadenceHours,
    modelSafetyTestCount,
    governanceProposalTemplateCount,
    humanPolicyControlCount,
  };
}

type MetricToleranceOverrides = Partial<
  Record<
    | "totalMonthlyUSD"
    | "averageResilience"
    | "guardianCoverageMinutes"
    | "annualBudget"
    | "coverageRatio"
    | "fundedDomainRatio"
    | "averageDomainCoverageSeconds"
    | "guardianWindowSeconds"
    | "minDomainCoverageSeconds"
    | "minimumCoverageAdequacy"
    | "minDomainFundingUSD"
    | "maxAutonomy"
    | "cadenceHours"
    | "lastExecutedAt"
    | "dominanceScore"
    | "guardianProtocolCount"
    | "guardianProtocolCoverageRatio"
    | "guardianProtocolSeverityScore"
    | "sessionMaxHours"
    | "sessionContextTokens"
    | "checkpointCadenceMinutes"
    | "checkpointCount"
    | "aiTeamCount"
    | "aiTeamCoverageRatio"
    | "safetyTripwireCount"
    | "validatorConsoleCount"
    | "stakeTierCount"
    | "milestoneTemplateCount"
    | "modelAdapterCount"
    | "modelEvaluationCadenceHours"
    | "modelSafetyTestCount"
    | "governanceProposalTemplateCount"
    | "humanPolicyControlCount"
  , number>
>;

export function crossVerifyMetrics(config: Phase8Config, overrides: MetricToleranceOverrides = {}) {
  const metrics = computeMetrics(config);
  const domains = config.domains ?? [];
  const sentinels = config.sentinels ?? [];
  const streams = config.capitalStreams ?? [];
  const protocols = config.guardianProtocols ?? [];

  const severityWeights: Record<string, number> = { critical: 1, high: 0.75, medium: 0.5, low: 0.25 };

  const domainSlugs = domains
    .map((domain) => String(domain.slug ?? "").toLowerCase())
    .filter((slug) => slug.length > 0);
  const domainSet = new Set(domainSlugs);

  const coverageByDomain = new Map<string, number>();
  let totalSentinelCoverageSeconds = 0;
  for (const sentinel of sentinels) {
    const coverage = Number(sentinel.coverageSeconds ?? 0);
    if (!Number.isFinite(coverage) || coverage <= 0) continue;
    totalSentinelCoverageSeconds += coverage;
    const declaredTargets = Array.from(
      new Set((sentinel.domains ?? []).map((entry) => String(entry ?? "").toLowerCase()).filter((entry) => domainSet.has(entry))),
    );
    const targets = declaredTargets.length > 0 ? declaredTargets : domainSlugs;
    for (const target of targets) {
      coverageByDomain.set(target, (coverageByDomain.get(target) ?? 0) + coverage);
    }
  }

  const fundingByDomain = new Map<string, number>();
  for (const slug of domainSlugs) {
    fundingByDomain.set(slug, 0);
  }
  for (const stream of streams) {
    const budgetRaw = Number(stream.annualBudget ?? 0);
    if (!Number.isFinite(budgetRaw) || budgetRaw <= 0) continue;
    const declaredTargets = Array.from(
      new Set((stream.domains ?? []).map((entry) => String(entry ?? "").toLowerCase()).filter((entry) => domainSet.has(entry))),
    );
    const targets = declaredTargets.length > 0 ? declaredTargets : domainSlugs;
    for (const target of targets) {
      const current = fundingByDomain.get(target) ?? 0;
      fundingByDomain.set(target, current + budgetRaw);
    }
  }

  const guardianWindowSeconds = Number(config.global?.guardianReviewWindow ?? 0);
  const autonomyGuardCap = Number(config.selfImprovement?.autonomyGuards?.maxAutonomyBps ?? 0);
  const cadenceSeconds = Number(config.selfImprovement?.plan?.cadenceSeconds ?? 0);

  const coverageEntries = domainSlugs.map((slug) => coverageByDomain.get(slug) ?? 0);
  const fundingEntries = domainSlugs.map((slug) => fundingByDomain.get(slug) ?? 0);

  const coveredCount = coverageEntries.filter((value) => value > 0).length;
  const fundedCount = fundingEntries.filter((value) => value > 0).length;
  const totalCoverageSeconds = coverageEntries.reduce((acc, value) => acc + value, 0);
  const minCoverageSeconds =
    domainSlugs.length === 0 ? 0 : Math.min(...coverageEntries, Number.POSITIVE_INFINITY);
  const minFundingUSD = domainSlugs.length === 0 ? 0 : Math.min(...fundingEntries, Number.POSITIVE_INFINITY);

  const crossCheck = {
    totalMonthlyUSD: domains.reduce(
      (acc, domain) => acc + Number(domain.valueFlowMonthlyUSD ?? 0),
      0,
    ),
    averageResilience:
      domains.length === 0
        ? 0
        : domains.reduce((acc, domain) => acc + Number(domain.resilienceIndex ?? 0), 0) / domains.length,
    guardianCoverageMinutes: totalSentinelCoverageSeconds / 60,
    annualBudget: streams.reduce((acc, stream) => acc + Number(stream.annualBudget ?? 0), 0),
    coverageRatioPercent: domainSlugs.length === 0 ? 0 : (coveredCount / domainSlugs.length) * 100,
    fundedDomainRatioPercent: domainSlugs.length === 0 ? 0 : (fundedCount / domainSlugs.length) * 100,
    averageDomainCoverageSeconds: domainSlugs.length === 0 ? 0 : totalCoverageSeconds / domainSlugs.length,
    guardianWindowSeconds,
    minDomainCoverageSeconds: minCoverageSeconds,
    minimumCoverageAdequacy:
      guardianWindowSeconds > 0 && coverageEntries.length > 0 ? minCoverageSeconds / guardianWindowSeconds : 0,
    minDomainFundingUSD: minFundingUSD,
    maxAutonomy: domains.reduce((acc, domain) => Math.max(acc, Number(domain.autonomyLevelBps ?? 0)), 0),
    cadenceHours: cadenceSeconds / 3600,
    lastExecutedAt: Number(config.selfImprovement?.plan?.lastExecutedAt ?? 0),
    dominanceScore: computeDominanceScore({
      totalMonthlyUSD: domains.reduce(
        (acc, domain) => acc + Number(domain.valueFlowMonthlyUSD ?? 0),
        0,
      ),
      averageResilience:
        domains.length === 0
          ? 0
          : domains.reduce((acc, domain) => acc + Number(domain.resilienceIndex ?? 0), 0) / domains.length,
      coverageRatio: domainSlugs.length === 0 ? 0 : coveredCount / domainSlugs.length,
      averageDomainCoverageSeconds: domainSlugs.length === 0 ? 0 : totalCoverageSeconds / domainSlugs.length,
      guardianReviewWindowSeconds: guardianWindowSeconds,
      maxAutonomyBps: domains.reduce((acc, domain) => Math.max(acc, Number(domain.autonomyLevelBps ?? 0)), 0),
      autonomyGuardCapBps: autonomyGuardCap,
      cadenceSeconds,
    }),
    guardianProtocolCount: protocols.length,
    guardianProtocolCoverageRatio:
      domainSlugs.length === 0
        ? 0
        : (() => {
            const coverageSet = new Set<string>();
            for (const protocol of protocols) {
              const declared = Array.from(
                new Set(
                  (protocol.linkedDomains ?? [])
                    .map((entry) => String(entry ?? "").toLowerCase())
                    .filter((entry) => domainSet.has(entry)),
                ),
              );
              const targets = declared.length > 0 ? declared : domainSlugs;
              for (const target of targets) {
                coverageSet.add(target);
              }
            }
            return (coverageSet.size / domainSlugs.length) * 100;
          })(),
    guardianProtocolSeverityScore:
      protocols.length === 0
        ? 0
        : protocols.reduce((acc, protocol) => acc + (severityWeights[protocol.severity ?? "high"] ?? 0.5), 0) /
          protocols.length,
    domainFundingMap: Object.fromEntries(domainSlugs.map((slug) => [slug, fundingByDomain.get(slug) ?? 0])),
    sessionMaxHours: Number(config.autonomy?.session?.maxHours ?? 0),
    sessionContextTokens: Number(config.autonomy?.session?.contextWindowTokens ?? 0),
    checkpointCadenceMinutes: Number(config.autonomy?.session?.checkpointCadenceMinutes ?? 0),
    checkpointCount: Number((config.autonomy?.progressCheckpoints ?? []).length),
    aiTeamCount: Number((config.aiTeams ?? []).length),
    aiTeamCoverageRatio:
      domainSlugs.length === 0
        ? 0
        : (() => {
            const coverageSet = new Set<string>();
            for (const team of config.aiTeams ?? []) {
              for (const domain of team.domains ?? []) {
                const normalized = String(domain ?? "").toLowerCase();
                if (domainSet.has(normalized)) {
                  coverageSet.add(normalized);
                }
              }
            }
            return Math.min(1, coverageSet.size / domainSlugs.length);
          })(),
    safetyTripwireCount: Number((config.safety?.tripwires ?? []).length),
    validatorConsoleCount: Number((config.safety?.validatorConsoles ?? []).length),
    stakeTierCount: Number((config.economy?.stakeTiers ?? []).length),
    milestoneTemplateCount: Number((config.economy?.milestoneTemplates ?? []).length),
    modelAdapterCount: Number((config.models?.adapters ?? []).length),
    modelEvaluationCadenceHours: Number(config.models?.evaluationCadenceHours ?? 0),
    modelSafetyTestCount: Number((config.models?.safetyTests ?? []).length),
    governanceProposalTemplateCount: Number((config.governance?.proposalTemplates ?? []).length),
    humanPolicyControlCount: Number((config.governance?.humanPolicyControls ?? []).length),
  };

  const defaultTolerance: Record<string, number> = {
    totalMonthlyUSD: 0.5,
    averageResilience: 1e-9,
    guardianCoverageMinutes: 1e-6,
    annualBudget: 0.5,
    coverageRatio: 1e-6,
    fundedDomainRatio: 1e-6,
    averageDomainCoverageSeconds: 1e-6,
    guardianWindowSeconds: 1e-9,
    minDomainCoverageSeconds: 1e-6,
    minimumCoverageAdequacy: 1e-6,
    minDomainFundingUSD: 1e-6,
    maxAutonomy: 1e-6,
    cadenceHours: 1e-9,
    lastExecutedAt: 1e-9,
    dominanceScore: 1e-6,
    guardianProtocolCount: 1e-9,
    guardianProtocolCoverageRatio: 1e-6,
    guardianProtocolSeverityScore: 1e-9,
    sessionMaxHours: 1e-9,
    sessionContextTokens: 1e-9,
    checkpointCadenceMinutes: 1e-9,
    checkpointCount: 1e-9,
    aiTeamCount: 1e-9,
    aiTeamCoverageRatio: 1e-9,
    safetyTripwireCount: 1e-9,
    validatorConsoleCount: 1e-9,
    stakeTierCount: 1e-9,
    milestoneTemplateCount: 1e-9,
    modelAdapterCount: 1e-9,
    modelEvaluationCadenceHours: 1e-9,
    modelSafetyTestCount: 1e-9,
    governanceProposalTemplateCount: 1e-9,
    humanPolicyControlCount: 1e-9,
  };

  const tolerance = { ...defaultTolerance, ...overrides };
  const mismatches: string[] = [];

  const comparisons: Array<{
    key: keyof typeof tolerance;
    baseline: number;
    cross: number;
  }> = [
    { key: "totalMonthlyUSD", baseline: metrics.totalMonthlyUSD, cross: crossCheck.totalMonthlyUSD },
    { key: "averageResilience", baseline: metrics.averageResilience, cross: crossCheck.averageResilience },
    { key: "guardianCoverageMinutes", baseline: metrics.guardianCoverageMinutes, cross: crossCheck.guardianCoverageMinutes },
    { key: "annualBudget", baseline: metrics.annualBudget, cross: crossCheck.annualBudget },
    { key: "coverageRatio", baseline: metrics.coverageRatio, cross: crossCheck.coverageRatioPercent },
    { key: "fundedDomainRatio", baseline: metrics.fundedDomainRatio, cross: crossCheck.fundedDomainRatioPercent },
    {
      key: "averageDomainCoverageSeconds",
      baseline: metrics.averageDomainCoverageSeconds,
      cross: crossCheck.averageDomainCoverageSeconds,
    },
    { key: "guardianWindowSeconds", baseline: metrics.guardianWindowSeconds, cross: crossCheck.guardianWindowSeconds },
    { key: "minDomainCoverageSeconds", baseline: metrics.minDomainCoverageSeconds, cross: crossCheck.minDomainCoverageSeconds },
    { key: "minimumCoverageAdequacy", baseline: metrics.minimumCoverageAdequacy, cross: crossCheck.minimumCoverageAdequacy },
    { key: "minDomainFundingUSD", baseline: metrics.minDomainFundingUSD, cross: crossCheck.minDomainFundingUSD },
    { key: "maxAutonomy", baseline: metrics.maxAutonomy, cross: crossCheck.maxAutonomy },
    { key: "cadenceHours", baseline: metrics.cadenceHours, cross: crossCheck.cadenceHours },
    { key: "lastExecutedAt", baseline: metrics.lastExecutedAt, cross: crossCheck.lastExecutedAt },
    { key: "dominanceScore", baseline: metrics.dominanceScore, cross: crossCheck.dominanceScore },
    { key: "guardianProtocolCount", baseline: metrics.guardianProtocolCount, cross: crossCheck.guardianProtocolCount },
    {
      key: "guardianProtocolCoverageRatio",
      baseline: metrics.guardianProtocolCoverageRatio,
      cross: crossCheck.guardianProtocolCoverageRatio,
    },
    {
      key: "guardianProtocolSeverityScore",
      baseline: metrics.guardianProtocolSeverityScore,
      cross: crossCheck.guardianProtocolSeverityScore,
    },
    { key: "sessionMaxHours", baseline: metrics.sessionMaxHours, cross: crossCheck.sessionMaxHours },
    { key: "sessionContextTokens", baseline: metrics.sessionContextTokens, cross: crossCheck.sessionContextTokens },
    {
      key: "checkpointCadenceMinutes",
      baseline: metrics.checkpointCadenceMinutes,
      cross: crossCheck.checkpointCadenceMinutes,
    },
    { key: "checkpointCount", baseline: metrics.checkpointCount, cross: crossCheck.checkpointCount },
    { key: "aiTeamCount", baseline: metrics.aiTeamCount, cross: crossCheck.aiTeamCount },
    { key: "aiTeamCoverageRatio", baseline: metrics.aiTeamCoverageRatio, cross: crossCheck.aiTeamCoverageRatio },
    { key: "safetyTripwireCount", baseline: metrics.safetyTripwireCount, cross: crossCheck.safetyTripwireCount },
    { key: "validatorConsoleCount", baseline: metrics.validatorConsoleCount, cross: crossCheck.validatorConsoleCount },
    { key: "stakeTierCount", baseline: metrics.stakeTierCount, cross: crossCheck.stakeTierCount },
    {
      key: "milestoneTemplateCount",
      baseline: metrics.milestoneTemplateCount,
      cross: crossCheck.milestoneTemplateCount,
    },
    { key: "modelAdapterCount", baseline: metrics.modelAdapterCount, cross: crossCheck.modelAdapterCount },
    {
      key: "modelEvaluationCadenceHours",
      baseline: metrics.modelEvaluationCadenceHours,
      cross: crossCheck.modelEvaluationCadenceHours,
    },
    { key: "modelSafetyTestCount", baseline: metrics.modelSafetyTestCount, cross: crossCheck.modelSafetyTestCount },
    {
      key: "governanceProposalTemplateCount",
      baseline: metrics.governanceProposalTemplateCount,
      cross: crossCheck.governanceProposalTemplateCount,
    },
    {
      key: "humanPolicyControlCount",
      baseline: metrics.humanPolicyControlCount,
      cross: crossCheck.humanPolicyControlCount,
    },
  ];

  for (const comparison of comparisons) {
    const diff = Math.abs(comparison.baseline - comparison.cross);
    if (diff > (tolerance[comparison.key] ?? 0)) {
      mismatches.push(
        `${String(comparison.key)}: baseline=${comparison.baseline.toString()} cross=${comparison.cross.toString()} diff=${diff.toString()}`,
      );
    }
  }

  const fundingKeys = new Set([
    ...Object.keys(metrics.domainFundingMap ?? {}),
    ...Object.keys(crossCheck.domainFundingMap ?? {}),
  ]);
  for (const key of fundingKeys) {
    const baseline = Number(metrics.domainFundingMap?.[key] ?? 0);
    const cross = Number(crossCheck.domainFundingMap?.[key] ?? 0);
    if (Math.abs(baseline - cross) > 1e-6) {
      mismatches.push(`domainFundingMap.${key}: baseline=${baseline} cross=${cross}`);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(`Phase 8 metrics cross-check failed:\n${mismatches.map((entry) => ` - ${entry}`).join("\n")}`);
  }

  return { metrics, crossCheck };
}

function usd(value: number) {
  if (value === 0) return "$0";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatSeverity(severity: string | undefined) {
  switch ((severity ?? "high").toLowerCase()) {
    case "critical":
      return "CRITICAL — immediate guardian intervention";
    case "high":
      return "HIGH — act within guardian review window";
    case "medium":
      return "MEDIUM — monitor closely and prepare overrides";
    case "low":
      return "LOW — advisory posture only";
    default:
      return `${String(severity ?? "unknown").toUpperCase()} — classify with guardian council`;
  }
}

function describeSeverityAverage(score: number) {
  if (score >= 0.875) return "critical";
  if (score >= 0.65) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function formatAmount(value: any) {
  try {
    const big = BigInt(value ?? 0);
    if (big === BigInt(0)) return "0";
    const str = big.toString();
    if (str.length <= 6) return str;
    const prefix = str.slice(0, 3);
    return `${prefix}… (10^${str.length - 3})`;
  } catch (error) {
    return String(value ?? "0");
  }
}

function slugId(slug: string): string {
  return keccak256(toUtf8Bytes(slug.toLowerCase()));
}

export function mermaid(config: Phase8Config) {
  const lines = ["graph TD", "  Governance[[Guardian DAO]] --> Manager(Phase8UniversalValueManager)"];
  for (const domain of config.domains ?? []) {
    const slug = String(domain.slug || "domain").replace(/[^a-z0-9]/gi, "");
    lines.push(`  Manager --> ${slug}([${domain.name ?? slug}])`);
  }
  lines.push("  Manager --> Treasury[[Universal Treasury]]");
  lines.push("  Manager --> Sentinels{Sentinel lattice}");
  lines.push("  Sentinels --> Pause[System pause]");
  lines.push("  Manager --> Streams[[Capital Streams]]");
  for (const stream of config.capitalStreams ?? []) {
    const slug = String(stream.slug || "stream").replace(/[^a-z0-9]/gi, "");
    lines.push(`  Streams --> ${slug}Stream([${stream.name ?? slug}])`);
  }
  lines.push("  Streams --> Domains([Autonomous domains])");
  return `${lines.join("\n")}\n`;
}

export function calldata(config: Phase8Config) {
  const iface = new Interface([
    "function setGlobalParameters((address,address,address,address,address,address,uint64,uint64,uint256,string,bytes32) params)",
    "function setGuardianCouncil(address council)",
    "function setSystemPause(address newPause)",
    "function registerDomain((string slug,string name,string metadataURI,address orchestrator,address capitalVault,address validatorModule,address policyKernel,uint64 heartbeatSeconds,uint256 tvlLimit,uint256 autonomyLevelBps,bool active) config)",
    "function registerSentinel((string slug,string name,string uri,address agent,uint64 coverageSeconds,uint256 sensitivityBps,bool active) profile)",
    "function registerCapitalStream((string slug,string name,string uri,address vault,uint256 annualBudget,uint256 expansionBps,bool active) stream)",
    "function setSentinelDomains(bytes32 id, bytes32[] domainIds)",
    "function setCapitalStreamDomains(bytes32 id, bytes32[] domainIds)",
    "function setSelfImprovementPlan((string planURI,bytes32 planHash,uint64 cadenceSeconds,uint64 lastExecutedAt,string lastReportURI) plan)",
    "function recordSelfImprovementExecution(uint64 executedAt,string reportURI)",
    "function removeDomain(bytes32 id)",
    "function removeSentinel(bytes32 id)",
    "function removeCapitalStream(bytes32 id)"
  ]);

  const global = config.global ?? {};
  const domainTuples = (config.domains ?? []).map((domain) => [
    domain.slug,
    domain.name,
    domain.metadataURI,
    domain.orchestrator,
    domain.capitalVault,
    domain.validatorModule,
    domain.policyKernel,
    BigInt(domain.heartbeatSeconds ?? 0),
    BigInt(domain.tvlLimit ?? 0),
    BigInt(domain.autonomyLevelBps ?? 0),
    Boolean(domain.active),
  ]);
  const sentinelTuples = (config.sentinels ?? []).map((sentinel) => [
    sentinel.slug,
    sentinel.name,
    sentinel.uri,
    sentinel.agent,
    BigInt(sentinel.coverageSeconds ?? 0),
    BigInt(sentinel.sensitivityBps ?? 0),
    Boolean(sentinel.active),
  ]);
  const streamTuples = (config.capitalStreams ?? []).map((stream) => [
    stream.slug,
    stream.name,
    stream.uri,
    stream.vault,
    BigInt(stream.annualBudget ?? 0),
    BigInt(stream.expansionBps ?? 0),
    Boolean(stream.active),
  ]);
  const plan = config.selfImprovement?.plan;
  const sentinelDomains = (config.sentinels ?? []).map((entry) => ({
    slug: entry.slug,
    id: slugId(String(entry.slug || "")),
    domains: (entry.domains ?? []).map((domain: string) => slugId(String(domain || ""))),
  }));
  const streamDomains = (config.capitalStreams ?? []).map((entry) => ({
    slug: entry.slug,
    id: slugId(String(entry.slug || "")),
    domains: (entry.domains ?? []).map((domain: string) => slugId(String(domain || ""))),
  }));

  const tuples = {
    global: [
      global.treasury,
      global.universalVault,
      global.upgradeCoordinator,
      global.validatorRegistry,
      global.missionControl,
      global.knowledgeGraph,
      BigInt(global.heartbeatSeconds ?? 0),
      BigInt(global.guardianReviewWindow ?? 0),
      BigInt(global.maxDrawdownBps ?? 0),
      String(global.manifestoURI ?? ""),
      String(global.manifestoHash ?? ZERO_HASH),
    ],
    guardian: global.guardianCouncil,
    pause: global.systemPause,
    plan: [
      String(plan?.planURI ?? ""),
      String(plan?.planHash ?? "0x0000000000000000000000000000000000000000000000000000000000000000"),
      BigInt(plan?.cadenceSeconds ?? 0),
      BigInt(plan?.lastExecutedAt ?? 0),
      String(plan?.lastReportURI ?? ""),
    ],
  };

  const nextExecution =
    plan && plan.cadenceSeconds
      ? BigInt(plan.lastExecutedAt ?? 0) + BigInt(plan.cadenceSeconds ?? 0)
      : undefined;
  const registerDomainCalls = domainTuples.map((tuple, index) => ({
    slug: config.domains[index]?.slug,
    data: iface.encodeFunctionData("registerDomain", [tuple]),
  }));
  const registerSentinelCalls = sentinelTuples.map((tuple, index) => ({
    slug: config.sentinels[index]?.slug,
    data: iface.encodeFunctionData("registerSentinel", [tuple]),
  }));
  const registerStreamCalls = streamTuples.map((tuple, index) => ({
    slug: config.capitalStreams[index]?.slug,
    data: iface.encodeFunctionData("registerCapitalStream", [tuple]),
  }));

  const removeDomainCalls = (config.domains ?? []).map((domain) => ({
    slug: domain.slug,
    data: iface.encodeFunctionData("removeDomain", [slugId(String(domain.slug || ""))]),
  }));
  const removeSentinelCalls = (config.sentinels ?? []).map((sentinel) => ({
    slug: sentinel.slug,
    data: iface.encodeFunctionData("removeSentinel", [slugId(String(sentinel.slug || ""))]),
  }));
  const removeStreamCalls = (config.capitalStreams ?? []).map((stream) => ({
    slug: stream.slug,
    data: iface.encodeFunctionData("removeCapitalStream", [slugId(String(stream.slug || ""))]),
  }));

  return {
    setGlobalParameters: iface.encodeFunctionData("setGlobalParameters", [tuples.global]),
    setGuardianCouncil: iface.encodeFunctionData("setGuardianCouncil", [tuples.guardian ?? "0x0000000000000000000000000000000000000000"]),
    setSystemPause: iface.encodeFunctionData("setSystemPause", [tuples.pause ?? "0x0000000000000000000000000000000000000000"]),
    registerDomain: registerDomainCalls[0]?.data,
    registerSentinel: registerSentinelCalls[0]?.data,
    registerCapitalStream: registerStreamCalls[0]?.data,
    registerDomains: registerDomainCalls,
    registerSentinels: registerSentinelCalls,
    registerCapitalStreams: registerStreamCalls,
    setSentinelDomains:
      sentinelDomains.length > 0
        ? iface.encodeFunctionData("setSentinelDomains", [sentinelDomains[0].id, sentinelDomains[0].domains])
        : undefined,
    setCapitalStreamDomains:
      streamDomains.length > 0
        ? iface.encodeFunctionData("setCapitalStreamDomains", [streamDomains[0].id, streamDomains[0].domains])
        : undefined,
    setSelfImprovementPlan: iface.encodeFunctionData("setSelfImprovementPlan", [tuples.plan]),
    recordSelfImprovementExecution:
      nextExecution && plan?.lastReportURI
        ? iface.encodeFunctionData("recordSelfImprovementExecution", [nextExecution, plan.lastReportURI])
        : undefined,
    removeDomain: removeDomainCalls[0]?.data,
    removeSentinel: removeSentinelCalls[0]?.data,
    removeCapitalStream: removeStreamCalls[0]?.data,
    removeDomains: removeDomainCalls,
    removeSentinels: removeSentinelCalls,
    removeCapitalStreams: removeStreamCalls,
    sentinelDomainCalls: sentinelDomains.map((entry) => ({
      slug: entry.slug,
      data: iface.encodeFunctionData("setSentinelDomains", [entry.id, entry.domains]),
    })),
    streamDomainCalls: streamDomains.map((entry) => ({
      slug: entry.slug,
      data: iface.encodeFunctionData("setCapitalStreamDomains", [entry.id, entry.domains]),
    })),
  };
}

export type CalldataEntry = { label: string; slug?: string; data: string };

export function flattenCalldataEntries(data: Record<string, any>): CalldataEntry[] {
  const entries: CalldataEntry[] = [];
  for (const [label, payload] of Object.entries(data)) {
    if (!payload || SKIP_SINGLE_CALL_KEYS.has(label)) continue;
    if (Array.isArray(payload)) {
      for (const item of payload) {
        if (!item || typeof item !== "object" || !item.data) continue;
        entries.push({ label: LABEL_MAP[label] ?? label, slug: item.slug, data: item.data });
      }
      continue;
    }
    if (typeof payload === "object" && (payload as any).data) {
      entries.push({ label, data: (payload as any).data, slug: (payload as any).slug });
      continue;
    }
    if (typeof payload === "string") {
      entries.push({ label, data: payload });
    }
  }
  return entries;
}

type ChecklistLookups = {
  domainLookup: Map<string, string>;
  sentinelLookup: Map<string, string>;
  streamLookup: Map<string, string>;
};

function buildChecklistLookups(config: Phase8Config): ChecklistLookups {
  const domainLookup = new Map<string, string>();
  for (const domain of config.domains ?? []) {
    const slug = String(domain.slug ?? "").toLowerCase();
    if (!slug) continue;
    const name = String(domain.name ?? slug).trim();
    domainLookup.set(slug, name.length > 0 ? name : slug);
  }

  const sentinelLookup = new Map<string, string>();
  for (const sentinel of config.sentinels ?? []) {
    const slug = String(sentinel.slug ?? "").toLowerCase();
    if (!slug) continue;
    const name = String(sentinel.name ?? slug).trim();
    sentinelLookup.set(slug, name.length > 0 ? name : slug);
  }

  const streamLookup = new Map<string, string>();
  for (const stream of config.capitalStreams ?? []) {
    const slug = String(stream.slug ?? "").toLowerCase();
    if (!slug) continue;
    const name = String(stream.name ?? slug).trim();
    streamLookup.set(slug, name.length > 0 ? name : slug);
  }

  return { domainLookup, sentinelLookup, streamLookup };
}

function resolveChecklistTarget(label: string, slug: string, lookups: ChecklistLookups): string | null {
  const normalized = String(slug ?? "").toLowerCase();
  if (!normalized) return null;

  const base = slug || normalized;
  if (["registerDomain", "removeDomain"].includes(label)) {
    const name = lookups.domainLookup.get(normalized);
    return name ? `${base} — ${name}` : base;
  }
  if (["registerSentinel", "setSentinelDomains", "removeSentinel"].includes(label)) {
    const name = lookups.sentinelLookup.get(normalized);
    return name ? `${base} — ${name}` : base;
  }
  if (["registerCapitalStream", "setCapitalStreamDomains", "removeCapitalStream"].includes(label)) {
    const name = lookups.streamLookup.get(normalized);
    return name ? `${base} — ${name}` : base;
  }
  return base;
}

function formatChecklistTargets(label: string, slugs: Set<string>, lookups: ChecklistLookups): string[] {
  const rendered = Array.from(slugs)
    .map((slug) => resolveChecklistTarget(label, slug, lookups))
    .filter((value): value is string => Boolean(value));
  return rendered.sort((a, b) => a.localeCompare(b));
}

function ensureOutputDirectory(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function telemetryMarkdown(
  config: Phase8Config,
  metrics: ReturnType<typeof computeMetrics>,
): string {
  const sentinelCoverageMap = sentinelNameMap(config);
  const streamDomainMap = streamNameMap(config);
  const autonomy = config.autonomy;
  const safety = config.safety;
  const economy = config.economy;
  const models = config.models;
  const governance = config.governance;
  const aiTeams = config.aiTeams ?? [];

  const lines: string[] = [];
  lines.push(`# Phase 8 — Universal Value Dominance Telemetry`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`## Global Metrics`);
  lines.push(`- Total monthly value flow: ${usd(metrics.totalMonthlyUSD)}`);
  lines.push(`- Annual capital allocation: ${usd(metrics.annualBudget)}`);
  lines.push(`- Average resilience index: ${metrics.averageResilience.toFixed(3)}`);
  lines.push(`- Universal dominance score: ${metrics.dominanceScore.toFixed(1)} / 100`);
  lines.push(`- Sentinel coverage per guardian cycle: ${metrics.guardianCoverageMinutes.toFixed(1)} minutes`);
  lines.push(`- Domains covered by sentinels: ${metrics.coverageRatio.toFixed(1)}%`);
  lines.push(`- Domains with capital funding: ${metrics.fundedDomainRatio.toFixed(1)}%`);
  lines.push(
    `- Guardian response protocols: ${metrics.guardianProtocolCount} scenarios covering ${metrics.guardianProtocolCoverageRatio.toFixed(1)}% of domains`,
  );
  lines.push(
    `- Protocol severity posture: ${describeSeverityAverage(metrics.guardianProtocolSeverityScore).toUpperCase()} (${metrics.guardianProtocolSeverityScore.toFixed(2)})`,
  );
  if (metrics.guardianWindowSeconds) {
    const adequacyPercent = metrics.minimumCoverageAdequacy * 100;
    lines.push(
      `- Minimum sentinel coverage per domain: ${metrics.minDomainCoverageSeconds.toFixed(0)}s (requirement ${metrics.guardianWindowSeconds}s, adequacy ${adequacyPercent.toFixed(1)}%)`,
    );
  }
  lines.push(`- Maximum encoded autonomy: ${metrics.maxAutonomy} bps`);
  lines.push(`- Minimum per-domain capital coverage: ${usd(metrics.minDomainFundingUSD ?? 0)} / yr`);
  if (metrics.cadenceHours) {
    lines.push(`- Self-improvement cadence: every ${metrics.cadenceHours.toFixed(2)} hours`);
  }
  if (metrics.lastExecutedAt) {
    lines.push(`- Last self-improvement execution: ${new Date(metrics.lastExecutedAt * 1000).toISOString()}`);
  }
  if (metrics.sessionMaxHours) {
    lines.push(
      `- Autonomous session envelope: ${metrics.sessionMaxHours.toFixed(2)} hours · ${metrics.sessionContextTokens.toLocaleString()} token context · checkpoints every ${metrics.checkpointCadenceMinutes.toFixed(0)} minutes (${metrics.checkpointCount} checkpoints)`,
    );
  }
  if (metrics.aiTeamCount) {
    lines.push(
      `- Multi-agent teams: ${metrics.aiTeamCount} orchestrators covering ${(metrics.aiTeamCoverageRatio * 100).toFixed(1)}% of dominions`,
    );
  }
  if (metrics.safetyTripwireCount || metrics.validatorConsoleCount) {
    lines.push(
      `- Safety lattice: ${metrics.safetyTripwireCount} automated tripwires · ${metrics.validatorConsoleCount} validator consoles`,
    );
  }
  if (metrics.stakeTierCount || metrics.milestoneTemplateCount) {
    lines.push(
      `- Economic incentives: ${metrics.stakeTierCount} stake tiers · ${metrics.milestoneTemplateCount} milestone templates`,
    );
  }
  if (metrics.modelAdapterCount || metrics.modelEvaluationCadenceHours) {
    lines.push(
      `- Model adapters: ${metrics.modelAdapterCount} adapters · evaluation cadence ${metrics.modelEvaluationCadenceHours.toFixed(1)}h · ${metrics.modelSafetyTestCount} safety tests`,
    );
  }
  if (metrics.governanceProposalTemplateCount || metrics.humanPolicyControlCount) {
    lines.push(
      `- Governance readiness: ${metrics.governanceProposalTemplateCount} proposal templates · ${metrics.humanPolicyControlCount} human policy controls`,
    );
  }
  lines.push("");

  const diagnostics = guardrailDiagnostics(config);
  lines.push("## Diagnostics");
  if (diagnostics.length === 0) {
    lines.push("- All guardrails nominal across monitored domains.");
  } else {
    for (const diagnostic of diagnostics) {
      lines.push(`- ${diagnostic}`);
    }
  }
  lines.push("");

  lines.push(`## Governance Control Surface`);
  lines.push(`- Treasury: ${config.global?.treasury}`);
  lines.push(`- Universal vault: ${config.global?.universalVault}`);
  lines.push(`- Upgrade coordinator: ${config.global?.upgradeCoordinator}`);
  lines.push(`- Validator registry: ${config.global?.validatorRegistry}`);
  lines.push(`- Mission control: ${config.global?.missionControl}`);
  lines.push(`- Knowledge graph: ${config.global?.knowledgeGraph}`);
  lines.push(`- Guardian council: ${config.global?.guardianCouncil}`);
  lines.push(`- System pause: ${config.global?.systemPause}`);
  lines.push(`- Manifest URI: ${config.global?.manifestoURI}`);
  lines.push(`- Manifest Hash: ${config.global?.manifestoHash ?? "—"}`);
  lines.push(`- Max drawdown guard: ${config.global?.maxDrawdownBps} bps`);
  lines.push("");

  if (autonomy || aiTeams.length) {
    lines.push(`## Autonomy & Multi-Agent Execution`);
    if (autonomy?.session) {
      lines.push(
        `- Session runtime: ${autonomy.session.maxHours}h · context ${autonomy.session.contextWindowTokens.toLocaleString()} tokens · checkpoint cadence ${autonomy.session.checkpointCadenceMinutes} minutes`,
      );
      lines.push(`- Memory strategy: ${autonomy.memoryStrategy}`);
      if (autonomy.persistentExecution) {
        const resources = autonomy.persistentExecution.resources ?? {};
        lines.push(
          `- Persistent execution: ${autonomy.persistentExecution.runtime} @ ${autonomy.persistentExecution.image} (${resources.cpu ?? "cpu"}/${resources.memory ?? "ram"}/${resources.storage ?? "storage"})`,
        );
      }
      for (const checkpoint of autonomy.progressCheckpoints ?? []) {
        lines.push(
          `  • Checkpoint ${checkpoint.name}: every ${checkpoint.intervalMinutes} minutes — ${checkpoint.description}`,
        );
      }
    }
    if (aiTeams.length) {
      for (const team of aiTeams) {
        const specialists = (team.specialists ?? []).length;
        lines.push(
          `- Team ${team.name}: ${team.mission} · cadence ${team.cadenceMinutes} minutes · specialists ${specialists} · collaboration ${team.collaborationProtocol}`,
        );
      }
    }
    lines.push("");
  }

  if (safety) {
    lines.push(`## Oversight & Safety`);
    lines.push(
      `- Autonomy threshold ${safety.autonomyThresholdMinutes} minutes · check-ins ${safety.checkInCadenceMinutes} minutes · trace sampling ${(safety.logging?.traceSampling ?? 0) * 100}%`,
    );
    lines.push(`- Logging sinks: ${(safety.logging?.sinks ?? []).map((sink) => sink.name).join(", ") || "None"}`);
    for (const tripwire of safety.tripwires ?? []) {
      lines.push(`  • Tripwire ${tripwire.name}: ${tripwire.trigger} → ${tripwire.action} (${tripwire.severity})`);
    }
    if (safety.validatorConsoles?.length) {
      lines.push(
        `- Validator consoles: ${safety.validatorConsoles.map((console) => `${console.name} (${console.url})`).join(", ")}`,
      );
    }
    lines.push("");
  }

  if (economy) {
    lines.push(`## Economic Incentives`);
    for (const tier of economy.stakeTiers ?? []) {
      lines.push(
        `- Stake tier ${tier.name}: duration ${tier.durationHours}h · minimum stake ${tier.minimumStake} · slash ×${tier.slashMultiplier}`,
      );
    }
    for (const milestone of economy.milestoneTemplates ?? []) {
      lines.push(`  • Milestone ${milestone.name}: ${milestone.description} (${milestone.payoutBps} bps)`);
    }
    if (economy.budgetCaps) {
      lines.push(
        `- Budget caps: compute ${usd(economy.budgetCaps.maxComputeUSD)} · API ${usd(economy.budgetCaps.maxApiSpendUSD)} · token ${usd(economy.budgetCaps.maxTokenSpendUSD)}`,
      );
    }
    if (economy.rewardCurves) {
      lines.push(
        `- Reward curves: long task bonus ${economy.rewardCurves.longTaskBonusBps} bps · validator premium ${economy.rewardCurves.validatorPremiumBps} bps`,
      );
    }
    lines.push("");
  }

  if (models) {
    lines.push(`## Model Integration Layer`);
    lines.push(
      `- Evaluation cadence: every ${models.evaluationCadenceHours}h · benchmarks ${(models.evaluationBenchmarks ?? []).join(", ") || "—"}`,
    );
    for (const adapter of models.adapters ?? []) {
      lines.push(
        `  • Adapter ${adapter.name} (${adapter.provider}) — ${adapter.modality} · ${adapter.maxContextTokens.toLocaleString()} tokens · $${adapter.costPer1kTokensUSD.toFixed(4)}/1k tokens · strengths ${(adapter.strengths ?? []).join(", ") || "—"}`,
      );
    }
    if (models.dynamicRouting) {
      lines.push(
        `- Dynamic routing: ${models.dynamicRouting.strategy} · metrics ${(models.dynamicRouting.metrics ?? []).join(", ") || "—"}`,
      );
    }
    for (const test of models.safetyTests ?? []) {
      lines.push(`  • Safety test ${test.name}: every ${test.frequencyHours}h`);
    }
    lines.push("");
  }

  if (governance) {
    lines.push(`## Governance & Human Collaboration`);
    lines.push(`- Governance interface: ${governance.interface}`);
    if (governance.validatorTools?.length) {
      lines.push(
        `- Validator tools: ${governance.validatorTools.map((tool) => `${tool.name} (${tool.url})`).join(", ")}`,
      );
    }
    for (const proposal of governance.proposalTemplates ?? []) {
      lines.push(`  • Proposal template ${proposal.title}: ETA ${proposal.executionEtaHours}h — ${proposal.summary}`);
    }
    if (governance.humanPolicyControls?.length) {
      lines.push("- Human-in-the-loop controls:");
      for (const control of governance.humanPolicyControls) {
        lines.push(`  • ${control.name}: requirement ${control.requirement} — enforcement ${control.enforcement}`);
      }
    }
    lines.push("");
  }

  lines.push(`## Domains`);
  lines.push(
    `| Domain | Autonomy (bps) | Resilience | Heartbeat (s) | TVL cap | Monthly value | Capital coverage | Sentinels | Capital streams |`,
  );
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const domain of config.domains ?? []) {
    const slug = String(domain.slug ?? "").toLowerCase();
    const sentinelList = (sentinelCoverageMap.get(slug) ?? ["—"]).join(", ");
    const streamList = (streamDomainMap.get(slug) ?? ["—"]).join(", ");
    const capitalCoverageUSD = usd(Number((metrics.domainFundingMap ?? {})[slug] ?? 0));
    lines.push(
      `| ${domain.name} | ${domain.autonomyLevelBps} | ${(domain.resilienceIndex ?? 0).toFixed(3)} | ${domain.heartbeatSeconds} | ${formatAmount(domain.tvlLimit)} | ${usd(Number(domain.valueFlowMonthlyUSD ?? 0))} | ${capitalCoverageUSD} | ${sentinelList} | ${streamList} |`,
    );
  }
  lines.push("");

  lines.push(`## Sentinel Lattice`);
  for (const sentinel of config.sentinels ?? []) {
    lines.push(
      `- ${sentinel.name} · coverage ${sentinel.coverageSeconds}s · sensitivity ${sentinel.sensitivityBps} bps · guarding ${(sentinel.domains || []).join(", ")}`,
    );
  }
  lines.push("");

  lines.push(`## Capital Streams`);
  for (const stream of config.capitalStreams ?? []) {
    lines.push(
      `- ${stream.name} · ${usd(Number(stream.annualBudget ?? 0))}/yr · expansion ${stream.expansionBps} bps · targets ${(stream.domains || []).join(", ")}`,
    );
  }
  lines.push("");

  lines.push(`## Guardian Response Protocols`);
  if ((config.guardianProtocols ?? []).length === 0) {
    lines.push("- No guardian response protocols configured — define scenarios to codify emergency playbooks.");
  } else {
    let index = 1;
    for (const protocol of config.guardianProtocols ?? []) {
      const sentinelList = (protocol.linkedSentinels ?? []).length
        ? (protocol.linkedSentinels ?? []).join(", ")
        : "All sentinels";
      const domainList = (protocol.linkedDomains ?? []).length
        ? (protocol.linkedDomains ?? []).join(", ")
        : "All domains";
      lines.push(`- [${index}] ${protocol.scenario} — ${formatSeverity(protocol.severity)}`);
      lines.push(`  • Trigger: ${protocol.trigger}`);
      lines.push(`  • Guardians: ${sentinelList}`);
      lines.push(`  • Domains: ${domainList}`);
      lines.push(`  • Immediate actions: ${protocol.immediateActions.join(" | ")}`);
      lines.push(`  • Stabilization actions: ${protocol.stabilizationActions.join(" | ")}`);
      lines.push(`  • Communications: ${protocol.communications.join(" | ")}`);
      if (protocol.successCriteria && protocol.successCriteria.length > 0) {
        lines.push(`  • Success criteria: ${protocol.successCriteria.join(" | ")}`);
      }
      index += 1;
    }
  }
  lines.push("");

  lines.push(`## Self-Improvement Kernel`);
  const plan = config.selfImprovement?.plan;
  const kernelGuardrails = config.selfImprovement?.guardrails;
  if (plan) {
    lines.push(
      `- Strategic plan: cadence ${plan.cadenceSeconds}s (${(Number(plan.cadenceSeconds ?? 0) / 3600).toFixed(2)} h) · hash ${plan.planHash} · last report ${plan.lastReportURI}`,
    );
  }
  if (kernelGuardrails) {
    lines.push(
      `- Kernel checksum: ${kernelGuardrails.checksum.algorithm} ${kernelGuardrails.checksum.value}`,
    );
    const zkNotes = kernelGuardrails.zkProof.notes ? ` · notes ${kernelGuardrails.zkProof.notes}` : "";
    lines.push(
      `- Kernel zk-proof: ${kernelGuardrails.zkProof.circuit} · status ${kernelGuardrails.zkProof.status} · artifact ${kernelGuardrails.zkProof.artifactURI}${zkNotes}`,
    );
  }
  const schedules = schedulePlaybooks(config);
  for (const schedule of schedules) {
    const guardrails = schedule.guardrails.length > 0 ? schedule.guardrails.join(", ") : "none";
    const cadence = schedule.requiresManualScheduling
      ? "Next run: manual scheduling required"
      : `Next run: ${schedule.nextRun}`;
    lines.push(`- Playbook ${schedule.name} (${schedule.automation}) · owner ${schedule.owner} · guardrails ${guardrails} · ${cadence}`);
  }
  if (config.selfImprovement?.autonomyGuards) {
    const guard = config.selfImprovement.autonomyGuards;
    lines.push(
      `- Autonomy guard: ≤${guard.maxAutonomyBps} bps · override window ${guard.humanOverrideMinutes} minutes · escalation ${(guard.escalationChannels || []).join(" → ")}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function escapeCsv(value: unknown): string {
  const stringValue = String(value ?? "");
  if (stringValue.includes(",") || stringValue.includes("\"") || /\s/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function generateOperatorRunbook(
  config: Phase8Config,
  metrics: ReturnType<typeof computeMetrics>,
  environment: EnvironmentConfig,
  generatedAt: string,
): string {
  const lines: string[] = [];
  lines.push("PHASE 8 — UNIVERSAL VALUE DOMINANCE :: OPERATOR RUNBOOK");
  lines.push(`Generated at ${generatedAt}`);
  lines.push("");
  lines.push("Key telemetry snapshot:");
  lines.push(`• Universal dominance score: ${metrics.dominanceScore.toFixed(1)} / 100`);
  lines.push(`• Total monthly value flow: ${usd(metrics.totalMonthlyUSD)}`);
  lines.push(`• Annual capital allocation: ${usd(metrics.annualBudget)}`);
  lines.push(`• Sentinel lattice coverage: ${metrics.guardianCoverageMinutes.toFixed(1)} minutes / cycle`);
  lines.push(
    `• Domains funded: ${metrics.fundedDomainRatio.toFixed(1)}% · Minimum funding floor ${usd(metrics.minDomainFundingUSD)}`,
  );
  if (metrics.guardianWindowSeconds) {
    lines.push(
      `• Minimum sentinel coverage: ${metrics.minDomainCoverageSeconds.toFixed(0)}s vs guardian window ${metrics.guardianWindowSeconds}s`,
    );
  }
  if (metrics.sessionMaxHours) {
    lines.push(
      `• Autonomous session envelope: ${metrics.sessionMaxHours.toFixed(2)}h · ${metrics.sessionContextTokens.toLocaleString()} tokens · checkpoint ${metrics.checkpointCadenceMinutes.toFixed(0)}m`,
    );
  }
  if (metrics.aiTeamCount) {
    lines.push(
      `• AI team mesh: ${metrics.aiTeamCount} teams covering ${(metrics.aiTeamCoverageRatio * 100).toFixed(1)}% of dominions`,
    );
  }
  if (metrics.safetyTripwireCount || metrics.validatorConsoleCount) {
    lines.push(
      `• Safety posture: ${metrics.safetyTripwireCount} tripwires · ${metrics.validatorConsoleCount} validator consoles on standby`,
    );
  }
  lines.push("");
  lines.push("Command ribbon (execute sequentially):");
  lines.push("1. npm ci                                 # lockfile enforced setup");
  lines.push("2. npm run demo:phase8:orchestrate        # synthesize calldata + exports");
  lines.push("3. Submit calldata via Safe / timelock    # governance executes encoded plan");
  lines.push("4. npx serve demo/Phase-8-Universal-Value-Dominance  # launch control surface");
  lines.push("");
  lines.push("Governance control points:");
  lines.push(shortAddress("Guardian council", config.global?.guardianCouncil));
  const managerConfigured =
    environment.managerAddress && environment.managerAddress !== ZERO_ADDRESS
      ? shortAddress("Phase 8 manager", environment.managerAddress)
      : "Phase 8 manager: set PHASE8_MANAGER_ADDRESS before execution";
  lines.push(managerConfigured);
  lines.push(shortAddress("Treasury", config.global?.treasury));
  lines.push(shortAddress("Universal vault", config.global?.universalVault));
  lines.push(shortAddress("System pause", config.global?.systemPause));
  lines.push(shortAddress("Mission control", config.global?.missionControl));
  lines.push(`Manifesto URI: ${config.global?.manifestoURI ?? "—"}`);
  lines.push(`Manifesto Hash: ${config.global?.manifestoHash ?? "—"}`);
  lines.push("");

  lines.push("Dominion readiness checks:");
  const guardianWindow = Number(config.global?.guardianReviewWindow ?? 0);
  const coverage = coverageMap(config.sentinels ?? [], (config.domains ?? []).map((d) => String(d.slug ?? "")));
  const funding = capitalCoverageMap(
    config.capitalStreams ?? [],
    (config.domains ?? []).map((d) => String(d.slug ?? "")),
  );
  for (const domain of config.domains ?? []) {
    const slug = String(domain.slug ?? "").toLowerCase();
    const domainCoverage = coverage.get(slug) ?? 0;
    const coverageStatus = guardianWindow > 0 ? `${(domainCoverage / guardianWindow * 100).toFixed(1)}% of window` : "n/a";
    const fundingUSD = funding.get(slug) ?? 0;
    const resilience = Number(domain.resilienceIndex ?? 0);
    const resilienceFlag =
      resilience < RESILIENCE_ALERT_THRESHOLD ? `ALERT resilience ${(resilience).toFixed(3)}` : `Resilience ${(resilience).toFixed(3)}`;
    lines.push(
      `• ${domain.name}: ${resilienceFlag} · Autonomy ${domain.autonomyLevelBps} bps · Sentinel coverage ${domainCoverage.toFixed(0)}s (${coverageStatus}) · Funding ${usd(fundingUSD)}/yr`,
    );
  }
  lines.push("");
  lines.push("Self-improvement kernel:");
  const plan = config.selfImprovement?.plan;
  const kernelGuardrails = config.selfImprovement?.guardrails;
  if (plan) {
    lines.push(`• Plan URI ${plan.planURI}`);
    lines.push(`• Plan hash ${plan.planHash}`);
    lines.push(`• Cadence ${plan.cadenceSeconds}s (${(Number(plan.cadenceSeconds ?? 0) / 3600).toFixed(2)}h)`);
    if (plan.lastExecutedAt) {
      lines.push(`• Last execution ${new Date(Number(plan.lastExecutedAt) * 1000).toISOString()}`);
    }
  }
  if (kernelGuardrails) {
    lines.push(`• Kernel checksum ${kernelGuardrails.checksum.algorithm} ${kernelGuardrails.checksum.value}`);
    const zkMeta = [
      `circuit ${kernelGuardrails.zkProof.circuit}`,
      `status ${kernelGuardrails.zkProof.status}`,
      `artifact ${kernelGuardrails.zkProof.artifactURI}`,
    ];
    if (kernelGuardrails.zkProof.notes) {
      zkMeta.push(`notes ${kernelGuardrails.zkProof.notes}`);
    }
    if (kernelGuardrails.zkProof.lastVerifiedAt && kernelGuardrails.zkProof.status === "verified") {
      zkMeta.push(`verified ${new Date(kernelGuardrails.zkProof.lastVerifiedAt * 1000).toISOString()}`);
    }
    lines.push(`• Kernel zk-proof ${zkMeta.join(" · ")}`);
  }
  const schedule = schedulePlaybooks(config);
  for (const playbook of schedule) {
    const cadence = playbook.intervalSeconds ? `${playbook.intervalSeconds / 3600}h cadence` : "manual";
    lines.push(`  - ${playbook.name} :: ${cadence} :: next ${playbook.nextRun ?? "—"}`);
  }
  if (config.selfImprovement?.autonomyGuards) {
    const guard = config.selfImprovement.autonomyGuards;
    lines.push(
      `• Autonomy guard ≤${guard.maxAutonomyBps}bps · Override ${guard.humanOverrideMinutes}m · Escalation ${(guard.escalationChannels ?? []).join(
        " → ",
      )}`,
    );
  }
  lines.push("");
  lines.push("Guardian response protocols:");
  if ((config.guardianProtocols ?? []).length === 0) {
    lines.push("• Configure guardianProtocols in the manifest so every dominion has an emergency response script.");
  } else {
    lines.push(
      `• ${config.guardianProtocols.length} playbooks covering ${metrics.guardianProtocolCoverageRatio.toFixed(1)}% of domains (average severity ${describeSeverityAverage(metrics.guardianProtocolSeverityScore).toUpperCase()}).`,
    );
    for (const protocol of config.guardianProtocols ?? []) {
      lines.push(`  - ${protocol.scenario}: ${formatSeverity(protocol.severity)} → ${protocol.trigger}`);
    }
  }
  lines.push("");
  lines.push("Emergency stops:");
  const pauseTarget =
    environment.managerAddress && environment.managerAddress !== ZERO_ADDRESS
      ? environment.managerAddress
      : "configure PHASE8_MANAGER_ADDRESS to route pause calls";
  lines.push(`• Invoke SystemPause via forwardPauseCall → ${pauseTarget}`);
  lines.push("• Guardian council retains immediate pause authority");
  lines.push("");
  lines.push("Console shortcuts:");
  lines.push(
    "• Manifest console: drop a manifest JSON or paste a URL to preview alternate dominions instantly. Use 'Use baseline manifest' to revert.",
  );
  lines.push(
    "• Dashboard URL accepts ?manifest=<url> for shareable guardian or auditor review sessions.",
  );
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function generateSelfImprovementPlanPayload(
  config: Phase8Config,
  metrics: ReturnType<typeof computeMetrics>,
  generatedAt: string,
) {
  const plan = config.selfImprovement?.plan ?? {};
  const guards = config.selfImprovement?.autonomyGuards ?? null;
  const kernelGuardrails = config.selfImprovement?.guardrails ?? null;
  const scheduled = schedulePlaybooks(config);
  return {
    generatedAt,
    dominanceScore: Number(metrics.dominanceScore.toFixed(1)),
    sentinelCoverageMinutes: Number(metrics.guardianCoverageMinutes.toFixed(2)),
    fundedDomainRatio: Number(metrics.fundedDomainRatio.toFixed(1)),
    plan: {
      uri: plan.planURI ?? "",
      hash: plan.planHash ?? "",
      cadenceSeconds: Number(plan.cadenceSeconds ?? 0),
      lastExecutedAt: Number(plan.lastExecutedAt ?? 0),
      lastReportURI: plan.lastReportURI ?? "",
    },
    autonomyGuards: guards,
    guardrails: kernelGuardrails,
    playbooks: scheduled.map((entry) => ({
      name: entry.name,
      owner: entry.owner,
      automation: entry.automation,
      guardrails: entry.guardrails,
      requiresManualScheduling: entry.requiresManualScheduling,
      nextRun: entry.nextRun ?? null,
      intervalSeconds: entry.intervalSeconds ?? null,
    })),
  };
}

function generateCycleReportCsv(
  config: Phase8Config,
  metrics: ReturnType<typeof computeMetrics>,
): string {
  const guardianWindow = Number(config.global?.guardianReviewWindow ?? 0);
  const domains = config.domains ?? [];
  const coverage = coverageMap(config.sentinels ?? [], domains.map((domain) => String(domain.slug ?? "")));
  const funding = capitalCoverageMap(
    config.capitalStreams ?? [],
    domains.map((domain) => String(domain.slug ?? "")),
  );
  const header = [
    "slug",
    "name",
    "resilience_index",
    "autonomy_bps",
    "monthly_value_usd",
    "sentinel_coverage_seconds",
    "guardian_window_seconds",
    "coverage_adequacy_percent",
    "capital_coverage_usd",
    "capital_share_percent",
    "resilience_status",
  ];
  const lines: string[] = [header.map(escapeCsv).join(",")];
  for (const domain of domains) {
    const slug = String(domain.slug ?? "");
    const normalized = slug.toLowerCase();
    const coverageSeconds = coverage.get(normalized) ?? 0;
    const coverageAdequacy = guardianWindow > 0 ? (coverageSeconds / guardianWindow) * 100 : 0;
    const fundingUSD = funding.get(normalized) ?? 0;
    const capitalShare = metrics.annualBudget > 0 ? (fundingUSD / metrics.annualBudget) * 100 : 0;
    const resilience = Number(domain.resilienceIndex ?? 0);
    const resilienceStatus = resilience < RESILIENCE_ALERT_THRESHOLD ? "review" : "stable";
    const row = [
      slug,
      domain.name ?? slug,
      resilience.toFixed(3),
      Number(domain.autonomyLevelBps ?? 0).toString(),
      Number(domain.valueFlowMonthlyUSD ?? 0).toString(),
      coverageSeconds.toFixed(0),
      guardianWindow.toString(),
      coverageAdequacy.toFixed(1),
      fundingUSD.toFixed(0),
      capitalShare.toFixed(1),
      resilienceStatus,
    ];
    lines.push(row.map(escapeCsv).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function generateGuardianResponsePlaybook(
  config: Phase8Config,
  metrics: ReturnType<typeof computeMetrics>,
  generatedAt: string,
): string {
  const sentinelLookup = new Map((config.sentinels ?? []).map((sentinel) => [String(sentinel.slug ?? "").toLowerCase(), sentinel.name ?? sentinel.slug ?? "Sentinel"]));
  const domainLookup = new Map((config.domains ?? []).map((domain) => [String(domain.slug ?? "").toLowerCase(), domain.name ?? domain.slug ?? "Domain"]));
  const protocols = config.guardianProtocols ?? [];

  const lines: string[] = [];
  lines.push("# Phase 8 — Guardian Response Playbook");
  lines.push(`Generated: ${generatedAt}`);
  lines.push("");
  lines.push("## Protocol posture");
  lines.push(`- Protocols defined: ${protocols.length}`);
  lines.push(`- Domain coverage: ${metrics.guardianProtocolCoverageRatio.toFixed(1)}% of domains secured by response plans`);
  const severityDescriptor = describeSeverityAverage(metrics.guardianProtocolSeverityScore ?? 0);
  lines.push(`- Average severity posture: ${severityDescriptor.toUpperCase()} (${metrics.guardianProtocolSeverityScore.toFixed(2)})`);
  if (metrics.guardianWindowSeconds) {
    lines.push(
      `- Guardian review window: ${metrics.guardianWindowSeconds}s with minimum sentinel coverage ${metrics.minDomainCoverageSeconds.toFixed(0)}s`,
    );
  }
  lines.push("");

  protocols.forEach((protocol, index) => {
    const sentinelNames = (protocol.linkedSentinels ?? []).map((slug) => sentinelLookup.get(String(slug ?? "").toLowerCase()) ?? slug);
    const domainNames = (protocol.linkedDomains ?? []).map((slug) => domainLookup.get(String(slug ?? "").toLowerCase()) ?? slug);
    const guardianLabel = sentinelNames.length > 0 ? sentinelNames.join(" · ") : "All sentinel guardians";
    const domainLabel = domainNames.length > 0 ? domainNames.join(" · ") : "All domains";
    lines.push(`## Scenario ${index + 1} — ${protocol.scenario}`);
    lines.push(`- Severity: ${formatSeverity(protocol.severity)}`);
    lines.push(`- Trigger condition: ${protocol.trigger}`);
    lines.push(`- Guardian coverage: ${guardianLabel}`);
    lines.push(`- Impacted domains: ${domainLabel}`);
    lines.push("");
    lines.push("### Immediate actions");
    protocol.immediateActions.forEach((action, actionIndex) => {
      lines.push(`${actionIndex + 1}. ${action}`);
    });
    lines.push("");
    lines.push("### Stabilization actions");
    protocol.stabilizationActions.forEach((action, actionIndex) => {
      lines.push(`${actionIndex + 1}. ${action}`);
    });
    lines.push("");
    lines.push("### Communications");
    protocol.communications.forEach((step) => {
      lines.push(`- ${step}`);
    });
    if (protocol.successCriteria && protocol.successCriteria.length > 0) {
      lines.push("");
      lines.push("### Success criteria");
      protocol.successCriteria.forEach((criterion) => {
        lines.push(`- ${criterion}`);
      });
    }
    lines.push("");
  });

  if (protocols.length === 0) {
    lines.push("No guardian response protocols configured — define scenarios in the manifest to unlock automated guardrails.");
  }

  return `${lines.join("\n")}\n`;
}

function generateGovernanceDirectives(
  config: Phase8Config,
  metrics: ReturnType<typeof computeMetrics>,
  environment: EnvironmentConfig,
  generatedAt: string,
): string {
  const guardianWindow = Number(config.global?.guardianReviewWindow ?? 0);
  const coverageSeconds = coverageMap(config.sentinels ?? [], (config.domains ?? []).map((domain) => String(domain.slug ?? "")));
  const fundingUSD = capitalCoverageMap(
    config.capitalStreams ?? [],
    (config.domains ?? []).map((domain) => String(domain.slug ?? "")),
  );
  const sentinelLabels = sentinelNameMap(config);
  const streamLabels = streamNameMap(config);
  const domainLabels = new Map(
    (config.domains ?? []).map((domain) => [String(domain.slug ?? "").toLowerCase(), domain.name ?? domain.slug ?? "Domain"]),
  );
  const sentinelNameBySlug = new Map(
    (config.sentinels ?? []).map((sentinel) => [String(sentinel.slug ?? "").toLowerCase(), sentinel.name ?? sentinel.slug ?? "Sentinel"]),
  );
  const lines: string[] = [];
  lines.push("# Phase 8 — Governance Directives");
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`Chain ID: ${environment.chainId}`);
  const managerLine =
    environment.managerAddress && environment.managerAddress !== ZERO_ADDRESS
      ? environment.managerAddress
      : "Set PHASE8_MANAGER_ADDRESS before submitting calls";
  lines.push(`Phase8 manager: ${managerLine}`);
  lines.push("");
  lines.push("## Immediate directives");
  lines.push("1. Confirm npm dependencies remain locked via `npm ci` (step enforced by CI).");
  lines.push(
    "2. Run `npm run demo:phase8:orchestrate` to regenerate calldata, scorecard, and operator briefings.",
  );
  lines.push(
    "3. Load `output/phase8-governance-calldata.json` or `output/phase8-safe-transaction-batch.json` into your multisig / timelock and execute the queued actions in sequence.",
  );
  lines.push(
    "4. Distribute `output/phase8-governance-directives.md` and `output/phase8-dominance-scorecard.json` to guardian council and observers for sign-off.",
  );
  lines.push("5. Launch the dashboard with `npx serve demo/Phase-8-Universal-Value-Dominance` for live monitoring.");
  lines.push("");
  lines.push("## Oversight priorities");
  for (const domain of config.domains ?? []) {
    const slug = String(domain.slug ?? "").toLowerCase();
    const coverage = coverageSeconds.get(slug) ?? 0;
    const coveragePercent = guardianWindow > 0 ? (coverage / guardianWindow) * 100 : 0;
    const funding = fundingUSD.get(slug) ?? 0;
    const sentinelNames = sentinelLabels.get(slug) ?? ["—"];
    const streamNames = streamLabels.get(slug) ?? ["—"];
    lines.push(
      `- ${domain.name}: resilience ${(Number(domain.resilienceIndex ?? 0)).toFixed(3)}, autonomy ${domain.autonomyLevelBps} bps, coverage ${coverage.toFixed(0)}s (${coveragePercent.toFixed(1)}% of guardian window), funding ${usd(funding)}/yr, sentinels ${sentinelNames.join(" · ")}, streams ${streamNames.join(" · ")}`,
    );
  }
  lines.push("");
  lines.push("## Safety instrumentation");
  lines.push(
    `- Autonomy guard ≤${config.selfImprovement?.autonomyGuards?.maxAutonomyBps ?? 0} bps · human override ${config.selfImprovement?.autonomyGuards?.humanOverrideMinutes ?? 0} minutes · escalation ${(config.selfImprovement?.autonomyGuards?.escalationChannels ?? []).join(" → ")}`,
  );
  lines.push(
    `- Guardian review window ${guardianWindow}s with minimum sentinel coverage ${metrics.minDomainCoverageSeconds.toFixed(0)}s (adequacy ${(metrics.minimumCoverageAdequacy * 100).toFixed(1)}%).`,
  );
  lines.push(
    `- Self-improvement cadence ${metrics.cadenceHours.toFixed(2)} h · last execution ${metrics.lastExecutedAt ? new Date(metrics.lastExecutedAt * 1000).toISOString() : "pending"}.`,
  );
  if (config.selfImprovement?.guardrails) {
    lines.push(
      `- Kernel checksum ${config.selfImprovement.guardrails.checksum.algorithm} ${config.selfImprovement.guardrails.checksum.value}`,
    );
    lines.push(
      `- Kernel zk-proof ${config.selfImprovement.guardrails.zkProof.circuit} :: status ${config.selfImprovement.guardrails.zkProof.status} :: artifact ${config.selfImprovement.guardrails.zkProof.artifactURI}`,
    );
  }
  lines.push("");
  lines.push("## Reporting & distribution");
  lines.push("- Share the dominance scorecard (JSON) with analytics teams for downstream automation.");
  lines.push("- Provide the orchestration report and directives markdown to auditors for immutable records.");
  lines.push("- Archive the telemetry markdown for board-level status updates.");
  lines.push("");
  lines.push("## Guardian response protocols");
  if ((config.guardianProtocols ?? []).length === 0) {
    lines.push("- Configure guardianProtocols in the manifest so every domain has an emergency response script.");
  } else {
    lines.push(
      `- ${config.guardianProtocols.length} protocols active covering ${metrics.guardianProtocolCoverageRatio.toFixed(1)}% of domains (average severity ${describeSeverityAverage(metrics.guardianProtocolSeverityScore).toUpperCase()}).`,
    );
    for (const protocol of config.guardianProtocols ?? []) {
      const sentinelNames = (protocol.linkedSentinels ?? []).map((slug) => sentinelNameBySlug.get(String(slug ?? "").toLowerCase()) ?? slug);
      const domainNames = (protocol.linkedDomains ?? []).map((slug) => domainLabels.get(String(slug ?? "").toLowerCase()) ?? slug);
      const guardianSummary = sentinelNames.length ? sentinelNames.join(" · ") : "All sentinels";
      const domainSummary = domainNames.length ? domainNames.join(" · ") : "All domains";
      lines.push(
        `- ${protocol.scenario}: ${formatSeverity(protocol.severity)} · Guardians ${guardianSummary} · Domains ${domainSummary}`,
      );
    }
  }
  lines.push("");
  lines.push("## Contacts");
  lines.push(shortAddress("Guardian council", config.global?.guardianCouncil));
  lines.push(shortAddress("System pause", config.global?.systemPause));
  lines.push(shortAddress("Upgrade coordinator", config.global?.upgradeCoordinator));
  lines.push(shortAddress("Validator registry", config.global?.validatorRegistry));

  return `${lines.join("\n")}\n`;
}

function generateDominanceScorecard(
  config: Phase8Config,
  metrics: ReturnType<typeof computeMetrics>,
  environment: EnvironmentConfig,
  generatedAt: string,
) {
  const coverageSeconds = coverageMap(config.sentinels ?? [], (config.domains ?? []).map((domain) => String(domain.slug ?? "")));
  const fundingUSD = capitalCoverageMap(
    config.capitalStreams ?? [],
    (config.domains ?? []).map((domain) => String(domain.slug ?? "")),
  );
  const sentinelLabels = sentinelNameMap(config);
  const streamLabels = streamNameMap(config);
  return {
    generatedAt,
    chain: {
      id: environment.chainId,
      manager: environment.managerAddress,
    },
    metrics: {
      dominanceScore: Number(metrics.dominanceScore.toFixed(1)),
      monthlyValueUSD: metrics.totalMonthlyUSD,
      annualBudgetUSD: metrics.annualBudget,
      averageResilience: Number(metrics.averageResilience.toFixed(3)),
      sentinelCoverageMinutes: Number(metrics.guardianCoverageMinutes.toFixed(2)),
      coverageRatioPercent: Number(metrics.coverageRatio.toFixed(1)),
      fundedDomainRatioPercent: Number(metrics.fundedDomainRatio.toFixed(1)),
      maxAutonomyBps: metrics.maxAutonomy,
      cadenceHours: Number(metrics.cadenceHours.toFixed(2)),
      minimumCoverageSeconds: Number(metrics.minDomainCoverageSeconds.toFixed(0)),
      guardianWindowSeconds: metrics.guardianWindowSeconds,
      minimumCoverageAdequacyPercent: Number((metrics.minimumCoverageAdequacy * 100).toFixed(1)),
      guardianProtocolCount: metrics.guardianProtocolCount,
      guardianProtocolCoveragePercent: Number(metrics.guardianProtocolCoverageRatio.toFixed(1)),
      guardianProtocolSeverityScore: Number(metrics.guardianProtocolSeverityScore.toFixed(2)),
      guardianProtocolSeverityLevel: describeSeverityAverage(metrics.guardianProtocolSeverityScore).toUpperCase(),
      sessionMaxHours: metrics.sessionMaxHours,
      sessionContextTokens: metrics.sessionContextTokens,
      checkpointCadenceMinutes: metrics.checkpointCadenceMinutes,
      checkpointCount: metrics.checkpointCount,
      aiTeamCount: metrics.aiTeamCount,
      aiTeamCoveragePercent: Number((metrics.aiTeamCoverageRatio * 100).toFixed(1)),
      safetyTripwireCount: metrics.safetyTripwireCount,
      validatorConsoleCount: metrics.validatorConsoleCount,
      stakeTierCount: metrics.stakeTierCount,
      milestoneTemplateCount: metrics.milestoneTemplateCount,
      modelAdapterCount: metrics.modelAdapterCount,
      modelEvaluationCadenceHours: metrics.modelEvaluationCadenceHours,
      modelSafetyTestCount: metrics.modelSafetyTestCount,
      governanceProposalTemplateCount: metrics.governanceProposalTemplateCount,
      humanPolicyControlCount: metrics.humanPolicyControlCount,
    },
    domains: (config.domains ?? []).map((domain) => {
      const slug = String(domain.slug ?? "").toLowerCase();
      return {
        slug,
        name: domain.name,
        autonomyLevelBps: domain.autonomyLevelBps,
        resilienceIndex: Number(domain.resilienceIndex ?? 0),
        heartbeatSeconds: Number(domain.heartbeatSeconds ?? 0),
        tvlLimit: String(domain.tvlLimit ?? "0"),
        valueFlowMonthlyUSD: Number(domain.valueFlowMonthlyUSD ?? 0),
        sentinelCoverageSeconds: Number((coverageSeconds.get(slug) ?? 0).toFixed(0)),
        sentinelGuardians: sentinelLabels.get(slug) ?? [],
        capitalSupportUSD: Number((fundingUSD.get(slug) ?? 0).toFixed(0)),
        capitalStreams: streamLabels.get(slug) ?? [],
      };
    }),
    sentinels: (config.sentinels ?? []).map((sentinel) => ({
      slug: sentinel.slug,
      name: sentinel.name,
      coverageSeconds: Number(sentinel.coverageSeconds ?? 0),
      sensitivityBps: Number(sentinel.sensitivityBps ?? 0),
      domains: sentinel.domains ?? [],
    })),
    capitalStreams: (config.capitalStreams ?? []).map((stream) => ({
      slug: stream.slug,
      name: stream.name,
      annualBudgetUSD: Number(stream.annualBudget ?? 0),
      expansionBps: Number(stream.expansionBps ?? 0),
      domains: stream.domains ?? [],
    })),
    guardianProtocols: (config.guardianProtocols ?? []).map((protocol) => ({
      scenario: protocol.scenario,
      severity: protocol.severity,
      trigger: protocol.trigger,
      linkedSentinels: protocol.linkedSentinels ?? [],
      linkedDomains: protocol.linkedDomains ?? [],
      immediateActions: protocol.immediateActions,
      stabilizationActions: protocol.stabilizationActions,
      communications: protocol.communications,
      successCriteria: protocol.successCriteria ?? [],
    })),
    guardrails: {
      autonomy: config.selfImprovement?.autonomyGuards ?? null,
      kernel: config.selfImprovement?.guardrails ?? null,
      plan: config.selfImprovement?.plan ?? null,
      maxDrawdownBps: config.global?.maxDrawdownBps ?? null,
    },
    autonomy: config.autonomy ?? null,
    aiTeams: (config.aiTeams ?? []).map((team) => ({
      slug: team.slug,
      name: team.name,
      mission: team.mission,
      leadAgent: team.leadAgent,
      leadModel: team.leadModel,
      cadenceMinutes: team.cadenceMinutes,
      domains: team.domains ?? [],
      specialists: (team.specialists ?? []).map((specialist) => ({
        role: specialist.role,
        agent: specialist.agent,
        model: specialist.model,
        contextWindowTokens: specialist.contextWindowTokens,
        maxAutonomyMinutes: specialist.maxAutonomyMinutes,
      })),
    })),
    safety: config.safety ?? null,
    economy: config.economy ?? null,
    models: config.models ?? null,
    governance: config.governance ?? null,
  };
}

export function buildSafeTransactions(entries: CalldataEntry[], managerAddress: string) {
  return entries.map((entry) => ({
    to: managerAddress,
    value: "0",
    data: entry.data,
    contractMethod: {
      name: entry.slug ? `${entry.label}(${entry.slug})` : entry.label,
      payable: false,
      inputs: [],
    },
    contractInputsValues: {},
  }));
}

function generateAiTeamMatrix(config: Phase8Config, metrics: ReturnType<typeof computeMetrics>, generatedAt: string) {
  return {
    generatedAt,
    summary: {
      teams: metrics.aiTeamCount,
      domainCoveragePercent: Number((metrics.aiTeamCoverageRatio * 100).toFixed(1)),
      sessionMaxHours: metrics.sessionMaxHours,
      checkpointCadenceMinutes: metrics.checkpointCadenceMinutes,
    },
    teams: (config.aiTeams ?? []).map((team) => ({
      slug: team.slug,
      name: team.name,
      mission: team.mission,
      cadenceMinutes: team.cadenceMinutes,
      collaborationProtocol: team.collaborationProtocol,
      memoryChannel: team.memoryChannel ?? null,
      escalationContact: team.escalationContact ?? null,
      leadAgent: team.leadAgent,
      leadModel: team.leadModel,
      domains: team.domains ?? [],
      specialists: (team.specialists ?? []).map((specialist) => ({
        role: specialist.role,
        agent: specialist.agent,
        model: specialist.model,
        contextWindowTokens: specialist.contextWindowTokens,
        maxAutonomyMinutes: specialist.maxAutonomyMinutes,
        capabilities: specialist.capabilities ?? [],
      })),
    })),
  };
}

function systemPauseAddress(config: Phase8Config): string {
  return normalizeAddress(config.global?.systemPause ?? ZERO_ADDRESS);
}

function manifestManagerAddress(config: Phase8Config): string {
  return normalizeAddress(config.global?.phase8Manager ?? ZERO_ADDRESS);
}

function resolveManagerAddress(config: Phase8Config, candidate?: string): string {
  const normalizedCandidate = normalizeAddress(candidate);
  if (normalizedCandidate !== ZERO_ADDRESS) {
    return normalizedCandidate;
  }
  return manifestManagerAddress(config);
}

function generateEmergencyOverrides(
  config: Phase8Config,
  metrics: ReturnType<typeof computeMetrics>,
  environment: EnvironmentConfig,
  generatedAt: string,
  managerAddress: string,
  pauseAddress: string,
) {
  const manager = resolveManagerAddress(config, managerAddress);
  const guardianCouncil = normalizeAddress(config.global?.guardianCouncil ?? ZERO_ADDRESS);
  const pauseTarget = normalizeAddress(pauseAddress);
  const pauseInterface = new Interface(SYSTEM_PAUSE_ABI);
  const managerInterface = new Interface(MANAGER_ABI);
  const guardWindow = Number(metrics.guardianWindowSeconds ?? 0);
  const coverageSeconds = Number((metrics.guardianCoverageMinutes ?? 0) * 60);
  const minCoverage = Number(metrics.minDomainCoverageSeconds ?? 0);
  const minimumAdequacy = Number((metrics.minimumCoverageAdequacy ?? 0).toFixed(3));
  const dominanceScore = Number(metrics.dominanceScore.toFixed(1));
  const readinessState =
    manager === ZERO_ADDRESS ? "missing-manager" : pauseTarget === ZERO_ADDRESS ? "missing-system-pause" : "ready";

  const overrideDescriptors = [
    {
      key: "pauseAll",
      label: "Pause all core modules",
      description:
        "Dispatch an immediate circuit breaker across job routing, staking, validation, dispute, and treasury flows.",
      payload: pauseInterface.encodeFunctionData("pauseAll"),
      advisory: [
        "Confirm sentinel alerts justify halting all domains.",
        "Notify mission control that queued jobs will stall until unpaused.",
      ],
    },
    {
      key: "unpauseAll",
      label: "Restore core modules",
      description: "Re-enable every module once the guardian council signs the remediation postmortem.",
      payload: pauseInterface.encodeFunctionData("unpauseAll"),
      advisory: [
        "Run regression diagnostics before resuming.",
        "Coordinate with validator registry to re-seed quorum where needed.",
      ],
    },
  ];

  const overrides = overrideDescriptors.map((entry) => ({
    key: entry.key,
    label: entry.label,
    description: entry.description,
    enabled: readinessState === "ready",
    to: manager,
    target: pauseTarget,
    managerCalldata: managerInterface.encodeFunctionData("forwardPauseCall", [entry.payload]),
    pauseCalldata: entry.payload,
    prerequisites: [
      "Guardian council multi-sig approval",
      manager === ZERO_ADDRESS
        ? "Phase8 manager address missing — set PHASE8_MANAGER_ADDRESS or update global.phase8Manager before invoking"
        : "Phase8 manager configured as Safe module",
      pauseTarget === ZERO_ADDRESS
        ? "System pause address missing — set via setSystemPause before invoking"
        : "System pause contract confirmed",
    ],
    advisory: entry.advisory,
  }));

  return {
    generatedAt,
    chainId: environment.chainId,
    manager,
    systemPause: pauseTarget,
    guardianCouncil,
    readiness: readinessState,
    metrics: {
      guardianWindowSeconds: guardWindow,
      sentinelCoverageSeconds: coverageSeconds,
      minimumCoverageSeconds: minCoverage,
      minimumCoverageAdequacy: minimumAdequacy,
      dominanceScore,
    },
    procedures: [
      "1. Verify sentinel alerts and telemetry support intervention.",
      "2. Convene guardian council for a signed decision (≥2/3 quorum).",
      "3. Execute the desired override via Safe transaction builder using the calldata below.",
      "4. Broadcast status to mission control and validators immediately after execution.",
    ],
    overrides,
  };
}

function generateGovernanceChecklist(
  config: Phase8Config,
  metrics: ReturnType<typeof computeMetrics>,
  environment: EnvironmentConfig,
  entries: CalldataEntry[],
  generatedAt: string,
) {
  const lookups = buildChecklistLookups(config);
  const grouped = new Map<string, ChecklistGroup>();
  for (const entry of entries) {
    const label = entry.label;
    const group = grouped.get(label) ?? { count: 0, slugs: new Set<string>() };
    group.count += 1;
    if (entry.slug) {
      group.slugs.add(String(entry.slug));
    }
    grouped.set(label, group);
  }

  const lines: string[] = [];
  lines.push(`# Phase 8 — Governance Execution Checklist`);
  lines.push(`Generated: ${generatedAt}`);
  lines.push("");
  lines.push(
    "> This briefing converts the encoded calldata manifest into a guardian flight plan so non-technical operators can command the universal value mesh with total confidence.",
  );
  lines.push("");
  lines.push(`- Manager Safe / Timelock: \`${environment.managerAddress}\``);
  lines.push(`- Chain ID: ${environment.chainId}`);
  lines.push(`- Universal dominance score: ${metrics.dominanceScore.toFixed(1)} / 100`);
  lines.push(
    `- Guardian lattice coverage: ${metrics.guardianCoverageMinutes.toFixed(1)} min (minimum adequacy ${(metrics.minimumCoverageAdequacy * 100).toFixed(1)}%)`,
  );
  lines.push(
    `- Capital floor: ${usd(metrics.minDomainFundingUSD)} / yr per dominion (100% funded coverage)`,
  );
  lines.push("");
  lines.push("## Execution order");
  let step = 1;
  for (const label of CHECKLIST_CALL_ORDER) {
    const group = grouped.get(label);
    if (!group) continue;
    const copy = CHECKLIST_COPY[label] ?? {
      title: label,
      summary: `Execute ${label} with guardian oversight.`,
      verification: "Document guardian sign-off before broadcasting.",
    };
    lines.push(`${step}. **${copy.title}**`);
    lines.push(`   - ${copy.summary}`);
    const targets = formatChecklistTargets(label, group.slugs, lookups);
    if (targets.length > 0) {
      lines.push(`   - Targets: ${targets.join(" · ")}`);
    }
    lines.push(`   - Encoded calls: ${group.count}`);
    if (copy.verification) {
      lines.push(`   - Verification: ${copy.verification}`);
    }
    if (copy.emphasis) {
      lines.push(`   - Note: ${copy.emphasis}`);
    }
    step += 1;
  }

  const remaining = Array.from(grouped.entries()).filter(
    ([label]) => !CHECKLIST_CALL_ORDER.includes(label),
  );
  if (remaining.length > 0) {
    lines.push("");
    lines.push("## Additional manifest calls");
    for (const [label, group] of remaining.sort(([a], [b]) => a.localeCompare(b))) {
      const targets = formatChecklistTargets(label, group.slugs, lookups);
      lines.push(`- ${label}: ${group.count} call(s)${targets.length ? ` → ${targets.join(" · ")}` : ""}`);
    }
  }

  lines.push("");
  lines.push("## Pre-flight checks");
  lines.push("- Circulate `phase8-governance-directives.md` for guardian signatures.");
  lines.push("- Import `phase8-safe-transaction-batch.json` into the Safe or timelock and map steps to this checklist.");
  lines.push("- Verify pause coverage using `phase8-emergency-overrides.json` in case guardians need the circuit breaker mid-flight.");
  lines.push("- Present the dominance scorecard to stakeholders to confirm readiness metrics remain ≥ guardrail thresholds.");

  lines.push("");
  lines.push("## Post-execution confirmation");
  lines.push("- Rerun `npm run demo:phase8:orchestrate` to refresh telemetry and validate no drift across manifest + scorecard.");
  lines.push("- Publish the updated self-improvement plan hash and cadence to mission control.");
  lines.push("- Archive Safe transaction receipts with this checklist for audit trails — this forms the human verification layer for the superintelligence.");

  lines.push("");
  lines.push(
    "> When every checkbox above is satisfied, guardians have mathematically verified control over the superintelligence — universal value dominance with human override dials intact.",
  );

  return `${lines.join("\n")}\n`;
}

export function writeArtifacts(
  config: Phase8Config,
  metrics: ReturnType<typeof computeMetrics>,
  data: ReturnType<typeof calldata>,
  environment: EnvironmentConfig,
  overrides: { outputDir?: string; managerAddress?: string; chainId?: number } = {},
) {
  const outputDir = overrides.outputDir ?? OUTPUT_DIR;
  ensureOutputDirectory(outputDir);
  const generatedAt = new Date().toISOString();
  const entries = flattenCalldataEntries(data);
  const overrideManager = normalizeAddress(overrides.managerAddress);
  const environmentManager = normalizeAddress(environment.managerAddress);
  const manifestManager = manifestManagerAddress(config);
  const managerAddress =
    overrideManager !== ZERO_ADDRESS
      ? overrideManager
      : environmentManager !== ZERO_ADDRESS
      ? environmentManager
      : manifestManager;
  const chainId = overrides.chainId ?? environment.chainId;
  const callManifest = {
    generatedAt,
    managerAddress,
    chainId,
    metrics: {
      totalMonthlyUSD: metrics.totalMonthlyUSD,
      annualBudgetUSD: metrics.annualBudget,
      averageResilience: metrics.averageResilience,
      guardianCoverageMinutes: metrics.guardianCoverageMinutes,
      coverageRatio: metrics.coverageRatio,
      dominanceScore: metrics.dominanceScore,
      averageDomainCoverageSeconds: metrics.averageDomainCoverageSeconds,
      guardianReviewWindowSeconds: metrics.guardianWindowSeconds,
      minDomainCoverageSeconds: metrics.minDomainCoverageSeconds,
      minimumCoverageAdequacyPercent: metrics.minimumCoverageAdequacy * 100,
      fundedDomainRatio: metrics.fundedDomainRatio,
      minDomainFundingUSD: metrics.minDomainFundingUSD,
      domainFundingUSD: metrics.domainFundingMap,
      guardianProtocolCount: metrics.guardianProtocolCount,
      guardianProtocolCoveragePercent: metrics.guardianProtocolCoverageRatio,
      guardianProtocolSeverityScore: metrics.guardianProtocolSeverityScore,
    },
    calls: entries,
  };
  const callManifestPath = join(outputDir, "phase8-governance-calldata.json");
  writeFileSync(callManifestPath, JSON.stringify(callManifest, null, 2));

  const safeBatch = {
    version: "1.0",
    chainId: String(chainId),
    createdAt: Date.now(),
    meta: {
      name: "Phase 8 — Universal Value Dominance",
      description: `Generated by AGI Jobs v0 (v2) on ${generatedAt}`,
      txBuilderVersion: "1.16.1",
      createdFromSafeAddress: managerAddress,
      createdFromOwnerAddress: "",
      checksum: "",
    },
    transactions: buildSafeTransactions(entries, managerAddress),
  };
  const safePath = join(outputDir, "phase8-safe-transaction-batch.json");
  writeFileSync(safePath, JSON.stringify(safeBatch, null, 2));

  const mermaidPath = join(outputDir, "phase8-mermaid-diagram.mmd");
  writeFileSync(mermaidPath, mermaid(config));

  const reportPath = join(outputDir, "phase8-telemetry-report.md");
  writeFileSync(reportPath, telemetryMarkdown(config, metrics));

  const operatorRunbookPath = join(outputDir, "phase8-orchestration-report.txt");
  writeFileSync(operatorRunbookPath, generateOperatorRunbook(config, metrics, environment, generatedAt));

  const planPayloadPath = join(outputDir, "phase8-self-improvement-plan.json");
  writeFileSync(
    planPayloadPath,
    `${JSON.stringify(generateSelfImprovementPlanPayload(config, metrics, generatedAt), null, 2)}\n`,
  );

  const cycleReportPath = join(outputDir, "phase8-cycle-report.csv");
  writeFileSync(cycleReportPath, generateCycleReportCsv(config, metrics));

  const directivesPath = join(outputDir, "phase8-governance-directives.md");
  writeFileSync(directivesPath, generateGovernanceDirectives(config, metrics, environment, generatedAt));

  const checklistPath = join(outputDir, "phase8-governance-checklist.md");
  writeFileSync(
    checklistPath,
    generateGovernanceChecklist(config, metrics, environment, entries, generatedAt),
  );

  const scorecardPath = join(outputDir, "phase8-dominance-scorecard.json");
  writeFileSync(scorecardPath, `${JSON.stringify(generateDominanceScorecard(config, metrics, environment, generatedAt), null, 2)}\n`);

  const emergencyOverridesPath = join(outputDir, "phase8-emergency-overrides.json");
  writeFileSync(
    emergencyOverridesPath,
    `${JSON.stringify(
      generateEmergencyOverrides(config, metrics, environment, generatedAt, managerAddress, systemPauseAddress(config)),
      null,
      2,
    )}\n`,
  );

  const guardianPlaybookPath = join(outputDir, "phase8-guardian-response-playbook.md");
  writeFileSync(guardianPlaybookPath, generateGuardianResponsePlaybook(config, metrics, generatedAt));

  const aiTeamMatrixPath = join(outputDir, "phase8-ai-team-matrix.json");
  writeFileSync(aiTeamMatrixPath, `${JSON.stringify(generateAiTeamMatrix(config, metrics, generatedAt), null, 2)}\n`);

  return [
    { label: "Calldata manifest", path: callManifestPath },
    { label: "Safe transaction batch", path: safePath },
    { label: "Mermaid diagram", path: mermaidPath },
    { label: "Telemetry report", path: reportPath },
    { label: "Operator runbook", path: operatorRunbookPath },
    { label: "Self-improvement payload", path: planPayloadPath },
    { label: "Cycle report", path: cycleReportPath },
    { label: "Governance directives", path: directivesPath },
    { label: "Governance checklist", path: checklistPath },
    { label: "Dominance scorecard", path: scorecardPath },
    { label: "Emergency overrides", path: emergencyOverridesPath },
    { label: "Guardian response playbook", path: guardianPlaybookPath },
    { label: "AI team matrix", path: aiTeamMatrixPath },
  ];
}

function printDomainTable(config: Phase8Config) {
  const rows = config.domains?.map((domain) => {
    const slug = String(domain.slug ?? "");
    const id = keccak256(toUtf8Bytes(slug.toLowerCase())).slice(0, 10);
    return [
      domain.name ?? slug,
      `ID ${id}`,
      `TVL ≤ ${formatAmount(domain.tvlLimit)}`,
      `Autonomy ${domain.autonomyLevelBps ?? 0} bps`,
      `Resilience ${(domain.resilienceIndex ?? 0).toFixed(3)}`,
      domain.autonomyNarrative ?? "",
    ];
  });
  if (!rows || rows.length === 0) return;
  const widths = rows[0].map((_: string, idx: number) => Math.max(...rows.map((r: string[]) => r[idx].length)));
  console.log("  \x1b[35mDominion registry\x1b[0m");
  for (const row of rows) {
    const formatted = row
      .map((cell: string, idx: number) => cell.padEnd(widths[idx] + (idx === row.length - 1 ? 0 : 2)))
      .join("");
    console.log(`  ${formatted}`);
  }
}

export function main() {
  try {
    const environmentOverrides = resolveEnvironment();
    const config = loadConfig();
    const effectiveManager = resolveManagerAddress(config, environmentOverrides.managerAddress);
    const environment: EnvironmentConfig = {
      ...environmentOverrides,
      managerAddress: effectiveManager,
    };
    banner("Phase 8 — Universal Value Dominance");
    console.log("Configuration:", CONFIG_PATH);
    console.log(
      `Environment overrides → manager: ${environmentOverrides.managerAddress}, chainId: ${environmentOverrides.chainId}`,
    );
    if (effectiveManager !== environmentOverrides.managerAddress) {
      console.log(`Effective manager fallback: ${effectiveManager}`);
    }
    if (effectiveManager === ZERO_ADDRESS) {
      console.log("Warning: Phase 8 manager address not configured — emergency overrides will remain disabled.");
    }

    const { metrics } = crossVerifyMetrics(config);
    banner("Network telemetry");
    console.log(`Total monthly on-chain value: ${usd(metrics.totalMonthlyUSD)}`);
    console.log(`Annual capital allocation: ${usd(metrics.annualBudget)}`);
    console.log(`Average resilience index: ${metrics.averageResilience.toFixed(3)}`);
    console.log(`Universal dominance score: ${metrics.dominanceScore.toFixed(1)} / 100`);
    console.log(`Guardian sentinel coverage: ${metrics.guardianCoverageMinutes.toFixed(1)} minutes per cycle`);
    if (metrics.guardianWindowSeconds) {
      console.log(`Average coverage per domain: ${metrics.averageDomainCoverageSeconds.toFixed(0)}s (guardian window ${metrics.guardianWindowSeconds}s)`);
      console.log(
        `Minimum coverage per domain: ${metrics.minDomainCoverageSeconds.toFixed(0)}s (requirement ${metrics.guardianWindowSeconds}s, adequacy ${(metrics.minimumCoverageAdequacy * 100).toFixed(1)}%)`,
      );
    }
    console.log(`Domains with sentinel coverage: ${metrics.coverageRatio.toFixed(1)}%`);
    console.log(
      `Domains funded by capital streams: ${metrics.fundedDomainRatio.toFixed(1)}% (minimum coverage ${usd(metrics.minDomainFundingUSD)} / yr)`,
    );
    console.log(
      `Guardian response protocols: ${metrics.guardianProtocolCount} covering ${metrics.guardianProtocolCoverageRatio.toFixed(1)}% of domains (severity ${describeSeverityAverage(metrics.guardianProtocolSeverityScore).toUpperCase()})`,
    );
    console.log(`Maximum encoded autonomy: ${metrics.maxAutonomy} bps`);
    if (metrics.cadenceHours) {
      console.log(`Self-improvement cadence: every ${metrics.cadenceHours.toFixed(2)} hours`);
    }
    if (metrics.lastExecutedAt) {
      console.log(`Last self-improvement execution: ${new Date(metrics.lastExecutedAt * 1000).toISOString()}`);
    }

    banner("Governance control surface");
    console.log(shortAddress("Treasury", config.global?.treasury));
    console.log(shortAddress("Universal vault", config.global?.universalVault));
    console.log(shortAddress("Upgrade coordinator", config.global?.upgradeCoordinator));
    console.log(shortAddress("Validator registry", config.global?.validatorRegistry));
    console.log(shortAddress("Mission control", config.global?.missionControl));
    console.log(shortAddress("Knowledge graph", config.global?.knowledgeGraph));
    console.log(shortAddress("Guardian council", config.global?.guardianCouncil));
    console.log(shortAddress("System pause", config.global?.systemPause));
    console.log(`Manifest URI: ${config.global?.manifestoURI}`);
    console.log(`Manifest Hash: ${config.global?.manifestoHash}`);

    banner("Domain registry summary");
    printDomainTable(config);

    banner("Sentinel lattice");
    for (const sentinel of config.sentinels ?? []) {
      console.log(
        `  ${sentinel.name}: coverage ${sentinel.coverageSeconds}s, sensitivity ${sentinel.sensitivityBps}bps → ${(sentinel.domains || []).join(", ")}`
      );
    }

    banner("Capital stream governance");
    for (const stream of config.capitalStreams ?? []) {
      console.log(
        `  ${stream.name}: ${usd(Number(stream.annualBudget ?? 0))}/yr, expansion ${stream.expansionBps}bps → ${(stream.domains || []).join(", ")}`
      );
    }

    banner("Self-improvement kernel");
    const planDetails = config.selfImprovement?.plan;
    if (planDetails) {
      const cadenceHours = (Number(planDetails.cadenceSeconds ?? 0) / 3600).toFixed(2);
      console.log(`  Plan URI: ${planDetails.planURI}`);
      console.log(`  Plan hash: ${planDetails.planHash}`);
      console.log(`  Cadence: ${planDetails.cadenceSeconds}s (${cadenceHours}h)`);
      if (planDetails.lastExecutedAt) {
        console.log(`  Last executed at: ${new Date(Number(planDetails.lastExecutedAt) * 1000).toISOString()}`);
        console.log(`  Last report: ${planDetails.lastReportURI}`);
      }
    }
    const guardrails = config.selfImprovement?.guardrails;
    if (guardrails) {
      console.log(`  Kernel checksum: ${guardrails.checksum.algorithm} ${guardrails.checksum.value}`);
      const notes = guardrails.zkProof.notes ? ` · notes ${guardrails.zkProof.notes}` : "";
      const verifiedAt =
        guardrails.zkProof.lastVerifiedAt && guardrails.zkProof.status === "verified"
          ? ` · verified ${new Date(guardrails.zkProof.lastVerifiedAt * 1000).toISOString()}`
          : "";
      console.log(
        `  Kernel zk-proof: ${guardrails.zkProof.circuit} · status ${guardrails.zkProof.status} · artifact ${guardrails.zkProof.artifactURI}${verifiedAt}${notes}`,
      );
    }
    for (const playbook of config.selfImprovement?.playbooks ?? []) {
      console.log(`  • ${playbook.name} (${playbook.automation}): ${playbook.description}`);
    }
    if (config.selfImprovement?.autonomyGuards) {
      const guards = config.selfImprovement.autonomyGuards;
      console.log(
        `  Autonomy guard: ≤${guards.maxAutonomyBps}bps autonomy, override ${guards.humanOverrideMinutes}m, escalation ${(guards.escalationChannels || []).join(" → ")}`
      );
    }

    banner("Guardian response protocols");
    if ((config.guardianProtocols ?? []).length === 0) {
      console.log("  No guardian protocols configured — update guardianProtocols in the manifest to codify emergency actions.");
    } else {
      config.guardianProtocols.forEach((protocol, index) => {
        const sentinels = (protocol.linkedSentinels ?? []).length ? protocol.linkedSentinels?.join(", ") : "all";
        const domains = (protocol.linkedDomains ?? []).length ? protocol.linkedDomains?.join(", ") : "all";
        console.log(
          `  ${index + 1}. ${protocol.scenario} :: ${formatSeverity(protocol.severity)} :: guardians ${sentinels} :: domains ${domains}`,
        );
        console.log(`     Trigger → ${protocol.trigger}`);
      });
    }

    banner("Mermaid system map");
    console.log("```mermaid");
    console.log(mermaid(config));
    console.log("```");

    banner("Calldata");
    const data = calldata(config);
    Object.entries(data).forEach(([label, payload]) => {
      if (!payload) return;
      if (Array.isArray(payload)) {
        payload
          .filter((entry) => entry && typeof entry === "object" && (entry as CalldataEntry).data)
          .forEach((entry) => {
            const item = entry as CalldataEntry;
            console.log(`  ${label} (${item.slug}): ${item.data}`);
          });
        return;
      }
      if (typeof payload === "object" && (payload as CalldataEntry).data) {
        console.log(`  ${label}: ${(payload as CalldataEntry).data}`);
        return;
      }
      console.log(`  ${label}: ${payload}`);
    });

    const exportsList = writeArtifacts(config, metrics, data, environment);
    banner("Exports");
    exportsList.forEach((entry) => {
      console.log(`  ${entry.label}: ${entry.path}`);
    });

    banner("How to run");
    console.log("  1. Execute `npm ci` (first run only)");
    console.log("  2. Run `npm run demo:phase8:orchestrate`");
    console.log("  3. Paste emitted calldata into the governance console / Safe");
    console.log("  4. Open demo UI via `npx serve demo/Phase-8-Universal-Value-Dominance`");
  } catch (error) {
    console.error("\n\x1b[31mPhase 8 orchestration failed\x1b[0m");
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
