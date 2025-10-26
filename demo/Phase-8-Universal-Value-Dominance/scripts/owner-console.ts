#!/usr/bin/env ts-node
import { existsSync, promises as fs } from "fs";
import path from "path";
import { z } from "zod";

import {
  calldata,
  crossVerifyMetrics,
  flattenCalldataEntries,
  guardrailDiagnostics,
  loadConfig,
  resolveEnvironment,
  type EnvironmentConfig,
  type Phase8Config,
} from "./run-phase8-demo";

const OWNER_CONSOLE_DIR = __dirname;

const OWNER_DIRECTIVES_PATH = path.resolve(OWNER_CONSOLE_DIR, "../configs/owner-directives.json");
const WORKFLOW_DIR = path.resolve(OWNER_CONSOLE_DIR, "../../../.github/workflows");

const AddressSchema = z
  .string({ invalid_type_error: "Address must be provided as a string" })
  .regex(/^0x[a-fA-F0-9]{40}$/u, "Must be a valid 20-byte hex address")
  .transform((value) => value.toLowerCase());

const OwnerDirectiveSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  address: AddressSchema,
  description: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
  guardrails: z.array(z.string()).default([]),
  methods: z
    .array(
      z.object({
        signature: z.string().min(1),
        description: z.string().min(1),
        safetyNotes: z.string().optional(),
      }),
    )
    .default([]),
});

const ParameterDirectiveSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  description: z.string().min(1),
  unit: z.string().default(""),
  desired: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
  call: z.string().min(1),
});

const TripwireSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]),
  response: z.string().min(1),
});

const OwnerDirectivesSchema = z.object({
  owner: AddressSchema,
  pauseGuardian: AddressSchema,
  governanceCouncil: z.array(AddressSchema).default([]),
  validatorGuild: AddressSchema.optional(),
  controlSurfaces: z.array(OwnerDirectiveSchema).min(1),
  parameters: z.array(ParameterDirectiveSchema).default([]),
  tripwires: z.array(TripwireSchema).default([]),
  ci: z.object({
    workflow: z.string().min(1),
    requireStatusChecks: z.array(z.string()).default([]),
  }),
});

export type OwnerDirectives = z.infer<typeof OwnerDirectivesSchema>;

export interface OwnerModulePlan {
  key: string;
  name: string;
  address: string;
  description: string;
  capabilities: string[];
  guardrails: string[];
  methods: { signature: string; description: string; safetyNotes?: string }[];
  inManifest: boolean;
  manifestReferences: string[];
}

export interface ParameterProjection {
  name: string;
  path: string;
  description: string;
  unit: string;
  desired: number;
  current: number | null;
  delta: number | null;
  min?: number;
  max?: number;
  call: string;
}

export interface OwnerControlPlan {
  owner: { address: string; matchesManager: boolean; pauseGuardian: string };
  governanceCouncil: string[];
  validatorGuild?: string;
  managerAddress: string;
  metrics: {
    dominanceScore: number;
    annualBudget: number;
    guardianCoverageMinutes: number;
    minimumCoverageAdequacy: number;
  };
  universalValueScore: number;
  modules: OwnerModulePlan[];
  missingModules: string[];
  parameters: ParameterProjection[];
  tripwires: z.infer<typeof TripwireSchema>[];
  guardrailFindings: string[];
  callGroups: { label: string; count: number }[];
  ci: { workflow: string; workflowExists: boolean; requireStatusChecks: string[] };
  visualization: string;
}

export async function loadOwnerDirectives(filePath: string = OWNER_DIRECTIVES_PATH): Promise<OwnerDirectives> {
  const buffer = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(buffer);
  return OwnerDirectivesSchema.parse(json);
}

function buildManifestAddressIndex(config: Phase8Config): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const push = (address: unknown, context: string) => {
    if (typeof address !== "string") return;
    const lower = address.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/iu.test(lower)) return;
    const current = map.get(lower) ?? [];
    current.push(context);
    map.set(lower, current);
  };

  const global = config.global ?? {};
  for (const [key, value] of Object.entries(global)) {
    push(value as string, `global.${key}`);
  }

  for (const domain of config.domains ?? []) {
    const base = `domain.${domain.slug ?? domain.name ?? "unknown"}`;
    push(domain.orchestrator, `${base}.orchestrator`);
    push(domain.capitalVault, `${base}.capitalVault`);
    push(domain.validatorModule, `${base}.validatorModule`);
    push(domain.policyKernel, `${base}.policyKernel`);
  }

  for (const sentinel of config.sentinels ?? []) {
    push(sentinel.agent, `sentinel.${sentinel.slug ?? sentinel.name ?? "unknown"}`);
  }

  for (const stream of config.capitalStreams ?? []) {
    push(stream.vault, `capitalStream.${stream.slug ?? "unknown"}`);
  }

  for (const playbook of config.selfImprovement?.playbooks ?? []) {
    push(playbook.owner, `selfImprovement.playbook.${playbook.name ?? "unknown"}`);
  }

  return map;
}

