#!/usr/bin/env ts-node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const ROOT = join(__dirname, "..", "config", "universal.value.manifest.json");
const HTML = join(__dirname, "..", "index.html");
const README = join(__dirname, "..", "README.md");

const address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((value) => value.toLowerCase());

const domainSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  metadataURI: z.string().min(1),
  orchestrator: address,
  capitalVault: address,
  validatorModule: address,
  policyKernel: address,
  heartbeatSeconds: z.number().int().positive(),
  tvlLimit: z.string().min(1),
  autonomyLevelBps: z.number().int().min(0).max(10_000),
  skillTags: z.array(z.string()).optional(),
  resilienceIndex: z.number().min(0),
  valueFlowMonthlyUSD: z.number().min(0),
  autonomyNarrative: z.string().optional(),
  active: z.boolean(),
});

const sentinelSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  uri: z.string().min(1),
  agent: address,
  coverageSeconds: z.number().int().positive(),
  sensitivityBps: z.number().int().min(0).max(10_000),
  domains: z.array(z.string()).default([]),
  active: z.boolean(),
});

const streamSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  uri: z.string().min(1),
  vault: address,
  annualBudget: z.number().min(0),
  expansionBps: z.number().int().min(0).max(10_000),
  domains: z.array(z.string()).default([]),
  active: z.boolean(),
});

const configSchema = z.object({
  global: z.object({
    treasury: address,
    universalVault: address,
    upgradeCoordinator: address,
    validatorRegistry: address,
    missionControl: address,
    knowledgeGraph: address,
    guardianCouncil: address,
    systemPause: address,
    heartbeatSeconds: z.number().int().positive(),
    guardianReviewWindow: z.number().int().positive(),
    maxDrawdownBps: z.number().int().min(0).max(10_000),
    manifestoURI: z.string().min(1),
  }),
  domains: z.array(domainSchema).min(1),
  sentinels: z.array(sentinelSchema).min(1),
  capitalStreams: z.array(streamSchema).min(1),
  selfImprovement: z.object({
    playbooks: z
      .array(
        z.object({
          name: z.string().min(1),
          description: z.string().min(1),
          owner: address,
          automation: z.string().min(1),
          guardrails: z.array(z.string()).min(1),
        }),
      )
      .min(1),
    autonomyGuards: z.object({
      maxAutonomyBps: z.number().int().min(0).max(10_000),
      humanOverrideMinutes: z.number().int().min(1),
      pausable: z.boolean(),
      escalationChannels: z.array(z.string()).min(1),
    }),
  }),
});

function main() {
  const configRaw = JSON.parse(readFileSync(ROOT, "utf-8"));
  const config = configSchema.parse(configRaw);

  const slugs = new Set<string>();
  for (const domain of config.domains) {
    const slug = domain.slug.toLowerCase();
    if (slugs.has(slug)) {
      throw new Error(`Duplicate domain slug detected: ${slug}`);
    }
    slugs.add(slug);
  }

  const sentinelCoverage = config.sentinels.reduce((acc, s) => acc + s.coverageSeconds, 0);
  if (sentinelCoverage < config.global.guardianReviewWindow) {
    throw new Error(
      `Sentinel coverage ${sentinelCoverage}s must exceed guardian review window ${config.global.guardianReviewWindow}s`,
    );
  }

  const html = readFileSync(HTML, "utf-8");
  if (!html.includes("Phase 8")) {
    throw new Error("index.html must mention Phase 8 to guide operators");
  }
  if (!html.includes("mermaid")) {
    throw new Error("index.html must embed a mermaid diagram placeholder");
  }

  const readme = readFileSync(README, "utf-8");
  const requiredSections = ["Quickstart", "Smart contract", "Mermaid", "Self-improvement"];
  for (const section of requiredSections) {
    if (!readme.toLowerCase().includes(section.toLowerCase())) {
      throw new Error(`README missing required section: ${section}`);
    }
  }

  const maxDomainAutonomy = Math.max(...config.domains.map((d) => d.autonomyLevelBps));
  if (maxDomainAutonomy > config.selfImprovement.autonomyGuards.maxAutonomyBps) {
    throw new Error("Domain autonomy exceeds guardrail maximum");
  }

  console.log("Phase 8 manifest validated ✔");
  console.log(`  Domains: ${config.domains.length}`);
  console.log(`  Sentinels: ${config.sentinels.length}`);
  console.log(`  Capital streams: ${config.capitalStreams.length}`);
  console.log(`  Total sentinel coverage: ${sentinelCoverage}s`);
}

main();
