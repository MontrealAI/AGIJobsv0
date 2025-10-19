import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

export const REPORT_DIR = path.join(__dirname, "..", "reports");
export const REPORT_FILE = path.join(REPORT_DIR, "governance-demo-report.md");
export const SUMMARY_FILE = path.join(REPORT_DIR, "governance-demo-summary.json");
export const DASHBOARD_FILE = path.join(REPORT_DIR, "governance-demo-dashboard.html");
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
    penaltyScaling: number;
    sigmaRewardMultiplier: number;
    divergencePenalty: number;
    curvatureBoost: number;
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
  alphaField: {
    stackelberg: {
      leaderBaseline: number;
      followerBaseline: number;
      valueCeiling: number;
      advantageFloor: number;
    };
    macroAttractor: {
      gibbsTargetKJ: number;
      gibbsToleranceKJ: number;
      divergenceLimit: number;
      entropyFloor: number;
    };
    antifragility: {
      minSecondDerivative: number;
      sigmaGainMinimum: number;
    };
    verification: {
      energyMarginFloorKJ: number;
      ownerCoverageMinimum: number;
      superintelligenceMinimum: number;
    };
    signatureWeights: {
      thermodynamic: number;
      governance: number;
      antifragility: number;
      owner: number;
    };
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
  closedFormPayoff: number;
  kktResiduals: number[];
  kktMaxResidual: number;
  kktCertified: boolean;
  simplexResidual: number;
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
};

export type JacobianReport = {
  analytic: number[][];
  numeric: number[][];
  maxDifference: number;
  gershgorinUpperBound: number;
  spectralRadius: number;
  stable: boolean;
};

