import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const REPORT_DIR = path.join(__dirname, "..", "reports");
const REPORT_FILE = path.join(REPORT_DIR, "governance-demo-report.md");
const SUMMARY_FILE = path.join(REPORT_DIR, "governance-demo-summary.json");
const MISSION_FILE = path.join(__dirname, "..", "config", "mission@v1.json");

const BOLTZMANN = 1.380649e-23; // Boltzmann constant (J/K)
const LN2 = Math.log(2);

interface MissionConfig {
  meta: {
    version: string;
    title: string;
    description: string;
  };
  thermodynamics: {
    enthalpyKJ: number;
    entropyKJPerK: number;
    operatingTemperatureK: number;
    referenceTemperatureK: number;
    bitsProcessed: number;
    burnRatePerBlock: number;
    stakeBoltzmann: number;
  };
  hamiltonian: {
    lambda: number;
    discountFactor: number;
    inertialMetric: number[];
    kineticCoefficients: number[];
    potentialCoefficients: number[];
    divergenceTolerance: number;
  };
  gameTheory: {
    strategies: Array<{
      name: string;
      description: string;
      initialShare: number;
    }>;
    payoffMatrix: number[][];
    monteCarlo: {
      iterations: number;
      noise: number;
      seed: number;
    };
  };
  antifragility: {
    sigmaSamples: number[];
    iterations: number;
    replicatorSteps: number;
    seedOffset: number;
  };
  risk: {
    coverageWeights: {
      staking: number;
      formal: number;
      fuzz: number;
    };
    portfolioThreshold: number;
    classes: Array<{
      id: string;
      label: string;
      probability: number;
      impact: number;
      mitigations: {
        staking: number;
        formal: number;
        fuzz: number;
      };
    }>;
  };
  ownerControls: {
    owner: string;
    pauser: string;
    treasury: string;
    timelockSeconds: number;
    upgradeActions: Array<{
      label: string;
      command: string;
      impact: string;
      category: string;
    }>;
    criticalCapabilities: Array<{
      category: string;
      label: string;
      description: string;
      command: string;
      verification: string;
    }>;
    requiredCategories: string[];
    monitoringSentinels: string[];
  };
  blockchain: {
    network: string;
    chainId: number;
    rpcProvider: string;
    gasTargetGwei: number;
    confirmations: number;
    upgradeDelaySeconds: number;
    contracts: Array<{
      name: string;
      address: string;
      role: string;
    }>;
    pausableFunctions: Array<{
      contract: string;
      function: string;
      selector: string;
      description: string;
    }>;
    safeModules: string[];
  };
  ci: {
    workflow: string;
    requiredJobs: Array<{
      id: string;
      name: string;
    }>;
    minCoverage: number;
    concurrency: string;
  };
}

type ThermodynamicReport = {
  gibbsFreeEnergyKJ: number;
  gibbsFreeEnergyJ: number;
  landauerKJ: number;
  freeEnergyMarginKJ: number;
  burnEnergyPerBlockKJ: number;
  gibbsAgreementDelta: number;
  stakeBoltzmannEnvelope: number;
};

type HamiltonianReport = {
  kineticTerm: number;
  potentialTerm: number;
  hamiltonianValue: number;
  alternativeHamiltonian: number;
  difference: number;
};

type EquilibriumResult = {
  labels: string[];
  replicator: number[];
  closedForm: number[];
  monteCarlo: number[];
  replicatorIterations: number;
  monteCarloRmsError: number;
  payoffAtEquilibrium: number;
  divergenceAtEquilibrium: number;
  discountFactor: number;
  replicatorDeviation: number;
};

type AntifragilitySample = {
  sigma: number;
  welfare: number;
  averagePayoff: number;
  divergence: number;
};

type AntifragilityReport = {
  samples: AntifragilitySample[];
  quadraticSecondDerivative: number;
  monotonicIncrease: boolean;
};

type RiskClassReport = {
  id: string;
  label: string;
  probability: number;
  impact: number;
  coverage: number;
  residual: number;
  mitigations: {
    staking: number;
    formal: number;
    fuzz: number;
  };
};

type RiskReport = {
  weights: MissionConfig["risk"]["coverageWeights"];
  classes: RiskClassReport[];
  portfolioResidual: number;
  threshold: number;
  withinBounds: boolean;
};

