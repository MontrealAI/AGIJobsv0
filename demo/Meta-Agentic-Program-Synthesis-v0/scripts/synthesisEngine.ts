import { readFile } from "fs/promises";
import path from "path";
import {
  OPERATION_TYPES,
  applyPipeline,
  isOperationType,
  mutateOperation,
  operationEnergy,
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

function clonePipeline(operations: OperationInstance[]): OperationInstance[] {
  return operations.map((operation) => ({ type: operation.type, params: { ...operation.params } }));
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

function evaluateCandidate(
  operations: OperationInstance[],
  task: TaskDefinition,
  mission: MissionParameters,
  generation: number,
): CandidateRecord {
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

  return {
    id: nextCandidateId(task.id, generation),
    operations,
    metrics,
    produced,
    generation,
  };
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

  return {
    task,
    bestCandidate: globalBest,
    elites,
    history,
    archive: Array.from(archive.values()).sort((a, b) => b.candidate.metrics.score - a.candidate.metrics.score),
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
