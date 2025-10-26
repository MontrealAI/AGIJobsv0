#!/usr/bin/env ts-node
import { promises as fs } from "fs";
import path from "path";
import { ethers } from "ethers";
import prompts from "prompts";

import {
  calldata,
  crossVerifyMetrics,
  flattenCalldataEntries,
  loadConfig,
  resolveEnvironment,
  writeArtifacts,
  type CalldataEntry,
  type Phase8Config,
} from "./run-phase8-demo";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CONFIG_DIR = path.resolve(__dirname, "../configs");
const OUTPUT_DIR = path.resolve(__dirname, "../output");

interface GovernancePolicies {
  owner: string;
  governanceCouncil: string[];
  pauseGuardian: string;
  validatorGuild: string;
  globalPause: boolean;
  budgetCapUSD: number;
  ci: { workflow: string; requireStatusChecks: string[] };
  upgradeHooks: Record<string, string>;
}

interface ModelAdapterConfig {
  id: string;
  provider: string;
  maxContext: number;
  costUSDPer1KTokens: number;
  safetyScore: number;
  latencyMs: number;
  lastValidated: string;
}

interface CallGroupSummary {
  label: string;
  count: number;
  targets: string[];
}

interface BootstrapPlan {
  config: Phase8Config;
  metrics: ReturnType<typeof crossVerifyMetrics>["metrics"];
  environment: ReturnType<typeof resolveEnvironment>;
  entries: CalldataEntry[];
  callGroups: CallGroupSummary[];
  managerAddress: string;
  exports: Record<string, string>;
  governance: GovernancePolicies;
  adapters: ModelAdapterConfig[];
  outputDir: string;
}

interface BuildPlanOptions {
  outputDir?: string;
  environment?: NodeJS.ProcessEnv;
  skipArtifacts?: boolean;
}

interface CliOptions {
  execute: boolean;
  yes: boolean;
  outputDir?: string;
  skipArtifacts: boolean;
}

function normalizeAddress(value: unknown): string {
  if (typeof value !== "string") return ZERO_ADDRESS;
  const trimmed = value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return ZERO_ADDRESS;
  return trimmed.toLowerCase();
}

async function readJSON<T>(file: string): Promise<T> {
  const buffer = await fs.readFile(path.join(CONFIG_DIR, file), "utf8");
  return JSON.parse(buffer) as T;
}

