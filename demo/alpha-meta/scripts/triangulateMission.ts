import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { performance } from "perf_hooks";

import { updateManifest } from "./manifestUtils";

import {
  loadMission,
  computeEquilibrium,
  computeThermodynamics,
  computeStatisticalPhysics,
  computeJarzynski,
} from "../../agi-governance/scripts/executeDemo";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const DEFAULT_MISSION_FILE = path.join(BASE_DIR, "config", "mission@alpha-meta.json");
const DEFAULT_SUMMARY_FILE = path.join(REPORT_DIR, "alpha-meta-governance-summary.json");
const DEFAULT_JSON = path.join(REPORT_DIR, "alpha-meta-triangulation.json");
const DEFAULT_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-triangulation.md");
const DEFAULT_MANIFEST = path.join(REPORT_DIR, "alpha-meta-manifest.json");

const DEFAULT_TOLERANCES = {
  equilibrium: 1e-6,
  thermodynamics: 1e-6,
  jarzynski: 1e-6,
};

type GovernanceSummary = {
  generatedAt: string;
  thermodynamics?: {
    gibbsFreeEnergyKJ: number;
  };
  jarzynski?: {
    logExpectation: number;
    logTheoretical: number;
    tolerance: number;
  };
  equilibrium?: {
    closedForm: number[];
    replicator?: number[];
    eigenvector?: number[];
  };
};

type TriangulationCheck = {
  id: string;
  label: string;
  passed: boolean;
  delta?: number;
  tolerance?: number;
  details: string;
};

export interface TriangulationOptions {
  missionFile?: string;
  summaryFile?: string;
  outputJson?: string;
  outputMarkdown?: string;
  manifestFile?: string;
  tolerances?: Partial<typeof DEFAULT_TOLERANCES>;
}

export interface TriangulationResult {
  generatedAt: string;
  durationMs: number;
  checks: TriangulationCheck[];
  success: boolean;
  maxDeviation: number;
  replicator: {
    profile: number[];
    independentState: number[];
    independentIterations: number;
    independentDeviation: number;
    stressSeeds: number[][];
    stressStates: number[][];
    stressMaxDeviation: number;
  };
  eigenvector: {
    summary: number[];
    independent: number[];
    deviation: number;
    iterations: number;
  };
  baseline: {
    closedForm: number[];
    gibbsFreeEnergyKJ: number;
    jarzynskiLogExpectation: number;
    jarzynskiLogTheoretical: number;
  };
  comparison?: {
    summaryPath: string;
    gibbsDelta?: number;
    jarzynskiDelta?: number;
    closedFormDelta?: number;
  };
  outputs: {
    json: string;
    markdown: string;
  };
}

function formatNumber(value: number, digits = 6): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(digits);
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => dot(row, vector));
}

function normalise(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return values.map(() => 1 / values.length);
  }
  return values.map((value) => value / total);
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function replicatorStep(state: number[], matrix: number[][]): number[] {
  const payoffs = multiplyMatrixVector(matrix, state);
  const average = dot(state, payoffs);
  const next = state.map((value, index) => {
    const payoff = payoffs[index];
    if (average <= 0) {
      return Math.max(value, Number.EPSILON);
    }
    const ratio = payoff <= 0 ? Number.EPSILON : payoff / average;
    const damping = 0.6;
    const scaled = value * ratio;
    const blended = (1 - damping) * value + damping * scaled;
    return Math.max(blended, Number.EPSILON);
  });
  return normalise(next);
}

function runReplicator(
  initial: number[],
  matrix: number[][],
  maxIterations = 50000,
  tolerance = 1e-8,
): { state: number[]; iterations: number } {
  let current = normalise([...initial]);
  let iterations = 0;
  const window: number[][] = [];
  const windowSize = 500;
  const aggregate = Array.from({ length: initial.length }, () => 0);
  let sampleCount = 0;
  const burnIn = Math.floor(maxIterations / 2);

  while (iterations < maxIterations) {
    const next = replicatorStep(current, matrix);
    const delta = Math.sqrt(next.reduce((sum, value, index) => sum + (value - current[index]) ** 2, 0));
    current = next;
    iterations += 1;
    window.push(next);
    if (window.length > windowSize) {
      window.shift();
    }
    if (iterations > burnIn) {
      for (let i = 0; i < next.length; i += 1) {
        aggregate[i] += next[i];
      }
      sampleCount += 1;
    }
    if (delta < tolerance) {
      break;
    }
  }

  if (iterations >= maxIterations) {
    if (sampleCount > 0) {
      const averaged = aggregate.map((value) => value / sampleCount);
      return { state: normalise(averaged), iterations };
    }
    if (window.length > 0) {
      const base = Array.from({ length: initial.length }, () => 0);
      const accumulated = window.reduce((acc, state) => {
        state.forEach((value, index) => {
          acc[index] += value;
        });
        return acc;
      }, base);
      const averagedWindow = accumulated.map((value) => value / window.length);
      return { state: normalise(averagedWindow), iterations };
    }
  }

  return { state: current, iterations };
}