function resolvePath(config: Phase8Config, pathValue: string): unknown {
  const parts = pathValue.split(".").filter(Boolean);
  let cursor: any = config;
  for (const part of parts) {
    if (cursor === undefined || cursor === null) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && /^\d+(\.\d+)?$/u.test(value.trim())) {
    return Number(value.trim());
  }
  if (typeof value === "bigint") return Number(value);
  return null;
}

function computeUniversalValueScore(plan: OwnerControlPlan["metrics"]): number {
  const dominance = plan.dominanceScore;
  const coverageAdequacy = plan.minimumCoverageAdequacy * 100;
  const guardianMinutes = plan.guardianCoverageMinutes;
  const scaledCoverage = Math.min(100, guardianMinutes / 60 * 10);
  return Math.round((dominance + coverageAdequacy + scaledCoverage) / 3);
}

export function renderOwnerMermaid(plan: OwnerControlPlan): string {
  const lines: string[] = [
    "flowchart LR",
    "    subgraph OwnerConsole[Owner Command Surface]",
    "        Owner([Owner Multisig])",
    "        PauseGuardian{{Pause Guardian}}",
    "    end",
    "    subgraph Governance",
    "        Manager[[Phase 8 Manager]]",
    "        Upgrades[[Upgrade Coordinator]]",
    "        Validators[[Validator Registry]]",
    "        SystemPause{{System Pause Kernel}}",
    "    end",
    "    subgraph Safety",
    "        Tripwires{{Autonomy Tripwires}}",
    "        CI[[CI Gatekeepers]]",
    "    end",
    "    Owner --> Manager",
    "    Owner --> Upgrades",
    "    Owner --> Validators",
    "    PauseGuardian --> SystemPause",
    "    Manager --> Tripwires",
    "    Tripwires --> SystemPause",
    "    CI --> Upgrades",
    "    Validators --> Manager",
  ];
  for (const module of plan.modules) {
    const nodeId = module.key.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "Module";
    lines.push(`    Manager -.control.-> ${nodeId}[${module.name}]`);
  }
  return lines.join("\n");
}

function renderMarkdownTable(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.join(" | ")} |`;
  const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyRows = rows.map((row) => `| ${row.join(" | ")} |`);
  return [headerRow, separatorRow, ...bodyRows].join("\n");
}

export function renderOwnerMarkdown(plan: OwnerControlPlan): string {
  const lines: string[] = [];
  lines.push("# Phase 8 Owner Command Console Report");
  lines.push("");
  lines.push(
    "This briefing distils the current Phase 8 control surface so the contract owner can assert universal value dominance with one glance.",
  );
  lines.push("");
  lines.push("## Executive Metrics");
  lines.push("");
  lines.push(
    renderMarkdownTable(
      ["Metric", "Value"],
      [
        ["Dominance score", plan.metrics.dominanceScore.toFixed(2)],
        ["Universal value score", plan.universalValueScore.toFixed(2)],
        ["Annual budget (USD)", plan.metrics.annualBudget.toLocaleString("en-US")],
        ["Guardian coverage (minutes)", plan.metrics.guardianCoverageMinutes.toString()],
        ["Minimum coverage adequacy", `${(plan.metrics.minimumCoverageAdequacy * 100).toFixed(2)}%`],
      ],
    ),
  );
  lines.push("");
  lines.push("## Owner & Governance Alignment");
  lines.push("");
  lines.push(
    `- **Owner address:** ${plan.owner.address}${plan.owner.matchesManager ? " (matches manager)" : ""}`,
  );
  lines.push(`- **Pause guardian:** ${plan.owner.pauseGuardian}`);
  if (plan.governanceCouncil.length > 0) {
    lines.push(`- **Governance council:** ${plan.governanceCouncil.join(", ")}`);
  }
  if (plan.validatorGuild) {
    lines.push(`- **Validator guild:** ${plan.validatorGuild}`);
  }
  lines.push(`- **Manager contract:** ${plan.managerAddress}`);
  lines.push("");
  lines.push("## Control Surface Coverage");
  lines.push("");
  const moduleRows = plan.modules.map((module) => [
    module.name,
    module.address,
    module.capabilities.join(", ") || "—",
    module.guardrails.join(", ") || "—",
    module.inManifest ? "yes" : "missing",
  ]);
  lines.push(renderMarkdownTable(["Module", "Address", "Capabilities", "Guardrails", "Manifest"], moduleRows));
  if (plan.missingModules.length > 0) {
    lines.push("");
    lines.push(`⚠️ Missing modules: ${plan.missingModules.join(", ")}`);
  }
  lines.push("");
  lines.push("## Parameter Projections");
  lines.push("");
  const parameterRows = plan.parameters.map((parameter) => [
    parameter.unit ? `${parameter.name} (${parameter.unit})` : parameter.name,
    parameter.unit,
    parameter.current === null ? "—" : parameter.current.toString(),
    parameter.desired.toString(),
    parameter.delta === null ? "—" : parameter.delta.toString(),
    parameter.call,
  ]);
  lines.push(
    renderMarkdownTable(
      ["Parameter", "Unit", "Current", "Desired", "Delta", "Call"],
      parameterRows.length > 0 ? parameterRows : [["—", "—", "—", "—", "—", "—"]],
    ),
  );
  lines.push("");
  lines.push("## Tripwires & Guardrails");
  lines.push("");
  if (plan.tripwires.length > 0) {
    for (const tripwire of plan.tripwires) {
      lines.push(`- **${tripwire.id}** (${tripwire.severity}): ${tripwire.description} — _${tripwire.response}_`);
    }
  } else {
    lines.push("- None configured");
  }
  if (plan.guardrailFindings.length > 0) {
    lines.push("");
    lines.push("### Diagnostics");
    for (const finding of plan.guardrailFindings) {
      lines.push(`- ${finding}`);
    }
  }
  lines.push("");
  lines.push("## Required CI Checks");
  lines.push("");
  lines.push(
    renderMarkdownTable(
      ["Workflow", "Exists", "Status checks"],
      [[plan.ci.workflow, plan.ci.workflowExists ? "yes" : "missing", plan.ci.requireStatusChecks.join("<br />") || "—"]],
    ),
  );
  lines.push("");
  lines.push("## Governance Call Bundles");
  lines.push("");
  const callRows = plan.callGroups.map((group) => [group.label, group.count.toString()]);
  lines.push(renderMarkdownTable(["Bundle", "Count"], callRows));
  lines.push("");
  lines.push("## Visual Control Map");
  lines.push("");
  lines.push("```mermaid");
  lines.push(plan.visualization);
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

