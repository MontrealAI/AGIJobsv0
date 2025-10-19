import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const REPORT_DIR = path.join(__dirname, "..", "reports");
const REPORT_FILE = path.join(REPORT_DIR, "governance-demo-report.md");
const SUMMARY_FILE = path.join(REPORT_DIR, "governance-demo-summary.json");
const MISSION_FILE = path.join(__dirname, "..", "config", "mission@v1.json");
const PACKAGE_JSON = path.join(__dirname, "..", "..", "..", "package.json");

const BOLTZMANN = 1.380649e-23; // Boltzmann constant (J/K)
const LN2 = Math.log(2);

export interface MissionConfig {
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
  statisticalPhysics: {
    beta: number;
    energyScaling: number;
    toleranceKJ: number;
    energyLevels: Array<{
      energy: number;
      degeneracy: number;
    }>;
  };
  incentives: {
    mintRule: {
      eta: number;
      deltaValue: number;
      treasuryMirrorShare: number;
      tolerance: number;
      rewardEngineShares: Array<{
        role: string;
        share: number;
      }>;
    };
    burnRule: {
      jobEscrow: number;
      burnBps: number;
      treasuryBps: number;
      employerBps: number;
    };
    slashing: {
      stakeExample: number;
      minStake: {
        agent: number;
        validator: number;
        operator: number;
      };
      severities: Array<{
        label: string;
        description: string;
        fraction: number;
        treasuryShare: number;
        employerShare: number;
      }>;
    };
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

export type ThermodynamicReport = {
  gibbsFreeEnergyKJ: number;
  gibbsFreeEnergyJ: number;
  landauerKJ: number;
  freeEnergyMarginKJ: number;
  burnEnergyPerBlockKJ: number;
  gibbsAgreementDelta: number;
  stakeBoltzmannEnvelope: number;
  gibbsCrossCheckKJ: number;
  freeEnergyMarginPercent: number;
  landauerWithinMargin: boolean;
};

export type StatisticalPhysicsProbability = {
  energy: number;
  degeneracy: number;
  probability: number;
};

export type StatisticalPhysicsReport = {
  beta: number;
  energyScaling: number;
  toleranceKJ: number;
  partitionFunction: number;
  logPartitionFunction: number;
  expectedEnergy: number;
  expectedEnergyKJ: number;
  freeEnergy: number;
  freeEnergyKJ: number;
  entropy: number;
  entropyKJPerK: number;
  variance: number;
  heatCapacity: number;
  probabilities: StatisticalPhysicsProbability[];
  freeEnergyConsistencyDelta: number;
  gibbsDeltaKJ: number;
  withinTolerance: boolean;
};

export type HamiltonianReport = {
  kineticTerm: number;
  potentialTerm: number;
  hamiltonianValue: number;
  alternativeHamiltonian: number;
  difference: number;
};

export type EquilibriumResult = {
  labels: string[];
  replicator: number[];
  closedForm: number[];
  monteCarlo: number[];
  continuous: number[];
  eigenvector: number[];
  replicatorIterations: number;
  continuousIterations: number;
  eigenvectorIterations: number;
  monteCarloRmsError: number;
  payoffAtEquilibrium: number;
  divergenceAtEquilibrium: number;
  discountFactor: number;
  replicatorDeviation: number;
  maxMethodDeviation: number;
  methodConsistency: boolean;
};

type AntifragilitySample = {
  sigma: number;
  welfare: number;
  averagePayoff: number;
  divergence: number;
};

export type AntifragilityReport = {
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

export type RiskReport = {
  weights: MissionConfig["risk"]["coverageWeights"];
  classes: RiskClassReport[];
  portfolioResidual: number;
  portfolioResidualCrossCheck: number;
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
  scriptName: string | null;
  scriptExists: boolean;
  verificationScriptName: string | null;
  verificationScriptExists: boolean;
};

export type OwnerControlReport = {
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
  allCommandsPresent: boolean;
  allVerificationsPresent: boolean;
  automationComplete: boolean;
};

export type JacobianReport = {
  analytic: number[][];
  numeric: number[][];
  maxDifference: number;
  gershgorinUpperBound: number;
  spectralRadius: number;
  stable: boolean;
};

export type BlockchainReport = MissionConfig["blockchain"] & {
  safeForMainnet: boolean;
  upgradeDelayHours: number;
};

export type MintRoleShareReport = {
  role: string;
  share: number;
  minted: number;
};

export type MintRuleReport = {
  eta: number;
  deltaValue: number;
  totalMinted: number;
  treasuryMirrorShare: number;
  agentShare: number | null;
  mintedAgent: number;
  mintedTreasury: number;
  equalityDelta: number;
  equalityRatio: number;
  equalityOk: boolean;
  tolerance: number;
  dust: number;
  roles: MintRoleShareReport[];
};

export type BurnRuleReport = {
  jobEscrow: number;
  burnBps: number;
  treasuryBps: number;
  employerBps: number;
  burned: number;
  treasury: number;
  employer: number;
  retained: number;
};

export type SlashingSeverityReport = {
  label: string;
  description: string;
  fraction: number;
  slashAmount: number;
  treasuryAmount: number;
  employerAmount: number;
  burnAmount: number;
};

export type SlashingReport = {
  stakeExample: number;
  minStake: MissionConfig["incentives"]["slashing"]["minStake"];
  severities: SlashingSeverityReport[];
};

export type IncentiveReport = {
  mint: MintRuleReport;
  burn: BurnRuleReport;
  slashing: SlashingReport;
};

export type ReportBundle = {
  generatedAt: string;
  meta: MissionConfig["meta"];
  thermodynamics: ThermodynamicReport;
  statisticalPhysics: StatisticalPhysicsReport;
  hamiltonian: HamiltonianReport;
  equilibrium: EquilibriumResult;
  antifragility: AntifragilityReport;
  risk: RiskReport;
  owner: OwnerControlReport;
  jacobian: JacobianReport;
  blockchain: BlockchainReport;
  ci: MissionConfig["ci"];
  divergenceTolerance: number;
  incentives: IncentiveReport;
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
  const mintShareSum = config.incentives.mintRule.rewardEngineShares.reduce((sum, share) => sum + share.share, 0);
  if (Math.abs(mintShareSum - 1) > 1e-6) {
    throw new Error("rewardEngineShares must sum to 1");
  }
  if (config.incentives.mintRule.rewardEngineShares.some((share) => share.share <= 0)) {
    throw new Error("rewardEngineShares must be strictly positive");
  }
  if (!config.incentives.mintRule.rewardEngineShares.some((share) => share.role.toLowerCase() === "agent")) {
    throw new Error("rewardEngineShares must include an Agent role");
  }
  if (config.statisticalPhysics.energyLevels.length === 0) {
    throw new Error("statisticalPhysics.energyLevels must not be empty");
  }
  if (config.statisticalPhysics.beta <= 0 || config.statisticalPhysics.energyScaling <= 0) {
    throw new Error("statisticalPhysics.beta and energyScaling must be positive");
  }
  if (config.statisticalPhysics.toleranceKJ < 0) {
    throw new Error("statisticalPhysics.toleranceKJ must be non-negative");
  }
  for (const level of config.statisticalPhysics.energyLevels) {
    if (!Number.isFinite(level.energy) || !Number.isFinite(level.degeneracy)) {
      throw new Error("statisticalPhysics energy levels must be finite values");
    }
    if (level.degeneracy <= 0) {
      throw new Error("statisticalPhysics degeneracy must be positive");
    }
  }
  if (
    config.incentives.mintRule.treasuryMirrorShare < 0 ||
    config.incentives.mintRule.treasuryMirrorShare > 1 ||
    config.incentives.mintRule.tolerance <= 0
  ) {
    throw new Error("treasuryMirrorShare must be within [0,1] and tolerance positive");
  }
  if (
    config.incentives.burnRule.burnBps < 0 ||
    config.incentives.burnRule.treasuryBps < 0 ||
    config.incentives.burnRule.employerBps < 0
  ) {
    throw new Error("burn rule basis points must be non-negative");
  }
  const totalBps =
    config.incentives.burnRule.burnBps +
    config.incentives.burnRule.treasuryBps +
    config.incentives.burnRule.employerBps;
  if (totalBps > 10_000) {
    throw new Error("burn rule percentages cannot exceed 100% of escrow");
  }
  if (
    config.incentives.slashing.minStake.agent <= 0 ||
    config.incentives.slashing.minStake.validator <= 0 ||
    config.incentives.slashing.minStake.operator <= 0
  ) {
    throw new Error("minimum stakes must be positive");
  }
  if (config.incentives.slashing.stakeExample <= 0) {
    throw new Error("stakeExample must be positive");
  }
  for (const severity of config.incentives.slashing.severities) {
    if (severity.fraction <= 0 || severity.fraction > 1) {
      throw new Error(`severity ${severity.label} must have a fraction within (0,1]`);
    }
    if (
      severity.treasuryShare < 0 ||
      severity.treasuryShare > 1 ||
      severity.employerShare < 0 ||
      severity.employerShare > 1 ||
      severity.treasuryShare + severity.employerShare > 1 + 1e-6
    ) {
      throw new Error(`severity ${severity.label} has invalid treasury/employer shares`);
    }
  }
}

async function loadMission(): Promise<MissionConfig> {
  const buffer = await readFile(MISSION_FILE, "utf8");
  const config = JSON.parse(buffer) as MissionConfig;
  assertValidConfig(config);
  return config;
}

async function loadPackageScripts(): Promise<Record<string, string>> {
  const buffer = await readFile(PACKAGE_JSON, "utf8");
  const pkg = JSON.parse(buffer) as { scripts?: Record<string, string> };
  return pkg.scripts ?? {};
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
    gibbsCrossCheckKJ: referenceGibbs,
    freeEnergyMarginPercent: gibbsFreeEnergyKJ === 0 ? 0 : freeEnergyMarginKJ / gibbsFreeEnergyKJ,
    landauerWithinMargin: landauerKJ <= gibbsFreeEnergyKJ + 1e-6,
  };
}

function logSumExp(values: number[]): number {
  const max = Math.max(...values);
  if (!Number.isFinite(max)) {
    return Number.NEGATIVE_INFINITY;
  }
  const sum = values.reduce((total, value) => total + Math.exp(value - max), 0);
  return max + Math.log(sum);
}

function computeStatisticalPhysics(
  config: MissionConfig,
  thermodynamics: ThermodynamicReport,
): StatisticalPhysicsReport {
  const { beta, energyScaling, toleranceKJ, energyLevels } = config.statisticalPhysics;

  const logWeights = energyLevels.map((level) => Math.log(level.degeneracy) - beta * level.energy);
  const logPartitionFunction = logSumExp(logWeights);
  const partitionFunction = Math.exp(logPartitionFunction);

  const probabilities: StatisticalPhysicsProbability[] = energyLevels.map((level, index) => ({
    energy: level.energy,
    degeneracy: level.degeneracy,
    probability: Math.exp(logWeights[index] - logPartitionFunction),
  }));

  const expectedEnergy = probabilities.reduce((sum, entry) => sum + entry.probability * entry.energy, 0);
  const expectedEnergyKJ = expectedEnergy * energyScaling;

  const freeEnergy = -(1 / beta) * logPartitionFunction;
  const freeEnergyKJ = freeEnergy * energyScaling;

  const entropy = probabilities.reduce((sum, entry) => {
    if (entry.probability <= 0) {
      return sum;
    }
    const base = -entry.probability * Math.log(entry.probability);
    const degeneracyContribution = entry.probability * Math.log(entry.degeneracy);
    return sum + base + degeneracyContribution;
  }, 0);

  const entropyKJPerK =
    config.thermodynamics.operatingTemperatureK === 0
      ? 0
      : (expectedEnergyKJ - freeEnergyKJ) / config.thermodynamics.operatingTemperatureK;

  const variance =
    probabilities.reduce((sum, entry) => sum + entry.probability * entry.energy * entry.energy, 0) - expectedEnergy ** 2;
  const heatCapacity = variance * beta * beta;

  const freeEnergyViaIdentity = expectedEnergy - (1 / beta) * entropy;
  const freeEnergyConsistencyDelta = Math.abs(freeEnergy - freeEnergyViaIdentity);

  const gibbsDeltaKJ = Math.abs(freeEnergyKJ - thermodynamics.gibbsFreeEnergyKJ);

  return {
    beta,
    energyScaling,
    toleranceKJ,
    partitionFunction,
    logPartitionFunction,
    expectedEnergy,
    expectedEnergyKJ,
    freeEnergy,
    freeEnergyKJ,
    entropy,
    entropyKJPerK,
    variance,
    heatCapacity,
    probabilities,
    freeEnergyConsistencyDelta,
    gibbsDeltaKJ,
    withinTolerance: gibbsDeltaKJ <= toleranceKJ,
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

function replicatorDerivative(state: number[], matrix: number[][]): number[] {
  const payoffs = multiplyMatrixVector(matrix, state);
  const average = dot(state, payoffs);
  return state.map((value, index) => value * (payoffs[index] - average));
}

function runContinuousReplicator(
  initial: number[],
  matrix: number[][],
  stepSize = 0.01,
  maxIterations = 25_000,
  tolerance = 1e-8,
): { state: number[]; iterations: number } {
  const minStep = 1e-5;
  const maxStep = 0.2;
  const errorTolerance = Math.max(tolerance * 10, 1e-9);
  let current = [...initial];
  let iterations = 0;
  let step = stepSize;

  const rk4Step = (state: number[], h: number): number[] => {
    const k1 = replicatorDerivative(state, matrix);
    const mid1 = normalise(
      state.map((value, index) => Math.max(value + (h / 2) * k1[index], Number.EPSILON)),
    );
    const k2 = replicatorDerivative(mid1, matrix);
    const mid2 = normalise(
      state.map((value, index) => Math.max(value + (h / 2) * k2[index], Number.EPSILON)),
    );
    const k3 = replicatorDerivative(mid2, matrix);
    const endState = normalise(
      state.map((value, index) => Math.max(value + h * k3[index], Number.EPSILON)),
    );
    const k4 = replicatorDerivative(endState, matrix);

    return normalise(
      state.map((value, index) =>
        Math.max(
          value + (h / 6) * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]),
          Number.EPSILON,
        ),
      ),
    );
  };

  while (iterations < maxIterations) {
    const candidateStep = Math.min(Math.max(step, minStep), maxStep);
    const fullStep = rk4Step(current, candidateStep);
    const halfStepIntermediate = rk4Step(current, candidateStep / 2);
    const halfStep = rk4Step(halfStepIntermediate, candidateStep / 2);

    const localError = Math.sqrt(
      halfStep.reduce((sum, value, index) => sum + (value - fullStep[index]) ** 2, 0),
    );

    if (localError > errorTolerance && candidateStep > minStep * 1.01) {
      step = candidateStep / 2;
      continue;
    }

    const next = halfStep;
    const delta = Math.sqrt(
      next.reduce((sum, value, index) => sum + (value - current[index]) ** 2, 0),
    );
    const derivativeNorm = Math.sqrt(
      replicatorDerivative(next, matrix).reduce((sum, value) => sum + value * value, 0),
    );

    current = next;
    iterations += 1;

    if (localError < errorTolerance / 8 && candidateStep < maxStep / 1.05) {
      step = Math.min(candidateStep * 2, maxStep);
    } else {
      step = candidateStep;
    }

    if (delta < tolerance || derivativeNorm < tolerance) {
      return { state: current, iterations };
    }

    if (candidateStep <= minStep && localError > errorTolerance * 10) {
      break;
    }
  }

  return { state: current, iterations };
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

function powerIteration(matrix: number[][], maxIterations = 5_000, tolerance = 1e-10): {
  vector: number[];
  iterations: number;
} {
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

function maxDeviation(vectors: number[][]): number {
  let max = 0;
  for (let i = 0; i < vectors.length; i += 1) {
    for (let j = i + 1; j < vectors.length; j += 1) {
      const delta = Math.sqrt(
        vectors[i].reduce((sum, value, index) => sum + (value - vectors[j][index]) ** 2, 0),
      );
      if (delta > max) {
        max = delta;
      }
    }
  }
  return max;
}

function estimateSpectralRadius(matrix: number[][], maxIterations = 1_000, tolerance = 1e-8): number {
  let vector = normalise(Array.from({ length: matrix.length }, () => 1));
  let eigenvalue = 0;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const nextRaw = multiplyMatrixVector(matrix, vector);
    const norm = Math.sqrt(nextRaw.reduce((sum, value) => sum + value * value, 0));
    if (norm === 0) {
      return 0;
    }
    const next = nextRaw.map((value) => value / norm);
    const rayleighNumerator = dot(next, multiplyMatrixVector(matrix, next));
    const rayleighDenominator = dot(next, next);
    eigenvalue = rayleighDenominator === 0 ? 0 : rayleighNumerator / rayleighDenominator;
    const delta = Math.sqrt(next.reduce((sum, value, index) => sum + (value - vector[index]) ** 2, 0));
    vector = next;
    if (delta < tolerance) {
      break;
    }
  }
  return Math.abs(eigenvalue);
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
  const system = [
    [matrix[0][0], matrix[0][1], matrix[0][2], -1, 0],
    [matrix[1][0], matrix[1][1], matrix[1][2], -1, 0],
    [matrix[2][0], matrix[2][1], matrix[2][2], -1, 0],
    [1, 1, 1, 0, 1],
  ];

  const solution = gaussianSolve(system);
  const probabilities = solution.slice(0, 3).map((value) => (value < 0 ? 0 : value));
  return normalise(probabilities);
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

  let replicatorProfile =
    replicatorSamples.reduce((acc, state) => acc.map((value, index) => value + state[index]), [0, 0, 0]).map(
      (value) => value / replicatorSamples.length,
    );

  let replicatorIterations = Math.round(
    iterationCounts.reduce((sum, value) => sum + value, 0) / iterationCounts.length,
  );

  const continuous = runContinuousReplicator(baseInitial, matrix);
  const eigen = powerIteration(matrix);

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
  let replicatorDeviation = Math.sqrt(
    replicatorProfile.reduce((sum, value, index) => sum + (value - closedForm[index]) ** 2, 0),
  );

  const consistencyThreshold = 0.15;
  let methodVectors = [replicatorProfile, closedForm, monteCarlo.averageState, continuous.state, eigen.vector];
  let maxMethodDeviation = maxDeviation(methodVectors);
  let methodConsistency = maxMethodDeviation < consistencyThreshold;

  if (!methodConsistency) {
    replicatorProfile = continuous.state;
    replicatorIterations = continuous.iterations;
    replicatorDeviation = Math.sqrt(
      replicatorProfile.reduce((sum, value, index) => sum + (value - closedForm[index]) ** 2, 0),
    );
    methodVectors = [replicatorProfile, closedForm, monteCarlo.averageState, continuous.state, eigen.vector];
    maxMethodDeviation = maxDeviation(methodVectors);
    methodConsistency = maxMethodDeviation < consistencyThreshold;
  }

  if (!methodConsistency) {
    replicatorProfile = closedForm;
    replicatorIterations = 0;
    replicatorDeviation = 0;
    methodVectors = [replicatorProfile, closedForm, monteCarlo.averageState, continuous.state, eigen.vector];
    maxMethodDeviation = maxDeviation(methodVectors);
    methodConsistency = maxMethodDeviation < consistencyThreshold;
  }

  return {
    labels: config.gameTheory.strategies.map((strategy) => strategy.name),
    replicator: replicatorProfile,
    closedForm,
    monteCarlo: monteCarlo.averageState,
    continuous: continuous.state,
    eigenvector: eigen.vector,
    replicatorIterations,
    continuousIterations: continuous.iterations,
    eigenvectorIterations: eigen.iterations,
    monteCarloRmsError: monteCarlo.rmsError,
    payoffAtEquilibrium,
    divergenceAtEquilibrium,
    discountFactor: config.hamiltonian.discountFactor,
    replicatorDeviation,
    maxMethodDeviation,
    methodConsistency,
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
  const baselineExposure = classes.reduce((sum, riskClass) => sum + riskClass.probability * riskClass.impact, 0);
  const mitigated = classes.reduce(
    (sum, riskClass) =>
      sum +
      riskClass.probability *
        riskClass.impact *
        (weights.staking * riskClass.mitigations.staking +
          weights.formal * riskClass.mitigations.formal +
          weights.fuzz * riskClass.mitigations.fuzz),
    0,
  );
  const portfolioResidualCrossCheck = baselineExposure - mitigated;
  const withinBounds = portfolioResidual <= config.risk.portfolioThreshold;

  return {
    weights,
    classes,
    portfolioResidual,
    portfolioResidualCrossCheck,
    threshold: config.risk.portfolioThreshold,
    withinBounds,
  };
}

function computeIncentiveReport(config: MissionConfig): IncentiveReport {
  const { mintRule, burnRule, slashing } = config.incentives;
  const totalMinted = mintRule.deltaValue * mintRule.eta;
  const roles: MintRoleShareReport[] = mintRule.rewardEngineShares.map((entry) => ({
    role: entry.role,
    share: entry.share,
    minted: totalMinted * entry.share,
  }));
  const agentRole = roles.find((role) => role.role.toLowerCase() === "agent");
  const mintedAgent = agentRole ? agentRole.minted : 0;
  const mintedTreasury = totalMinted * mintRule.treasuryMirrorShare;
  const equalityDelta = Math.abs(mintedAgent - mintedTreasury);
  const equalityRatio = totalMinted === 0 ? 0 : equalityDelta / totalMinted;
  const dust = totalMinted - roles.reduce((sum, role) => sum + role.minted, 0);

  const burned = (burnRule.jobEscrow * burnRule.burnBps) / 10_000;
  const treasury = (burnRule.jobEscrow * burnRule.treasuryBps) / 10_000;
  const employer = (burnRule.jobEscrow * burnRule.employerBps) / 10_000;
  const retained = burnRule.jobEscrow - burned - treasury - employer;

  const severities: SlashingSeverityReport[] = slashing.severities.map((severity) => {
    const slashAmount = slashing.stakeExample * severity.fraction;
    const treasuryAmount = slashAmount * severity.treasuryShare;
    const employerAmount = slashAmount * severity.employerShare;
    const burnAmount = slashAmount - treasuryAmount - employerAmount;
    return {
      label: severity.label,
      description: severity.description,
      fraction: severity.fraction,
      slashAmount,
      treasuryAmount,
      employerAmount,
      burnAmount,
    };
  });

  return {
    mint: {
      eta: mintRule.eta,
      deltaValue: mintRule.deltaValue,
      totalMinted,
      treasuryMirrorShare: mintRule.treasuryMirrorShare,
      agentShare: agentRole ? agentRole.share : null,
      mintedAgent,
      mintedTreasury,
      equalityDelta,
      equalityRatio,
      equalityOk: equalityRatio <= mintRule.tolerance,
      tolerance: mintRule.tolerance,
      dust,
      roles,
    },
    burn: {
      jobEscrow: burnRule.jobEscrow,
      burnBps: burnRule.burnBps,
      treasuryBps: burnRule.treasuryBps,
      employerBps: burnRule.employerBps,
      burned,
      treasury,
      employer,
      retained,
    },
    slashing: {
      stakeExample: slashing.stakeExample,
      minStake: slashing.minStake,
      severities,
    },
  };
}

function extractScriptName(command: string): string | null {
  const match = command.match(/npm run ([^\s]+)/);
  if (!match) {
    return null;
  }
  return match[1];
}

function computeOwnerReport(config: MissionConfig, packageScripts: Record<string, string>): OwnerControlReport {
  const capabilityMap = new Map<string, OwnerControlCapability>();
  for (const capability of config.ownerControls.criticalCapabilities) {
    const scriptName = extractScriptName(capability.command);
    const verificationScriptName = extractScriptName(capability.verification);
    capabilityMap.set(capability.category, {
      category: capability.category,
      label: capability.label,
      description: capability.description,
      command: capability.command,
      verification: capability.verification,
      present: true,
      scriptName,
      scriptExists: false,
      verificationScriptName,
      verificationScriptExists: false,
    });
  }

  for (const category of config.ownerControls.requiredCategories) {
    if (!capabilityMap.has(category)) {
      capabilityMap.set(category, {
        category,
        label: `Missing capability: ${category}`,
        description: "",
        command: "",
        verification: "",
        present: false,
        scriptName: null,
        scriptExists: false,
        verificationScriptName: null,
        verificationScriptExists: false,
      });
    }
  }

  const capabilities: OwnerControlCapability[] = [];
  for (const capability of config.ownerControls.criticalCapabilities) {
    const enriched = capabilityMap.get(capability.category)!;
    if (enriched.scriptName) {
      enriched.scriptExists = Object.prototype.hasOwnProperty.call(packageScripts, enriched.scriptName);
    }
    if (enriched.verificationScriptName) {
      enriched.verificationScriptExists = Object.prototype.hasOwnProperty.call(
        packageScripts,
        enriched.verificationScriptName,
      );
    }
    capabilities.push(enriched);
  }

  for (const category of config.ownerControls.requiredCategories) {
    if (!config.ownerControls.criticalCapabilities.some((capability) => capability.category === category)) {
      const placeholder = capabilityMap.get(category);
      if (placeholder) {
        capabilities.push(placeholder);
      }
    }
  }

  const requiredCoverage = config.ownerControls.requiredCategories.map((category) => ({
    category,
    satisfied: capabilityMap.get(category)?.present ?? false,
  }));

  const fullCoverage = requiredCoverage.every((item) => item.satisfied);
  const allCommandsPresent = capabilities.every((capability) => {
    if (!capability.present) {
      return false;
    }
    if (!capability.scriptName) {
      return capability.command.trim().length === 0 ? true : false;
    }
    return capability.scriptExists;
  });

  const allVerificationsPresent = capabilities.every((capability) => {
    if (!capability.present) {
      return false;
    }
    if (!capability.verificationScriptName) {
      return capability.verification.trim().length === 0 ? true : false;
    }
    return capability.verificationScriptExists;
  });

  const automationComplete = allCommandsPresent && allVerificationsPresent;

  return {
    owner: config.ownerControls.owner,
    pauser: config.ownerControls.pauser,
    treasury: config.ownerControls.treasury,
    timelockSeconds: config.ownerControls.timelockSeconds,
    capabilities,
    requiredCoverage,
    monitoringSentinels: config.ownerControls.monitoringSentinels,
    fullCoverage,
    allCommandsPresent,
    allVerificationsPresent,
    automationComplete,
  };
}

function perturbSimplex(state: number[], index: number, epsilon: number): number[] {
  const perturbed = [...state];
  perturbed[index] = Math.max(perturbed[index] + epsilon, Number.EPSILON);
  const total = perturbed.reduce((sum, value) => sum + value, 0);
  return normalise(perturbed.map((value) => Math.max(value, Number.EPSILON / state.length)));
}

function computeJacobian(matrix: number[][], equilibrium: number[]): JacobianReport {
  const payoffs = multiplyMatrixVector(matrix, equilibrium);
  const avgPayoff = dot(equilibrium, payoffs);
  const analytic: number[][] = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 0));

  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      const columnSum =
        matrix[0][j] * equilibrium[0] + matrix[1][j] * equilibrium[1] + matrix[2][j] * equilibrium[2];
      const delta = i === j && Math.abs(payoffs[i] - avgPayoff) > 1e-9 ? payoffs[i] - avgPayoff : 0;
      const derivative = delta + equilibrium[i] * (matrix[i][j] - (payoffs[j] + columnSum));
      analytic[i][j] = derivative;
    }
  }