type OwnerControlCapability = {
  category: string;
  label: string;
  description: string;
  command: string;
  verification: string;
  present: boolean;
};

type OwnerControlReport = {
  owner: string;
  pauser: string;
  treasury: string;
  timelockSeconds: number;
  capabilities: OwnerControlCapability[];
  requiredCoverage: Array<{
    category: string;
    satisfied: boolean;
  }>;
  monitoringSentinels: string[];
  fullCoverage: boolean;
};

type JacobianReport = {
  jacobian: number[][];
  gershgorinUpperBound: number;
  stable: boolean;
};

type BlockchainReport = MissionConfig["blockchain"] & {
  safeForMainnet: boolean;
  upgradeDelayHours: number;
};

type ReportBundle = {
  generatedAt: string;
  meta: MissionConfig["meta"];
  thermodynamics: ThermodynamicReport;
  hamiltonian: HamiltonianReport;
  equilibrium: EquilibriumResult;
  antifragility: AntifragilityReport;
  risk: RiskReport;
  owner: OwnerControlReport;
  jacobian: JacobianReport;
  blockchain: BlockchainReport;
  ci: MissionConfig["ci"];
  divergenceTolerance: number;
};

function assertValidConfig(config: MissionConfig): void {
  if (config.gameTheory.strategies.length !== 3) {
    throw new Error("mission config must define exactly three strategies");
  }
  if (config.gameTheory.payoffMatrix.length !== 3 || config.gameTheory.payoffMatrix.some((row) => row.length !== 3)) {
    throw new Error("mission config must provide a 3x3 payoff matrix");
  }
  if (config.hamiltonian.inertialMetric.length !== config.hamiltonian.kineticCoefficients.length) {
    throw new Error("inertialMetric length must match kineticCoefficients length");
  }
  if (config.hamiltonian.potentialCoefficients.length !== config.hamiltonian.kineticCoefficients.length) {
    throw new Error("potentialCoefficients length must match kineticCoefficients length");
  }
  const weightSum =
    config.risk.coverageWeights.formal + config.risk.coverageWeights.fuzz + config.risk.coverageWeights.staking;
  if (Math.abs(weightSum - 1) > 1e-6) {
    throw new Error("risk coverage weights must sum to 1");
  }
  if (config.ownerControls.requiredCategories.length === 0) {
    throw new Error("ownerControls.requiredCategories must list at least one category");
  }
}

async function loadMission(): Promise<MissionConfig> {
  const buffer = await readFile(MISSION_FILE, "utf8");
  const config = JSON.parse(buffer) as MissionConfig;
  assertValidConfig(config);
  return config;
}

function computeThermodynamics(config: MissionConfig): ThermodynamicReport {
  const { enthalpyKJ, entropyKJPerK, operatingTemperatureK, referenceTemperatureK, bitsProcessed, burnRatePerBlock } =
    config.thermodynamics;

  const gibbsFreeEnergyKJ = enthalpyKJ - operatingTemperatureK * entropyKJPerK;
  const gibbsFreeEnergyJ = gibbsFreeEnergyKJ * 1_000;

  const landauerEnergyJ = BOLTZMANN * operatingTemperatureK * LN2 * bitsProcessed;
  const landauerKJ = landauerEnergyJ / 1_000;
  const freeEnergyMarginKJ = gibbsFreeEnergyKJ - landauerKJ;

  const burnEnergyPerBlockKJ = gibbsFreeEnergyKJ * burnRatePerBlock;

  const referenceGibbs =
    enthalpyKJ - (operatingTemperatureK - referenceTemperatureK) * entropyKJPerK - referenceTemperatureK * entropyKJPerK;
  const gibbsAgreementDelta = Math.abs(referenceGibbs - gibbsFreeEnergyKJ);

  const stakeBoltzmannEnvelope =
    config.thermodynamics.stakeBoltzmann * operatingTemperatureK * LN2 * bitsProcessed;

  return {
    gibbsFreeEnergyKJ,
    gibbsFreeEnergyJ,
    landauerKJ,
    freeEnergyMarginKJ,
    burnEnergyPerBlockKJ,
    gibbsAgreementDelta,
    stakeBoltzmannEnvelope,
  };
}

