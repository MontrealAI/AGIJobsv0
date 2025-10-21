import { readFile } from "fs/promises";
import path from "path";
import {
  OPERATION_TYPES,
  applyPipeline,
  isOperationType,
  mutateOperation,
  operationEnergy,
  createOperation,
  randomOperation,
  signature,
  summarisePipeline,
  type OperationInstance,
  type OperationType,
} from "./operations";
import { DeterministicRandom } from "./random";
import type {
  ArchiveCell,
  CandidateMetrics,
  CandidateRecord,
  GenerationSnapshot,
  MissionConfig,
  MissionParameters,
  OwnerControlCoverage,
  SynthesisRun,
  TaskDefinition,
  TaskResult,
  TaskExample,
  TaskThermodynamics,
  TriangulationReport,
  VerificationPerspective,
} from "./types";
import { ensureMissionValidity } from "./validation";

const SEED_LIBRARY: Record<string, OperationInstance[]> = {
  "arc-sentinel": [
    { type: "difference", params: {} },
    { type: "threshold", params: { threshold: 0.5, high: 3 } },
  ],
  "ledger-harmonics": [
    { type: "cumulative", params: {} },
    { type: "mod", params: { modulus: 5 } },
    { type: "offset", params: { value: 2 } },
  ],
  "nova-weave": [
    { type: "power", params: { exponent: 2 } },
    { type: "offset", params: { value: 1 } },
    { type: "scale", params: { factor: 2 } },
  ],
};

const OPERATION_ALLOWLIST: Record<string, OperationType[]> = {
  "arc-sentinel": ["difference", "threshold", "scale", "mirror", "offset"],
  "ledger-harmonics": ["cumulative", "mod", "offset", "scale", "mirror"],
  "nova-weave": ["power", "offset", "scale", "mod", "mirror"],
};

const MAX_GENERATION_LOGS = 24;

let candidateIdCounter = 0;

function nextCandidateId(taskId: string, generation: number): string {
  candidateIdCounter += 1;
  return `${taskId}-g${generation}-c${candidateIdCounter}`;
}

interface PipelineAssessment {
  metrics: CandidateMetrics;
  produced: number[][];
}

function clonePipeline(operations: OperationInstance[]): OperationInstance[] {
  return operations.map((operation) => ({ type: operation.type, params: { ...operation.params } }));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2147483647;
  }
  return hash === 0 ? 1 : hash;
}

function deterministicOperation(type: OperationType, seed: number): OperationInstance {
  const rng = new DeterministicRandom(Math.abs(seed) + 137);
  return createOperation(type, rng);
}

function buildBaselinePipeline(task: TaskDefinition, mission: MissionConfig): OperationInstance[] {
  const seeded = SEED_LIBRARY[task.id];
  if (seeded && seeded.length > 0) {
    return clonePipeline(seeded);
  }

  const hints = (task.pipelineHint ?? []).filter(isOperationType);
  if (hints.length === 0) {
    return [];
  }

  const maxOperations = Math.max(
    1,
    Math.min(mission.parameters.maxOperations, task.constraints?.maxOperations ?? mission.parameters.maxOperations),
  );
  const baseSeed =
    hashString(`${task.id}|${mission.meta.title}|${mission.meta.ownerAddress}|${mission.parameters.seed}`) +
    mission.parameters.generations * 97;
  return hints.slice(0, maxOperations).map((type, index) => deterministicOperation(type, baseSeed + index * 131));
}

function bucketValue(value: number, buckets: number[]): number {
  if (buckets.length === 0) {
    return value;
  }
  for (const bucket of buckets) {
    if (value <= bucket) {
      return bucket;
    }
  }
  return buckets[buckets.length - 1];
}

function computeMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function flattenExamples(examples: TaskExample[]): number[] {
  const values: number[] = [];
  for (const example of examples) {
    values.push(...example.expected);
  }
  return values;
}

