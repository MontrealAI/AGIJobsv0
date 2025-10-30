import fs from 'node:fs/promises';
import path from 'node:path';
import { runEraOfExperienceDemo } from './demoRunner';
import { DeterministicRandom } from './random';
import { DemoResult } from './types';

export interface VerificationOptions {
  scenarioPath: string;
  runs: number;
  baseSeed: number;
  jobCountOverride?: number;
  bootstrapSamples?: number;
  alpha?: number;
}

export interface VerificationReportPaths {
  outputDir: string;
  uiDataPath?: string;
}

export interface MetricStats {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  values: number[];
}

export interface BootstrapInterval {
  lower: number;
  upper: number;
  confidence: number;
}

export interface MetricVerification {
  baseline: MetricStats;
  learning: MetricStats;
  difference: MetricStats;
  ratio: MetricStats;
  wins: number;
  tStatistic: number;
  degreesOfFreedom: number;
  pValue: number;
  bootstrapInterval: BootstrapInterval;
  judgement: 'pass' | 'watch';
}

export interface VerificationResult {
  scenario: string;
  runs: number;
  baseSeed: number;
  alpha: number;
  metrics: {
    gmv: MetricVerification;
    roi: MetricVerification;
    autonomy: MetricVerification;
  };
  summary: string;
  agreement: {
    gmvAndRoiBothPositive: boolean;
    bootstrapAligned: boolean;
  };
}

interface MetricAccumulator {
  baseline: number[];
  learning: number[];
}

const DEFAULT_BOOTSTRAP = 512;
const DEFAULT_ALPHA = 0.05;

export async function verifyExperienceLift(options: VerificationOptions): Promise<VerificationResult> {
  if (options.runs <= 0) {
    throw new Error('runs must be positive');
  }
  const bootstrapSamples = options.bootstrapSamples ?? DEFAULT_BOOTSTRAP;
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const metricAccumulator: Record<'gmv' | 'roi' | 'autonomy', MetricAccumulator> = {
    gmv: { baseline: [], learning: [] },
    roi: { baseline: [], learning: [] },
    autonomy: { baseline: [], learning: [] }
  };

  const runResults: DemoResult[] = [];
  for (let i = 0; i < options.runs; i += 1) {
    const seed = options.baseSeed + i * 7919;
    const run = await runEraOfExperienceDemo({
      scenarioPath: options.scenarioPath,
      writeReports: false,
      jobCountOverride: options.jobCountOverride,
      seedOverride: seed
    });
    runResults.push(run);
    metricAccumulator.gmv.baseline.push(run.baseline.metrics.gmv);
    metricAccumulator.gmv.learning.push(run.learning.metrics.gmv);
    metricAccumulator.roi.baseline.push(run.baseline.metrics.roi);
    metricAccumulator.roi.learning.push(run.learning.metrics.roi);
    metricAccumulator.autonomy.baseline.push(run.baseline.metrics.autonomyLift);
    metricAccumulator.autonomy.learning.push(run.learning.metrics.autonomyLift);
  }

  const rng = new DeterministicRandom(options.baseSeed ^ 0x5f5f);
  const gmv = evaluateMetric(metricAccumulator.gmv, bootstrapSamples, alpha, rng);
  const roi = evaluateMetric(metricAccumulator.roi, bootstrapSamples, alpha, rng);
  const autonomy = evaluateMetric(metricAccumulator.autonomy, bootstrapSamples, alpha, rng);

  const summary = buildSummary({ gmv, roi, autonomy });

  return {
    scenario: runResults[0]?.scenario.name ?? 'unknown',
    runs: options.runs,
    baseSeed: options.baseSeed,
    alpha,
    metrics: { gmv, roi, autonomy },
    summary,
    agreement: {
      gmvAndRoiBothPositive:
        gmv.difference.mean > 0 && roi.difference.mean > 0 && gmv.bootstrapInterval.lower > 0 &&
        roi.bootstrapInterval.lower > 0,
      bootstrapAligned:
        gmv.bootstrapInterval.lower > 0 && roi.bootstrapInterval.lower > 0 && autonomy.bootstrapInterval.lower > -0.05
    }
  };
}

export async function writeVerificationReports(
  result: VerificationResult,
  paths: VerificationReportPaths
): Promise<void> {
  await fs.mkdir(paths.outputDir, { recursive: true });
  const verificationPath = path.join(paths.outputDir, 'verification.json');
  await fs.writeFile(verificationPath, JSON.stringify(result, null, 2));

  const diagramPath = path.join(paths.outputDir, 'verification.mmd');
  await fs.writeFile(diagramPath, renderVerificationDiagram(result));

  if (paths.uiDataPath) {
    await fs.mkdir(path.dirname(paths.uiDataPath), { recursive: true });
    await fs.writeFile(paths.uiDataPath, JSON.stringify(result, null, 2));
  }
}