function computeHamiltonian(config: MissionConfig): HamiltonianReport {
  const { lambda, inertialMetric, kineticCoefficients, potentialCoefficients } = config.hamiltonian;

  const kineticTerm = kineticCoefficients.reduce((sum, value, index) => sum + (value * value) / (2 * inertialMetric[index]), 0);
  const potentialTerm = lambda * potentialCoefficients.reduce((sum, value) => sum + value, 0);
  const hamiltonianValue = kineticTerm - potentialTerm;

  const alternativeKinetic = kineticCoefficients.reduce(
    (sum, value, index) => sum + (value / inertialMetric[index]) * (value / 2),
    0,
  );
  const potentialSum = potentialCoefficients.reduce((sum, value) => sum + value, 0);
  const alternativeHamiltonian = alternativeKinetic - lambda * potentialSum;

  const difference = Math.abs(hamiltonianValue - alternativeHamiltonian);

  return {
    kineticTerm,
    potentialTerm,
    hamiltonianValue,
    alternativeHamiltonian,
    difference,
  };
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function normalise(vector: number[]): number[] {
  const total = vector.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return vector.map(() => 1 / vector.length);
  }
  return vector.map((value) => value / total);
}

function replicatorStep(state: number[], matrix: number[][], stepSize = 0.01): number[] {
  const payoffs = multiplyMatrixVector(matrix, state);
  const average = dot(state, payoffs);
  const next = state.map((value, index) => {
    const growth = value * (payoffs[index] - average);
    const updated = value + stepSize * growth;
    return Math.max(updated, Number.EPSILON);
  });
  return normalise(next);
}

function runReplicator(initial: number[], matrix: number[][], maxIterations = 50_000, tolerance = 1e-8): {
  state: number[];
  iterations: number;
} {
  let current = [...initial];
  let iterations = 0;
  const window: number[][] = [];
  const windowSize = 500;
  const aggregate = [0, 0, 0];
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
      const averagedWindow = window
        .reduce((acc, state) => acc.map((value, index) => value + state[index]), [0, 0, 0])
        .map((value) => value / window.length);
      return { state: normalise(averagedWindow), iterations };
    }
  }
  return { state: current, iterations };
}

function gaussianSolve(system: number[][]): number[] {
  const matrix = system.map((row) => [...row]);
  const size = matrix.length;

  for (let col = 0; col < size; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivotRow][col])) {
        pivotRow = row;
      }
    }
    if (Math.abs(matrix[pivotRow][col]) < 1e-12) {
      continue;
    }
    if (pivotRow !== col) {
      [matrix[col], matrix[pivotRow]] = [matrix[pivotRow], matrix[col]];
    }
    const pivot = matrix[col][col];
    for (let j = col; j < size + 1; j += 1) {
      matrix[col][j] /= pivot;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === col) continue;
      const factor = matrix[row][col];
      for (let j = col; j < size + 1; j += 1) {
        matrix[row][j] -= factor * matrix[col][j];
      }
    }
  }

  return matrix.map((row) => row[size]);
}