function computeNormalizer(values: number[]): number {
  if (values.length === 0) {
    return 1;
  }
  const sum = values.reduce((acc, value) => acc + Math.abs(value), 0);
  return Math.max(1, sum + values.length);
}

function assessPipeline(
  operations: OperationInstance[],
  task: TaskDefinition,
  mission: MissionParameters,
): PipelineAssessment {
  const produced: number[][] = [];
  let totalError = 0;
  let comparisons = 0;
  let successfulExamples = 0;

  for (const example of task.examples) {
    const output = applyPipeline(operations, example.input);
    produced.push(output);
    const length = Math.max(output.length, example.expected.length);
    let exampleSuccess = true;
    for (let index = 0; index < length; index += 1) {
      const expectedValue = Number.isFinite(example.expected[index]) ? example.expected[index] : 0;
      const actualValue = Number.isFinite(output[index]) ? output[index] : 0;
      const diff = Math.abs(actualValue - expectedValue);
      totalError += diff;
      comparisons += Math.abs(expectedValue) + 1;
      if (diff > 0.05) {
        exampleSuccess = false;
      }
    }
    if (exampleSuccess) {
      successfulExamples += 1;
    }
  }

  const normalizer = comparisons > 0 ? comparisons : computeNormalizer(flattenExamples(task.examples));
  const accuracy = Math.max(0, 1 - totalError / normalizer);
  const coverage = task.examples.length > 0 ? successfulExamples / task.examples.length : 0;

  const energy = operations.reduce((acc, operation) => acc + operationEnergy(operation), 0);
  const expectedEnergy = task.constraints?.expectedEnergy ?? mission.energyBudget / Math.max(1, mission.generations);
  const energyDelta = Math.abs(energy - expectedEnergy) / (expectedEnergy + 1);

  const uniqueOperationTypes = new Set(operations.map((operation) => operation.type)).size;
  const operationNovelty = operations.length > 0 ? uniqueOperationTypes / operations.length : 0;

  const flattenedOutputs = produced.flat();
  const mean = flattenedOutputs.length
    ? flattenedOutputs.reduce((acc, value) => acc + value, 0) / flattenedOutputs.length
    : 0;
  const variance = flattenedOutputs.length
    ? flattenedOutputs.reduce((acc, value) => acc + (value - mean) ** 2, 0) / flattenedOutputs.length
    : 0;
  const outputNovelty = flattenedOutputs.length ? Math.min(1, Math.sqrt(variance) / (Math.abs(mean) + 1)) : 0;
  const novelty = Math.min(1, operationNovelty * 0.55 + outputNovelty * 0.45);

  const score =
    accuracy * 100 +
    novelty * 18 +
    coverage * 22 -
    energyDelta * 14 +
    Math.max(0, (mission.noveltyTarget - Math.abs(mission.noveltyTarget - novelty)) * 9);

  const metrics: CandidateMetrics = {
    score,
    accuracy,
    error: totalError,
    energy,
    novelty,
    coverage,
    operationsUsed: operations.length,
  };

  return { metrics, produced };
}

function evaluateStability(
  operations: OperationInstance[],
  task: TaskDefinition,
  rng: DeterministicRandom,
): { averageDeviation: number; maxDeviation: number; samples: number } {
  const baselineOutputs = task.examples.map((example) => applyPipeline(operations, example.input));
  let totalDeviation = 0;
  let maxDeviation = 0;
  let samples = 0;

  for (let exampleIndex = 0; exampleIndex < task.examples.length; exampleIndex += 1) {
    const example = task.examples[exampleIndex];
    const baseline = baselineOutputs[exampleIndex] ?? [];
    for (let trial = 0; trial < 4; trial += 1) {
      const jitteredInput = example.input.map((value) => {
        const amplitude = Math.max(0.08, Math.abs(value) * 0.12 + 0.08);
        return rng.perturb(value, amplitude, {
          min: value - amplitude * 1.25,
          max: value + amplitude * 1.25,
        });
      });
      const jitteredOutput = applyPipeline(operations, jitteredInput);
      const length = Math.max(jitteredOutput.length, baseline.length);
      for (let index = 0; index < length; index += 1) {
        const baseValue = Number.isFinite(baseline[index]) ? baseline[index] : 0;
        const jitterValue = Number.isFinite(jitteredOutput[index]) ? jitteredOutput[index] : 0;
        const deviation = Math.abs(jitterValue - baseValue);
        totalDeviation += deviation;
        maxDeviation = Math.max(maxDeviation, deviation);
        samples += 1;
      }
    }
  }

  const averageDeviation = samples > 0 ? totalDeviation / samples : 0;
  return { averageDeviation, maxDeviation, samples };
}