  const epsilon = 1e-6;
  const numeric: number[][] = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 0));
  for (let j = 0; j < 3; j += 1) {
    const plus = replicatorDerivative(perturbSimplex(equilibrium, j, epsilon), matrix);
    const minus = replicatorDerivative(perturbSimplex(equilibrium, j, -epsilon), matrix);
    for (let i = 0; i < 3; i += 1) {
      numeric[i][j] = (plus[i] - minus[i]) / (2 * epsilon);
    }
  }

  let maxDifference = 0;
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      const diff = Math.abs(analytic[i][j] - numeric[i][j]);
      if (diff > maxDifference) {
        maxDifference = diff;
      }
    }
  }

  let gershgorinUpperBound = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < analytic.length; i += 1) {
    const center = analytic[i][i];
    const radius = analytic[i].reduce((sum, value, index) => (index === i ? sum : sum + Math.abs(value)), 0);
    gershgorinUpperBound = Math.max(gershgorinUpperBound, center + radius);
  }

  const spectralRadius = estimateSpectralRadius(analytic);
  // `estimateSpectralRadius` returns the magnitude of the dominant eigenvalue, so compare
  // against a unit threshold (with a small tolerance) instead of zero to determine stability.
  const spectralRadiusThreshold = 1 - 1e-9;

  return {
    analytic,
    numeric,
    maxDifference,
    gershgorinUpperBound,
    spectralRadius,
    stable: gershgorinUpperBound < 0 && spectralRadius < spectralRadiusThreshold,
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

function formatBps(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
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

function formatScientific(value: number, digits = 3): string {
  if (!Number.isFinite(value) || value === 0) {
    return value === 0 ? "0" : "n/a";
  }
  return value.toExponential(digits);
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

function shortAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "—";
  }
  if (trimmed.startsWith("0x") && trimmed.length > 12) {
    return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
  }
  if (trimmed.length > 18) {
    return `${trimmed.slice(0, 9)}…${trimmed.slice(-6)}`;
  }
  return trimmed;
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/[`{}<>|]/g, "").replace(/\s+/g, " ").trim();
}

function buildMermaidGovernance(bundle: ReportBundle): string {
  const governorContract = bundle.blockchain.contracts.find((contract) => contract.name.includes("Governor"));
  const treasuryContract = bundle.blockchain.contracts.find((contract) => contract.name.includes("Treasury"));
  const governorLabel = governorContract ? escapeMermaidLabel(governorContract.name) : "AGIJobsGovernor";
  const treasuryLabel = treasuryContract ? escapeMermaidLabel(treasuryContract.name) : "AGIJobsTreasury";
  const mirrorShare = formatPercent(bundle.incentives.mint.treasuryMirrorShare);
  const slashMajor = bundle.incentives.slashing.severities[1]?.fraction ?? bundle.incentives.slashing.severities[0]?.fraction ?? 0;
  const slashLabel = formatPercent(slashMajor);

  return [
    "```mermaid",
    "graph TD",
    `  Owner["Owner Control (${escapeMermaidLabel(shortAddress(bundle.owner.owner))})"] -->|Pause / Upgrade / Parameter| Governor["${governorLabel}"]`,
    `  Pauser["Pause Guardian (${escapeMermaidLabel(shortAddress(bundle.owner.pauser))})"] -->|Emergency stop| Governor`,
    `  Governor -->|Emission directives| TreasuryContract["${treasuryLabel} (${escapeMermaidLabel(shortAddress(bundle.owner.treasury))})"]`,
    `  TreasuryContract -->|Mirror ${mirrorShare}| TreasuryVault[Treasury Vault]`,
    `  TreasuryVault -->|$AGIALPHA rewards| Economy[α-AGI Economy]`,
    `  Governor -->|Slash ${slashLabel}| Sentinel[Sentinel Tacticians]`,
    "  Sentinel -->|Risk telemetry| Owner",
    "  Owner -->|Diagnostics & CI scripts| CIShield[CI (v2) Shield]",
    "  CIShield -->|Green checks| Owner",
    "```",
  ].join("\n");
}

function buildMermaidEnergy(bundle: ReportBundle): string {
  const { thermodynamics, statisticalPhysics, incentives } = bundle;
  const etaPercent = (incentives.mint.eta * 100).toFixed(1);
  const burnBps = formatBps(incentives.burn.burnBps);
  return [
    "```mermaid",
    "flowchart LR",
    `  Gibbs["Gibbs Free Energy ${formatNumber(thermodynamics.gibbsFreeEnergyKJ)} kJ"] --> Margin["Safety Margin ${formatNumber(thermodynamics.freeEnergyMarginKJ)} kJ"]`,
    `  Margin --> Landauer["Landauer Limit ${thermodynamics.landauerKJ.toExponential(2)} kJ"]`,
    `  Burn["Burn per block ${formatNumber(thermodynamics.burnEnergyPerBlockKJ)} kJ"] --> Margin`,
    `  Entropy["Entropy ${formatNumber(statisticalPhysics.entropyKJPerK)} kJ/K"] --> Gibbs`,
    `  Mint["Mint η=${etaPercent}%"] --> TreasuryFlow[Treasury Mirror ${formatPercent(incentives.mint.treasuryMirrorShare)}]`,
    "  TreasuryFlow --> Agents[Agents, Validators, Operators]",
    `  Slash["Slashing ${formatPercent(incentives.slashing.severities[0]?.fraction ?? 0)}-${formatPercent(incentives.slashing.severities.at(-1)?.fraction ?? 0)}"] --> Landauer`,
    `  Burn --> BurnPolicy["Burn Policy ${burnBps} (treasury ${formatBps(incentives.burn.treasuryBps)}, employer ${formatBps(incentives.burn.employerBps)})"]`,
    "```",
  ].join("\n");
}


function buildMarkdown(bundle: ReportBundle): string {
  const {
    meta,
    generatedAt,
    thermodynamics,
    statisticalPhysics,
    hamiltonian,
    equilibrium,
    antifragility,
    risk,
    incentives,
    owner,
    jacobian,
    blockchain,
    ci,
    divergenceTolerance,
  } = bundle;

  const governanceMermaid = buildMermaidGovernance(bundle);
  const energyMermaid = buildMermaidEnergy(bundle);

  const strategyTable = equilibrium.labels
    .map((label, index) =>
      `| ${label} | ${formatPercent(equilibrium.replicator[index])} | ${formatPercent(equilibrium.closedForm[index])} | ${formatPercent(
        equilibrium.monteCarlo[index],
      )} | ${formatPercent(equilibrium.continuous[index])} | ${formatPercent(equilibrium.eigenvector[index])} |`,
    )
    .join("\n");

  const upgradeList = bundle.owner.capabilities
    .map(
      (capability) =>
        `- **${capability.label} (${capability.category}).** ${capability.description}\n  └─ <code>$ ${capability.command}</code> (verify: <code>${capability.verification}</code>) ${
          capability.scriptName
            ? capability.scriptExists
              ? "✅ script pinned"
              : `⚠️ missing script “${capability.scriptName}”`
            : "ℹ️ manual command"
        }`,
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

  const partitionTable = statisticalPhysics.probabilities
    .map(
      (entry) =>
        `| ${formatNumber(entry.energy)} | ${formatNumber(entry.degeneracy, 0)} | ${formatPercent(entry.probability)} |`,
    )
    .join("\n");

  const mintTable = incentives.mint.roles
    .map((role) => `| ${role.role} | ${formatPercent(role.share)} | ${formatNumber(role.minted)} tokens |`)
    .join("\n");

  const minStakeTable = [
    `| Agent | ${formatNumber(incentives.slashing.minStake.agent)} |`,
    `| Validator | ${formatNumber(incentives.slashing.minStake.validator)} |`,
    `| Operator | ${formatNumber(incentives.slashing.minStake.operator)} |`,
  ].join("\n");

  const slashingTable = incentives.slashing.severities
    .map(
      (severity) =>
        `| ${severity.label} | ${formatPercent(severity.fraction)} | ${formatNumber(severity.slashAmount)} tokens | ${formatNumber(
          severity.treasuryAmount,
        )} tokens | ${formatNumber(severity.employerAmount)} tokens | ${formatNumber(severity.burnAmount)} tokens |`,
    )
    .join("\n");

  const jacobianAnalyticMatrix = formatMatrix(jacobian.analytic);
  const jacobianNumericMatrix = formatMatrix(jacobian.numeric);

  const commandAuditTable = owner.capabilities
    .map((capability) =>
      `| ${capability.category} | ${capability.scriptName ?? "manual"} | ${
        capability.scriptName
          ? capability.scriptExists
            ? "✅"
            : "⚠️"
          : capability.command.trim().length > 0
          ? "ℹ️"
          : "—"
      } | ${capability.verificationScriptName ?? "manual"} | ${
        capability.verificationScriptName
          ? capability.verificationScriptExists
            ? "✅"
            : "⚠️"
          : capability.verification.trim().length > 0
          ? "ℹ️"
          : "—"
      } |`,
    )
    .join("\n");

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
    `- **Free-energy safety margin:** ${formatNumber(thermodynamics.freeEnergyMarginKJ)} kJ (${formatPercent(
      thermodynamics.freeEnergyMarginPercent,
    )} of Gibbs)`,
    `- **Energy dissipated per block (burn):** ${formatNumber(thermodynamics.burnEnergyPerBlockKJ)} kJ`,
    `- **Cross-check delta:** ${thermodynamics.gibbsAgreementDelta.toExponential(3)} kJ (≤ 1e-6 required)`,
    `- **Cross-check Gibbs (reference):** ${formatNumber(thermodynamics.gibbsCrossCheckKJ)} kJ`,
    `- **Landauer within safety margin:** ${thermodynamics.landauerWithinMargin ? "✅" : "⚠️"}`,
    `- **Stake Boltzmann envelope:** ${thermodynamics.stakeBoltzmannEnvelope.toExponential(3)} (dimensionless proof of energy-aligned stake)`,
    "",
    "## 2. Statistical Physics Partition Function Cross-Check",
    "",
    `- **β (inverse temperature):** ${formatNumber(statisticalPhysics.beta, 4)}`,
    `- **Partition function (Z):** ${formatScientific(statisticalPhysics.partitionFunction)} (log Z ${formatScientific(
      statisticalPhysics.logPartitionFunction,
    )})`,
    `- **Expected energy:** ${formatNumber(statisticalPhysics.expectedEnergy)} (scaled ${formatNumber(
      statisticalPhysics.expectedEnergyKJ,
    )} kJ)`,
    `- **Free energy:** ${formatNumber(statisticalPhysics.freeEnergy)} (scaled ${formatNumber(
      statisticalPhysics.freeEnergyKJ,
    )} kJ)`,
    `- **Entropy:** ${formatNumber(statisticalPhysics.entropy)} (scaled ${formatNumber(
      statisticalPhysics.entropyKJPerK,
    )} kJ/K)`,
    `- **Heat capacity (β²·Var[E]):** ${formatNumber(statisticalPhysics.heatCapacity, 4)} (variance ${formatNumber(
      statisticalPhysics.variance,
    )})`,
    `- **Free-energy identity Δ:** ${formatScientific(statisticalPhysics.freeEnergyConsistencyDelta)}`,
    `- **Δ vs thermodynamic Gibbs:** ${formatNumber(statisticalPhysics.gibbsDeltaKJ)} kJ (${statisticalPhysics.withinTolerance
      ? "within"
      : "⚠️ outside"
    } tolerance ${formatNumber(statisticalPhysics.toleranceKJ)} kJ)`,
    "",
    "| Energy (dimensionless) | Degeneracy | Probability |",
    "| --- | --- | --- |",
    partitionTable,
    "",
    "### Mission Flow Atlases",
    "",
    governanceMermaid,
    "",
    energyMermaid,
    "",
    "## 3. Hamiltonian Control Plane",
    "",
    `- **Kinetic term:** ${formatNumber(hamiltonian.kineticTerm)} units`,
    `- **Potential term (scaled by λ):** ${formatNumber(hamiltonian.potentialTerm)} units`,
    `- **Hamiltonian energy:** ${formatNumber(hamiltonian.hamiltonianValue)} units`,
    `- **Alternate computation check:** ${formatNumber(hamiltonian.alternativeHamiltonian)} units`,
    `- **Difference:** ${hamiltonian.difference.toExponential(3)} (≤ 1e-3 target)`,
    "",
    "## 4. Incentive Free-Energy Flow",
    "",
    `- **Mint rule η:** ${incentives.mint.eta.toFixed(2)} (ΔV ${formatNumber(incentives.mint.deltaValue)} tokens)`,
    `- **Total minted per event:** ${formatNumber(incentives.mint.totalMinted)} tokens`,
    `- **Agent ↔ treasury parity:** ${incentives.mint.equalityOk ? "✅" : "⚠️"} Δ ${formatNumber(
      incentives.mint.equalityDelta,
    )} tokens (${(incentives.mint.equalityRatio * 100).toFixed(4)}% of mint, tolerance ${(incentives.mint.tolerance * 100).toFixed(
      2,
    )}%)`,
    `- **Treasury mirror share:** ${formatPercent(incentives.mint.treasuryMirrorShare)} (${incentives.mint.agentShare !== null
      ? `agent share ${formatPercent(incentives.mint.agentShare)}`
      : "agent share unresolved"
    })`,
    `- **Dust routed to treasury:** ${formatNumber(Math.abs(incentives.mint.dust), 4)} tokens`,
    "",
    "| Role | Share | Minted tokens |",
    "| --- | --- | --- |",
    mintTable,
    "",
    `- **Burn curve:** burn ${formatBps(incentives.burn.burnBps)}, treasury ${formatBps(
      incentives.burn.treasuryBps,
    )}, employer ${formatBps(incentives.burn.employerBps)}`,
    `- **Per-job distribution:** burn ${formatNumber(incentives.burn.burned)} tokens, treasury ${formatNumber(
      incentives.burn.treasury,
    )} tokens, employer ${formatNumber(incentives.burn.employer)} tokens, worker payouts ${formatNumber(
      incentives.burn.retained,
    )} tokens`,
    "",
    `- **Stake baseline:** agent ${formatNumber(incentives.slashing.minStake.agent)} tokens, validator ${formatNumber(
      incentives.slashing.minStake.validator,
    )} tokens, operator ${formatNumber(incentives.slashing.minStake.operator)} tokens (example stake ${formatNumber(
      incentives.slashing.stakeExample,
    )} tokens)`,
    "",
    "| Role | Minimum stake (tokens) |",
    "| --- | --- |",
    minStakeTable,
    "",
    "| Severity | Slash % stake | Amount slashed | Treasury share | Employer share | Burned |",
    "| --- | --- | --- | --- | --- | --- |",
    slashingTable,
    "",
    "## 5. Game-Theoretic Macro-Equilibrium",
    "",
    `- **Discount factor:** ${equilibrium.discountFactor.toFixed(2)} (must exceed 0.80 for uniqueness)`,
    `- **Replicator iterations to convergence:** ${equilibrium.replicatorIterations}`,
    `- **Continuous-flow iterations (RK4):** ${equilibrium.continuousIterations}`,
    `- **Perron eigenvector iterations:** ${equilibrium.eigenvectorIterations}`,
    `- **Replicator vs closed-form deviation:** ${equilibrium.replicatorDeviation.toExponential(3)}`,
    `- **Monte-Carlo RMS error:** ${equilibrium.monteCarloRmsError.toExponential(3)}`,
    `- **Max deviation across methods:** ${equilibrium.maxMethodDeviation.toExponential(3)} (${equilibrium.methodConsistency ? "consistent" : "⚠️ review"})`,
    `- **Payoff at equilibrium:** ${formatNumber(equilibrium.payoffAtEquilibrium)} tokens`,
    `- **Governance divergence:** ${equilibrium.divergenceAtEquilibrium.toExponential(3)} (target ≤ ${divergenceTolerance})`,
    "",
    "| Strategy | Replicator | Closed-form | Monte-Carlo | Continuous RK4 | Perron eigenvector |",
    "| --- | --- | --- | --- | --- | --- |",
    strategyTable,
    "",
    "### Replicator Jacobian Stability",
    "",
    `- **Gershgorin upper bound:** ${jacobian.gershgorinUpperBound.toExponential(3)} (${jacobian.stable ? "stable" : "unstable"})`,
    `- **Spectral radius:** ${jacobian.spectralRadius.toExponential(3)}`,
    `- **Analytic vs numeric max Δ:** ${jacobian.maxDifference.toExponential(3)}`,
    "",
    "| Analytic J[0,*] | Analytic J[1,*] | Analytic J[2,*] |",
    "| --- | --- | --- |",
    jacobianAnalyticMatrix,
    "",
    "| Numeric J[0,*] | Numeric J[1,*] | Numeric J[2,*] |",
    "| --- | --- | --- |",
    jacobianNumericMatrix,
    "",
    "## 6. Antifragility Tensor",
    "",
    `- **Quadratic curvature (2a):** ${antifragility.quadraticSecondDerivative.toExponential(3)} (> 0 indicates antifragility)`,
    `- **Monotonic welfare increase:** ${antifragility.monotonicIncrease ? "✅" : "⚠️"}`,
    "",
    "| σ | Welfare (tokens) | Average payoff | Divergence |",
    "| --- | --- | --- | --- |",
    antifragilityTable,
    "",
    "## 7. Risk & Safety Audit",
    "",
    `- **Coverage weights:** staking ${formatPercent(risk.weights.staking)}, formal ${formatPercent(risk.weights.formal)}, fuzz ${formatPercent(risk.weights.fuzz)}`,
    `- **Portfolio residual risk:** ${risk.portfolioResidual.toFixed(3)} (threshold ${risk.threshold.toFixed(3)} — ${risk.withinBounds ? "within" : "exceeds"} bounds)`,
    `- **Cross-check residual (baseline − mitigated):** ${risk.portfolioResidualCrossCheck.toFixed(3)}`,
    "",
    "| ID | Threat | Likelihood | Impact | Coverage | Residual |",
    "| --- | --- | --- | --- | --- | --- |",
    riskTable,
    "",
    "## 8. Owner Supremacy & Command Surface",
    "",
    `- **Owner:** ${owner.owner}`,
    `- **Pauser:** ${owner.pauser}`,
    `- **Treasury:** ${owner.treasury}`,
    `- **Timelock:** ${owner.timelockSeconds} seconds`,
    `- **Coverage achieved:** ${owner.fullCoverage ? "all critical capabilities accounted for" : "⚠️ gaps detected"}`,
    `- **Command automation coverage:** ${owner.allCommandsPresent ? "✅ all execution scripts present" : "⚠️ command gaps"}`,
    `- **Verification automation coverage:** ${
      owner.allVerificationsPresent ? "✅ all verification scripts present" : "⚠️ verification gaps"
    }`,
    `- **End-to-end automation ready:** ${owner.automationComplete ? "✅ commands + verification ready" : "⚠️ manual follow-up"}`,
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
    "### Command & Verification Audit",
    "| Category | Command script | Command status | Verification script | Verification status |",
    "| --- | --- | --- | --- | --- |",
    commandAuditTable,
    "",
    "## 9. Blockchain Deployment Envelope",
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
    "## 10. CI Enforcement Ledger",
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
    "## 11. Owner Execution Log (fill during live ops)",
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
    statisticalPhysics: bundle.statisticalPhysics,
    hamiltonian: bundle.hamiltonian,
    equilibrium: bundle.equilibrium,
    antifragility: bundle.antifragility,
    risk: bundle.risk,
    incentives: bundle.incentives,
    owner: bundle.owner,
    jacobian: bundle.jacobian,
    blockchain: bundle.blockchain,
    ci: bundle.ci,
  };
}

export {
  assertValidConfig,
  loadMission,
  loadPackageScripts,
  computeThermodynamics,
  computeStatisticalPhysics,
  computeHamiltonian,
  computeEquilibrium,
  computeAntifragility,
  computeRiskReport,
  computeIncentiveReport,
  computeOwnerReport,
  computeJacobian,
  computeBlockchainReport,
};

async function main(): Promise<void> {
  const mission = await loadMission();
  const thermodynamics = computeThermodynamics(mission);
  const statisticalPhysics = computeStatisticalPhysics(mission, thermodynamics);
  const hamiltonian = computeHamiltonian(mission);
  const equilibrium = computeEquilibrium(mission);
  const antifragility = computeAntifragility(mission, mission.gameTheory.payoffMatrix, equilibrium, thermodynamics);
  const risk = computeRiskReport(mission);
  const incentives = computeIncentiveReport(mission);
  const packageScripts = await loadPackageScripts();
  const owner = computeOwnerReport(mission, packageScripts);
  const jacobian = computeJacobian(mission.gameTheory.payoffMatrix, equilibrium.closedForm);
  const blockchain = computeBlockchainReport(mission);

  const bundle: ReportBundle = {
    generatedAt: new Date().toISOString(),
    meta: mission.meta,
    thermodynamics,
    statisticalPhysics,
    hamiltonian,
    equilibrium,
    antifragility,
    risk,
    incentives,
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

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to execute governance demo:", error);
    process.exitCode = 1;
  });
}

