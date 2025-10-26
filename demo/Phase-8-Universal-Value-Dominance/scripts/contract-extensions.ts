#!/usr/bin/env ts-node
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { Interface, keccak256, toUtf8Bytes } from "ethers";
import { z } from "zod";

import { loadConfig, type Phase8Config } from "./run-phase8-demo";

const CONFIG_PATH = path.resolve(__dirname, "../configs/contract-extensions.json");
const OUTPUT_DIR = path.resolve(__dirname, "../output");

const HEX_ADDRESS = /^0x[a-fA-F0-9]{40}$/u;
const HEX_BYTES = /^0x[a-fA-F0-9]*$/u;
const EXTENSION_ABI = [
  "function stageExtension(bytes32 moduleId,address implementation,bool pauseBeforeUpgrade,uint64 upgradeWindowHours,bytes initializer)",
  "function activateExtension(bytes32 moduleId)",
];

const AddressSchema = z
  .string({ invalid_type_error: "Expected address as string" })
  .regex(HEX_ADDRESS, "Must be a valid 20-byte hex address")
  .transform((value) => value.toLowerCase());

const HexBytesSchema = z
  .string({ invalid_type_error: "Expected hex string" })
  .regex(HEX_BYTES, "Initializer must be a hex string")
  .transform((value) => (value.length === 0 ? "0x" : value.length === 2 ? value.toLowerCase() : value.toLowerCase()));

type DependencyType = "domain" | "sentinel" | "stream" | "aiTeam" | "protocol";

const DependencySchema = z.object({
  type: z.enum(["domain", "sentinel", "stream", "aiTeam", "protocol"]),
  slug: z.string().min(1),
});

const ExtensionSchema = z.object({
  slug: z.string().min(1),
  module: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  implementation: AddressSchema,
  initializer: HexBytesSchema.default("0x"),
  pauseBeforeUpgrade: z.boolean().default(true),
  upgradeWindowHours: z
    .number({ invalid_type_error: "upgradeWindowHours must be a number" })
    .int("upgradeWindowHours must be an integer")
    .positive("upgradeWindowHours must be positive"),
  dependencies: z.array(DependencySchema).default([]),
  ciChecks: z.array(z.string()).default([]),
  guardianApprovers: z.array(AddressSchema).default([]),
  rolloutPlan: z.array(z.string()).default([]),
  rollback: z
    .object({
      description: z.string().min(1),
      call: z.string().min(1),
    })
    .optional(),
  observability: z.array(z.string()).default([]),
  valueLevers: z.array(z.string()).default([]),
  checksum: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/u, "Checksum must be a 32-byte hex value")
    .optional(),
});

const ExtensionConfigSchema = z.object({
  version: z.string().default("1.0.0"),
  generatedAt: z.string().optional(),
  extensions: z.array(ExtensionSchema).min(1, "At least one extension is required"),
});

export type ExtensionConfig = z.infer<typeof ExtensionConfigSchema>;
export type ExtensionEntry = z.infer<typeof ExtensionSchema>;

type DependencyLookup = Map<DependencyType, Set<string>>;

type ExtensionPlanEntry = {
  slug: string;
  module: string;
  moduleId: string;
  name: string;
  description: string;
  implementation: string;
  initializer: string;
  pauseBeforeUpgrade: boolean;
  upgradeWindowHours: number;
  dependencies: { type: DependencyType; slug: string; label: string }[];
  ciChecks: string[];
  guardianApprovers: string[];
  rolloutPlan: string[];
  rollback?: { description: string; call: string };
  observability: string[];
  valueLevers: string[];
  checksum?: string;
  calls: { stage: string; activate: string };
};

type ExtensionMetrics = {
  count: number;
  pauseCoveragePercent: number;
  averageUpgradeWindowHours: number;
  ciCoverage: number;
  guardianApproverCount: number;
};

type ExtensionPlan = {
  generatedAt: string;
  manifestManager: string | null;
  metrics: ExtensionMetrics;
  extensions: ExtensionPlanEntry[];
  callGroups: { label: string; count: number }[];
};

export function loadExtensionConfig(filePath: string = CONFIG_PATH): ExtensionConfig {
  const buffer = readFileSync(filePath, "utf8");
  const json = JSON.parse(buffer);
  return ExtensionConfigSchema.parse(json);
}