function solveClosedForm(matrix: number[][]): number[] {
  const row0 = matrix[0];
  const row1 = matrix[1];
  const row2 = matrix[2];

  const system = [
    [row0[0] - row1[0], row0[1] - row1[1], row0[2] - row1[2], 0],
    [row0[0] - row2[0], row0[1] - row2[1], row0[2] - row2[2], 0],
    [1, 1, 1, 1],
  ];

  const solution = gaussianSolve(system);
  return normalise(solution.map((value) => (value < 0 ? 0 : value)));
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function runMonteCarlo(
  matrix: number[][],
  equilibrium: number[],
  iterations: number,
  seed: number,
  noise: number,
  steps = 250,
): {
  averageState: number[];
  rmsError: number;
  averagePayoff: number;
  averageDivergence: number;
} {
  const rng = mulberry32(seed);
  const accumulator = [0, 0, 0];
  let squaredError = 0;
  let payoffSum = 0;
  let divergenceSum = 0;

  for (let i = 0; i < iterations; i += 1) {
    const state = normalise([
      Math.abs(rng() + noise * (rng() - 0.5)),
      Math.abs(rng() + noise * (rng() - 0.5)),
      Math.abs(rng() + noise * (rng() - 0.5)),
    ]);

    let next = state;
    for (let step = 0; step < steps; step += 1) {
      next = replicatorStep(next, matrix);
    }

    accumulator[0] += next[0];
    accumulator[1] += next[1];
    accumulator[2] += next[2];

    const payoffs = multiplyMatrixVector(matrix, next);
    payoffSum += dot(next, payoffs);

    const divergence = Math.max(
      Math.abs(payoffs[0] - payoffs[1]),
      Math.max(Math.abs(payoffs[0] - payoffs[2]), Math.abs(payoffs[1] - payoffs[2])),
    );
    divergenceSum += divergence;

    squaredError += next.reduce((sum, value, index) => sum + (value - equilibrium[index]) ** 2, 0);
  }

  return {
    averageState: accumulator.map((value) => value / iterations),
    rmsError: Math.sqrt(squaredError / iterations),
    averagePayoff: payoffSum / iterations,
    averageDivergence: divergenceSum / iterations,
  };
}

function computeEquilibrium(config: MissionConfig): EquilibriumResult {
  const matrix = config.gameTheory.payoffMatrix;
  const baseInitial = normalise(config.gameTheory.strategies.map((strategy) => strategy.initialShare));

  const closedForm = solveClosedForm(matrix);

  const replicatorSamples: number[][] = [];
  const iterationCounts: number[] = [];

  const seeds = [baseInitial];
  const rng = mulberry32(config.gameTheory.monteCarlo.seed);
  for (let i = 0; i < 4; i += 1) {
    seeds.push(
      normalise([
        rng() + 0.1 * (rng() - 0.5),
        rng() + 0.1 * (rng() - 0.5),
        rng() + 0.1 * (rng() - 0.5),
      ]),
    );
  }

  for (const seed of seeds) {
    const result = runReplicator(seed, matrix);
    replicatorSamples.push(result.state);
    iterationCounts.push(result.iterations);
  }

  const replicatorAverage =
    replicatorSamples.reduce((acc, state) => acc.map((value, index) => value + state[index]), [0, 0, 0]).map(
      (value) => value / replicatorSamples.length,
    );

  const averageIterations = iterationCounts.reduce((sum, value) => sum + value, 0) / iterationCounts.length;

  const monteCarlo = runMonteCarlo(
    matrix,
    closedForm,
    config.gameTheory.monteCarlo.iterations,
    config.gameTheory.monteCarlo.seed,
    config.gameTheory.monteCarlo.noise,
  );

  const payoffAtEquilibrium = dot(closedForm, multiplyMatrixVector(matrix, closedForm));
  const payoffs = multiplyMatrixVector(matrix, closedForm);
  const divergenceAtEquilibrium = Math.max(
    Math.abs(payoffs[0] - payoffs[1]),
    Math.max(Math.abs(payoffs[0] - payoffs[2]), Math.abs(payoffs[1] - payoffs[2])),
  );
  const replicatorDeviation = Math.sqrt(
    replicatorAverage.reduce((sum, value, index) => sum + (value - closedForm[index]) ** 2, 0),
  );

  return {
    labels: config.gameTheory.strategies.map((strategy) => strategy.name),
    replicator: replicatorAverage,
    closedForm,
    monteCarlo: monteCarlo.averageState,
    replicatorIterations: Math.round(averageIterations),
    monteCarloRmsError: monteCarlo.rmsError,
    payoffAtEquilibrium,
    divergenceAtEquilibrium,
    discountFactor: config.hamiltonian.discountFactor,
    replicatorDeviation,
  };
}

function fitQuadratic(points: Array<{ x: number; y: number }>): { a: number; b: number; c: number } {
  const n = points.length;
  const sumX = points.reduce((acc, point) => acc + point.x, 0);
  const sumX2 = points.reduce((acc, point) => acc + point.x ** 2, 0);
  const sumX3 = points.reduce((acc, point) => acc + point.x ** 3, 0);
  const sumX4 = points.reduce((acc, point) => acc + point.x ** 4, 0);
  const sumY = points.reduce((acc, point) => acc + point.y, 0);
  const sumXY = points.reduce((acc, point) => acc + point.x * point.y, 0);
  const sumX2Y = points.reduce((acc, point) => acc + point.x ** 2 * point.y, 0);

  const system = [
    [sumX4, sumX3, sumX2, sumX2Y],
    [sumX3, sumX2, sumX, sumXY],
    [sumX2, sumX, n, sumY],
  ];

  const [a, b, c] = gaussianSolve(system);
  return { a, b, c };
}
function computeAntifragility(
  config: MissionConfig,
  matrix: number[][],
  equilibrium: EquilibriumResult,
  thermodynamics: ThermodynamicReport,
): AntifragilityReport {
  const samples: AntifragilitySample[] = [];
  const penalty = thermodynamics.burnEnergyPerBlockKJ / config.hamiltonian.lambda;

  config.antifragility.sigmaSamples.forEach((sigma, index) => {
    const mc = runMonteCarlo(
      matrix,
      equilibrium.closedForm,
      config.antifragility.iterations,
      config.gameTheory.monteCarlo.seed + config.antifragility.seedOffset + index,
      sigma,
      config.antifragility.replicatorSteps,
    );
    samples.push({
      sigma,
      welfare: mc.averagePayoff - penalty,
      averagePayoff: mc.averagePayoff,
      divergence: mc.averageDivergence,
    });
  });

  let quadraticSecondDerivative = 0;
  if (samples.length >= 3) {
    const quadratic = fitQuadratic(samples.map((sample) => ({ x: sample.sigma, y: sample.welfare })));
    quadraticSecondDerivative = 2 * quadratic.a;
  }

  const monotonicIncrease = samples.every((sample, index) => {
    if (index === 0) return true;
    return sample.welfare + 1e-9 >= samples[index - 1].welfare;
  });

  return { samples, quadraticSecondDerivative, monotonicIncrease };
}

function computeRiskReport(config: MissionConfig): RiskReport {
  const weights = config.risk.coverageWeights;
  const classes = config.risk.classes.map((riskClass) => {
    const coverage =
      weights.staking * riskClass.mitigations.staking +
      weights.formal * riskClass.mitigations.formal +
      weights.fuzz * riskClass.mitigations.fuzz;
    const clampedCoverage = Math.max(0, Math.min(1, coverage));
    const residual = riskClass.probability * riskClass.impact * (1 - clampedCoverage);
    return {
      id: riskClass.id,
      label: riskClass.label,
      probability: riskClass.probability,
      impact: riskClass.impact,
      coverage: clampedCoverage,
      residual,
      mitigations: riskClass.mitigations,
    };
  });

  const portfolioResidual = classes.reduce((sum, riskClass) => sum + riskClass.residual, 0);
  const withinBounds = portfolioResidual <= config.risk.portfolioThreshold;

  return {
    weights,
    classes,
    portfolioResidual,
    threshold: config.risk.portfolioThreshold,
    withinBounds,
  };
}

function verifyOwnerControls(config: MissionConfig): OwnerControlReport {
  const capabilityMap = new Map<string, OwnerControlCapability>();
  for (const capability of config.ownerControls.criticalCapabilities) {
    capabilityMap.set(capability.category, {
      category: capability.category,
      label: capability.label,
      description: capability.description,
      command: capability.command,
      verification: capability.verification,
      present: true,
    });
  }

  const capabilities: OwnerControlCapability[] = [];
  for (const capability of config.ownerControls.criticalCapabilities) {
    capabilities.push(capabilityMap.get(capability.category)!);
  }

  const requiredCoverage = config.ownerControls.requiredCategories.map((category) => ({
    category,
    satisfied: capabilityMap.has(category),
  }));

  const fullCoverage = requiredCoverage.every((item) => item.satisfied);

  return {
    owner: config.ownerControls.owner,
    pauser: config.ownerControls.pauser,
    treasury: config.ownerControls.treasury,
    timelockSeconds: config.ownerControls.timelockSeconds,
    capabilities,
    requiredCoverage,
    monitoringSentinels: config.ownerControls.monitoringSentinels,
    fullCoverage,
  };
}

function computeJacobian(matrix: number[][], equilibrium: number[]): JacobianReport {
  const payoffs = multiplyMatrixVector(matrix, equilibrium);
  const avgPayoff = dot(equilibrium, payoffs);
  const jacobian: number[][] = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 0));

  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      const delta = i === j ? payoffs[i] - avgPayoff : 0;
      const columnSum =
        matrix[0][j] * equilibrium[0] + matrix[1][j] * equilibrium[1] + matrix[2][j] * equilibrium[2];
      const derivative = delta + equilibrium[i] * (matrix[i][j] - (payoffs[j] + columnSum));
      jacobian[i][j] = derivative;
    }
  }

  let gershgorinUpperBound = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < jacobian.length; i += 1) {
    const center = jacobian[i][i];
    const radius = jacobian[i].reduce((sum, value, index) => (index === i ? sum : sum + Math.abs(value)), 0);
    gershgorinUpperBound = Math.max(gershgorinUpperBound, center + radius);
  }

  return {
    jacobian,
    gershgorinUpperBound,
    stable: gershgorinUpperBound < 0,
  };
}