export function buildOwnerControlPlan(
  config: Phase8Config,
  directives: OwnerDirectives,
  environment: EnvironmentConfig,
): OwnerControlPlan {
  const { metrics } = crossVerifyMetrics(config);
  const manifestAddresses = buildManifestAddressIndex(config);

  const modules: OwnerModulePlan[] = directives.controlSurfaces.map((entry) => ({
    key: entry.key,
    name: entry.name,
    address: entry.address,
    description: entry.description,
    capabilities: entry.capabilities,
    guardrails: entry.guardrails,
    methods: entry.methods.map((method) => ({
      signature: method.signature,
      description: method.description,
      safetyNotes: method.safetyNotes,
    })),
    inManifest: manifestAddresses.has(entry.address),
    manifestReferences: manifestAddresses.get(entry.address) ?? [],
  }));

  const parameters: ParameterProjection[] = directives.parameters.map((parameter) => {
    const currentValue = normalizeNumber(resolvePath(config, parameter.path));
    return {
      name: parameter.name,
      path: parameter.path,
      description: parameter.description,
      unit: parameter.unit,
      desired: parameter.desired,
      current: currentValue,
      delta: currentValue === null ? null : Number(parameter.desired) - currentValue,
      min: parameter.min,
      max: parameter.max,
      call: parameter.call,
    };
  });

  const plan: OwnerControlPlan = {
    owner: {
      address: directives.owner,
      matchesManager: directives.owner === environment.managerAddress.toLowerCase(),
      pauseGuardian: directives.pauseGuardian,
    },
    governanceCouncil: directives.governanceCouncil,
    validatorGuild: directives.validatorGuild,
    managerAddress: environment.managerAddress,
    metrics: {
      dominanceScore: metrics.dominanceScore,
      annualBudget: metrics.annualBudget,
      guardianCoverageMinutes: metrics.guardianCoverageMinutes,
      minimumCoverageAdequacy: metrics.minimumCoverageAdequacy,
    },
    universalValueScore: 0,
    modules,
    missingModules: modules.filter((module) => !module.inManifest).map((module) => module.key),
    parameters,
    tripwires: directives.tripwires,
    guardrailFindings: guardrailDiagnostics(config),
    callGroups: flattenCalldataEntries(calldata(config))
      .reduce<{ label: string; count: number }[]>((acc, entry) => {
        const existing = acc.find((item) => item.label === entry.label);
        if (existing) {
          existing.count += 1;
        } else {
          acc.push({ label: entry.label, count: 1 });
        }
        return acc;
      }, [])
      .sort((a, b) => a.label.localeCompare(b.label)),
    ci: {
      workflow: directives.ci.workflow,
      workflowExists: existsSync(path.join(WORKFLOW_DIR, directives.ci.workflow)),
      requireStatusChecks: directives.ci.requireStatusChecks,
    },
    visualization: "",
  };

  plan.universalValueScore = computeUniversalValueScore(plan.metrics);
  plan.visualization = renderOwnerMermaid(plan);
  return plan;
}

