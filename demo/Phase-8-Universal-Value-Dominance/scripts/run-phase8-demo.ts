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

  return [
    { label: "Calldata manifest", path: callManifestPath },
    { label: "Safe transaction batch", path: safePath },
    { label: "Mermaid diagram", path: mermaidPath },
    { label: "Telemetry report", path: reportPath },
    { label: "Operator runbook", path: operatorRunbookPath },
    { label: "Self-improvement payload", path: planPayloadPath },
    { label: "Cycle report", path: cycleReportPath },
    { label: "Governance directives", path: directivesPath },
    { label: "Dominance scorecard", path: scorecardPath },
    { label: "Emergency overrides", path: emergencyOverridesPath },
    { label: "Guardian response playbook", path: guardianPlaybookPath },
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