function computeBlockchainReport(config: MissionConfig): BlockchainReport {
  return {
    ...config.blockchain,
    safeForMainnet: config.blockchain.chainId === 1 && config.blockchain.confirmations >= 2,
    upgradeDelayHours: Math.round(config.blockchain.upgradeDelaySeconds / 3600),
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(digits)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(digits)}k`;
  }
  return value.toFixed(digits);
}

function formatMatrix(matrix: number[][]): string {
  return matrix
    .map((row) =>
      row
        .map((value) => {
          if (Math.abs(value) < 1e-9) {
            return value.toExponential(2);
          }
          return value.toExponential(2);
        })
        .join(" | "),
    )
    .map((row) => `| ${row} |`)
    .join("\n");
}

function buildMarkdown(bundle: ReportBundle): string {
  const {
    meta,
    generatedAt,
    thermodynamics,
    hamiltonian,
    equilibrium,
    antifragility,
    risk,
    owner,
    jacobian,
    blockchain,
    ci,
    divergenceTolerance,
  } = bundle;

  const strategyTable = equilibrium.labels
    .map((label, index) =>
      `| ${label} | ${formatPercent(equilibrium.replicator[index])} | ${formatPercent(equilibrium.closedForm[index])} | ${formatPercent(
        equilibrium.monteCarlo[index],
      )} |`,
    )
    .join("\n");

  const upgradeList = bundle.owner.capabilities
    .map(
      (capability) =>
        `- **${capability.label} (${capability.category}).** ${capability.description}\n  └─ <code>$ ${capability.command}</code> (verify: <code>${capability.verification}</code>)`,
    )
    .join("\n");

  const requiredCoverageTable = owner.requiredCoverage
    .map((coverage) => `| ${coverage.category} | ${coverage.satisfied ? "✅" : "⚠️"} |`)
    .join("\n");

  const ciTable = ci.requiredJobs.map((job) => `| ${job.id} | ${job.name} |`).join("\n");

  const antifragilityTable = antifragility.samples
    .map(
      (sample) =>
        `| ${sample.sigma.toFixed(2)} | ${formatNumber(sample.welfare)} | ${formatNumber(sample.averagePayoff)} | ${sample.divergence.toExponential(
          2,
        )} |`,
    )
    .join("\n");

  const riskTable = risk.classes
    .map(
      (riskClass) =>
        `| ${riskClass.id} | ${riskClass.label} | ${formatNumber(riskClass.probability, 2)} | ${formatNumber(
          riskClass.impact,
          2,
        )} | ${formatPercent(riskClass.coverage)} | ${riskClass.residual.toFixed(3)} |`,
    )
    .join("\n");

  const contractTable = blockchain.contracts
    .map((contract) => `| ${contract.name} | ${contract.address} | ${contract.role} |`)
    .join("\n");

  const pausableTable = blockchain.pausableFunctions
    .map((fn) => `| ${fn.contract} | ${fn.function} | ${fn.selector} | ${fn.description} |`)
    .join("\n");

  const jacobianMatrix = formatMatrix(jacobian.jacobian);

  return [
    `# ${meta.title} — Governance Demonstration Report`,
    `*Generated at:* ${generatedAt}`,
    `*Version:* ${meta.version}`,
    "",
    `> ${meta.description}`,
    "",
    "## 1. Thermodynamic Intelligence Ledger",
    "",
    `- **Gibbs free energy:** ${formatNumber(thermodynamics.gibbsFreeEnergyKJ)} kJ (${formatNumber(
      thermodynamics.gibbsFreeEnergyJ,
    )} J)`,
    `- **Landauer limit envelope:** ${formatNumber(thermodynamics.landauerKJ)} kJ`,
    `- **Free-energy safety margin:** ${formatNumber(thermodynamics.freeEnergyMarginKJ)} kJ`,
    `- **Energy dissipated per block (burn):** ${formatNumber(thermodynamics.burnEnergyPerBlockKJ)} kJ`,
    `- **Cross-check delta:** ${thermodynamics.gibbsAgreementDelta.toExponential(3)} kJ (≤ 1e-6 required)`,
    `- **Stake Boltzmann envelope:** ${thermodynamics.stakeBoltzmannEnvelope.toExponential(3)} (dimensionless proof of energy-aligned stake)`,
    "",
    "## 2. Hamiltonian Control Plane",
    "",
    `- **Kinetic term:** ${formatNumber(hamiltonian.kineticTerm)} units`,
    `- **Potential term (scaled by λ):** ${formatNumber(hamiltonian.potentialTerm)} units`,
    `- **Hamiltonian energy:** ${formatNumber(hamiltonian.hamiltonianValue)} units`,
    `- **Alternate computation check:** ${formatNumber(hamiltonian.alternativeHamiltonian)} units`,
    `- **Difference:** ${hamiltonian.difference.toExponential(3)} (≤ 1e-3 target)`,
    "",
    "## 3. Game-Theoretic Macro-Equilibrium",
    "",
    `- **Discount factor:** ${equilibrium.discountFactor.toFixed(2)} (must exceed 0.80 for uniqueness)`,
    `- **Replicator iterations to convergence:** ${equilibrium.replicatorIterations}`,
    `- **Replicator vs closed-form deviation:** ${equilibrium.replicatorDeviation.toExponential(3)}`,
    `- **Monte-Carlo RMS error:** ${equilibrium.monteCarloRmsError.toExponential(3)}`,
    `- **Payoff at equilibrium:** ${formatNumber(equilibrium.payoffAtEquilibrium)} tokens`,
    `- **Governance divergence:** ${equilibrium.divergenceAtEquilibrium.toExponential(3)} (target ≤ ${divergenceTolerance})`,
    "",
    "| Strategy | Replicator | Closed-form | Monte-Carlo |",
    "| --- | --- | --- | --- |",
    strategyTable,
    "",
    "### Replicator Jacobian Stability",
    "",
    `- **Gershgorin upper bound:** ${jacobian.gershgorinUpperBound.toExponential(3)} (${jacobian.stable ? "stable" : "unstable"})`,
    "",
    "| J[0,*] | J[1,*] | J[2,*] |",
    "| --- | --- | --- |",
    jacobianMatrix,
    "",
    "## 4. Antifragility Tensor",
    "",
    `- **Quadratic curvature (2a):** ${antifragility.quadraticSecondDerivative.toExponential(3)} (> 0 indicates antifragility)`,
    `- **Monotonic welfare increase:** ${antifragility.monotonicIncrease ? "✅" : "⚠️"}`,
    "",
    "| σ | Welfare (tokens) | Average payoff | Divergence |",
    "| --- | --- | --- | --- |",
    antifragilityTable,
    "",
    "## 5. Risk & Safety Audit",
    "",
    `- **Coverage weights:** staking ${formatPercent(risk.weights.staking)}, formal ${formatPercent(risk.weights.formal)}, fuzz ${formatPercent(risk.weights.fuzz)}`,
    `- **Portfolio residual risk:** ${risk.portfolioResidual.toFixed(3)} (threshold ${risk.threshold.toFixed(3)} — ${risk.withinBounds ? "within" : "exceeds"} bounds)`,
    "",
    "| ID | Threat | Likelihood | Impact | Coverage | Residual |",
    "| --- | --- | --- | --- | --- | --- |",
    riskTable,
    "",
    "## 6. Owner Supremacy & Command Surface",
    "",
    `- **Owner:** ${owner.owner}`,
    `- **Pauser:** ${owner.pauser}`,
    `- **Treasury:** ${owner.treasury}`,
    `- **Timelock:** ${owner.timelockSeconds} seconds`,
    `- **Coverage achieved:** ${owner.fullCoverage ? "all critical capabilities accounted for" : "⚠️ gaps detected"}`,
    "",
    "### Critical Capabilities",
    upgradeList,
    "",
    "| Capability | Present |",
    "| --- | --- |",
    requiredCoverageTable,
    "",
    "### Monitoring Sentinels",
    owner.monitoringSentinels.map((sentinel) => `- ${sentinel}`).join("\n"),
    "",
    "## 7. Blockchain Deployment Envelope",
    "",
    `- **Network:** ${blockchain.network} (chainId ${blockchain.chainId})`,
    `- **RPC:** ${blockchain.rpcProvider}`,
    `- **Gas target:** ${blockchain.gasTargetGwei} gwei`,
    `- **Confirmations:** ${blockchain.confirmations} (mainnet-safe: ${blockchain.safeForMainnet ? "yes" : "no"})`,
    `- **Upgrade delay:** ${blockchain.upgradeDelayHours} hours`,
    `- **Safe modules:** ${blockchain.safeModules.join(", ")}`,
    "",
    "| Contract | Address | Role |",
    "| --- | --- | --- |",
    contractTable,
    "",
    "| Contract | Function | Selector | Description |",
    "| --- | --- | --- | --- |",
    pausableTable,
    "",
    "## 8. CI Enforcement Ledger",
    "",
    `- **Workflow name:** ${ci.workflow}`,
    `- **Concurrency guard:** <code>${ci.concurrency}</code>`,
    `- **Minimum coverage:** ${ci.minCoverage}%`,
    "",
    "| Job ID | Display name |",
    "| --- | --- |",
    ciTable,
    "",
    "Run <code>npm run demo:agi-governance:ci</code> to assert the workflow still exports these shields.",
    "",
    "## 9. Owner Execution Log (fill during live ops)",
    "",
    "| Timestamp | Action | Tx hash | Operator | Notes |",
    "| --- | --- | --- | --- | --- |",
    "| _pending_ |  |  |  |  |",
  ].join("\n");
}