function evaluateCandidate(
  operations: OperationInstance[],
  task: TaskDefinition,
  mission: MissionParameters,
  generation: number,
): CandidateRecord {
  const assessment = assessPipeline(operations, task, mission);
  return {
    id: nextCandidateId(task.id, generation),
    operations: clonePipeline(operations),
    metrics: assessment.metrics,
    produced: assessment.produced,
    generation,
  };
}

function triangulateCandidate(
  candidate: CandidateRecord,
  task: TaskDefinition,
  mission: MissionConfig,
  elites: CandidateRecord[],
  seed: number,
): TriangulationReport {
  const perspectiveRng = new DeterministicRandom(Math.abs(seed) + hashString(candidate.id));
  const perspectives: VerificationPerspective[] = [];

  const replay = assessPipeline(candidate.operations, task, mission.parameters);
  const scoreDelta = Math.abs(replay.metrics.score - candidate.metrics.score);
  const accuracyDelta = Math.abs(replay.metrics.accuracy - candidate.metrics.accuracy);
  const noveltyDelta = Math.abs(replay.metrics.novelty - candidate.metrics.novelty);
  const energyDelta = Math.abs(replay.metrics.energy - candidate.metrics.energy);
  const consistencyPass =
    scoreDelta <= 0.05 && accuracyDelta <= 0.001 && noveltyDelta <= 0.005 && energyDelta <= 1.5;
  perspectives.push({
    id: "consistency",
    label: "Deterministic replay",
    method: "Independent recomputation of pipeline metrics to detect hidden state drift.",
    passed: consistencyPass,
    confidence: 0.3,
    scoreDelta,
    accuracyDelta,
    noveltyDelta,
    energyDelta,
    notes: consistencyPass ? undefined : "Replay metrics deviated beyond tolerance bounds.",
  });

  const baselinePipeline = buildBaselinePipeline(task, mission);
  let baselineImprovement = candidate.metrics.score;
  let baselineScore = 0;
  let baselineNotes = "Baseline unavailable; mission seeds satisfied by evolved pipeline.";
  if (baselinePipeline.length > 0) {
    const baselineAssessment = assessPipeline(baselinePipeline, task, mission.parameters);
    baselineScore = baselineAssessment.metrics.score;
    baselineImprovement = candidate.metrics.score - baselineScore;
    baselineNotes = `Seed score ${baselineScore.toFixed(2)} → improvement ${baselineImprovement.toFixed(2)}`;
  }
  const baselinePass =
    baselinePipeline.length === 0 || baselineImprovement >= Math.max(3, baselineScore * 0.03);
  perspectives.push({
    id: "baseline",
    label: "Baseline dominance",
    method: "Compare against deterministic seed pipeline from mission hints.",
    passed: baselinePass,
    confidence: 0.25,
    scoreDelta: baselineImprovement,
    notes: baselineNotes,
  });

  const stability = evaluateStability(candidate.operations, task, perspectiveRng);
  const stabilityPass = stability.averageDeviation <= 0.85 && stability.maxDeviation <= 4.5;
  perspectives.push({
    id: "stability",
    label: "Adversarial jitter",
    method: "Inject bounded noise into inputs and compare to baseline outputs for resilience.",
    passed: stabilityPass,
    confidence: 0.25,
    scoreDelta: Number.parseFloat(stability.averageDeviation.toFixed(4)),
    notes: `Average deviation ${stability.averageDeviation.toFixed(3)}, max ${stability.maxDeviation.toFixed(
      3,
    )} across ${stability.samples} samples`,
  });

  const allowedTypes =
    task.constraints?.preferredOperations?.filter(isOperationType) ??
    OPERATION_ALLOWLIST[task.id] ??
    OPERATION_TYPES;
  const disallowed = candidate.operations.find((operation) => !allowedTypes.includes(operation.type));
  const expectedEnergy =
    task.constraints?.expectedEnergy ?? mission.parameters.energyBudget / Math.max(1, mission.parameters.generations);
  const guardEnergyDelta = Math.abs(candidate.metrics.energy - expectedEnergy);
  const energyTolerance = Math.max(expectedEnergy * 0.35, 18);
  const peerScores = elites.map((peer) => peer.metrics.score);
  const peerMedian = computeMedian(peerScores.length ? peerScores : [candidate.metrics.score]);
  const guardPass =
    !disallowed && guardEnergyDelta <= energyTolerance && candidate.metrics.score >= peerMedian - 0.5;
  perspectives.push({
    id: "governance",
    label: "Constraint & peer safety",
    method: "Enforce allowlisted operations, thermodynamic alignment, and elite dominance checks.",
    passed: guardPass,
    confidence: 0.2,
    energyDelta: guardEnergyDelta,
    notes: disallowed
      ? `Operation ${disallowed.type} outside allowlist`
      : `Peer median ${peerMedian.toFixed(2)} • energy delta ${guardEnergyDelta.toFixed(2)} (≤ ${energyTolerance.toFixed(2)})`,
  });

  const totalWeight = perspectives.reduce((acc, perspective) => acc + perspective.confidence, 0);
  const achievedWeight = perspectives
    .filter((perspective) => perspective.passed)
    .reduce((acc, perspective) => acc + perspective.confidence, 0);
  const confidence = totalWeight > 0 ? achievedWeight / totalWeight : 0;
  const passed = perspectives.filter((perspective) => perspective.passed).length;
  let consensus: TriangulationReport["consensus"];
  if (passed === perspectives.length) {
    consensus = "confirmed";
  } else if (confidence >= 0.65 && passed >= perspectives.length - 1) {
    consensus = "attention";
  } else {
    consensus = "rejected";
  }

  return {
    candidateId: candidate.id,
    consensus,
    confidence,
    passed,
    total: perspectives.length,
    perspectives,
  };
}