function logPlan(plan: OwnerControlPlan) {
  console.log("\n=== Phase 8 Owner Command Console ===\n");
  console.log(
    `Owner address: ${plan.owner.address} (matches manager: ${plan.owner.matchesManager ? "yes" : "no"})`,
  );
  console.log(`Pause guardian: ${plan.owner.pauseGuardian}`);
  console.log(`Manager (Phase 8): ${plan.managerAddress}`);
  console.log(`Governance council seats: ${plan.governanceCouncil.length}`);
  if (plan.validatorGuild) {
    console.log(`Validator guild: ${plan.validatorGuild}`);
  }

  console.table([
    { Metric: "Dominance score", Value: plan.metrics.dominanceScore.toFixed(2) },
    { Metric: "Universal value score", Value: plan.universalValueScore.toFixed(2) },
    { Metric: "Annual budget (USD)", Value: plan.metrics.annualBudget.toLocaleString("en-US", { maximumFractionDigits: 2 }) },
    {
      Metric: "Guardian coverage (minutes)",
      Value: plan.metrics.guardianCoverageMinutes.toLocaleString("en-US", { maximumFractionDigits: 2 }),
    },
    {
      Metric: "Minimum coverage adequacy",
      Value: `${(plan.metrics.minimumCoverageAdequacy * 100).toFixed(2)}%`,
    },
  ]);

  console.log("\nModule coverage:");
  console.table(
    plan.modules.map((module) => ({
      Module: module.name,
      Address: module.address,
      Capabilities: module.capabilities.join(", "),
      Guardrails: module.guardrails.join(", "),
      Present: module.inManifest ? "yes" : "missing",
    })),
  );

  if (plan.missingModules.length > 0) {
    console.warn("\nWarning: some owner control surfaces are missing from the manifest:", plan.missingModules);
  }

  if (plan.parameters.length > 0) {
    console.log("\nParameter deltas:");
    console.table(
      plan.parameters.map((parameter) => ({
        Parameter: `${parameter.name} (${parameter.unit})`,
        Current: parameter.current ?? "—",
        Desired: parameter.desired,
        Delta: parameter.delta ?? "—",
        Call: parameter.call,
      })),
    );
  }

  if (plan.guardrailFindings.length > 0) {
    console.log("\nGuardrail diagnostics:");
    for (const finding of plan.guardrailFindings) {
      console.log(` - ${finding}`);
    }
  }

  console.log("\nRequired CI workflow:");
  console.table([
    {
      Workflow: plan.ci.workflow,
      Exists: plan.ci.workflowExists ? "yes" : "missing",
      Checks: plan.ci.requireStatusChecks.join(" | "),
    },
  ]);

  console.log("\nRecommended governance call bundles:");
  console.table(plan.callGroups);

  console.log("\nMermaid visualization:\n");
  console.log(plan.visualization);
}

interface CliOptions {
  json?: string;
  mermaid?: string;
  markdown?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      options.json = path.resolve(argv[i + 1] ?? "");
      i += 1;
    } else if (arg === "--mermaid") {
      options.mermaid = path.resolve(argv[i + 1] ?? "");
      i += 1;
    } else if (arg === "--markdown") {
      options.markdown = path.resolve(argv[i + 1] ?? "");
      i += 1;
    }
  }
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();
    const environment = resolveEnvironment();
    const directives = await loadOwnerDirectives();
    const plan = buildOwnerControlPlan(config, directives, environment);

    logPlan(plan);

    if (options.json) {
      await fs.mkdir(path.dirname(options.json), { recursive: true });
      await fs.writeFile(options.json, JSON.stringify(plan, null, 2));
      console.log(`\nPlan written to ${options.json}`);
    }

    if (options.mermaid) {
      await fs.mkdir(path.dirname(options.mermaid), { recursive: true });
      await fs.writeFile(options.mermaid, plan.visualization, "utf8");
      console.log(`Mermaid diagram written to ${options.mermaid}`);
    }

    if (options.markdown) {
      await fs.mkdir(path.dirname(options.markdown), { recursive: true });
      await fs.writeFile(options.markdown, renderOwnerMarkdown(plan), "utf8");
      console.log(`Markdown report written to ${options.markdown}`);
    }
  } catch (error) {
    console.error("\nOwner console failed:");
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

export { OWNER_DIRECTIVES_PATH };
