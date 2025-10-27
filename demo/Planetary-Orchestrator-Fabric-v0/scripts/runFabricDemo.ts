#!/usr/bin/env ts-node

import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import {
  runFabricScenario,
  PlanetaryOrchestratorFabric,
  FabricRunResult,
} from "./lib/orchestrator";

interface CliOptions {
  configPath: string;
  jobs: number;
  checkpointPath: string;
  outputPath?: string;
  uiPath?: string;
  simulateKill?: boolean;
  seed?: number;
  checkpointInterval?: number;
  resume?: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const defaults = resolveDefaults();
  const options: CliOptions = {
    configPath: defaults.configPath,
    jobs: 10000,
    checkpointPath: defaults.checkpointPath,
    outputPath: defaults.outputPath,
    uiPath: defaults.uiPath,
    simulateKill: false,
    resume: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token) continue;
    switch (token) {
      case "--config":
        options.configPath = resolveArg(args[++i], defaults.configPath);
        break;
      case "--jobs":
        options.jobs = Number(args[++i] ?? options.jobs);
        break;
      case "--checkpoint":
        options.checkpointPath = resolveArg(args[++i], defaults.checkpointPath);
        break;
      case "--output":
        options.outputPath = resolveArg(args[++i], defaults.outputPath);
        break;
      case "--ui":
        options.uiPath = resolveArg(args[++i], defaults.uiPath);
        break;
      case "--simulate-kill":
        options.simulateKill = true;
        break;
      case "--resume":
        options.resume = true;
        break;
      case "--seed":
        options.seed = Number(args[++i] ?? options.seed);
        break;
      case "--checkpoint-interval":
        options.checkpointInterval = Number(args[++i] ?? options.checkpointInterval);
        break;
      default:
        if (token.startsWith("--config=")) {
          options.configPath = resolveArg(token.split("=", 2)[1], defaults.configPath);
        } else if (token.startsWith("--jobs=")) {
          options.jobs = Number(token.split("=", 2)[1]);
        } else if (token.startsWith("--checkpoint=")) {
          options.checkpointPath = resolveArg(token.split("=", 2)[1], defaults.checkpointPath);
        } else if (token.startsWith("--output=")) {
          options.outputPath = resolveArg(token.split("=", 2)[1], defaults.outputPath);
        } else if (token.startsWith("--ui=")) {
          options.uiPath = resolveArg(token.split("=", 2)[1], defaults.uiPath);
        } else if (token.startsWith("--seed=")) {
          options.seed = Number(token.split("=", 2)[1]);
        } else if (token.startsWith("--checkpoint-interval=")) {
          options.checkpointInterval = Number(token.split("=", 2)[1]);
        } else if (token === "--help" || token === "-h") {
          printHelp();
          process.exit(0);
        } else {
          console.warn(`Unknown argument: ${token}`);
        }
        break;
    }
  }

  if (!Number.isFinite(options.jobs) || options.jobs <= 0) {
    throw new Error("--jobs must be a positive number");
  }

  return options;
}

function resolveDefaults() {
  const root = resolve(__dirname, "..");
  const configPath = join(root, "config", "fabric.manifest.json");
  const checkpointPath = join(root, "output", "fabric.checkpoint.json");
  const outputPath = join(root, "output", "fabric-report.json");
  const uiPath = join(root, "ui", "data", "latest.json");
  return { root, configPath, checkpointPath, outputPath, uiPath };
}

function resolveArg(value: string | undefined, fallback: string | undefined): string {
  if (!value) {
    if (!fallback) throw new Error("Missing argument value");
    return fallback;
  }
  return resolve(value);
}

function printHelp() {
  console.log(`Planetary Orchestrator Fabric demo\n\nCommands:\n  --config <path>             Path to fabric manifest JSON.\n  --jobs <count>              Number of jobs to simulate (default 10000).\n  --checkpoint <path>         Path to checkpoint file.\n  --output <path>             Where to write the final report JSON.\n  --ui <path>                 Where to write the UI snapshot JSON.\n  --seed <number>             Deterministic seed for reproducibility.\n  --simulate-kill             Run a mid-flight checkpoint/resume drill.\n  --resume                    Resume from an existing checkpoint.\n  --checkpoint-interval <n>   Override checkpoint interval in jobs.\n`);
}

function logSummary(label: string, result: FabricRunResult) {
  const successRate = result.totalJobsRequested === 0
    ? 0
    : ((result.completedJobs - result.failedJobs) / result.totalJobsRequested) * 100;
  console.log(`\n${label}`);
  console.log(`  Jobs completed: ${result.completedJobs}/${result.totalJobsRequested}`);
  console.log(`  Reassignments : ${result.reassignments}`);
  console.log(`  Cross-shard   : ${result.crossShardTransfers}`);
  console.log(`  Spillovers    : ${result.spillovers}`);
  console.log(`  Unstoppable   : ${(result.unstoppableScore * 100).toFixed(2)}%`);
  console.log(`  Success rate  : ${successRate.toFixed(2)}%`);
}

async function main() {
  const options = parseArgs();
  const defaults = resolveDefaults();

  const config = PlanetaryOrchestratorFabric.loadConfig(options.configPath);
  console.log(
    `Manifest ${config.version}: ${config.description} (owner unstoppable floor ${(config.owner.controls.unstoppableScoreFloor * 100).toFixed(2)}%)`
  );
  const checkpointPath = options.checkpointPath ?? defaults.checkpointPath;
  const seed = options.seed ?? 20250101;

  if (options.resume && !existsSync(checkpointPath)) {
    throw new Error(`Cannot resume – checkpoint not found at ${checkpointPath}`);
  }

  if (options.simulateKill) {
    const killAfter = Math.max(1, Math.min(options.jobs - 1, Math.floor(options.jobs / 2)));
    console.log(`▶️  Launching planetary fabric (first phase ${killAfter} jobs, seed ${seed})`);
    const partial = runFabricScenario(options.configPath, {
      totalJobs: options.jobs,
      checkpointPath,
      checkpointInterval: options.checkpointInterval,
      simulateKillAfterJobs: killAfter,
      deterministicSeed: seed,
      outputPath: undefined,
      uiDataPath: undefined,
      baseTimestamp: Date.now(),
    });
    logSummary("Partial run complete – checkpoint persisted", partial);
    console.log(`  Checkpoint saved to: ${partial.checkpointPath}`);
    console.log("  Simulating orchestrator restart...\n");
    options.resume = true;
  }

  const finalResult = runFabricScenario(options.configPath, {
    totalJobs: options.jobs,
    checkpointPath,
    checkpointInterval: options.checkpointInterval,
    resume: options.resume,
    deterministicSeed: seed,
    outputPath: options.outputPath,
    uiDataPath: options.uiPath,
    baseTimestamp: Date.now(),
  });

  logSummary("Planetary fabric orchestration complete", finalResult);
  if (options.outputPath) {
    console.log(`  Report stored at: ${options.outputPath}`);
  }
  if (options.uiPath) {
    console.log(`  UI snapshot written to: ${options.uiPath}`);
  }
  console.log(`  Owner unstoppable floor: ${(finalResult.ownerControls.unstoppableScoreFloor * 100).toFixed(2)}%`);
}

main().catch((error) => {
  console.error("❌ Planetary fabric demo failed", error);
  process.exitCode = 1;
});