function evaluateThermodynamics(candidate: CandidateRecord, task: TaskDefinition): TaskThermodynamics {
  const target = Math.max(0, task.owner.thermodynamicTarget);
  const actualEnergy = candidate.metrics.energy;
  const delta = Math.abs(actualEnergy - target);
  const tolerance = Math.max(target * 0.15, 8);
  const normaliser = target + tolerance + 1;
  const alignment = normaliser > 0 ? Math.max(0, 1 - delta / normaliser) : 1;
  let status: TaskThermodynamics["status"];
  if (delta <= tolerance) {
    status = "aligned";
  } else if (delta <= tolerance * 1.75) {
    status = "monitor";
  } else {
    status = "drift";
  }
  return { target, actualEnergy, delta, tolerance, alignment, status };
}

function crossoverPipeline(
  parentA: OperationInstance[],
  parentB: OperationInstance[],
  rng: DeterministicRandom,
  maxOperations: number,
): OperationInstance[] {
  if (parentA.length === 0) {
    return clonePipeline(parentB).slice(0, maxOperations);
  }
  if (parentB.length === 0) {
    return clonePipeline(parentA).slice(0, maxOperations);
  }
  const pivotA = rng.nextInt(Math.max(1, parentA.length));
  const pivotB = rng.nextInt(Math.max(1, parentB.length));
  const left = parentA.slice(0, pivotA + 1);
  const right = parentB.slice(pivotB);
  const merged = [...left, ...right];
  return merged.slice(0, Math.max(1, Math.min(maxOperations, merged.length)));
}

