#!/usr/bin/env ts-node
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ora from "ora";

interface AdapterScorecard {
  id: string;
  provider: string;
  safetyScore: number;
  costUSDPer1KTokens: number;
  latencyMs: number;
  maxContext: number;
  compositeScore: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.resolve(__dirname, "../configs");

async function loadAdapters() {
  const file = await fs.readFile(path.join(CONFIG_DIR, "model-adapters.json"), "utf8");
  return JSON.parse(file) as AdapterScorecard[];
}

function evaluate(adapter: AdapterScorecard, jobDurationHours: number): AdapterScorecard {
  const latencyPenalty = adapter.latencyMs / 1000;
  const contextBonus = Math.log2(adapter.maxContext);
  const costEfficiency = 1 / adapter.costUSDPer1KTokens;
  const durationBonus = Math.log(jobDurationHours + 1);

  const composite = adapter.safetyScore * 0.4 + costEfficiency * 0.2 + contextBonus * 0.2 + durationBonus * 0.1 - latencyPenalty * 0.1;
  return { ...adapter, compositeScore: Number(composite.toFixed(4)) };
}

async function main() {
  const jobIdIndex = process.argv.indexOf("--job");
  const jobId = jobIdIndex >= 0 ? process.argv[jobIdIndex + 1] : "Phase8-Universal-Value-Dominance";
  const jobDurationHours = Number(process.env.JOB_DURATION_HOURS ?? "8");

  const spinner = ora(`Evaluating adapters for job ${jobId}`).start();
  const adapters = await loadAdapters();
  const scored = adapters.map((adapter) => evaluate(adapter, jobDurationHours)).sort((a, b) => b.compositeScore - a.compositeScore);
  spinner.stop();

  console.table(scored.map(({ compositeScore, ...rest }) => ({ ...rest, compositeScore })));
  const outputPath = path.join(CONFIG_DIR, "model-adapters.scored.json");
  await fs.writeFile(outputPath, JSON.stringify(scored, null, 2));
  console.log(`\nSaved composite scores to ${outputPath}`);
}

main().catch((error) => {
  console.error("Evaluation pipeline failed:", error);
  process.exit(1);
});