function groupEntries(entries: CalldataEntry[]): CallGroupSummary[] {
  const groups = new Map<string, { count: number; targets: Set<string> }>();
  for (const entry of entries) {
    const key = entry.label;
    const current = groups.get(key) ?? { count: 0, targets: new Set<string>() };
    current.count += 1;
    if (entry.slug) {
      current.targets.add(String(entry.slug).toLowerCase());
    }
    groups.set(key, current);
  }
  return Array.from(groups.entries())
    .map(([label, value]) => ({
      label,
      count: value.count,
      targets: Array.from(value.targets.values()).sort(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function resolveManagerAddress(config: Phase8Config, environmentManager?: string): string {
  const envAddress = normalizeAddress(environmentManager ?? "");
  if (envAddress !== ZERO_ADDRESS) {
    return envAddress;
  }
  const manifestAddress = normalizeAddress(config.global?.phase8Manager ?? "");
  if (manifestAddress !== ZERO_ADDRESS) {
    return manifestAddress;
  }
  throw new Error(
    "Phase 8 manager address is not configured. Set PHASE8_MANAGER_ADDRESS or provide global.phase8Manager in the manifest.",
  );
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { execute: false, yes: false, outputDir: undefined, skipArtifacts: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--execute":
        options.execute = true;
        break;
      case "--dry-run":
        options.execute = false;
        break;
      case "--yes":
      case "-y":
        options.yes = true;
        break;
      case "--output":
      case "-o":
        options.outputDir = path.resolve(argv[i + 1] ?? "");
        i += 1;
        break;
      case "--skip-artifacts":
        options.skipArtifacts = true;
        break;
      default:
        if (arg.startsWith("-")) {
          console.warn(`Unknown option ${arg} — ignoring.`);
        }
        break;
    }
  }
  return options;
}

function mapExports(entries: { label: string; path: string }[]): Record<string, string> {
  return entries.reduce<Record<string, string>>((acc, entry) => {
    acc[entry.label] = entry.path;
    return acc;
  }, {});
}

export async function buildBootstrapPlan(options: BuildPlanOptions = {}): Promise<BootstrapPlan> {
  const config = loadConfig();
  const environment = resolveEnvironment(options.environment ?? process.env);
  const { metrics } = crossVerifyMetrics(config);
  const data = calldata(config);
  const entries = flattenCalldataEntries(data);
  if (entries.length === 0) {
    throw new Error("Manifest did not produce any governance calldata entries.");
  }

  const exports = options.skipArtifacts
    ? []
    : writeArtifacts(config, metrics, data, environment, {
        outputDir: options.outputDir,
        managerAddress: environment.managerAddress,
        chainId: environment.chainId,
      });

  const managerAddress = resolveManagerAddress(config, environment.managerAddress);
  const governance = await readJSON<GovernancePolicies>("governance-policies.json");
  const adapters = (await readJSON<ModelAdapterConfig[]>("model-adapters.json")).sort(
    (a, b) => b.safetyScore - a.safetyScore,
  );
  const callGroups = groupEntries(entries);
  return {
    config,
    metrics,
    environment,
    entries,
    callGroups,
    managerAddress,
    exports: mapExports(exports),
    governance,
    adapters,
    outputDir: options.outputDir ? path.resolve(options.outputDir) : OUTPUT_DIR,
  };
}

async function connectProvider() {
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.OWNER_PRIVATE_KEY;
  if (!rpcUrl) {
    throw new Error("RPC_URL is required to execute governance transactions.");
  }
  if (!privateKey) {
    throw new Error("OWNER_PRIVATE_KEY is required to sign governance transactions.");
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  return { provider, wallet };
}

function formatUSD(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function logPlanSummary(plan: BootstrapPlan) {
  console.log("\n=== Phase 8 Bootstrap Planner ===\n");

  console.table([
    { Metric: "Dominance score", Value: `${plan.metrics.dominanceScore.toFixed(1)} / 100` },
    { Metric: "Monthly value flow", Value: formatUSD(plan.metrics.totalMonthlyUSD) },
    { Metric: "Annual treasury", Value: formatUSD(plan.metrics.annualBudget) },
    { Metric: "Guardian coverage", Value: `${plan.metrics.guardianCoverageMinutes.toFixed(1)} min` },
    { Metric: "Minimum coverage adequacy", Value: `${(plan.metrics.minimumCoverageAdequacy * 100).toFixed(1)}%` },
    { Metric: "Max autonomy", Value: `${(plan.metrics.maxAutonomy / 100).toFixed(2)}%` },
    { Metric: "AI teams", Value: `${plan.config.aiTeams?.length ?? 0}` },
    { Metric: "Safety tripwires", Value: `${plan.metrics.safetyTripwireCount}` },
  ]);

  console.log("\nGovernance control surface:");
  console.table({
    Owner: plan.governance.owner,
    GuardianCouncil: plan.config.global?.guardianCouncil ?? "—",
    PauseGuardian: plan.governance.pauseGuardian,
    ValidatorGuild: plan.governance.validatorGuild,
    Manager: plan.managerAddress,
  });

  console.log("\nCalldata manifest:");
  console.table(
    plan.callGroups.map((group) => ({
      Call: group.label,
      Count: group.count,
      Targets: group.targets.length > 0 ? group.targets.join(" · ") : "—",
    })),
  );

  console.log("\nModel adapter readiness:");
  console.table(
    plan.adapters.map((adapter) => ({
      Adapter: adapter.id,
      Provider: adapter.provider,
      "Ctx tokens": adapter.maxContext,
      Safety: adapter.safetyScore.toFixed(2),
      "Cost/1K": `$${adapter.costUSDPer1KTokens.toFixed(3)}`,
      "Last validated": adapter.lastValidated,
    })),
  );

  if (Object.keys(plan.exports).length > 0) {
    console.log("\nArtifacts refreshed:");
    Object.entries(plan.exports).forEach(([label, file]) => {
      console.log(` - ${label}: ${file}`);
    });
  } else {
    console.log("\nArtifacts skipped (use without --skip-artifacts to regenerate outputs).");
  }

  console.log(`\nTotal encoded calls: ${plan.entries.length}`);
}

async function confirmExecution(plan: BootstrapPlan, autoApprove: boolean): Promise<boolean> {
  if (autoApprove) return true;
  const response = await prompts({
    type: "confirm",
    name: "ready",
    message: `Broadcast ${plan.entries.length} governance call(s) to ${plan.managerAddress}?`,
    initial: false,
  });
  return Boolean(response.ready);
}

async function recordExecution(outputDir: string, record: any) {
  const historyFile = path.join(outputDir, "phase8-bootstrap-history.jsonl");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.appendFile(historyFile, `${JSON.stringify(record)}\n`, "utf8");
}

async function executePlan(plan: BootstrapPlan, wallet: ethers.Wallet) {
  console.log("\nExecuting governance transactions...");
  for (const entry of plan.entries) {
    const label = `${entry.label}${entry.slug ? ` (${entry.slug})` : ""}`;
    const tx = await wallet.sendTransaction({ to: plan.managerAddress, data: entry.data });
    console.log(` - ${label}: ${tx.hash}`);
    const receipt = await tx.wait();
    await recordExecution(plan.outputDir, {
      label: entry.label,
      slug: entry.slug ?? null,
      hash: tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
      timestamp: new Date().toISOString(),
    });
  }
  console.log("\nBroadcast complete. Execution receipts stored in phase8-bootstrap-history.jsonl.");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const plan = await buildBootstrapPlan({
      outputDir: options.outputDir,
      skipArtifacts: options.skipArtifacts,
    });

    logPlanSummary(plan);

    if (!options.execute) {
      console.log("\nDry run mode: no transactions broadcast. Use --execute to push calls on-chain.");
      return;
    }

    if (!(await confirmExecution(plan, options.yes))) {
      console.log("Execution aborted by operator.");
      return;
    }

    const { wallet } = await connectProvider();
    if (wallet.address.toLowerCase() !== plan.governance.owner.toLowerCase()) {
      console.warn(
        `Warning: signer ${wallet.address} does not match governance owner ${plan.governance.owner}. Ensure permissions are correc` +
          "t before proceeding.",
      );
    }
    await executePlan(plan, wallet);
  } catch (error) {
    console.error("\nPhase 8 bootstrap failed:");
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