function mutatePipeline(
  pipeline: OperationInstance[],
  rng: DeterministicRandom,
  maxOperations: number,
  allowed?: OperationType[],
): OperationInstance[] {
  let next = clonePipeline(pipeline);
  const shouldAdd = rng.next() < 0.24 && next.length < maxOperations;
  const shouldRemove = rng.next() < 0.18 && next.length > 1;

  if (shouldAdd) {
    next.push(randomOperation(rng, { allowedTypes: allowed }));
  }
  if (shouldRemove) {
    const indexToRemove = rng.nextInt(next.length);
    next = next.filter((_, index) => index !== indexToRemove);
  }
  if (next.length === 0) {
    next.push(randomOperation(rng, { allowedTypes: allowed }));
  }
  const indexToMutate = rng.nextInt(next.length);
  next[indexToMutate] = mutateOperation(next[indexToMutate], rng, { allowedTypes: allowed });
  return next.slice(0, maxOperations);
}

function initialisePopulation(
  task: TaskDefinition,
  mission: MissionParameters,
  rng: DeterministicRandom,
): OperationInstance[][] {
  const maxOperations = Math.max(1, Math.min(mission.maxOperations, task.constraints?.maxOperations ?? mission.maxOperations));
  const preferred = task.constraints?.preferredOperations?.filter(isOperationType);
  const allowlist = preferred && preferred.length > 0 ? preferred : OPERATION_ALLOWLIST[task.id] ?? OPERATION_TYPES;
  const population: OperationInstance[][] = [];

  const seed = SEED_LIBRARY[task.id];
  if (seed) {
    population.push(clonePipeline(seed).slice(0, maxOperations));
  }

  while (population.length < mission.populationSize) {
    const length = Math.max(1, rng.nextInt(maxOperations) + 1);
    const operations: OperationInstance[] = [];
    for (let index = 0; index < length; index += 1) {
      operations.push(randomOperation(rng, { allowedTypes: allowlist }));
    }
    population.push(operations);
  }

  return population;
}

function recordArchive(
  archive: Map<string, ArchiveCell>,
  candidate: CandidateRecord,
  mission: MissionConfig,
): void {
  const complexityBucket = bucketValue(
    candidate.metrics.operationsUsed,
    mission.qualityDiversity.complexityBuckets,
  );
  const noveltyBucket = bucketValue(
    Math.round(candidate.metrics.novelty * 100) / 100,
    mission.qualityDiversity.noveltyBuckets,
  );
  const energyBucket = bucketValue(candidate.metrics.energy, mission.qualityDiversity.energyBuckets);
  const key = `${complexityBucket}|${noveltyBucket}|${energyBucket}`;
  const existing = archive.get(key);
  if (!existing || existing.candidate.metrics.score < candidate.metrics.score) {
    archive.set(key, {
      key,
      features: {
        complexity: complexityBucket,
        novelty: noveltyBucket,
        energy: energyBucket,
      },
      candidate,
    });
  }
}

function summariseGeneration(
  generation: number,
  evaluated: CandidateRecord[],
  snapshots: GenerationSnapshot[],
): void {
  const sorted = [...evaluated].sort((a, b) => b.metrics.score - a.metrics.score);
  const bestScore = sorted[0]?.metrics.score ?? 0;
  const meanScore =
    evaluated.length === 0
      ? 0
      : evaluated.reduce((acc, candidate) => acc + candidate.metrics.score, 0) / evaluated.length;
  const medianScore =
    evaluated.length === 0
      ? 0
      : sorted[Math.floor(evaluated.length / 2)]?.metrics.score ?? sorted[sorted.length - 1]?.metrics.score ?? 0;
  const uniqueSignatures = new Set(evaluated.map((candidate) => candidate.operations.map(signature).join("|"))).size;
  const diversity = evaluated.length > 0 ? uniqueSignatures / evaluated.length : 0;
  const eliteScore = sorted.slice(0, 3).reduce((acc, candidate) => acc + candidate.metrics.score, 0) / Math.max(1, Math.min(3, sorted.length));

  snapshots.push({
    generation,
    bestScore,
    meanScore,
    medianScore,
    diversity,
    eliteScore,
    timestamp: new Date().toISOString(),
  });

  if (snapshots.length > MAX_GENERATION_LOGS) {
    snapshots.shift();
  }
}

