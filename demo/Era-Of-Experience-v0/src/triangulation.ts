import fs from 'node:fs/promises';
import path from 'node:path';
import { runEraOfExperienceDemo } from './demoRunner';
import { DemoRunOptions, RunResult } from './types';

export interface TriangulationOptions {
  scenarioPath: string;
  seeds: number[];
  rewardPath?: string;
  jobCountOverride?: number;
  outputDir?: string;
  writeReports?: boolean;
}

export interface TriangulationRunSummary {
  seed: number;
  baselineGMV: number;
  learningGMV: number;
  baselineROI: number;
  learningROI: number;
  baselineAutonomy: number;
  learningAutonomy: number;
  gmvLift: number;
  roiLift: number;
  autonomyLift: number;
  dominanceRatio: number;
}

export interface StatSummary {
  mean: number;
  min: number;
  max: number;
  standardDeviation: number;
}

export interface TriangulationAggregate {
  gmv: StatSummary;
  roi: StatSummary;
  autonomy: StatSummary;
  dominanceMean: number;
  successRatio: number;
  combinedGMV: {
    baseline: number;
    learning: number;
    lift: number;
  };
  combinedROI: number;
}

export interface TriangulationVerdict {
  gmvPositive: boolean;
  roiPositive: boolean;
  autonomyPositive: boolean;
  consensusRatio: number;
  dominanceMean: number;
  combinedLift: number;
  confidenceScore: number;
  flaggedSeeds: number[];
  notes: string[];
}

export interface TriangulationResult {
  scenarioName: string;
  scenarioDescription: string;
  runs: TriangulationRunSummary[];
  aggregate: TriangulationAggregate;
  verdict: TriangulationVerdict;
}

const DEFAULT_OUTPUT_DIR = path.resolve('demo/Era-Of-Experience-v0/reports');

export async function performTriangulation(options: TriangulationOptions): Promise<TriangulationResult> {
  if (!options.seeds || options.seeds.length === 0) {
    throw new Error('At least one seed must be provided for triangulation');
  }

  const runs: TriangulationRunSummary[] = [];
  let scenarioName = 'unknown';
  let scenarioDescription = '';

  for (const seed of options.seeds) {
    const runOptions: DemoRunOptions = {
      scenarioPath: options.scenarioPath,
      rewardPath: options.rewardPath,
      jobCountOverride: options.jobCountOverride,
      writeReports: false,
      seedOverride: seed
    };
    const result = await runEraOfExperienceDemo(runOptions);
    scenarioName = result.scenario.name;
    scenarioDescription = result.scenario.description;

    const gmvLift = safeRatio(result.learning.metrics.gmv, result.baseline.metrics.gmv);
    const roiLift = safeRatio(result.learning.metrics.roi, result.baseline.metrics.roi);
    const autonomyLift = safeRatio(
      result.learning.metrics.autonomyLift,
      result.baseline.metrics.autonomyLift
    );

    const dominanceRatio = computeDominanceRatio(result.baseline, result.learning);

    runs.push({
      seed,
      baselineGMV: round(result.baseline.metrics.gmv),
      learningGMV: round(result.learning.metrics.gmv),
      baselineROI: Number(result.baseline.metrics.roi.toFixed(6)),
      learningROI: Number(result.learning.metrics.roi.toFixed(6)),
      baselineAutonomy: Number(result.baseline.metrics.autonomyLift.toFixed(6)),
      learningAutonomy: Number(result.learning.metrics.autonomyLift.toFixed(6)),
      gmvLift,
      roiLift,
      autonomyLift,
      dominanceRatio
    });
  }

  const aggregate = buildAggregate(runs);
  const verdict = buildVerdict(runs, aggregate);
  const triangulationResult: TriangulationResult = {
    scenarioName,
    scenarioDescription,
    runs,
    aggregate,
    verdict
  };

  if (options.writeReports !== false) {
    await writeTriangulationReports(triangulationResult, options.outputDir ?? DEFAULT_OUTPUT_DIR);
  }

  return triangulationResult;
}

async function writeTriangulationReports(result: TriangulationResult, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'triangulation.json');
  await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));

  const mermaidPath = path.join(outputDir, 'triangulation.mmd');
  await fs.writeFile(mermaidPath, renderTriangulationMermaid(result));
}

function computeDominanceRatio(baseline: RunResult, learning: RunResult): number {
  const total = Math.min(baseline.trajectory.length, learning.trajectory.length);
  if (total === 0) {
    return 0;
  }
  let dominant = 0;
  for (let i = 0; i < total; i += 1) {
    if (learning.trajectory[i].cumulativeGMV >= baseline.trajectory[i].cumulativeGMV) {
      dominant += 1;
    }
  }
  return Number((dominant / total).toFixed(6));
}

