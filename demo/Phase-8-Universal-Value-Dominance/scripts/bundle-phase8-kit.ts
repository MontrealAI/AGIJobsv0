#!/usr/bin/env ts-node
/*
 * Phase 8 operator kit bundler.
 * Packages governance calldata, telemetry, manifest, and guidance into a
 * single tarball for non-technical operators.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import tar from "tar";

import {
  calldata,
  computeMetrics,
  loadConfig,
  resolveEnvironment,
  writeArtifacts,
  type EnvironmentConfig,
  type Phase8Config,
} from "./run-phase8-demo";

export type BundleResult = {
  bundlePath: string;
  kitManifestPath: string;
  includedFiles: string[];
  generatedAt: string;
};

export type BundleOptions = {
  /** Optional override for the manifest path */
  manifestPath?: string;
  /** Optional override for the output directory */
  outputDir?: string;
  /** Optional override for the base directory used for tar relative paths */
  baseDir?: string;
  /** Optional override for the governance manager address */
  managerAddress?: string;
  /** Optional override for the chain ID encoded in exported payloads */
  chainId?: number;
  /** Optional custom bundle file name */
  bundleFileName?: string;
};

const DEFAULT_BUNDLE_NAME = "phase8-operator-kit.tar.gz";

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function mergeEnvironment(
  environment: EnvironmentConfig,
  overrides: Pick<BundleOptions, "managerAddress" | "chainId">
): EnvironmentConfig {
  const next = { ...environment };
  if (overrides.managerAddress) {
    next.managerAddress = overrides.managerAddress.toLowerCase();
  }
  if (typeof overrides.chainId === "number" && Number.isFinite(overrides.chainId)) {
    next.chainId = overrides.chainId;
  }
  return next;
}

function includeIfExists(collection: Map<string, string>, baseDir: string, absolutePath: string) {
  if (!existsSync(absolutePath)) {
    return;
  }
  const relativePath = relative(baseDir, absolutePath);
  collection.set(relativePath, absolutePath);
}

export async function bundleOperatorKit(options: BundleOptions = {}): Promise<BundleResult> {
  const baseDir = options.baseDir ?? join(__dirname, "..");
  const manifestPath = options.manifestPath ?? join(baseDir, "config", "universal.value.manifest.json");
  const outputDir = options.outputDir ?? join(baseDir, "output");
  const bundleFileName = options.bundleFileName ?? DEFAULT_BUNDLE_NAME;
  const environment = mergeEnvironment(resolveEnvironment(), {
    managerAddress: options.managerAddress,
    chainId: options.chainId,
  });

  ensureDir(outputDir);

  const config: Phase8Config = loadConfig(manifestPath);
  const metrics = computeMetrics(config);
  const data = calldata(config);
  const artifacts = writeArtifacts(config, metrics, data, environment, {
    outputDir,
    managerAddress: environment.managerAddress,
    chainId: environment.chainId,
  });

  const included = new Map<string, string>();
  includeIfExists(included, baseDir, manifestPath);

  for (const artifact of artifacts) {
    includeIfExists(included, baseDir, artifact.path);
  }

  const additionalArtifacts = [
    join(outputDir, "phase8-orchestration-report.txt"),
    join(outputDir, "phase8-cycle-report.csv"),
    join(outputDir, "phase8-self-improvement-plan.json"),
  ];
  for (const artifactPath of additionalArtifacts) {
    includeIfExists(included, baseDir, artifactPath);
  }

  includeIfExists(included, baseDir, join(baseDir, "README.md"));
  includeIfExists(included, baseDir, join(baseDir, "index.html"));

  const callManifestPath = join(outputDir, "phase8-governance-calldata.json");
  if (!existsSync(callManifestPath)) {
    throw new Error("Missing governance calldata manifest; run orchestrator export first.");
  }

  const callManifest = JSON.parse(readFileSync(callManifestPath, "utf-8"));
  const generatedAt: string = callManifest.generatedAt ?? new Date().toISOString();

  const kitManifestPath = join(outputDir, "phase8-operator-kit-manifest.json");
  const assetRecords = Array.from(included.entries()).map(([relativePath]) => ({
    path: relativePath,
  }));

  const kitManifest = {
    generatedAt,
    managerAddress: callManifest.managerAddress,
    chainId: callManifest.chainId,
    dominanceScore: metrics.dominanceScore,
    totals: {
      totalMonthlyUSD: metrics.totalMonthlyUSD,
      annualBudgetUSD: metrics.annualBudget,
      averageResilience: metrics.averageResilience,
      guardianCoverageMinutes: metrics.guardianCoverageMinutes,
    },
    instructions: [
      "1. Import phase8-safe-transaction-batch.json into a multisig or timelock console.",
      "2. Apply transactions in order and confirm guardians observe overrides.",
      "3. Publish phase8-mermaid-diagram.mmd and phase8-telemetry-report.md for executive briefing.",
      "4. Load index.html locally or via static hosting for the live Phase 8 console.",
    ],
    assets: assetRecords,
  };
  writeFileSync(kitManifestPath, JSON.stringify(kitManifest, null, 2));
  includeIfExists(included, baseDir, kitManifestPath);
  const kitRelativePath = relative(baseDir, kitManifestPath);
  assetRecords.push({ path: kitRelativePath });
  writeFileSync(kitManifestPath, JSON.stringify({ ...kitManifest, assets: assetRecords }, null, 2));

  const bundlePath = join(outputDir, bundleFileName);
  if (existsSync(bundlePath)) {
    rmSync(bundlePath);
  }

  await tar.create({
    gzip: true,
    cwd: baseDir,
    file: bundlePath,
  }, Array.from(included.keys()));

  console.log("Phase 8 operator kit ready");
  console.log(`  Bundle: ${bundlePath}`);
  console.log(`  Assets: ${included.size}`);

  return {
    bundlePath,
    kitManifestPath,
    includedFiles: Array.from(included.keys()),
    generatedAt,
  };
}

async function main() {
  try {
    await bundleOperatorKit();
  } catch (error) {
    console.error("\n\x1b[31mPhase 8 bundling failed\x1b[0m");
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