function runPowerIteration(
  matrix: number[][],
  maxIterations = 5000,
  tolerance = 1e-10,
): { vector: number[]; iterations: number } {
  const size = matrix.length;
  let vector = normalise(Array.from({ length: size }, () => 1 / size));
  let iterations = 0;
  while (iterations < maxIterations) {
    const nextRaw = multiplyMatrixVector(matrix, vector);
    const next = normalise(nextRaw.map((value) => Math.max(value, Number.EPSILON)));
    const delta = Math.sqrt(next.reduce((sum, value, index) => sum + (value - vector[index]) ** 2, 0));
    vector = next;
    iterations += 1;
    if (delta < tolerance) {
      break;
    }
  }
  return { vector, iterations };
}

function maxAbsDifference(a: number[], b: number[]): number {
  let max = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (diff > max) {
      max = diff;
    }
  }
  return max;
}

async function loadSummary(summaryPath: string): Promise<GovernanceSummary | undefined> {
  try {
    const raw = await readFile(summaryPath, "utf8");
    return JSON.parse(raw) as GovernanceSummary;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function describeChecks(checks: TriangulationCheck[]): string {
  const failed = checks.filter((check) => !check.passed);
  if (failed.length === 0) {
    return "All triangulation checks satisfied.";
  }
  return `${failed.length} triangulation checks exceeded tolerance.`;
}

export async function executeTriangulation(options: TriangulationOptions = {}): Promise<TriangulationResult> {
  const started = performance.now();
  const tolerances = { ...DEFAULT_TOLERANCES, ...(options.tolerances ?? {}) };

  const mission = await loadMission(options.missionFile ?? DEFAULT_MISSION_FILE);
  const summaryPath = path.resolve(options.summaryFile ?? DEFAULT_SUMMARY_FILE);
  const summary = await loadSummary(summaryPath);

  const equilibrium = computeEquilibrium(mission);
  const thermodynamics = computeThermodynamics(mission);
  const statistics = computeStatisticalPhysics(mission, thermodynamics);
  const jarzynski = computeJarzynski(mission, thermodynamics, statistics);

  const rng = mulberry32((mission.gameTheory.monteCarlo.seed ?? 0) ^ 0x9e3779b9);
  const matrix = mission.gameTheory.payoffMatrix;
  const replicatorProfile = equilibrium.replicator ?? equilibrium.closedForm;
  const independentReplicator = runReplicator(replicatorProfile, matrix);

  const seeds: number[][] = [];
  const initialShare = normalise(mission.gameTheory.strategies.map((strategy) => strategy.initialShare));
  seeds.push(initialShare);
  seeds.push(equilibrium.closedForm);
  seeds.push(replicatorProfile);
  for (let i = 0; i < 3; i += 1) {
    const noise = equilibrium.closedForm.map((value) => value + (rng() - 0.5) * 0.05);
    seeds.push(normalise(noise));
  }

  const stressStates = seeds.map((seed) => runReplicator(seed, matrix).state);
  const stressMaxDeviation = stressStates.reduce(
    (max, state) => Math.max(max, maxAbsDifference(state, equilibrium.closedForm)),
    0,
  );

  const independentEigen = runPowerIteration(matrix);
  const eigenDeviation = maxAbsDifference(independentEigen.vector, equilibrium.closedForm);

  const checks: TriangulationCheck[] = [];

  if (summary?.equilibrium?.closedForm) {
    const delta = maxAbsDifference(summary.equilibrium.closedForm, equilibrium.closedForm);
    checks.push({
      id: "summary-closed-form",
      label: "Summary closed-form equilibrium",
      passed: delta <= tolerances.equilibrium,
      delta,
      tolerance: tolerances.equilibrium,
      details: `Max deviation ${formatNumber(delta)} (tol=${formatNumber(tolerances.equilibrium)})`,
    });
  }

  if (summary?.equilibrium?.replicator) {
    const delta = maxAbsDifference(summary.equilibrium.replicator, replicatorProfile);
    checks.push({
      id: "replicator-summary",
      label: "Summary replicator equilibrium",
      passed: delta <= tolerances.equilibrium,
      delta,
      tolerance: tolerances.equilibrium,
      details: `Max deviation ${formatNumber(delta)} (tol=${formatNumber(tolerances.equilibrium)})`,
    });
  }

  const independentReplicatorDeviation = maxAbsDifference(independentReplicator.state, equilibrium.closedForm);
  checks.push({
    id: "replicator-independent",
    label: "Independent replicator vs closed-form",
    passed: independentReplicatorDeviation <= tolerances.equilibrium,
    delta: independentReplicatorDeviation,
    tolerance: tolerances.equilibrium,
    details: `Deviation ${formatNumber(independentReplicatorDeviation)}`,
  });

  const stressTolerance = mission.gameTheory.consistencyThreshold ?? 0.1;
  checks.push({
    id: "replicator-stress",
    label: "Stress replicator max deviation",
    passed: stressMaxDeviation <= stressTolerance,
    delta: stressMaxDeviation,
    tolerance: stressTolerance,
    details: `Stress seeds max Δ=${formatNumber(stressMaxDeviation)} (tol=${formatNumber(stressTolerance)})`,
  });

  const eigenTolerance = Math.max(tolerances.equilibrium, mission.gameTheory.consistencyThreshold ?? 0.05);

  if (summary?.equilibrium?.eigenvector) {
    const delta = maxAbsDifference(summary.equilibrium.eigenvector, independentEigen.vector);
    checks.push({
      id: "eigenvector-summary",
      label: "Summary eigenvector match",
      passed: delta <= eigenTolerance,
      delta,
      tolerance: eigenTolerance,
      details: `Max deviation ${formatNumber(delta)} (tol=${formatNumber(eigenTolerance)})`,
    });
  }

  checks.push({
    id: "eigenvector-independent",
    label: "Independent eigenvector vs closed-form",
    passed: eigenDeviation <= eigenTolerance,
    delta: eigenDeviation,
    tolerance: eigenTolerance,
    details: `Deviation ${formatNumber(eigenDeviation)}`,
  });

  if (summary?.thermodynamics?.gibbsFreeEnergyKJ !== undefined) {
    const delta = Math.abs(summary.thermodynamics.gibbsFreeEnergyKJ - thermodynamics.gibbsFreeEnergyKJ);
    checks.push({
      id: "gibbs",
      label: "Gibbs free energy cross-check",
      passed: delta <= tolerances.thermodynamics,
      delta,
      tolerance: tolerances.thermodynamics,
      details: `Summary ${formatNumber(summary.thermodynamics.gibbsFreeEnergyKJ)} vs recomputed ${formatNumber(
        thermodynamics.gibbsFreeEnergyKJ,
      )}`,
    });
  }

  if (summary?.jarzynski) {
    const delta = Math.abs(summary.jarzynski.logExpectation - jarzynski.logExpectation);
    checks.push({
      id: "jarzynski",
      label: "Jarzynski log expectation cross-check",
      passed: delta <= Math.max(tolerances.jarzynski, summary.jarzynski.tolerance),
      delta,
      tolerance: Math.max(tolerances.jarzynski, summary.jarzynski.tolerance),
      details: `Summary ${formatNumber(summary.jarzynski.logExpectation)} vs recomputed ${formatNumber(
        jarzynski.logExpectation,
      )}`,
    });
    const theoreticalDelta = Math.abs(jarzynski.logExpectation - jarzynski.logTheoretical);
    checks.push({
      id: "jarzynski-consistency",
      label: "Jarzynski self-consistency",
      passed: theoreticalDelta <= jarzynski.tolerance,
      delta: theoreticalDelta,
      tolerance: jarzynski.tolerance,
      details: `Expectation vs theoretical Δ=${formatNumber(theoreticalDelta)} (tol=${formatNumber(
        jarzynski.tolerance,
      )})`,
    });
  }

  const success = checks.every((check) => check.passed);
  const durationMs = performance.now() - started;

  const outputJson = path.resolve(options.outputJson ?? DEFAULT_JSON);
  const outputMarkdown = path.resolve(options.outputMarkdown ?? DEFAULT_MARKDOWN);

  await mkdir(path.dirname(outputJson), { recursive: true });
  await mkdir(path.dirname(outputMarkdown), { recursive: true });

  const result: TriangulationResult = {
    generatedAt: new Date().toISOString(),
    durationMs,
    checks,
    success,
    maxDeviation: Math.max(independentReplicatorDeviation, stressMaxDeviation, eigenDeviation),
    replicator: {
      profile: replicatorProfile,
      independentState: independentReplicator.state,
      independentIterations: independentReplicator.iterations,
      independentDeviation: independentReplicatorDeviation,
      stressSeeds: seeds,
      stressStates: stressStates,
      stressMaxDeviation,
    },
    eigenvector: {
      summary: summary?.equilibrium?.eigenvector ?? [],
      independent: independentEigen.vector,
      deviation: eigenDeviation,
      iterations: independentEigen.iterations,
    },
    baseline: {
      closedForm: equilibrium.closedForm,
      gibbsFreeEnergyKJ: thermodynamics.gibbsFreeEnergyKJ,
      jarzynskiLogExpectation: jarzynski.logExpectation,
      jarzynskiLogTheoretical: jarzynski.logTheoretical,
    },
    comparison: summary
      ? {
          summaryPath,
          gibbsDelta: summary.thermodynamics
            ? Math.abs(summary.thermodynamics.gibbsFreeEnergyKJ - thermodynamics.gibbsFreeEnergyKJ)
            : undefined,
          jarzynskiDelta: summary.jarzynski
            ? Math.abs(summary.jarzynski.logExpectation - jarzynski.logExpectation)
            : undefined,
          closedFormDelta: summary.equilibrium
            ? maxAbsDifference(summary.equilibrium.closedForm, equilibrium.closedForm)
            : undefined,
        }
      : undefined,
    outputs: {
      json: outputJson,
      markdown: outputMarkdown,
    },
  };

  await writeFile(outputJson, JSON.stringify(result, null, 2), "utf8");

  const statusEmoji = success ? "✅" : "❌";
  const markdownLines: string[] = [];
  markdownLines.push(`# Alpha-Meta Triangulation Report`);
  markdownLines.push(`*Generated at:* ${result.generatedAt}`);
  markdownLines.push(`*Duration:* ${(durationMs / 1000).toFixed(2)} s`);
  markdownLines.push("");
  markdownLines.push(`Overall status: ${statusEmoji} ${describeChecks(checks)}`);
  markdownLines.push("");
  markdownLines.push("## Checks");
  markdownLines.push("| Check | Status | Δ | Tolerance | Details |");
  markdownLines.push("| --- | --- | --- | --- | --- |");
  for (const check of checks) {
    const emoji = check.passed ? "✅" : "❌";
    markdownLines.push(
      `| ${check.label} | ${emoji} | ${
        check.delta !== undefined ? formatNumber(check.delta, 6) : "-"
      } | ${check.tolerance !== undefined ? formatNumber(check.tolerance, 6) : "-"} | ${check.details} |`,
    );
  }
  markdownLines.push("");
  markdownLines.push("## Replicator Diagnostics");
  markdownLines.push(`- Independent replicator deviation: ${formatNumber(independentReplicatorDeviation, 6)}`);
  markdownLines.push(`- Stress-test max deviation: ${formatNumber(stressMaxDeviation, 6)}`);
  markdownLines.push(`- Stress seeds analysed: ${seeds.length}`);
  markdownLines.push("- Replicator profile: [" + replicatorProfile.map((value) => formatNumber(value, 6)).join(", ") + "]");
  markdownLines.push("- Closed-form state: [" + equilibrium.closedForm.map((value) => formatNumber(value, 6)).join(", ") + "]");
  markdownLines.push("");
  markdownLines.push("## Eigenvector Diagnostics");
  markdownLines.push(`- Independent eigen iterations: ${independentEigen.iterations}`);
  markdownLines.push(`- Independent eigen deviation: ${formatNumber(eigenDeviation, 6)}`);
  markdownLines.push("");
  if (summary) {
    markdownLines.push("## Summary Comparison");
    markdownLines.push(`- Summary file: \`${summaryPath}\``);
    if (summary.thermodynamics) {
      markdownLines.push(
        `- Gibbs free energy Δ: ${formatNumber(
          Math.abs(summary.thermodynamics.gibbsFreeEnergyKJ - thermodynamics.gibbsFreeEnergyKJ),
        )} kJ`,
      );
    }
    if (summary.jarzynski) {
      markdownLines.push(
        `- Jarzynski log expectation Δ: ${formatNumber(
          Math.abs(summary.jarzynski.logExpectation - jarzynski.logExpectation),
        )}`,
      );
    }
    if (summary.equilibrium) {
      markdownLines.push(
        `- Closed-form equilibrium Δ: ${formatNumber(
          maxAbsDifference(summary.equilibrium.closedForm, equilibrium.closedForm),
        )}`,
      );
    }
    markdownLines.push("");
  }
  markdownLines.push("## Files");
  markdownLines.push(`- JSON: \`${outputJson}\``);
  markdownLines.push(`- Markdown: \`${outputMarkdown}\``);

  await writeFile(outputMarkdown, markdownLines.join("\n"), "utf8");

  await updateManifest(options.manifestFile ?? DEFAULT_MANIFEST, [outputJson, outputMarkdown]);

  return result;
}

async function main(): Promise<void> {
  const result = await executeTriangulation();
  if (!result.success) {
    console.error("❌ Alpha-Meta triangulation detected deviations beyond tolerance.");
    result.checks
      .filter((check) => !check.passed)
      .forEach((check) => console.error(`   - ${check.label}: ${check.details}`));
    process.exitCode = 1;
    return;
  }
  console.log("✅ Alpha-Meta triangulation checks satisfied.");
  console.log(`   JSON: ${result.outputs.json}`);
  console.log(`   Markdown: ${result.outputs.markdown}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to execute Alpha-Meta triangulation:", error);
    process.exitCode = 1;
  });
}