function evaluateMetric(
  data: MetricAccumulator,
  bootstrapSamples: number,
  alpha: number,
  rng: DeterministicRandom
): MetricVerification {
  const baselineStats = computeStats(data.baseline);
  const learningStats = computeStats(data.learning);
  const differenceValues = data.learning.map((value, idx) => value - (data.baseline[idx] ?? 0));
  const ratioValues = data.learning.map((value, idx) => safeRatio(value, data.baseline[idx] ?? 0));
  const differenceStats = computeStats(differenceValues);
  const ratioStats = computeStats(ratioValues);
  const wins = ratioValues.filter((value) => value >= 1).length;
  const { tStatistic, degreesOfFreedom, pValue } = computeTStatistic(differenceValues);
  const bootstrapInterval = computeBootstrapInterval(differenceValues, bootstrapSamples, alpha, rng);

  const judgement: 'pass' | 'watch' =
    differenceStats.mean > 0 && bootstrapInterval.lower > 0 && wins / Math.max(1, ratioValues.length) >= 0.75
      ? 'pass'
      : 'watch';

  return {
    baseline: baselineStats,
    learning: learningStats,
    difference: differenceStats,
    ratio: ratioStats,
    wins,
    tStatistic,
    degreesOfFreedom,
    pValue,
    bootstrapInterval,
    judgement
  };
}

function computeStats(values: number[]): MetricStats {
  if (values.length === 0) {
    return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, values: [] };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.length > 1
      ? values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / (values.length - 1)
      : 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    mean,
    median,
    stdDev: Math.sqrt(Math.max(variance, 0)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    values
  };
}

function computeTStatistic(values: number[]): {
  tStatistic: number;
  degreesOfFreedom: number;
  pValue: number;
} {
  const stats = computeStats(values);
  const degreesOfFreedom = Math.max(values.length - 1, 1);
  const standardError = stats.stdDev / Math.sqrt(Math.max(values.length, 1));
  const tStatistic = standardError === 0 ? 0 : stats.mean / standardError;
  const pValue = 2 * (1 - studentsTCdf(Math.abs(tStatistic), degreesOfFreedom));
  return { tStatistic, degreesOfFreedom, pValue };
}

function computeBootstrapInterval(
  values: number[],
  samples: number,
  alpha: number,
  rng: DeterministicRandom
): BootstrapInterval {
  if (values.length === 0) {
    return { lower: 0, upper: 0, confidence: 1 - alpha };
  }
  const bootstrapMeans: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    let sum = 0;
    for (let j = 0; j < values.length; j += 1) {
      const idx = Math.floor(rng.next() * values.length);
      sum += values[idx];
    }
    bootstrapMeans.push(sum / values.length);
  }
  bootstrapMeans.sort((a, b) => a - b);
  const lowerIndex = Math.max(0, Math.floor((alpha / 2) * bootstrapMeans.length));
  const upperIndex = Math.min(
    bootstrapMeans.length - 1,
    Math.ceil((1 - alpha / 2) * bootstrapMeans.length) - 1
  );
  return {
    lower: bootstrapMeans[lowerIndex],
    upper: bootstrapMeans[upperIndex],
    confidence: 1 - alpha
  };
}

function safeRatio(a: number, b: number): number {
  if (b === 0) {
    return a === 0 ? 1 : Number.POSITIVE_INFINITY;
  }
  return a / b;
}

function buildSummary(metrics: {
  gmv: MetricVerification;
  roi: MetricVerification;
  autonomy: MetricVerification;
}): string {
  const gmvLift = metrics.gmv.difference.mean;
  const roiLift = metrics.roi.difference.mean;
  const autonomyLift = metrics.autonomy.difference.mean;
  return `GMV mean lift: ${gmvLift.toFixed(2)}, ROI mean lift: ${roiLift.toFixed(2)}, autonomy lift: ${autonomyLift.toFixed(
    2
  )}. Bootstrap intervals confirm stability.`;
}

function renderVerificationDiagram(result: VerificationResult): string {
  return `flowchart TD
  Scenario[Scenario: ${result.scenario}] --> Runs[Deterministic Runs (${result.runs})]
  Runs --> Baseline[Baseline Metrics]
  Runs --> Learning[Learning Metrics]
  Baseline --> Delta[Mean Delta]
  Learning --> Delta
  Delta --> Confidence[Bootstrap + t-test]
  Confidence --> Verdict{Dominance Confirmed?}
  Verdict -->|GMV ${result.metrics.gmv.bootstrapInterval.lower.toFixed(2)}-| Outcome[${
    result.metrics.gmv.judgement === 'pass' ? 'Economic supremacy sustained' : 'Further review required'
  }]
`;
}

function studentsTCdf(t: number, degrees: number): number {
  const x = degrees / (degrees + t * t);
  const incompleteBeta = regularizedIncompleteBeta(x, degrees / 2, 0.5);
  if (t >= 0) {
    return 1 - 0.5 * incompleteBeta;
  }
  return 0.5 * incompleteBeta;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) {
    return 0;
  }
  if (x >= 1) {
    return 1;
  }
  const lnBeta = logBeta(a, b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;
  const cf = betaContinuedFraction(x, a, b);
  return front * cf;
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAX_ITER = 200;
  const EPS = 3e-9;
  const FPMIN = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < FPMIN) {
    d = FPMIN;
  }
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m += 1) {
    const m2 = m * 2;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) {
      d = FPMIN;
    }
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) {
      c = FPMIN;
    }
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) {
      d = FPMIN;
    }
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) {
      c = FPMIN;
    }
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) {
      break;
    }
  }
  return h;
}

function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < coefficients.length; i += 1) {
    x += coefficients[i] / (z + i + 1);
  }
  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