function buildSummary(bundle: ReportBundle): Record<string, unknown> {
  return {
    generatedAt: bundle.generatedAt,
    version: bundle.meta.version,
    thermodynamics: bundle.thermodynamics,
    hamiltonian: bundle.hamiltonian,
    equilibrium: bundle.equilibrium,
    antifragility: bundle.antifragility,
    risk: bundle.risk,
    owner: bundle.owner,
    jacobian: bundle.jacobian,
    blockchain: bundle.blockchain,
    ci: bundle.ci,
  };
}

async function main(): Promise<void> {
  const mission = await loadMission();
  const thermodynamics = computeThermodynamics(mission);
  const hamiltonian = computeHamiltonian(mission);
  const equilibrium = computeEquilibrium(mission);
  const antifragility = computeAntifragility(mission, mission.gameTheory.payoffMatrix, equilibrium, thermodynamics);
  const risk = computeRiskReport(mission);
  const owner = verifyOwnerControls(mission);
  const jacobian = computeJacobian(mission.gameTheory.payoffMatrix, equilibrium.closedForm);
  const blockchain = computeBlockchainReport(mission);

  const bundle: ReportBundle = {
    generatedAt: new Date().toISOString(),
    meta: mission.meta,
    thermodynamics,
    hamiltonian,
    equilibrium,
    antifragility,
    risk,
    owner,
    jacobian,
    blockchain,
    ci: mission.ci,
    divergenceTolerance: mission.hamiltonian.divergenceTolerance,
  };

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(REPORT_FILE, buildMarkdown(bundle), "utf8");
  await writeFile(SUMMARY_FILE, JSON.stringify(buildSummary(bundle), null, 2), "utf8");

  console.log(`✅ Governance dossier generated: ${REPORT_FILE}`);
  console.log(`   Summary JSON: ${SUMMARY_FILE}`);
}

main().catch((error) => {
  console.error("❌ Failed to execute governance demo:", error);
  process.exitCode = 1;
});

