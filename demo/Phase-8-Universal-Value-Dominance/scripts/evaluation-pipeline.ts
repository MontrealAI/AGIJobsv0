#!/usr/bin/env ts-node
import { promises as fs } from "fs";
import path from "path";

export interface AdapterScorecard {
  id: string;
  provider: string;
  safetyScore: number;
  costUSDPer1KTokens: number;
  latencyMs: number;
  maxContext: number;
  compositeScore: number;
}

const CONFIG_DIR = path.resolve(__dirname, "../configs");

async function loadAdapters() {
  const file = await fs.readFile(path.join(CONFIG_DIR, "model-adapters.json"), "utf8");
  return JSON.parse(file) as AdapterScorecard[];
}

export function computeCompositeScore(adapter: AdapterScorecard, jobDurationHours: number): number {
  if (!Number.isFinite(jobDurationHours) || jobDurationHours < 0) {
    throw new Error("jobDurationHours must be a non-negative number");
  }

  const { safetyScore, costUSDPer1KTokens, latencyMs, maxContext } = adapter;
  if (!Number.isFinite(safetyScore) || safetyScore < 0 || safetyScore > 1) {
    throw new Error("safetyScore must be between 0 and 1");
  }
  if (!Number.isFinite(costUSDPer1KTokens) || costUSDPer1KTokens <= 0) {
    throw new Error("costUSDPer1KTokens must be positive");
  }
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) {
    throw new Error("latencyMs must be positive");
  }
  if (!Number.isFinite(maxContext) || maxContext <= 0) {
    throw new Error("maxContext must be positive");
  }

  const latencyPenalty = latencyMs / 1000;
  const contextBonus = Math.log2(maxContext);
  const costEfficiency = 1 / costUSDPer1KTokens;
  const durationBonus = Math.log(jobDurationHours + 1);

  return Number(
    (safetyScore * 0.4 + costEfficiency * 0.2 + contextBonus * 0.2 + durationBonus * 0.1 - latencyPenalty * 0.1).toFixed(4),
  );
}

export function evaluate(adapter: AdapterScorecard, jobDurationHours: number): AdapterScorecard {
  const compositeScore = computeCompositeScore(adapter, jobDurationHours);
  return { ...adapter, compositeScore };
}

export function rankAdapters(adapters: AdapterScorecard[], jobDurationHours: number): AdapterScorecard[] {
  return adapters
    .map((adapter) => evaluate(adapter, jobDurationHours))
    .sort((a, b) => b.compositeScore - a.compositeScore);
}

async function main() {
  const jobIdIndex = process.argv.indexOf("--job");
  const jobId = jobIdIndex >= 0 ? process.argv[jobIdIndex + 1] : "Phase8-Universal-Value-Dominance";
  const jobDurationHours = Number(process.env.JOB_DURATION_HOURS ?? "8");

  const { default: ora } = await import("ora");
  const spinner = ora(`Evaluating adapters for job ${jobId}`).start();
  const adapters = await loadAdapters();
  const scored = rankAdapters(adapters, jobDurationHours);
  spinner.stop();

  console.table(scored.map(({ compositeScore, ...rest }) => ({ ...rest, compositeScore })));
  const outputPath = path.join(CONFIG_DIR, "model-adapters.scored.json");
  await fs.writeFile(outputPath, JSON.stringify(scored, null, 2));
  console.log(`\nSaved composite scores to ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error("Evaluation pipeline failed:", error);
    process.exit(1);
  });
}
