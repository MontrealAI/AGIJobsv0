import { mkdir, readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import { performance } from "perf_hooks";

import {
  loadMission,
  computeThermodynamics,
  computeStatisticalPhysics,
  computeJarzynski,
  computeEquilibrium,
  type MissionConfig,
} from "../../agi-governance/scripts/executeDemo";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");

const DEFAULT_MISSION_FILE = path.join(BASE_DIR, "config", "mission@alpha-meta.json");
const DEFAULT_SUMMARY_FILE = path.join(REPORT_DIR, "alpha-meta-governance-summary.json");
const DEFAULT_JSON = path.join(REPORT_DIR, "alpha-meta-consistency.json");
const DEFAULT_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-consistency.md");
const DEFAULT_MANIFEST = path.join(REPORT_DIR, "alpha-meta-manifest.json");

const DEFAULT_ITERATIONS = 3;

const DEFAULT_TOLERANCES = {
  gibbsFreeEnergyKJ: 1e-6,
  jarzynskiLog: 1e-9,
  equilibrium: 1e-9,
};

const DEBUG = process.env.ALPHA_META_DEBUG === "1";

function debugLog(...messages: unknown[]): void {
  if (DEBUG) {
    console.log("[alpha-meta:consistency]", ...messages);
  }
}

const MANIFEST_KEY_FILES = [
  path.join(BASE_DIR, "reports", "alpha-meta-governance-summary.json"),
  path.join(BASE_DIR, "reports", "alpha-meta-governance-report.md"),
  path.join(BASE_DIR, "reports", "alpha-meta-governance-dashboard.html"),
  path.join(BASE_DIR, "reports", "alpha-meta-owner-matrix.json"),
  path.join(BASE_DIR, "reports", "alpha-meta-owner-matrix.md"),
  path.join(BASE_DIR, "reports", "alpha-meta-consistency.json"),
  path.join(BASE_DIR, "reports", "alpha-meta-consistency.md"),
];

interface GovernanceSummary {
  thermodynamics?: {
    gibbsFreeEnergyKJ: number;
  };
  jarzynski?: {
    logExpectation: number;
    logTheoretical: number;
    tolerance?: number;
  };
  equilibrium?: {
    closedForm: number[];
  };
}

interface ManifestDocument {
  generatedAt: string;
  root?: string;
  files: number;
  entries: Array<{
    path: string;
    sha256: string;
    bytes: number;
  }>;
}

interface ConsistencyIteration {
  iteration: number;
  gibbsFreeEnergyKJ: number;
  gibbsDelta: number;
  jarzynskiLogExpectation: number;
  jarzynskiExpectationDelta: number;
  jarzynskiLogTheoretical: number;
  jarzynskiTheoreticalDelta: number;
  equilibriumProfile: number[];
  equilibriumDelta: number;
  durationMs: number;
}

interface ManifestCheck {
  checked: Array<{
    path: string;
    sha256Matches: boolean;
    bytesMatch: boolean;
    expectedSha256?: string;
    actualSha256: string;
    expectedBytes?: number;
    actualBytes: number;
  }>;
  missing: string[];
}

export interface ConsistencyOptions {
  missionFile?: string;
  summaryFile?: string;
  outputJson?: string;
  outputMarkdown?: string;
  manifestFile?: string;
  iterations?: number;
  tolerances?: Partial<typeof DEFAULT_TOLERANCES>;
}

export interface ConsistencyResult {
  generatedAt: string;
  durationMs: number;
  baseline: {
    gibbsFreeEnergyKJ: number;
    jarzynskiLogExpectation: number;
    jarzynskiLogTheoretical: number;
    equilibriumProfile: number[];
  };
  iterations: ConsistencyIteration[];
  manifest: ManifestCheck;
  tolerances: typeof DEFAULT_TOLERANCES;
  maxDeviation: {
    gibbsFreeEnergyKJ: number;
    jarzynskiLogExpectation: number;
    jarzynskiLogTheoretical: number;
    equilibrium: number;
  };
  success: boolean;
  warnings: string[];
  outputs: {
    json: string;
    markdown: string;
  };
}

function normalisePath(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

function formatNumber(value: number, digits = 6): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 1) {
    return value.toFixed(digits);
  }
  return value.toExponential(digits - 1);
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function maxAbsoluteDelta(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  let maxDelta = 0;
  for (let i = 0; i < length; i += 1) {
    const delta = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (delta > maxDelta) {
      maxDelta = delta;
    }
  }
  return maxDelta;
}

function collectManifestIssues(manifest: ManifestCheck): string[] {
  return [
    ...manifest.missing.map((pathValue) => `Missing manifest entry for ${pathValue}`),
    ...manifest.checked
      .filter((entry) => !entry.sha256Matches)
      .map((entry) => `SHA-256 mismatch for ${entry.path}`),
    ...manifest.checked
      .filter((entry) => entry.sha256Matches && !entry.bytesMatch)
      .map((entry) => `Byte-length mismatch for ${entry.path}`),
  ];
}

function evaluateConsistency(
  manifest: ManifestCheck,
  maxDeviation: {
    gibbsFreeEnergyKJ: number;
    jarzynskiLogExpectation: number;
    jarzynskiLogTheoretical: number;
    equilibrium: number;
  },
  tolerances: typeof DEFAULT_TOLERANCES,
): { success: boolean; warnings: string[]; manifestIssues: string[] } {
  const manifestIssues = collectManifestIssues(manifest);
  const success =
    manifestIssues.length === 0 &&
    maxDeviation.gibbsFreeEnergyKJ <= tolerances.gibbsFreeEnergyKJ &&
    maxDeviation.jarzynskiLogExpectation <= tolerances.jarzynskiLog &&
    maxDeviation.jarzynskiLogTheoretical <= tolerances.jarzynskiLog &&
    maxDeviation.equilibrium <= tolerances.equilibrium;

  const warnings: string[] = [];
  if (!success && manifestIssues.length === 0) {
    warnings.push("Physical invariants deviated beyond tolerance");
  }
  if (manifestIssues.length > 0) {
    warnings.push(...manifestIssues);
  }

  return { success, warnings, manifestIssues };
}

function renderMarkdown(result: ConsistencyResult, manifestIssues: string[]): string {
  const lines: string[] = [];
  lines.push("# Alpha-Meta Consistency Audit");
  lines.push("");
  lines.push(`Generated at: ${result.generatedAt}`);
  lines.push("");
  lines.push("## Baseline invariants");
  lines.push("");
  lines.push(`- Gibbs free energy (kJ): ${formatNumber(result.baseline.gibbsFreeEnergyKJ)}`);
  lines.push(`- Jarzynski expectation (log): ${formatNumber(result.baseline.jarzynskiLogExpectation)}`);
  lines.push(`- Jarzynski theoretical (log): ${formatNumber(result.baseline.jarzynskiLogTheoretical)}`);
  lines.push(
    `- Equilibrium profile: ${result.baseline.equilibriumProfile
      .map((value) => formatNumber(value, 8))
      .join(", ")}`,
  );
  lines.push("");
  lines.push("## Iteration comparisons");
  lines.push("");
  lines.push(
    "| Iteration | Duration (ms) | Δ Gibbs (kJ) | Δ Jarzynski (expectation) | Δ Jarzynski (theoretical) | Δ Equilibrium (L∞) |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const entry of result.iterations) {
    lines.push(
      `| ${entry.iteration} | ${formatNumber(entry.durationMs, 4)} | ${formatNumber(entry.gibbsDelta)} | ${formatNumber(
        entry.jarzynskiExpectationDelta,
      )} | ${formatNumber(entry.jarzynskiTheoreticalDelta)} | ${formatNumber(entry.equilibriumDelta)} |`,
    );
  }
  lines.push("");
  lines.push("## Manifest verification");
  lines.push("");
  if (manifestIssues.length === 0) {
    lines.push("All key artefacts are present with matching digests and byte lengths.");
  } else {
    lines.push("Issues detected:");
    for (const issue of manifestIssues) {
      lines.push(`- ${issue}`);
    }
  }
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  if (result.success) {
    lines.push(
      "✅ Alpha-Meta invariants are deterministic across repeated computations and manifest integrity is intact.",
    );
  } else {
    lines.push("❌ Deviations exceeded tolerance or manifest integrity checks failed.");
  }
  lines.push("");
  lines.push("### Tolerances");
  lines.push("");
  lines.push(
    `- Gibbs free energy Δ ≤ ${formatNumber(result.tolerances.gibbsFreeEnergyKJ)} kJ (observed ${formatNumber(
      result.maxDeviation.gibbsFreeEnergyKJ,
    )})`,
  );
  lines.push(
    `- Jarzynski log Δ ≤ ${formatNumber(result.tolerances.jarzynskiLog)} (observed max expectation Δ ${formatNumber(
      result.maxDeviation.jarzynskiLogExpectation,
    )}, theoretical Δ ${formatNumber(result.maxDeviation.jarzynskiLogTheoretical)})`,
  );
  lines.push(
    `- Equilibrium Δ ≤ ${formatNumber(result.tolerances.equilibrium)} (observed ${formatNumber(
      result.maxDeviation.equilibrium,
    )})`,
  );

  lines.push("");

  return lines.join("\n");
}

async function updateManifest(manifestPath: string, files: string[]): Promise<void> {
  let document: ManifestDocument;
  try {
    document = await readJsonFile<ManifestDocument>(manifestPath);
  } catch (error) {
    document = {
      generatedAt: new Date().toISOString(),
      root: REPO_ROOT,
      files: 0,
      entries: [],
    };
  }

  const entryMap = new Map<string, ManifestDocument["entries"][number]>(
    (document.entries ?? []).map((entry) => [entry.path, entry]),
  );

  for (const file of files) {
    const absolute = path.resolve(file);
    const relative = normalisePath(absolute);
    const buffer = await readFile(absolute);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const entry = {
      path: relative,
      sha256,
      bytes: buffer.length,
    };
    entryMap.set(relative, entry);
  }

  const entries = Array.from(entryMap.values()).sort((a, b) => a.path.localeCompare(b.path));
  document.entries = entries;
  document.files = entries.length;
  document.root = document.root ?? REPO_ROOT;
  document.generatedAt = new Date().toISOString();

  await writeFile(manifestPath, JSON.stringify(document, null, 2), "utf8");
}

async function checkManifest(manifestPath: string): Promise<ManifestCheck> {
  const manifest = await readJsonFile<ManifestDocument>(manifestPath);
  const entryMap = new Map(manifest.entries.map((entry) => [entry.path, entry]));

  const checked: ManifestCheck["checked"] = [];
  const missing: string[] = [];

  for (const absolute of MANIFEST_KEY_FILES) {
    const relative = normalisePath(absolute);
    const buffer = await readFile(absolute);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const bytes = buffer.length;

    const entry = entryMap.get(relative);
    if (!entry) {
      missing.push(relative);
      continue;
    }

    checked.push({
      path: relative,
      sha256Matches: entry.sha256 === sha256,
      bytesMatch: entry.bytes === bytes,
      expectedSha256: entry.sha256,
      actualSha256: sha256,
      expectedBytes: entry.bytes,
      actualBytes: bytes,
    });
  }

  return { checked, missing };
}

async function computeBaseline(summaryFile: string): Promise<{
  summary: GovernanceSummary;
  gibbsFreeEnergyKJ: number;
  jarzynskiLogExpectation: number;
  jarzynskiLogTheoretical: number;
  equilibriumProfile: number[];
}> {
  const summary = await readJsonFile<GovernanceSummary>(summaryFile);
  if (!summary.thermodynamics || !Number.isFinite(summary.thermodynamics.gibbsFreeEnergyKJ)) {
    throw new Error("Summary is missing thermodynamic Gibbs free energy");
  }
  if (!summary.jarzynski) {
    throw new Error("Summary is missing Jarzynski data");
  }
  if (!summary.equilibrium || !Array.isArray(summary.equilibrium.closedForm)) {
    throw new Error("Summary is missing equilibrium closed form");
  }
  return {
    summary,
    gibbsFreeEnergyKJ: summary.thermodynamics.gibbsFreeEnergyKJ,
    jarzynskiLogExpectation: summary.jarzynski.logExpectation,
    jarzynskiLogTheoretical: summary.jarzynski.logTheoretical,
    equilibriumProfile: summary.equilibrium.closedForm,
  };
}

function computeMissionIteration(mission: MissionConfig) {
  const thermodynamics = computeThermodynamics(mission);
  const statisticalPhysics = computeStatisticalPhysics(mission, thermodynamics);
  const jarzynski = computeJarzynski(mission, thermodynamics, statisticalPhysics);
  const equilibrium = computeEquilibrium(mission);

  return {
    gibbsFreeEnergyKJ: thermodynamics.gibbsFreeEnergyKJ,
    jarzynskiLogExpectation: jarzynski.logExpectation,
    jarzynskiLogTheoretical: jarzynski.logTheoretical,
    equilibriumProfile: equilibrium.closedForm,
  };
}

export async function executeConsistencyAudit(options: ConsistencyOptions = {}): Promise<ConsistencyResult> {
  const missionFile = path.resolve(options.missionFile ?? DEFAULT_MISSION_FILE);
  const summaryFile = path.resolve(options.summaryFile ?? DEFAULT_SUMMARY_FILE);
  const outputJson = path.resolve(options.outputJson ?? DEFAULT_JSON);
  const outputMarkdown = path.resolve(options.outputMarkdown ?? DEFAULT_MARKDOWN);
  const manifestFile = path.resolve(options.manifestFile ?? DEFAULT_MANIFEST);
  const iterations = Math.max(1, Math.floor(options.iterations ?? DEFAULT_ITERATIONS));
  const tolerances = {
    ...DEFAULT_TOLERANCES,
    ...(options.tolerances ?? {}),
  };

  await mkdir(path.dirname(outputJson), { recursive: true });

  const mission = await loadMission(missionFile);
  const baseline = await computeBaseline(summaryFile);
  debugLog("Mission and summary loaded");

  const iterationResults: ConsistencyIteration[] = [];
  let maxGibbsDelta = 0;
  let maxJarzynskiExpectationDelta = 0;
  let maxJarzynskiTheoreticalDelta = 0;
  let maxEquilibriumDelta = 0;

  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const iterationStart = performance.now();
    const result = computeMissionIteration(mission);
    const iterationEnd = performance.now();

    const gibbsDelta = Math.abs(result.gibbsFreeEnergyKJ - baseline.gibbsFreeEnergyKJ);
    const jarzynskiExpectationDelta = Math.abs(
      result.jarzynskiLogExpectation - baseline.jarzynskiLogExpectation,
    );
    const jarzynskiTheoreticalDelta = Math.abs(
      result.jarzynskiLogTheoretical - baseline.jarzynskiLogTheoretical,
    );
    const equilibriumDelta = maxAbsoluteDelta(result.equilibriumProfile, baseline.equilibriumProfile);

    maxGibbsDelta = Math.max(maxGibbsDelta, gibbsDelta);
    maxJarzynskiExpectationDelta = Math.max(maxJarzynskiExpectationDelta, jarzynskiExpectationDelta);
    maxJarzynskiTheoreticalDelta = Math.max(maxJarzynskiTheoreticalDelta, jarzynskiTheoreticalDelta);
    maxEquilibriumDelta = Math.max(maxEquilibriumDelta, equilibriumDelta);

    iterationResults.push({
      iteration: index + 1,
      gibbsFreeEnergyKJ: result.gibbsFreeEnergyKJ,
      gibbsDelta,
      jarzynskiLogExpectation: result.jarzynskiLogExpectation,
      jarzynskiExpectationDelta,
      jarzynskiLogTheoretical: result.jarzynskiLogTheoretical,
      jarzynskiTheoreticalDelta,
      equilibriumProfile: result.equilibriumProfile,
      equilibriumDelta,
      durationMs: iterationEnd - iterationStart,
    });
  }
  const end = performance.now();

  const maxDeviation = {
    gibbsFreeEnergyKJ: maxGibbsDelta,
    jarzynskiLogExpectation: maxJarzynskiExpectationDelta,
    jarzynskiLogTheoretical: maxJarzynskiTheoreticalDelta,
    equilibrium: maxEquilibriumDelta,
  };
  debugLog("Computed max deviations", maxDeviation);

  const placeholderResult: ConsistencyResult = {
    generatedAt: new Date().toISOString(),
    durationMs: end - start,
    baseline: {
      gibbsFreeEnergyKJ: baseline.gibbsFreeEnergyKJ,
      jarzynskiLogExpectation: baseline.jarzynskiLogExpectation,
      jarzynskiLogTheoretical: baseline.jarzynskiLogTheoretical,
      equilibriumProfile: baseline.equilibriumProfile,
    },
    iterations: iterationResults,
    manifest: { checked: [], missing: [] },
    tolerances,
    maxDeviation,
    success: false,
    warnings: ["Manifest verification pending"],
    outputs: {
      json: outputJson,
      markdown: outputMarkdown,
    },
  };

  const placeholderMarkdown = [
    "# Alpha-Meta Consistency Audit",
    "",
    `Generated at: ${placeholderResult.generatedAt}`,
    "",
    "Manifest verification pending — rerendering after digest checks...",
  ].join("\n");

  await writeFile(outputJson, JSON.stringify(placeholderResult, null, 2), "utf8");
  await writeFile(outputMarkdown, placeholderMarkdown, "utf8");
  debugLog("Wrote placeholder outputs");

  await updateManifest(manifestFile, [outputJson, outputMarkdown]);
  debugLog("Updated manifest with placeholder outputs");
  let manifest = await checkManifest(manifestFile);
  debugLog("Initial manifest check complete");
  let evaluation = evaluateConsistency(manifest, maxDeviation, tolerances);

  let result: ConsistencyResult = {
    ...placeholderResult,
    generatedAt: new Date().toISOString(),
    manifest,
    success: evaluation.success,
    warnings: evaluation.warnings,
  };

  let markdown = renderMarkdown(result, evaluation.manifestIssues);

  await writeFile(outputJson, JSON.stringify(result, null, 2), "utf8");
  await writeFile(outputMarkdown, markdown, "utf8");
  debugLog("Wrote first-pass outputs");

  await updateManifest(manifestFile, [outputJson, outputMarkdown]);
  debugLog("Updated manifest after first pass");
  manifest = await checkManifest(manifestFile);
  debugLog("Second manifest check complete");
  evaluation = evaluateConsistency(manifest, maxDeviation, tolerances);

  const finalResult: ConsistencyResult = {
    ...result,
    generatedAt: new Date().toISOString(),
    manifest,
    success: evaluation.success,
    warnings: evaluation.warnings,
  };

  const finalMarkdown = renderMarkdown(finalResult, evaluation.manifestIssues);

  const previousJson = JSON.stringify(result, null, 2);
  const finalJson = JSON.stringify(finalResult, null, 2);

  if (finalJson !== previousJson) {
    await writeFile(outputJson, finalJson, "utf8");
    debugLog("Applied final JSON output");
  }
  if (finalMarkdown !== markdown) {
    await writeFile(outputMarkdown, finalMarkdown, "utf8");
    debugLog("Applied final Markdown output");
  }

  if (finalJson !== previousJson || finalMarkdown !== markdown) {
    await updateManifest(manifestFile, [outputJson, outputMarkdown]);
    debugLog("Updated manifest after final outputs");
    const postUpdateManifest = await checkManifest(manifestFile);
    debugLog("Post-update manifest check complete");
    const postEvaluation = evaluateConsistency(postUpdateManifest, maxDeviation, tolerances);
    if (
      postEvaluation.success !== finalResult.success ||
      postEvaluation.warnings.join("\n") !== finalResult.warnings.join("\n") ||
      collectManifestIssues(postUpdateManifest).join("\n") !==
        collectManifestIssues(finalResult.manifest).join("\n")
    ) {
      const updatedResult: ConsistencyResult = {
        ...finalResult,
        generatedAt: new Date().toISOString(),
        manifest: postUpdateManifest,
        success: postEvaluation.success,
        warnings: postEvaluation.warnings,
      };
      const updatedMarkdown = renderMarkdown(updatedResult, collectManifestIssues(postUpdateManifest));
      await writeFile(outputJson, JSON.stringify(updatedResult, null, 2), "utf8");
      await writeFile(outputMarkdown, updatedMarkdown, "utf8");
      await updateManifest(manifestFile, [outputJson, outputMarkdown]);
      debugLog("Updated manifest after reconciliation pass");
      return updatedResult;
    }
  }

  debugLog("Consistency audit completed successfully");
  return finalResult;
}

async function main(): Promise<void> {
  const result = await executeConsistencyAudit();

  const manifestWarnings = result.warnings.filter((warning) => warning.startsWith("Missing manifest"));
  if (!result.success) {
    console.error("❌ Alpha-Meta consistency audit failed.");
    if (result.warnings.length > 0) {
      result.warnings.forEach((warning) => console.error(`   - ${warning}`));
    }
    process.exitCode = 1;
    return;
  }

  if (manifestWarnings.length > 0) {
    manifestWarnings.forEach((warning) => console.warn(`⚠️ ${warning}`));
  }

  console.log("✅ Alpha-Meta consistency audit complete.");
  console.log(`   Consistency JSON: ${result.outputs.json}`);
  console.log(`   Consistency Markdown: ${result.outputs.markdown}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to execute Alpha-Meta consistency audit:", error);
    process.exitCode = 1;
  });
}