function normalizeAddress(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!HEX_ADDRESS.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function buildDependencyLookup(manifest: Phase8Config): DependencyLookup {
  const lookup: DependencyLookup = new Map();
  lookup.set("domain", new Set((manifest.domains ?? []).map((entry) => String(entry.slug ?? "").toLowerCase()).filter(Boolean)));
  lookup.set(
    "sentinel",
    new Set((manifest.sentinels ?? []).map((entry) => String(entry.slug ?? "").toLowerCase()).filter(Boolean)),
  );
  lookup.set(
    "stream",
    new Set((manifest.capitalStreams ?? []).map((entry) => String(entry.slug ?? "").toLowerCase()).filter(Boolean)),
  );
  lookup.set(
    "aiTeam",
    new Set((manifest.aiTeams ?? []).map((entry) => String(entry.slug ?? "").toLowerCase()).filter(Boolean)),
  );
  lookup.set(
    "protocol",
    new Set((manifest.guardianProtocols ?? []).map((entry) => String(entry.scenario ?? "").toLowerCase()).filter(Boolean)),
  );
  return lookup;
}

function assertDependencies(manifest: Phase8Config, extension: ExtensionEntry) {
  const lookup = buildDependencyLookup(manifest);
  for (const dependency of extension.dependencies ?? []) {
    const targetSet = lookup.get(dependency.type);
    if (!targetSet) continue;
    const candidate = String(dependency.slug ?? "").toLowerCase();
    if (!targetSet.has(candidate)) {
      throw new Error(
        `Extension ${extension.slug} references unknown ${dependency.type} dependency ${dependency.slug}. Update the manifest or the dependency list.`,
      );
    }
  }
}

function renderDependencyLabel(dependency: { type: DependencyType; slug: string }, manifest: Phase8Config): string {
  const slug = String(dependency.slug ?? "").toLowerCase();
  switch (dependency.type) {
    case "domain": {
      const domain = (manifest.domains ?? []).find((entry) => String(entry.slug ?? "").toLowerCase() === slug);
      return domain ? `${domain.slug} — ${domain.name}` : dependency.slug;
    }
    case "sentinel": {
      const sentinel = (manifest.sentinels ?? []).find((entry) => String(entry.slug ?? "").toLowerCase() === slug);
      return sentinel ? `${sentinel.slug} — ${sentinel.name}` : dependency.slug;
    }
    case "stream": {
      const stream = (manifest.capitalStreams ?? []).find((entry) => String(entry.slug ?? "").toLowerCase() === slug);
      return stream ? `${stream.slug} — ${stream.name}` : dependency.slug;
    }
    case "aiTeam": {
      const team = (manifest.aiTeams ?? []).find((entry) => String(entry.slug ?? "").toLowerCase() === slug);
      return team ? `${team.slug} — ${team.name}` : dependency.slug;
    }
    case "protocol": {
      const protocol = (manifest.guardianProtocols ?? []).find(
        (entry) => String(entry.scenario ?? "").toLowerCase() === slug,
      );
      return protocol ? `${protocol.scenario} — ${protocol.severity}` : dependency.slug;
    }
    default:
      return dependency.slug;
  }
}

export function buildExtensionPlan(manifest: Phase8Config, config: ExtensionConfig): ExtensionPlan {
  const iface = new Interface(EXTENSION_ABI);
  const entries: ExtensionPlanEntry[] = [];
  const pauseCount = config.extensions.filter((entry) => entry.pauseBeforeUpgrade).length;
  let upgradeWindowTotal = 0;
  const callGroups = new Map<string, number>();

  for (const extension of config.extensions) {
    assertDependencies(manifest, extension);
    const moduleId = keccak256(toUtf8Bytes(extension.module));
    const stage = iface.encodeFunctionData("stageExtension", [
      moduleId,
      extension.implementation,
      extension.pauseBeforeUpgrade,
      BigInt(extension.upgradeWindowHours),
      extension.initializer ?? "0x",
    ]);
    const activate = iface.encodeFunctionData("activateExtension", [moduleId]);
    const dependencies = Array.isArray(extension.dependencies) ? extension.dependencies : [];
    const formattedDependencies = dependencies.map((dependency) => {
      const typed = {
        type: dependency.type as DependencyType,
        slug: String(dependency.slug ?? ""),
      };
      return {
        ...typed,
        label: renderDependencyLabel(typed, manifest),
      };
    });

    entries.push({
      slug: extension.slug,
      module: extension.module,
      moduleId,
      name: extension.name,
      description: extension.description,
      implementation: extension.implementation,
      initializer: extension.initializer ?? "0x",
      pauseBeforeUpgrade: extension.pauseBeforeUpgrade,
      upgradeWindowHours: extension.upgradeWindowHours,
      dependencies: formattedDependencies,
      ciChecks: extension.ciChecks ?? [],
      guardianApprovers: extension.guardianApprovers ?? [],
      rolloutPlan: extension.rolloutPlan ?? [],
      rollback:
        extension.rollback && extension.rollback.description && extension.rollback.call
          ? {
              description: extension.rollback.description,
              call: extension.rollback.call,
            }
          : undefined,
      observability: extension.observability ?? [],
      valueLevers: extension.valueLevers ?? [],
      checksum: extension.checksum,
      calls: { stage, activate },
    });

    callGroups.set("stageExtension", (callGroups.get("stageExtension") ?? 0) + 1);
    callGroups.set("activateExtension", (callGroups.get("activateExtension") ?? 0) + 1);
    upgradeWindowTotal += extension.upgradeWindowHours;
  }

  const metrics: ExtensionMetrics = {
    count: entries.length,
    pauseCoveragePercent: entries.length === 0 ? 0 : (pauseCount / entries.length) * 100,
    averageUpgradeWindowHours: entries.length === 0 ? 0 : upgradeWindowTotal / entries.length,
    ciCoverage: entries.reduce((acc, entry) => acc + entry.ciChecks.length, 0),
    guardianApproverCount: entries.reduce((acc, entry) => acc + entry.guardianApprovers.length, 0),
  };

  return {
    generatedAt: new Date().toISOString(),
    manifestManager: normalizeAddress(manifest.global?.phase8Manager ?? null),
    metrics,
    extensions: entries,
    callGroups: Array.from(callGroups.entries()).map(([label, count]) => ({ label, count })),
  };
}

export function renderExtensionMarkdown(plan: ExtensionPlan): string {
  const lines: string[] = [];
  lines.push("# Phase 8 Contract Extension Console");
  lines.push("");
  lines.push("This dossier equips the contract owner to stage and activate upgrade bundles with one command path.");
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push(`- Extensions ready: **${plan.metrics.count}**`);
  lines.push(
    `- Pause coverage: **${plan.metrics.pauseCoveragePercent.toFixed(1)}%** (guardian-approved safety windows)`,
  );
  lines.push(`- Average upgrade window: **${plan.metrics.averageUpgradeWindowHours.toFixed(2)}h**`);
  lines.push(`- CI checks enforced: **${plan.metrics.ciCoverage}** total`);
  lines.push(`- Guardian approvers referenced: **${plan.metrics.guardianApproverCount}**`);
  if (plan.manifestManager) {
    lines.push(`- Phase 8 manager: \`${plan.manifestManager}\``);
  }
  lines.push("");
  for (const extension of plan.extensions) {
    lines.push(`## ${extension.name}`);
    lines.push("");
    lines.push(extension.description);
    lines.push("");
    lines.push(`- Module: \`${extension.module}\``);
    lines.push(`- Module ID: \`${extension.moduleId}\``);
    lines.push(`- Implementation: \`${extension.implementation}\``);
    lines.push(`- Initializer: \`${extension.initializer}\``);
    lines.push(`- Upgrade window: ${extension.upgradeWindowHours} hours`);
    lines.push(`- Pause before upgrade: ${extension.pauseBeforeUpgrade ? "Yes" : "No"}`);
    if (extension.dependencies.length > 0) {
      lines.push("- Dependencies:");
      for (const dep of extension.dependencies) {
        lines.push(`  - ${dep.type}: ${dep.label}`);
      }
    }
    if (extension.ciChecks.length > 0) {
      lines.push(`- CI checks: ${extension.ciChecks.join(", ")}`);
    }
    if (extension.guardianApprovers.length > 0) {
      lines.push(`- Guardian approvers: ${extension.guardianApprovers.join(", ")}`);
    }
    if (extension.rolloutPlan.length > 0) {
      lines.push("- Rollout plan:");
      extension.rolloutPlan.forEach((step, index) => {
        lines.push(`  ${index + 1}. ${step}`);
      });
    }
    if (extension.rollback) {
      lines.push("- Rollback:");
      lines.push(`  - ${extension.rollback.description}`);
      lines.push(`  - Procedure: ${extension.rollback.call}`);
    }
    if (extension.observability.length > 0) {
      lines.push(`- Observability: ${extension.observability.join(" | ")}`);
    }
    if (extension.valueLevers.length > 0) {
      lines.push(`- Value levers: ${extension.valueLevers.join(" | ")}`);
    }
    if (extension.checksum) {
      lines.push(`- Checksum: \`${extension.checksum}\``);
    }
    lines.push("- Stage calldata:");
    lines.push("```solidity");
    lines.push(extension.calls.stage);
    lines.push("```");
    lines.push("- Activate calldata:");
    lines.push("```solidity");
    lines.push(extension.calls.activate);
    lines.push("```");
    lines.push("");
  }
    return lines.join("\n");
}

export function renderExtensionMermaid(plan: ExtensionPlan): string {
  const lines: string[] = [
    "flowchart TD",
    "  Owner[Owner Console] --> Manager[Phase 8 Manager]",
    "  Manager --> UpgradeKernel[Upgrade Kernel]",
  ];
  plan.extensions.forEach((extension, index) => {
    const nodeId = `Ext${index}`;
    lines.push(`  UpgradeKernel --> ${nodeId}[${extension.name}]`);
    extension.dependencies.forEach((dependency, depIndex) => {
      const depId = `${nodeId}Dep${depIndex}`;
      lines.push(`  ${depId}[${dependency.label}] --> ${nodeId}`);
    });
  });
  return lines.join("\n");
}

function ensureOutputDirectory(dir: string) {
  return fs.mkdir(dir, { recursive: true });
}

interface CliOptions {
  json?: string;
  markdown?: string;
  mermaid?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      options.json = path.resolve(argv[i + 1] ?? "");
      i += 1;
    } else if (arg === "--markdown") {
      options.markdown = path.resolve(argv[i + 1] ?? "");
      i += 1;
    } else if (arg === "--mermaid") {
      options.mermaid = path.resolve(argv[i + 1] ?? "");
      i += 1;
    }
  }
  return options;
}