export type AlphaFieldReport = {
  stackelbergAdvantage: number;
  stackelbergBound: number;
  stackelbergWithinBound: boolean;
  stackelbergAdvantageSatisfiesFloor: boolean;
  stackelbergAdvantageFloor: number;
  gibbsTargetKJ: number;
  gibbsDeltaKJ: number;
  gibbsWithinTolerance: boolean;
  gibbsToleranceKJ: number;
  divergenceLimit: number;
  equilibriumDivergence: number;
  divergenceWithinLimit: boolean;
  entropyFloor: number;
  entropyKJPerK: number;
  entropyAboveFloor: boolean;
  antifragilitySecondDerivative: number;
  antifragilityMinimum: number;
  antifragilityMeetsMinimum: boolean;
  sigmaGain: number;
  sigmaGainMinimum: number;
  sigmaGainSatisfied: boolean;
  ownerCoverageRatio: number;
  ownerCoverageMinimum: number;
  ownerCoverageSatisfied: boolean;
  energyMarginKJ: number;
  energyMarginFloorKJ: number;
  energyMarginSatisfied: boolean;
  confidenceScore: number;
  thermodynamicAssurance: number;
  governanceAssurance: number;
  antifragilityAssurance: number;
  ownerAssurance: number;
  superintelligenceIndex: number;
  superintelligenceMinimum: number;
  superintelligenceSatisfied: boolean;
  riskResidual: number;
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
  alphaField: AlphaFieldReport;
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
  if (config.antifragility.penaltyScaling <= 0 || config.antifragility.penaltyScaling > 1) {
    throw new Error("antifragility.penaltyScaling must be within (0,1]");
  }
  if (config.antifragility.sigmaRewardMultiplier <= 0) {
    throw new Error("antifragility.sigmaRewardMultiplier must be positive");
  }
  if (config.antifragility.divergencePenalty < 0) {
    throw new Error("antifragility.divergencePenalty must be non-negative");
  }
  if (config.antifragility.curvatureBoost < 0) {
    throw new Error("antifragility.curvatureBoost must be non-negative");
  }
  if (config.alphaField.stackelberg.valueCeiling <= 0) {
    throw new Error("alphaField.stackelberg.valueCeiling must be positive");
  }
  if (config.alphaField.stackelberg.advantageFloor < 0) {
    throw new Error("alphaField.stackelberg.advantageFloor must be non-negative");
  }
  if (config.alphaField.macroAttractor.gibbsToleranceKJ < 0) {
    throw new Error("alphaField.macroAttractor.gibbsToleranceKJ must be non-negative");
  }
  if (config.alphaField.macroAttractor.divergenceLimit <= 0) {
    throw new Error("alphaField.macroAttractor.divergenceLimit must be positive");
  }
  if (config.alphaField.verification.energyMarginFloorKJ < 0) {
    throw new Error("alphaField.verification.energyMarginFloorKJ must be non-negative");
  }
  if (
    config.alphaField.verification.ownerCoverageMinimum < 0 ||
    config.alphaField.verification.ownerCoverageMinimum > 1
  ) {
    throw new Error("alphaField.verification.ownerCoverageMinimum must be within [0,1]");
  }
  if (
    config.alphaField.verification.superintelligenceMinimum < 0 ||
    config.alphaField.verification.superintelligenceMinimum > 1
  ) {
    throw new Error("alphaField.verification.superintelligenceMinimum must be within [0,1]");
  }
  const signatureWeights = config.alphaField.signatureWeights;
  const signatureWeightSum =
    signatureWeights.antifragility +
    signatureWeights.governance +
    signatureWeights.owner +
    signatureWeights.thermodynamic;
  if (Math.abs(signatureWeightSum - 1) > 1e-6) {
    throw new Error("alphaField.signatureWeights must sum to 1");
  }
  for (const [label, weight] of Object.entries(signatureWeights)) {
    if (!(weight > 0)) {
      throw new Error(`alphaField.signatureWeights.${label} must be strictly positive`);
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

type ClosedFormSolution = {
  probabilities: number[];
  payoff: number;
  residuals: number[];
  simplexResidual: number;
};

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

function solveClosedForm(matrix: number[][]): ClosedFormSolution {
  const system = [
    [matrix[0][0], matrix[0][1], matrix[0][2], -1, 0],
    [matrix[1][0], matrix[1][1], matrix[1][2], -1, 0],
    [matrix[2][0], matrix[2][1], matrix[2][2], -1, 0],
    [1, 1, 1, 0, 1],
  ];

  const solution = gaussianSolve(system);
  const rawProbabilities = solution.slice(0, 3).map((value) => (value < 0 ? 0 : value));
  const probabilities = normalise(rawProbabilities);
  const payoffs = multiplyMatrixVector(matrix, probabilities);
  const payoff = payoffs.reduce((sum, value) => sum + value, 0) / payoffs.length;
  const residuals = payoffs.map((value) => value - payoff);
  const simplexResidual = probabilities.reduce((sum, value) => sum + value, 0) - 1;

  return { probabilities, payoff, residuals, simplexResidual };
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

  const closedFormSolution = solveClosedForm(matrix);
  const closedForm = closedFormSolution.probabilities;
  const closedFormPayoff = closedFormSolution.payoff;
  const kktResiduals = closedFormSolution.residuals;
  const simplexResidual = closedFormSolution.simplexResidual;
  const kktMaxResidual = Math.max(...kktResiduals.map((value) => Math.abs(value)));
  const kktCertified = kktMaxResidual <= 1e-6 && Math.abs(simplexResidual) <= 1e-6;

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

  const consistencyThreshold = 0.08;
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
    closedFormPayoff,
    kktResiduals,
    kktMaxResidual,
    kktCertified,
    simplexResidual,
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
  const penalty =
    (thermodynamics.burnEnergyPerBlockKJ / config.hamiltonian.lambda) * config.antifragility.penaltyScaling;

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
      welfare:
        mc.averagePayoff -
        penalty -
        mc.averageDivergence * config.antifragility.divergencePenalty +
        sigma * config.antifragility.sigmaRewardMultiplier +
        sigma * sigma * config.antifragility.curvatureBoost,
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
    capabilityMap.set(capability.category, {
      category: capability.category,
      label: capability.label,
      description: capability.description,
      command: capability.command,
      verification: capability.verification,
      present: true,
      scriptName: extractScriptName(capability.command),
      scriptExists: false,
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
      });
    }
  }

  const capabilities: OwnerControlCapability[] = [];
  for (const capability of config.ownerControls.criticalCapabilities) {
    const enriched = capabilityMap.get(capability.category)!;
    if (enriched.scriptName) {
      enriched.scriptExists = Object.prototype.hasOwnProperty.call(packageScripts, enriched.scriptName);
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

function computeAlphaField(
  config: MissionConfig,
  thermodynamics: ThermodynamicReport,
  statisticalPhysics: StatisticalPhysicsReport,
  equilibrium: EquilibriumResult,
  antifragility: AntifragilityReport,
  risk: RiskReport,
  owner: OwnerControlReport,
): AlphaFieldReport {
  const advantage = config.alphaField.stackelberg.leaderBaseline - config.alphaField.stackelberg.followerBaseline;
  const bound = 0.75 * config.alphaField.stackelberg.valueCeiling;
  const stackelbergWithinBound = advantage <= bound + 1e-9;
  const stackelbergAdvantageSatisfiesFloor = advantage >= config.alphaField.stackelberg.advantageFloor - 1e-9;

  const gibbsDelta = Math.abs(thermodynamics.gibbsFreeEnergyKJ - config.alphaField.macroAttractor.gibbsTargetKJ);
  const gibbsWithinTolerance = gibbsDelta <= config.alphaField.macroAttractor.gibbsToleranceKJ + 1e-9;

  const divergenceWithinLimit =
    equilibrium.divergenceAtEquilibrium <= config.alphaField.macroAttractor.divergenceLimit + 1e-12;

  const entropyAboveFloor =
    statisticalPhysics.entropyKJPerK >= config.alphaField.macroAttractor.entropyFloor - 1e-9;

  const antifragilityMeetsMinimum =
    antifragility.quadraticSecondDerivative >= config.alphaField.antifragility.minSecondDerivative - 1e-12;
  const sigmaGain =
    antifragility.samples.length >= 2
      ? antifragility.samples[antifragility.samples.length - 1].welfare - antifragility.samples[0].welfare
      : 0;
  const sigmaGainSatisfied = sigmaGain >= config.alphaField.antifragility.sigmaGainMinimum - 1e-9;

  const satisfiedCategories = owner.requiredCoverage.filter((item) => item.satisfied).length;
  const ownerCoverageRatio = owner.requiredCoverage.length
    ? satisfiedCategories / owner.requiredCoverage.length
    : 1;
  const ownerCoverageSatisfied =
    ownerCoverageRatio >= config.alphaField.verification.ownerCoverageMinimum - 1e-9;

  const energyMarginSatisfied =
    thermodynamics.freeEnergyMarginKJ >= config.alphaField.verification.energyMarginFloorKJ - 1e-9;

  const thermodynamicAssurance = clamp(
    config.alphaField.verification.energyMarginFloorKJ <= 0
      ? 1
      : thermodynamics.freeEnergyMarginKJ / config.alphaField.verification.energyMarginFloorKJ,
    0,
    1,
  );
  const governanceAssurance = clamp(
    config.risk.portfolioThreshold <= 0
      ? 1
      : 1 - risk.portfolioResidual / config.risk.portfolioThreshold,
    0,
    1,
  );
  const antifragilityAssurance = clamp(
    config.alphaField.antifragility.minSecondDerivative <= 0
      ? 1
      : antifragility.quadraticSecondDerivative / config.alphaField.antifragility.minSecondDerivative,
    0,
    1,
  );
  const ownerAssurance = clamp(ownerCoverageRatio, 0, 1);

  const weights = config.alphaField.signatureWeights;
  const weightTotal =
    weights.antifragility + weights.governance + weights.owner + weights.thermodynamic;
  const weightedScore =
    weights.thermodynamic * thermodynamicAssurance +
    weights.governance * governanceAssurance +
    weights.antifragility * antifragilityAssurance +
    weights.owner * ownerAssurance;
  const superintelligenceIndex = clamp(weightTotal > 0 ? weightedScore / weightTotal : 0, 0, 1);
  const superintelligenceSatisfied =
    superintelligenceIndex >= config.alphaField.verification.superintelligenceMinimum - 1e-9;

  const totalSignals = [
    stackelbergWithinBound,
    stackelbergAdvantageSatisfiesFloor,
    gibbsWithinTolerance,
    divergenceWithinLimit,
    entropyAboveFloor,
    antifragilityMeetsMinimum,
    sigmaGainSatisfied,
    ownerCoverageSatisfied,
    energyMarginSatisfied,
    superintelligenceSatisfied,
  ];
  const binaryScore = totalSignals.filter(Boolean).length / totalSignals.length;
  const confidenceScore = clamp((binaryScore + superintelligenceIndex) / 2, 0, 1);

  return {
    stackelbergAdvantage: advantage,
    stackelbergBound: bound,
    stackelbergWithinBound,
    stackelbergAdvantageSatisfiesFloor,
    stackelbergAdvantageFloor: config.alphaField.stackelberg.advantageFloor,
    gibbsTargetKJ: config.alphaField.macroAttractor.gibbsTargetKJ,
    gibbsDeltaKJ: gibbsDelta,
    gibbsWithinTolerance,
    gibbsToleranceKJ: config.alphaField.macroAttractor.gibbsToleranceKJ,
    divergenceLimit: config.alphaField.macroAttractor.divergenceLimit,
    equilibriumDivergence: equilibrium.divergenceAtEquilibrium,
    divergenceWithinLimit,
    entropyFloor: config.alphaField.macroAttractor.entropyFloor,
    entropyKJPerK: statisticalPhysics.entropyKJPerK,
    entropyAboveFloor,
    antifragilitySecondDerivative: antifragility.quadraticSecondDerivative,
    antifragilityMinimum: config.alphaField.antifragility.minSecondDerivative,
    antifragilityMeetsMinimum,
    sigmaGain,
    sigmaGainMinimum: config.alphaField.antifragility.sigmaGainMinimum,
    sigmaGainSatisfied,
    ownerCoverageRatio,
    ownerCoverageMinimum: config.alphaField.verification.ownerCoverageMinimum,
    ownerCoverageSatisfied,
    energyMarginKJ: thermodynamics.freeEnergyMarginKJ,
    energyMarginFloorKJ: config.alphaField.verification.energyMarginFloorKJ,
    energyMarginSatisfied,
    confidenceScore,
    thermodynamicAssurance,
    governanceAssurance,
    antifragilityAssurance,
    ownerAssurance,
    superintelligenceIndex,
    superintelligenceMinimum: config.alphaField.verification.superintelligenceMinimum,
    superintelligenceSatisfied,
    riskResidual: risk.portfolioResidual,
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

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
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

function buildMermaidFlowchart(bundle: ReportBundle): string {
  const { thermodynamics, incentives, equilibrium, risk, owner, blockchain, alphaField } = bundle;
  const ownerLabel = `${owner.owner.slice(0, 6)}…${owner.owner.slice(-4)}`;
  const pauserLabel = `${owner.pauser.slice(0, 6)}…${owner.pauser.slice(-4)}`;
  const treasuryLabel = `${owner.treasury.slice(0, 6)}…${owner.treasury.slice(-4)}`;
  const divergence = equilibrium.divergenceAtEquilibrium.toExponential(2);
  const kktResidual = equilibrium.kktMaxResidual.toExponential(2);
  const kktBadge = equilibrium.kktCertified ? "✅" : "⚠️";
  const riskResidual = risk.portfolioResidual.toFixed(3);
  const governorName = blockchain.contracts[0]?.name ?? "AGIJobsGovernor";
  const monitorName = blockchain.contracts[2]?.name ?? "HamiltonianMonitor";
  const stackelberg = alphaField.stackelbergAdvantage.toFixed(2);
  const superintelligence = `${Math.round(alphaField.superintelligenceIndex * 100)}%`;
  const thermoAssurance = `${Math.round(alphaField.thermodynamicAssurance * 100)}%`;
  const governanceAssurance = `${Math.round(alphaField.governanceAssurance * 100)}%`;
  const antifragilityAssurance = `${Math.round(alphaField.antifragilityAssurance * 100)}%`;
  const ownerAssurance = `${Math.round(alphaField.ownerAssurance * 100)}%`;
  return [
    "```mermaid",
    "flowchart LR",
    "  subgraph Energy[Energy Intelligence Stack]",
    `    Thermo[Gibbs Free Energy ${formatNumber(thermodynamics.gibbsFreeEnergyKJ)} kJ]`,
    `    Burn[Burn Envelope ${formatNumber(thermodynamics.burnEnergyPerBlockKJ)} kJ/block]`,
    "    Thermo --> Burn",
    "  end",
    "  subgraph Incentives[Mint/Burn Governance]",
    `    Mint[Mint η=${incentives.mint.eta.toFixed(2)}]`,
    "    BurnCurve[Burn Curve Δ Escrow]",
    "    Mint --> BurnCurve",
    "  end",
    "  subgraph Equilibrium[Macro Equilibrium]",
    `    StratA[Replicator Δ=${equilibrium.replicatorDeviation.toExponential(2)}]`,
    `    KKT[KKT Residual ${kktResidual} ${kktBadge}]`,
    `    Divergence[Divergence ${divergence}]`,
    `    Payoff[Payoff ${formatNumber(equilibrium.payoffAtEquilibrium)} tokens]`,
    "    StratA --> KKT",
    "    KKT --> Divergence",
    "    Divergence --> Payoff",
    "  end",
    "  subgraph Risk[Risk Engine]",
    `    Residual[Residual ${riskResidual}]`,
    "  end",
    "  subgraph AlphaField[Alpha-Field Assurance]",
    `    Stackelberg[Stackelberg Δ=${stackelberg}]`,
    `    Confidence[Superintelligence ${superintelligence}]`,
    `    ThermoSignal[Thermo Assurance ${thermoAssurance}]`,
    `    GovernanceSignal[Governance Assurance ${governanceAssurance}]`,
    `    AntifragileSignal[Antifragility Assurance ${antifragilityAssurance}]`,
    `    OwnerSignal[Owner Command ${ownerAssurance}]`,
    `    EnergyFloor[Energy Margin ${formatNumber(alphaField.energyMarginKJ)} kJ]`,
    "    Stackelberg --> Confidence",
    "    EnergyFloor --> ThermoSignal",
    "    ThermoSignal --> Confidence",
    "    GovernanceSignal --> Confidence",
    "    AntifragileSignal --> Confidence",
    "    OwnerSignal --> Confidence",
    "  end",
    "  subgraph Control[Owner Command Surface]",
    `    Owner((Owner ${ownerLabel}))`,
    `    Pauser([Pauser ${pauserLabel}])`,
    `    Treasury([Treasury ${treasuryLabel}])`,
    "    Owner --> Pauser",
    "    Owner --> Treasury",
    "  end",
    "  subgraph Chain[Mainnet Envelope]",
    `    Governor[${governorName}]`,
    `    Monitor[${monitorName}]`,
    "    Governor --> Monitor",
    "  end",
    "  Thermo --> Mint",
    "  BurnCurve --> StratA",
    "  Payoff --> Residual",
    "  Residual --> Stackelberg",
    "  Confidence --> Owner",
    "  Owner --> Governor",
    "```",
  ].join("\n");
}

function buildRiskPie(bundle: ReportBundle): string {
  const slices = bundle.risk.classes
    .map((riskClass) => `  \"${riskClass.id} ${riskClass.label}\" : ${(riskClass.residual * 1000).toFixed(4)}`)
    .join("\n");
  return ["```mermaid", "pie showData", "  title Residual Risk Distribution ×10⁻³", slices, "```"].join("\n");
}

function buildOwnerSequence(bundle: ReportBundle): string {
  const { owner, incentives, blockchain } = bundle;
  const treasury = `${owner.treasury.slice(0, 6)}…${owner.treasury.slice(-4)}`;
  const governor = blockchain.contracts[0]?.name ?? "AGIJobsGovernor";
  const mintTokens = formatNumber(incentives.mint.totalMinted);
  return [
    "```mermaid",
    "sequenceDiagram",
    "  participant O as Owner",
    `  participant G as ${governor}`,
    "  participant T as Treasury",
    "  participant M as Mission AI Field",
    "  O->>G: Pause / Resume Commands",
    `  O->>T: Mirror Mint ${mintTokens} tokens`,
    "  G->>M: Reconfigure Hamiltonian λ",
    "  M-->>G: Updated Divergence Metrics",
    "  G-->>O: Deterministic State Report",
    `  T-->>O: Treasury Mirror Share ${formatPercent(bundle.incentives.mint.treasuryMirrorShare)}`,
    "```",
  ].join("\n");
}

function buildAntifragilityMindmap(bundle: ReportBundle): string {
  const lines = bundle.antifragility.samples
    .map(
      (sample) =>
        `        \"σ=${sample.sigma.toFixed(2)}\":::sigma --> \"Welfare ${formatNumber(sample.welfare)}\":::welfare`,
    )
    .join("\n");
  return [
    "```mermaid",
    "mindmap",
    "  root((Antifragility Tensor))",
    "    \"Quadratic curvature\":::core",
    `      \"2a=${bundle.antifragility.quadraticSecondDerivative.toExponential(2)}\":::core`,
    "    \"Sigma Scan\":::core",
    lines,
    "    \"Owner Actions\":::core",
    `      \"Mint Mirror ${formatPercent(bundle.incentives.mint.treasuryMirrorShare)}\"`,
    `      \"Residual Risk ${bundle.risk.portfolioResidual.toFixed(3)}\"`,
    "  classDef core fill:#111827,stroke:#38bdf8,stroke-width:2px,color:#f9fafb,font-weight:600;",
    "  classDef sigma fill:#1f2937,stroke:#f97316,stroke-width:2px,color:#fef3c7;font-weight:600;",
    "  classDef welfare fill:#0f172a,stroke:#22d3ee,stroke-width:2px,color:#ecfeff;font-weight:600;",
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
    alphaField,
    blockchain,
    ci,
    divergenceTolerance,
  } = bundle;

  const flowchart = buildMermaidFlowchart(bundle);
  const riskPie = buildRiskPie(bundle);
  const ownerSequence = buildOwnerSequence(bundle);
  const antifragilityMindmap = buildAntifragilityMindmap(bundle);

  const strategyTable = equilibrium.labels
    .map((label, index) =>
      `| ${label} | ${formatPercent(equilibrium.replicator[index])} | ${formatPercent(equilibrium.closedForm[index])} | ${formatPercent(
        equilibrium.monteCarlo[index],
      )} | ${formatPercent(equilibrium.continuous[index])} | ${formatPercent(equilibrium.eigenvector[index])} |`,
    )
    .join("\n");
  const kktResidualRows = equilibrium.kktResiduals
    .map((residual, index) => `| ${equilibrium.labels[index]} payoff Δ | ${residual.toExponential(3)} |`);
  kktResidualRows.push(`| Probability simplex Δ | ${equilibrium.simplexResidual.toExponential(3)} |`);
  const kktResidualTable = kktResidualRows.join("\n");

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
  const alphaFieldSignalTable = [
    ["Stackelberg within cap", alphaField.stackelbergWithinBound],
    ["Stackelberg floor met", alphaField.stackelbergAdvantageSatisfiesFloor],
    ["Gibbs delta within tolerance", alphaField.gibbsWithinTolerance],
    ["Divergence within limit", alphaField.divergenceWithinLimit],
    ["Entropy above floor", alphaField.entropyAboveFloor],
    ["Antifragility curvature", alphaField.antifragilityMeetsMinimum],
    ["Sigma welfare gain", alphaField.sigmaGainSatisfied],
    ["Owner coverage", alphaField.ownerCoverageSatisfied],
    ["Energy margin", alphaField.energyMarginSatisfied],
    ["Superintelligence threshold", alphaField.superintelligenceSatisfied],
  ]
    .map(([label, ok]) => `| ${label} | ${ok ? "✅" : "⚠️"} |`)
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
        capability.scriptName ? (capability.scriptExists ? "✅" : "⚠️") : "ℹ️"
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
    flowchart,
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
    `- **Closed-form KKT payoff (λ):** ${formatNumber(equilibrium.closedFormPayoff)} tokens`,
    `- **KKT residual max:** ${equilibrium.kktMaxResidual.toExponential(3)} (${equilibrium.kktCertified ? "satisfied" : "⚠️ re-evaluate"})`,
    `- **Simplex residual:** ${equilibrium.simplexResidual.toExponential(3)}`,
    `- **Governance divergence:** ${equilibrium.divergenceAtEquilibrium.toExponential(3)} (target ≤ ${divergenceTolerance})`,
    "",
    "| Strategy | Replicator | Closed-form | Monte-Carlo | Continuous RK4 | Perron eigenvector |",
    "| --- | --- | --- | --- | --- | --- |",
    strategyTable,
    "",
    "| Condition | Residual |",
    "| --- | --- |",
    kktResidualTable,
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
    antifragilityMindmap,
    "",
    "## 7. Alpha-Field Sovereign Assurance",
    "",
    `- **Stackelberg advantage:** Δ${formatNumber(alphaField.stackelbergAdvantage)} vs cap ${formatNumber(
      alphaField.stackelbergBound,
    )} (${alphaField.stackelbergWithinBound ? "✅ within" : "⚠️ breach"})`,
    `- **Stackelberg floor satisfied:** ${alphaField.stackelbergAdvantageSatisfiesFloor ? "✅" : "⚠️"} (floor ${formatNumber(
      alphaField.stackelbergAdvantageFloor,
    )}; achieved Δ ${formatNumber(alphaField.stackelbergAdvantage)})`,
    `- **Gibbs delta:** ${formatNumber(alphaField.gibbsDeltaKJ)} kJ (target ${formatNumber(
      alphaField.gibbsTargetKJ,
    )} ± ${formatNumber(alphaField.gibbsToleranceKJ)} kJ)`,
    `- **Equilibrium divergence:** ${alphaField.equilibriumDivergence.toExponential(3)} (limit ${alphaField.divergenceLimit.toExponential(
      3,
    )})`,
    `- **Entropy floor:** ${formatNumber(alphaField.entropyKJPerK)} kJ/K (floor ${formatNumber(alphaField.entropyFloor)} kJ/K)`,
    `- **Antifragility curvature:** ${alphaField.antifragilitySecondDerivative.toExponential(3)} (minimum ${alphaField.antifragilityMinimum.toExponential(
      3,
    )})`,
    `- **Sigma welfare gain:** ${formatNumber(alphaField.sigmaGain)} (minimum ${formatNumber(alphaField.sigmaGainMinimum)})`,
    `- **Owner coverage ratio:** ${(alphaField.ownerCoverageRatio * 100).toFixed(2)}% (threshold ${(
      alphaField.ownerCoverageMinimum * 100
    ).toFixed(2)}%)`,
    `- **Energy margin:** ${formatNumber(alphaField.energyMarginKJ)} kJ (floor ${formatNumber(
      alphaField.energyMarginFloorKJ,
    )} kJ — ${alphaField.energyMarginSatisfied ? "✅" : "⚠️"})`,
    `- **Superintelligence index:** ${(alphaField.superintelligenceIndex * 100).toFixed(1)}% (minimum ${(
      alphaField.superintelligenceMinimum * 100
    ).toFixed(1)}% — ${alphaField.superintelligenceSatisfied ? "✅" : "⚠️"})`,
    `- **Composite confidence:** ${(alphaField.confidenceScore * 100).toFixed(1)}% (thermo ${(alphaField.thermodynamicAssurance *
      100
    ).toFixed(1)}% · governance ${(alphaField.governanceAssurance * 100).toFixed(1)}% · antifragility ${(alphaField.antifragilityAssurance *
      100
    ).toFixed(1)}% · owner ${(alphaField.ownerAssurance * 100).toFixed(1)}%)`,
    "",
    "| Signal | Status |",
    "| --- | --- |",
    alphaFieldSignalTable,
    "",
    "## 8. Risk & Safety Audit",
    "",
    `- **Coverage weights:** staking ${formatPercent(risk.weights.staking)}, formal ${formatPercent(risk.weights.formal)}, fuzz ${formatPercent(risk.weights.fuzz)}`,
    `- **Portfolio residual risk:** ${risk.portfolioResidual.toFixed(3)} (threshold ${risk.threshold.toFixed(3)} — ${risk.withinBounds ? "within" : "exceeds"} bounds)`,
    `- **Cross-check residual (baseline − mitigated):** ${risk.portfolioResidualCrossCheck.toFixed(3)}`,
    "",
    "| ID | Threat | Likelihood | Impact | Coverage | Residual |",
    "| --- | --- | --- | --- | --- | --- |",
    riskTable,
    "",
    riskPie,
    "",
    "## 9. Owner Supremacy & Command Surface",
    "",
    `- **Owner:** ${owner.owner}`,
    `- **Pauser:** ${owner.pauser}`,
    `- **Treasury:** ${owner.treasury}`,
    `- **Timelock:** ${owner.timelockSeconds} seconds`,
    `- **Coverage achieved:** ${owner.fullCoverage ? "all critical capabilities accounted for" : "⚠️ gaps detected"}`,
    `- **Command surfaces wired:** ${owner.allCommandsPresent ? "✅ all npm scripts present" : "⚠️ missing scripts"}`,
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
    ownerSequence,
    "",
    "### Command Audit",
    "| Category | npm script | Status |",
    "| --- | --- | --- |",
    commandAuditTable,
    "",
    "## 10. Blockchain Deployment Envelope",
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
    "## 11. CI Enforcement Ledger",
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
    "## 12. Owner Execution Log (fill during live ops)",
    "",
    "| Timestamp | Action | Tx hash | Operator | Notes |",
    "| --- | --- | --- | --- | --- |",
    "| _pending_ |  |  |  |  |",
  ].join("\n");
}

function stripMermaid(diagram: string): string {
  return diagram
    .split("\n")
    .filter((line) => line.trim() !== "```" && line.trim() !== "```mermaid")
    .join("\n")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003C");
}

function buildDashboardHtml(bundle: ReportBundle): string {
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
    alphaField,
    blockchain,
    ci,
  } = bundle;

  const flowDiagram = stripMermaid(buildMermaidFlowchart(bundle));
  const riskDiagram = stripMermaid(buildRiskPie(bundle));
  const ownerDiagram = stripMermaid(buildOwnerSequence(bundle));
  const antifragilityDiagram = stripMermaid(buildAntifragilityMindmap(bundle));

  const mintRows = incentives.mint.roles
    .map(
      (role) =>
        `<tr><td>${escapeHtml(role.role)}</td><td>${formatPercent(role.share)}</td><td>${formatNumber(role.minted)} tokens</td></tr>`,
    )
    .join("\n");

  const riskRows = risk.classes
    .map(
      (riskClass) =>
        `<tr><td>${escapeHtml(riskClass.id)}</td><td>${escapeHtml(riskClass.label)}</td><td>${formatNumber(
          riskClass.probability,
          2,
        )}</td><td>${formatNumber(riskClass.impact, 2)}</td><td>${formatPercent(riskClass.coverage)}</td><td>${riskClass.residual.toFixed(
          3,
        )}</td></tr>`,
    )
    .join("\n");

  const capabilityRows = owner.capabilities
    .map((capability) => {
      const status = capability.present ? (capability.scriptName && !capability.scriptExists ? "⚠️" : "✅") : "⚠️";
      return `<tr><td>${escapeHtml(capability.label)}</td><td>${escapeHtml(capability.category)}</td><td>${
        capability.scriptName ? escapeHtml(capability.scriptName) : "manual"
      }</td><td>${status}</td></tr>`;
    })
    .join("\n");

  const sentinelList = owner.monitoringSentinels.map((sentinel) => `<li>${escapeHtml(sentinel)}</li>`).join("\n");

  const strategyRows = equilibrium.labels
    .map(
      (label, index) =>
        `<tr><td>${escapeHtml(label)}</td><td>${formatPercent(equilibrium.replicator[index])}</td><td>${formatPercent(
          equilibrium.closedForm[index],
        )}</td><td>${formatPercent(equilibrium.monteCarlo[index])}</td><td>${formatPercent(
          equilibrium.continuous[index],
        )}</td><td>${formatPercent(equilibrium.eigenvector[index])}</td></tr>`,
    )
    .join("\n");
  const kktRowsHtml = [
    ...equilibrium.kktResiduals.map(
      (residual, index) =>
        `<tr><td>${escapeHtml(equilibrium.labels[index])} payoff Δ</td><td>${residual.toExponential(3)}</td></tr>`,
    ),
    `<tr><td>Probability simplex Δ</td><td>${equilibrium.simplexResidual.toExponential(3)}</td></tr>`,
  ].join("\n");

  const antifragilityRows = antifragility.samples
    .map(
      (sample) =>
        `<tr><td>${sample.sigma.toFixed(2)}</td><td>${formatNumber(sample.welfare)}</td><td>${formatNumber(
          sample.averagePayoff,
        )}</td><td>${sample.divergence.toExponential(2)}</td></tr>`,
    )
    .join("\n");
  const alphaFieldRows = [
    {
      label: "Stackelberg Δ",
      value: `${formatNumber(alphaField.stackelbergAdvantage)} (cap ${formatNumber(alphaField.stackelbergBound)})`,
      status: alphaField.stackelbergWithinBound ? "✅" : "⚠️",
    },
    {
      label: "Stackelberg floor",
      value: `${formatNumber(alphaField.stackelbergAdvantageFloor)} (achieved ${formatNumber(
        alphaField.stackelbergAdvantage,
      )})`,
      status: alphaField.stackelbergAdvantageSatisfiesFloor ? "✅" : "⚠️",
    },
    {
      label: "Gibbs delta",
      value: `${formatNumber(alphaField.gibbsDeltaKJ)} kJ (tol ±${formatNumber(alphaField.gibbsToleranceKJ)} kJ)`,
      status: alphaField.gibbsWithinTolerance ? "✅" : "⚠️",
    },
    {
      label: "Divergence",
      value: `${alphaField.equilibriumDivergence.toExponential(3)} ≤ ${alphaField.divergenceLimit.toExponential(3)}`,
      status: alphaField.divergenceWithinLimit ? "✅" : "⚠️",
    },
    {
      label: "Entropy floor",
      value: `${formatNumber(alphaField.entropyKJPerK)} ≥ ${formatNumber(alphaField.entropyFloor)} kJ/K`,
      status: alphaField.entropyAboveFloor ? "✅" : "⚠️",
    },
    {
      label: "Antifragility curvature",
      value: `${alphaField.antifragilitySecondDerivative.toExponential(3)} ≥ ${alphaField.antifragilityMinimum.toExponential(3)}`,
      status: alphaField.antifragilityMeetsMinimum ? "✅" : "⚠️",
    },
    {
      label: "Sigma welfare gain",
      value: `${formatNumber(alphaField.sigmaGain)} ≥ ${formatNumber(alphaField.sigmaGainMinimum)}`,
      status: alphaField.sigmaGainSatisfied ? "✅" : "⚠️",
    },
    {
      label: "Owner coverage",
      value: `${(alphaField.ownerCoverageRatio * 100).toFixed(2)}% ≥ ${(alphaField.ownerCoverageMinimum * 100).toFixed(2)}%`,
      status: alphaField.ownerCoverageSatisfied ? "✅" : "⚠️",
    },
    {
      label: "Energy margin",
      value: `${formatNumber(alphaField.energyMarginKJ)} ≥ ${formatNumber(alphaField.energyMarginFloorKJ)} kJ`,
      status: alphaField.energyMarginSatisfied ? "✅" : "⚠️",
    },
    {
      label: "Superintelligence index",
      value: `${(alphaField.superintelligenceIndex * 100).toFixed(1)}% ≥ ${(alphaField.superintelligenceMinimum * 100).toFixed(
        1,
      )}%`,
      status: alphaField.superintelligenceSatisfied ? "✅" : "⚠️",
    },
    {
      label: "Thermodynamic assurance",
      value: `${(alphaField.thermodynamicAssurance * 100).toFixed(1)}%`,
      status: alphaField.thermodynamicAssurance >= 1 ? "🌌" : "✅",
    },
    {
      label: "Governance assurance",
      value: `${(alphaField.governanceAssurance * 100).toFixed(1)}%`,
      status: alphaField.governanceAssurance >= 0.9 ? "✅" : "⚠️",
    },
    {
      label: "Antifragility assurance",
      value: `${(alphaField.antifragilityAssurance * 100).toFixed(1)}%`,
      status: alphaField.antifragilityAssurance >= 1 ? "🌌" : alphaField.antifragilityAssurance >= 0.9 ? "✅" : "⚠️",
    },
    {
      label: "Owner assurance",
      value: `${(alphaField.ownerAssurance * 100).toFixed(1)}%`,
      status: alphaField.ownerAssurance >= 0.95 ? "✅" : "⚠️",
    },
  ]
    .map((row) => `<tr><td>${row.label}</td><td>${row.value}</td><td>${row.status}</td></tr>`)
    .join("\n");

  const contractRows = blockchain.contracts
    .map((contract) => `<tr><td>${escapeHtml(contract.name)}</td><td>${escapeHtml(contract.address)}</td><td>${escapeHtml(contract.role)}</td></tr>`)
    .join("\n");

  const pausableRows = blockchain.pausableFunctions
    .map(
      (fn) =>
        `<tr><td>${escapeHtml(fn.contract)}</td><td>${escapeHtml(fn.function)}</td><td>${escapeHtml(
          fn.selector,
        )}</td><td>${escapeHtml(fn.description)}</td></tr>`,
    )
    .join("\n");

  const ciRows = ci.requiredJobs
    .map((job) => `<tr><td>${escapeHtml(job.id)}</td><td>${escapeHtml(job.name)}</td></tr>`)
    .join("\n");

  const antifragilityData = serializeForScript(
    antifragility.samples.map((sample) => ({ sigma: sample.sigma, welfare: sample.welfare })),
  );

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(meta.title)} — Governance Dashboard</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #020617;
        --card: rgba(15, 23, 42, 0.72);
        --accent: #38bdf8;
        --accent-strong: #f97316;
        --text: #f8fafc;
        --muted: #94a3b8;
        --border: rgba(148, 163, 184, 0.3);
        font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
      }
      body {
        margin: 0;
        background: radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 38%),
          radial-gradient(circle at bottom right, rgba(249, 115, 22, 0.18), transparent 42%),
          var(--bg);
        color: var(--text);
        line-height: 1.6;
      }
      header {
        padding: 3.5rem 4vw 2rem;
        text-align: center;
      }
      header h1 {
        margin: 0;
        font-size: clamp(2.5rem, 4vw, 3.5rem);
        font-weight: 700;
        letter-spacing: 0.04em;
      }
      header p.meta {
        margin: 0.4rem 0 0;
        font-size: 0.95rem;
        color: var(--muted);
      }
      main {
        padding: 0 4vw 4rem;
        display: grid;
        gap: 2.75rem;
      }
      section.card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 2.2rem;
        box-shadow: 0 32px 64px rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(18px);
      }
      section.card h2 {
        margin-top: 0;
        font-size: 1.6rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      section.card h3 {
        margin-top: 2rem;
        font-size: 1.1rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--muted);
      }
      .grid {
        display: grid;
        gap: 1.8rem;
      }
      @media (min-width: 1080px) {
        .grid-columns-3 {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .grid-columns-2 {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      ul.metric-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.75rem;
      }
      ul.metric-list li {
        font-size: 1rem;
        background: rgba(15, 23, 42, 0.65);
        border-radius: 12px;
        padding: 1rem 1.2rem;
        border: 1px solid rgba(56, 189, 248, 0.12);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
        border: 1px solid var(--border);
        font-size: 0.95rem;
      }
      table th,
      table td {
        padding: 0.7rem 0.9rem;
        border-bottom: 1px solid var(--border);
        text-align: left;
      }
      table th {
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.78rem;
      }
      pre.mermaid {
        background: rgba(15, 23, 42, 0.6);
        border-radius: 16px;
        padding: 1.4rem;
        border: 1px solid rgba(148, 163, 184, 0.3);
        overflow-x: auto;
      }
      #antifragility-chart {
        width: 100%;
        height: 280px;
        margin-top: 1.2rem;
        border-radius: 16px;
        border: 1px solid rgba(56, 189, 248, 0.25);
        background: rgba(15, 23, 42, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      footer {
        padding: 3rem 4vw;
        text-align: center;
        color: var(--muted);
        font-size: 0.85rem;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        background: rgba(56, 189, 248, 0.18);
        color: var(--accent);
        border-radius: 999px;
        padding: 0.4rem 0.9rem;
        font-size: 0.85rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    <header>
      <div class="badge">AGI Jobs v0 (v2) Superintelligence Console</div>
      <h1>${escapeHtml(meta.title)}</h1>
      <p class="meta">Generated ${escapeHtml(generatedAt)} • Version ${escapeHtml(meta.version)}</p>
      <p class="meta">${escapeHtml(meta.description)}</p>
    </header>
    <main>
      <section class="card grid grid-columns-3">
        <div>
          <h2>Thermodynamics</h2>
          <ul class="metric-list">
            <li>Gibbs free energy: <strong>${formatNumber(thermodynamics.gibbsFreeEnergyKJ)} kJ</strong></li>
            <li>Landauer limit: <strong>${formatNumber(thermodynamics.landauerKJ)} kJ</strong></li>
            <li>Free-energy margin: <strong>${formatNumber(thermodynamics.freeEnergyMarginKJ)} kJ</strong></li>
            <li>Burn energy per block: <strong>${formatNumber(thermodynamics.burnEnergyPerBlockKJ)} kJ</strong></li>
            <li>β inverse temperature: <strong>${formatNumber(statisticalPhysics.beta, 4)}</strong></li>
            <li>Partition function Z: <strong>${formatScientific(statisticalPhysics.partitionFunction)}</strong></li>
          </ul>
        </div>
        <div>
          <h2>Hamiltonian</h2>
          <ul class="metric-list">
            <li>Kinetic term: <strong>${formatNumber(hamiltonian.kineticTerm)}</strong></li>
            <li>Potential term: <strong>${formatNumber(hamiltonian.potentialTerm)}</strong></li>
            <li>Energy: <strong>${formatNumber(hamiltonian.hamiltonianValue)}</strong></li>
            <li>Δ check: <strong>${hamiltonian.difference.toExponential(3)}</strong></li>
          </ul>
        </div>
        <div>
          <h2>Superintelligence & Owner</h2>
          <ul class="metric-list">
            <li>Superintelligence index: <strong>${(alphaField.superintelligenceIndex * 100).toFixed(1)}%</strong></li>
            <li>Composite confidence: <strong>${(alphaField.confidenceScore * 100).toFixed(1)}%</strong></li>
            <li>Thermo / governance / antifragility / owner assurances:
              <strong>${(alphaField.thermodynamicAssurance * 100).toFixed(1)}%</strong> ·
              <strong>${(alphaField.governanceAssurance * 100).toFixed(1)}%</strong> ·
              <strong>${(alphaField.antifragilityAssurance * 100).toFixed(1)}%</strong> ·
              <strong>${(alphaField.ownerAssurance * 100).toFixed(1)}%</strong></li>
            <li>Owner: <strong>${escapeHtml(owner.owner)}</strong></li>
            <li>Pauser: <strong>${escapeHtml(owner.pauser)}</strong></li>
            <li>Treasury: <strong>${escapeHtml(owner.treasury)}</strong></li>
            <li>Timelock: <strong>${owner.timelockSeconds} seconds</strong></li>
          </ul>
        </div>
      </section>

      <section class="card">
        <h2>Energy → Governance Flow</h2>
        <pre class="mermaid">${flowDiagram}</pre>
      </section>

      <section class="card grid grid-columns-2">
        <div>
          <h2>Mint Ledger</h2>
          <p>Total minted per event: <strong>${formatNumber(incentives.mint.totalMinted)} tokens</strong> • Treasury mirror share ${formatPercent(
            incentives.mint.treasuryMirrorShare,
          )}</p>
          <table>
            <thead><tr><th>Role</th><th>Share</th><th>Minted</th></tr></thead>
            <tbody>${mintRows}</tbody>
          </table>
        </div>
        <div>
          <h2>Game-Theoretic Equilibrium</h2>
          <table>
            <thead>
              <tr>
                <th>Strategy</th><th>Replicator</th><th>Closed</th><th>Monte-Carlo</th><th>Continuous</th><th>Eigenvector</th>
              </tr>
            </thead>
            <tbody>${strategyRows}</tbody>
          </table>
          <p>Deviation Δmax: <strong>${equilibrium.maxMethodDeviation.toExponential(3)}</strong> • Divergence ${equilibrium.divergenceAtEquilibrium.toExponential(
            3,
          )}</p>
          <p>
            KKT payoff λ: <strong>${formatNumber(equilibrium.closedFormPayoff)} tokens</strong> • Residual Δmax
            <strong>${equilibrium.kktMaxResidual.toExponential(3)}</strong>
            (${equilibrium.kktCertified ? "certified" : "attention"}) • Simplex Δ
            <strong>${equilibrium.simplexResidual.toExponential(3)}</strong>
          </p>
          <table>
            <thead><tr><th>Condition</th><th>Residual</th></tr></thead>
            <tbody>${kktRowsHtml}</tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h2>Antifragility Tensor</h2>
        <pre class="mermaid">${antifragilityDiagram}</pre>
        <div id="antifragility-chart">Rendering antifragility curve…</div>
        <table>
          <thead><tr><th>σ</th><th>Welfare</th><th>Average payoff</th><th>Divergence</th></tr></thead>
          <tbody>${antifragilityRows}</tbody>
        </table>
      </section>

      <section class="card">
        <h2>Alpha-Field Sovereign Assurance</h2>
        <p>
          Confidence score: <strong>${(alphaField.confidenceScore * 100).toFixed(1)}%</strong> • Superintelligence index
          <strong>${(alphaField.superintelligenceIndex * 100).toFixed(1)}%</strong> • Energy margin
          ${formatNumber(alphaField.energyMarginKJ)} kJ
        </p>
        <table>
          <thead><tr><th>Signal</th><th>Value</th><th>Status</th></tr></thead>
          <tbody>${alphaFieldRows}</tbody>
        </table>
      </section>

      <section class="card grid grid-columns-2">
        <div>
          <h2>Risk Portfolio</h2>
          <p>Residual risk: <strong>${risk.portfolioResidual.toFixed(3)}</strong> • Threshold ${risk.threshold.toFixed(3)}</p>
          <pre class="mermaid">${riskDiagram}</pre>
          <table>
            <thead><tr><th>ID</th><th>Threat</th><th>Likelihood</th><th>Impact</th><th>Coverage</th><th>Residual</th></tr></thead>
            <tbody>${riskRows}</tbody>
          </table>
        </div>
        <div>
          <h2>Owner Command Surface</h2>
          <pre class="mermaid">${ownerDiagram}</pre>
          <h3>Monitoring Sentinels</h3>
          <ul>${sentinelList}</ul>
          <h3>Capabilities</h3>
          <table>
            <thead><tr><th>Capability</th><th>Category</th><th>Script</th><th>Status</th></tr></thead>
            <tbody>${capabilityRows}</tbody>
          </table>
        </div>
      </section>

      <section class="card grid grid-columns-2">
        <div>
          <h2>On-Chain Contracts</h2>
          <p>Network: <strong>${escapeHtml(blockchain.network)}</strong> • Gas target ${blockchain.gasTargetGwei} gwei • Confirmations ${
            blockchain.confirmations
          }</p>
          <table>
            <thead><tr><th>Contract</th><th>Address</th><th>Role</th></tr></thead>
            <tbody>${contractRows}</tbody>
          </table>
          <h3>Pausable Functions</h3>
          <table>
            <thead><tr><th>Contract</th><th>Function</th><th>Selector</th><th>Description</th></tr></thead>
            <tbody>${pausableRows}</tbody>
          </table>
        </div>
        <div>
          <h2>CI Enforcement</h2>
          <p>Workflow <strong>${escapeHtml(ci.workflow)}</strong> • Concurrency <code>${escapeHtml(ci.concurrency)}</code> • Coverage ≥ ${
            ci.minCoverage
          }%</p>
          <table>
            <thead><tr><th>Job ID</th><th>Name</th></tr></thead>
            <tbody>${ciRows}</tbody>
          </table>
          <h3>Jacobian Diagnostics</h3>
          <ul class="metric-list">
            <li>Gershgorin bound: <strong>${jacobian.gershgorinUpperBound.toExponential(3)}</strong></li>
            <li>Spectral radius: <strong>${jacobian.spectralRadius.toExponential(3)}</strong></li>
            <li>Analytic vs numeric Δ: <strong>${jacobian.maxDifference.toExponential(3)}</strong></li>
          </ul>
        </div>
      </section>
    </main>
    <footer>
      Solving α-AGI Governance — evidence that AGI Jobs v0 (v2) gives non-technical owners full-spectrum control over a
      civilisation-scale intelligence engine.
    </footer>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
      mermaid.initialize({ startOnLoad: true, theme: 'forest' });

      const antifragilityData = ${antifragilityData};
      const chart = document.querySelector('#antifragility-chart');
      if (chart && Array.isArray(antifragilityData) && antifragilityData.length > 0) {
        const width = 760;
        const height = 260;
        const padding = 42;
        const min = Math.min(...antifragilityData.map((d) => d.welfare));
        const max = Math.max(...antifragilityData.map((d) => d.welfare));
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.overflow = 'visible';

        const axis = document.createElementNS(svgNS, 'line');
        axis.setAttribute('x1', String(padding));
        axis.setAttribute('y1', String(height - padding));
        axis.setAttribute('x2', String(width - padding));
        axis.setAttribute('y2', String(height - padding));
        axis.setAttribute('stroke', 'rgba(148, 163, 184, 0.6)');
        axis.setAttribute('stroke-width', '1.5');
        svg.appendChild(axis);

        const yAxis = document.createElementNS(svgNS, 'line');
        yAxis.setAttribute('x1', String(padding));
        yAxis.setAttribute('y1', String(padding));
        yAxis.setAttribute('x2', String(padding));
        yAxis.setAttribute('y2', String(height - padding));
        yAxis.setAttribute('stroke', 'rgba(148, 163, 184, 0.6)');
        yAxis.setAttribute('stroke-width', '1.5');
        svg.appendChild(yAxis);

        const points = antifragilityData
          .map((point, index) => {
            const x = padding + (index / Math.max(antifragilityData.length - 1, 1)) * (width - padding * 2);
            const normalised = max === min ? 0.5 : (point.welfare - min) / (max - min);
            const y = height - padding - normalised * (height - padding * 2);
            return x + ',' + y;
          })
          .join(' ');

        const polyline = document.createElementNS(svgNS, 'polyline');
        polyline.setAttribute('points', points);
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke', 'url(#gradient)');
        polyline.setAttribute('stroke-width', '3');
        polyline.setAttribute('stroke-linejoin', 'round');
        polyline.setAttribute('stroke-linecap', 'round');
        svg.appendChild(polyline);

        const gradient = document.createElementNS(svgNS, 'linearGradient');
        gradient.setAttribute('id', 'gradient');
        gradient.setAttribute('x1', '0%');
        gradient.setAttribute('y1', '0%');
        gradient.setAttribute('x2', '100%');
        gradient.setAttribute('y2', '0%');
        const stop1 = document.createElementNS(svgNS, 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', '#38bdf8');
        const stop2 = document.createElementNS(svgNS, 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', '#f97316');
        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        const defs = document.createElementNS(svgNS, 'defs');
        defs.appendChild(gradient);
        svg.insertBefore(defs, svg.firstChild);

        antifragilityData.forEach((point, index) => {
          const x = padding + (index / Math.max(antifragilityData.length - 1, 1)) * (width - padding * 2);
          const normalised = max === min ? 0.5 : (point.welfare - min) / (max - min);
          const y = height - padding - normalised * (height - padding * 2);
          const circle = document.createElementNS(svgNS, 'circle');
          circle.setAttribute('cx', String(x));
          circle.setAttribute('cy', String(y));
          circle.setAttribute('r', '6');
          circle.setAttribute('fill', '#0ea5e9');
          circle.setAttribute('stroke', '#082f49');
          circle.setAttribute('stroke-width', '2');
          svg.appendChild(circle);

          const label = document.createElementNS(svgNS, 'text');
          label.setAttribute('x', String(x));
          label.setAttribute('y', String(y - 12));
          label.setAttribute('fill', '#bae6fd');
          label.setAttribute('font-size', '12');
          label.setAttribute('text-anchor', 'middle');
          label.textContent = point.welfare.toFixed(3);
          svg.appendChild(label);
        });

        chart.innerHTML = '';
        chart.appendChild(svg);
      }
    </script>
  </body>
</html>`;

  return html;
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
    alphaField: bundle.alphaField,
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
  computeAlphaField,
  computeRiskReport,
  computeIncentiveReport,
  computeOwnerReport,
  computeJacobian,
  computeBlockchainReport,
};

export async function generateGovernanceDemo(): Promise<ReportBundle> {
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
  const alphaField = computeAlphaField(
    mission,
    thermodynamics,
    statisticalPhysics,
    equilibrium,
    antifragility,
    risk,
    owner,
  );

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
    alphaField,
    blockchain,
    ci: mission.ci,
    divergenceTolerance: mission.hamiltonian.divergenceTolerance,
  };

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(REPORT_FILE, buildMarkdown(bundle), "utf8");
  await writeFile(SUMMARY_FILE, JSON.stringify(buildSummary(bundle), null, 2), "utf8");
  await writeFile(DASHBOARD_FILE, buildDashboardHtml(bundle), "utf8");

  return bundle;
}

async function main(): Promise<void> {
  await generateGovernanceDemo();

  console.log(`✅ Governance dossier generated: ${REPORT_FILE}`);
  console.log(`   Summary JSON: ${SUMMARY_FILE}`);
  console.log(`   Interactive dashboard: ${DASHBOARD_FILE}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to execute governance demo:", error);
    process.exitCode = 1;
  });
}