function buildAggregate(runs: TriangulationRunSummary[]): TriangulationAggregate {
  const gmvValues = runs.map((run) => run.gmvLift);
  const roiValues = runs.map((run) => run.roiLift);
  const autonomyValues = runs.map((run) => run.autonomyLift);
  const dominanceValues = runs.map((run) => run.dominanceRatio);

  const baselineGMVTotal = runs.reduce((acc, run) => acc + run.baselineGMV, 0);
  const learningGMVTotal = runs.reduce((acc, run) => acc + run.learningGMV, 0);
  const baselineCost = runs.reduce(
    (acc, run) => acc + computeCostFromGMVAndROI(run.baselineGMV, run.baselineROI),
    0
  );
  const learningCost = runs.reduce(
    (acc, run) => acc + computeCostFromGMVAndROI(run.learningGMV, run.learningROI),
    0
  );

  const combinedLift = safeRatio(learningGMVTotal, baselineGMVTotal);
  const combinedROI = safeRatio(learningGMVTotal / Math.max(learningCost, 1e-9), baselineGMVTotal / Math.max(baselineCost, 1e-9));

  return {
    gmv: computeStats(gmvValues),
    roi: computeStats(roiValues),
    autonomy: computeStats(autonomyValues),
    dominanceMean: dominanceValues.length
      ? Number((dominanceValues.reduce((acc, value) => acc + value, 0) / dominanceValues.length).toFixed(6))
      : 0,
    successRatio: runs.length
      ? Number((runs.filter((run) => run.gmvLift > 1 && run.roiLift >= 1).length / runs.length).toFixed(6))
      : 0,
    combinedGMV: {
      baseline: Number(baselineGMVTotal.toFixed(6)),
      learning: Number(learningGMVTotal.toFixed(6)),
      lift: combinedLift
    },
    combinedROI
  };
}

function buildVerdict(runs: TriangulationRunSummary[], aggregate: TriangulationAggregate): TriangulationVerdict {
  const gmvPositive = aggregate.gmv.min > 1;
  const roiPositive = aggregate.roi.min >= 1;
  const autonomyPositive = aggregate.autonomy.min >= 1;
  const flaggedSeeds = runs
    .filter((run) => run.gmvLift <= 1 || run.roiLift < 1 || run.autonomyLift < 1)
    .map((run) => run.seed);

  const consensusRatio = aggregate.successRatio;
  const confidenceScore = Number(((consensusRatio * 0.6 + aggregate.dominanceMean * 0.4)).toFixed(6));

  const notes: string[] = [];
  if (!gmvPositive) {
    notes.push('GMV lift dipped below parity on at least one seed.');
  }
  if (!roiPositive) {
    notes.push('ROI fell below baseline on at least one seed.');
  }
  if (!autonomyPositive) {
    notes.push('Autonomy lift regressed on at least one seed.');
  }
  if (!notes.length) {
    notes.push('All seeds delivered compounding lift across GMV, ROI, and autonomy.');
  }

  return {
    gmvPositive,
    roiPositive,
    autonomyPositive,
    consensusRatio,
    dominanceMean: aggregate.dominanceMean,
    combinedLift: aggregate.combinedGMV.lift,
    confidenceScore,
    flaggedSeeds,
    notes
  };
}

function renderTriangulationMermaid(result: TriangulationResult): string {
  const lines: string[] = [
    '%% Triangulation consensus graph',
    'graph TD',
    `  Scenario[${escapeMermaidLabel(result.scenarioName)}] --> Consensus[GMV Consensus ${(result.aggregate.successRatio * 100).toFixed(1)}%]`
  ];
  result.runs.forEach((run, index) => {
    const seedNode = `Seed${index}`;
    lines.push(
      `  Scenario --> ${seedNode}[Seed ${run.seed}\\nGMV ${(run.gmvLift).toFixed(3)}x\\nROI ${(run.roiLift).toFixed(3)}x]`
    );
    lines.push(
      `  ${seedNode} --> ${seedNode}Dominance[Dominance ${(run.dominanceRatio * 100).toFixed(1)}%]`
    );
  });
  lines.push(
    `  Consensus --> Verdict[Confidence ${(result.verdict.confidenceScore * 100).toFixed(1)}%]`
  );
  return lines.join('\n');
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/[`"\\]/g, '');
}

function computeStats(values: number[]): StatSummary {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0, standardDeviation: 0 };
  }
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
  return {
    mean: Number(mean.toFixed(6)),
    min: Number(min.toFixed(6)),
    max: Number(max.toFixed(6)),
    standardDeviation: Number(Math.sqrt(variance).toFixed(6))
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function safeRatio(a: number, b: number): number {
  if (b === 0) {
    return a === 0 ? 1 : Number(a.toFixed(6));
  }
  return Number((a / b).toFixed(6));
}

function computeCostFromGMVAndROI(gmv: number, roi: number): number {
  if (roi === 0) {
    return 0;
  }
  return Number((gmv / roi).toFixed(6));
}