function logPlan(plan: ExtensionPlan) {
  console.log("\n=== Phase 8 Contract Extension Console ===\n");
  console.table([
    { Metric: "Extensions", Value: plan.metrics.count },
    { Metric: "Pause coverage %", Value: plan.metrics.pauseCoveragePercent.toFixed(1) },
    { Metric: "Average upgrade window (h)", Value: plan.metrics.averageUpgradeWindowHours.toFixed(2) },
    { Metric: "CI checks", Value: plan.metrics.ciCoverage },
    { Metric: "Guardian approvers", Value: plan.metrics.guardianApproverCount },
  ]);
  console.log("\nCall groups:");
  console.table(plan.callGroups);
  for (const extension of plan.extensions) {
    console.log(`\n[${extension.slug}] ${extension.name}`);
    console.log(`  Module: ${extension.module}`);
    console.log(`  Implementation: ${extension.implementation}`);
    console.log(`  Upgrade window: ${extension.upgradeWindowHours}h`);
    console.log(`  Pause before upgrade: ${extension.pauseBeforeUpgrade ? "yes" : "no"}`);
    if (extension.dependencies.length > 0) {
      console.log(`  Dependencies: ${extension.dependencies.map((entry) => entry.label).join(", ")}`);
    }
    console.log(`  Stage calldata: ${extension.calls.stage}`);
    console.log(`  Activate calldata: ${extension.calls.activate}`);
  }
}

export async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const manifest = loadConfig();
    const config = loadExtensionConfig(CONFIG_PATH);
    const plan = buildExtensionPlan(manifest, config);
    logPlan(plan);

    await ensureOutputDirectory(OUTPUT_DIR);

    if (options.json) {
      await ensureOutputDirectory(path.dirname(options.json));
      await fs.writeFile(options.json, JSON.stringify(plan, null, 2));
      console.log(`\nJSON plan written to ${options.json}`);
    }

    if (options.markdown) {
      await ensureOutputDirectory(path.dirname(options.markdown));
      await fs.writeFile(options.markdown, renderExtensionMarkdown(plan), "utf8");
      console.log(`Markdown report written to ${options.markdown}`);
    }

    if (options.mermaid) {
      await ensureOutputDirectory(path.dirname(options.mermaid));
      await fs.writeFile(options.mermaid, renderExtensionMermaid(plan), "utf8");
      console.log(`Mermaid diagram written to ${options.mermaid}`);
    }
  } catch (error) {
    console.error("Contract extension console failed:");
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