function runTask(
  task: TaskDefinition,
  mission: MissionConfig,
  globalSeed: number,
): TaskResult {
  const rng = new DeterministicRandom(globalSeed);
  const maxOperations = Math.max(1, Math.min(mission.parameters.maxOperations, task.constraints?.maxOperations ?? mission.parameters.maxOperations));
  const preferred = task.constraints?.preferredOperations?.filter(isOperationType);
  const allowedTypes = preferred && preferred.length > 0 ? preferred : OPERATION_ALLOWLIST[task.id] ?? OPERATION_TYPES;
  const archive = new Map<string, ArchiveCell>();
  const history: GenerationSnapshot[] = [];

  let population = initialisePopulation(task, mission.parameters, rng);
  let evaluated = population.map((operations) => evaluateCandidate(operations, task, mission.parameters, 0));
  evaluated.forEach((candidate) => recordArchive(archive, candidate, mission));
  summariseGeneration(0, evaluated, history);

  let globalBest = evaluated[0];

  for (let generation = 1; generation <= mission.parameters.generations; generation += 1) {
    const sorted = [...evaluated].sort((a, b) => b.metrics.score - a.metrics.score);
    const elites = sorted.slice(0, Math.max(1, mission.parameters.eliteCount));
    const nextPopulation: OperationInstance[][] = elites.map((candidate) => clonePipeline(candidate.operations));

    while (nextPopulation.length < mission.parameters.populationSize) {
      const useCrossover = rng.next() < mission.parameters.crossoverRate && elites.length >= 2;
      if (useCrossover) {
        const parentA = rng.pick(elites).operations;
        const parentB = rng.pick(elites).operations;
        const child = crossoverPipeline(parentA, parentB, rng, maxOperations);
        nextPopulation.push(child);
      } else {
        const parent = rng.pick(sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.6)))).operations;
        const child = mutatePipeline(parent, rng, maxOperations, allowedTypes);
        nextPopulation.push(child);
      }
    }

    population = nextPopulation.slice(0, mission.parameters.populationSize);
    evaluated = population.map((operations) => evaluateCandidate(operations, task, mission.parameters, generation));
    evaluated.forEach((candidate) => recordArchive(archive, candidate, mission));
    summariseGeneration(generation, evaluated, history);

    const best = evaluated.reduce((acc, candidate) => (candidate.metrics.score > acc.metrics.score ? candidate : acc), evaluated[0]);
    if (!globalBest || best.metrics.score > globalBest.metrics.score) {
      globalBest = best;
    }
  }

  const finalSorted = [...evaluated].sort((a, b) => b.metrics.score - a.metrics.score);
  const elites = finalSorted.slice(0, Math.max(3, mission.parameters.eliteCount));
  const triangulation = triangulateCandidate(globalBest, task, mission, elites, globalSeed);
  const thermodynamics = evaluateThermodynamics(globalBest, task);

  return {
    task,
    bestCandidate: globalBest,
    elites,
    history,
    archive: Array.from(archive.values()).sort((a, b) => b.candidate.metrics.score - a.candidate.metrics.score),
    triangulation,
    thermodynamics,
  };
}

export async function loadMissionConfig(
  filePath: string,
): Promise<{ mission: MissionConfig; coverage: OwnerControlCoverage }> {
  const resolved = path.resolve(filePath);
  const raw = await readFile(resolved, "utf8");
  const parsed = JSON.parse(raw) as MissionConfig;
  const coverage = ensureMissionValidity(parsed);
  return { mission: parsed, coverage };
}

export function runMetaSynthesis(mission: MissionConfig, coverage?: OwnerControlCoverage): SynthesisRun {
  const generatedAt = new Date().toISOString();
  candidateIdCounter = 0;
  const ownerCoverage = coverage ?? ensureMissionValidity(mission);

  const tasks: TaskResult[] = mission.tasks.map((task, index) => {
    const seedOffset = mission.parameters.seed + index * 9973;
    return runTask(task, mission, seedOffset);
  });

  const globalBest = tasks
    .map((task) => task.bestCandidate.metrics.score)
    .reduce((acc, value) => Math.max(acc, value), 0);
  const averageAccuracy =
    tasks.reduce((acc, task) => acc + task.bestCandidate.metrics.accuracy, 0) / Math.max(1, tasks.length);
  const energyUsage =
    tasks.reduce((acc, task) => acc + task.bestCandidate.metrics.energy, 0) / Math.max(1, tasks.length);
  const noveltyScore =
    tasks.reduce((acc, task) => acc + task.bestCandidate.metrics.novelty, 0) / Math.max(1, tasks.length);
  const coverageScore =
    tasks.reduce((acc, task) => acc + task.bestCandidate.metrics.coverage, 0) / Math.max(1, tasks.length);
  const triangulationConfidence =
    tasks.reduce((acc, task) => acc + task.triangulation.confidence, 0) / Math.max(1, tasks.length);
  const consensusCounts = tasks.reduce<Record<"confirmed" | "attention" | "rejected", number>>(
    (acc, task) => {
      acc[task.triangulation.consensus] += 1;
      return acc;
    },
    { confirmed: 0, attention: 0, rejected: 0 },
  );
  const thermodynamicStats = tasks.reduce(
    (
      acc,
      task,
    ): {
      alignmentSum: number;
      deltaSum: number;
      maxDelta: number;
      counts: { aligned: number; monitor: number; drift: number };
    } => {
      acc.alignmentSum += task.thermodynamics.alignment;
      acc.deltaSum += task.thermodynamics.delta;
      acc.maxDelta = Math.max(acc.maxDelta, task.thermodynamics.delta);
      acc.counts[task.thermodynamics.status] += 1;
      return acc;
    },
    {
      alignmentSum: 0,
      deltaSum: 0,
      maxDelta: 0,
      counts: { aligned: 0, monitor: 0, drift: 0 },
    },
  );

  return {
    mission,
    generatedAt,
    parameters: mission.parameters,
    tasks,
    ownerCoverage,
    aggregate: {
      globalBestScore: globalBest,
      averageAccuracy,
      energyUsage,
      noveltyScore,
      coverageScore,
      triangulationConfidence,
      consensus: consensusCounts,
      thermodynamics: {
        averageAlignment: thermodynamicStats.alignmentSum / Math.max(1, tasks.length),
        meanDelta: thermodynamicStats.deltaSum / Math.max(1, tasks.length),
        maxDelta: thermodynamicStats.maxDelta,
        statusCounts: thermodynamicStats.counts,
      },
    },
  };
}

export function renderCandidateNarrative(candidate: CandidateRecord): string {
  const lines = ["Pipeline:", ...summarisePipeline(candidate.operations)];
  lines.push(
    `Metrics → score ${candidate.metrics.score.toFixed(2)}, accuracy ${(candidate.metrics.accuracy * 100).toFixed(2)}%, ` +
      `energy ${candidate.metrics.energy.toFixed(2)}, novelty ${(candidate.metrics.novelty * 100).toFixed(1)}%, ` +
      `coverage ${(candidate.metrics.coverage * 100).toFixed(1)}%`,
  );
  return lines.join("\n");
}
