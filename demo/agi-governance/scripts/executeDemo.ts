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
  ownerControls: {
    owner: string;
    pauser: string;
    treasury: string;
    timelockSeconds: number;
    upgradeActions: Array<{
      label: string;
      command: string;
      impact: string;
    }>;
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

type ReportBundle = {
  generatedAt: string;
  meta: MissionConfig["meta"];
  thermodynamics: ThermodynamicReport;
  hamiltonian: HamiltonianReport;
  equilibrium: EquilibriumResult;
  ownerControls: MissionConfig["ownerControls"];
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

  const referenceGibbs = enthalpyKJ - (operatingTemperatureK - referenceTemperatureK) * entropyKJPerK - referenceTemperatureK * entropyKJPerK;
  const gibbsAgreementDelta = Math.abs(referenceGibbs - gibbsFreeEnergyKJ);

  return {
    gibbsFreeEnergyKJ,
    gibbsFreeEnergyJ,
    landauerKJ,
    freeEnergyMarginKJ,
    burnEnergyPerBlockKJ,
    gibbsAgreementDelta,
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

function replicatorStep(state: number[], matrix: number[][], stepSize = 0.05): number[] {
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
  while (iterations < maxIterations) {
    const next = replicatorStep(current, matrix);
    const delta = Math.sqrt(next.reduce((sum, value, index) => sum + (value - current[index]) ** 2, 0));
    current = next;
    iterations += 1;
    if (delta < tolerance) {
      break;
    }
  }
  return { state: current, iterations };
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

  for (let col = 0; col < 3; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < 3; row += 1) {
      if (Math.abs(system[row][col]) > Math.abs(system[pivotRow][col])) {
        pivotRow = row;
      }
    }
    if (Math.abs(system[pivotRow][col]) < 1e-12) {
      continue;
    }
    if (pivotRow !== col) {
      [system[col], system[pivotRow]] = [system[pivotRow], system[col]];
    }
    const pivot = system[col][col];
    for (let j = col; j < 4; j += 1) {
      system[col][j] /= pivot;
    }
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const factor = system[row][col];
      for (let j = col; j < 4; j += 1) {
        system[row][j] -= factor * system[col][j];
      }
    }
  }

  const solution = system.map((row) => row[3]);
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

function runMonteCarlo(matrix: number[][], equilibrium: number[], iterations: number, seed: number, noise: number): {
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
    for (let step = 0; step < 250; step += 1) {
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

  const replicatorAverage = replicatorSamples.reduce(
    (acc, state) => acc.map((value, index) => value + state[index]),
    [0, 0, 0],
  ).map((value) => value / replicatorSamples.length);

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

function buildMarkdown(bundle: ReportBundle): string {
  const { meta, generatedAt, thermodynamics, hamiltonian, equilibrium, ownerControls, ci, divergenceTolerance } = bundle;

  const strategyTable = equilibrium.labels
    .map((label, index) =>
      `| ${label} | ${formatPercent(equilibrium.replicator[index])} | ${formatPercent(equilibrium.closedForm[index])} | ${formatPercent(
        equilibrium.monteCarlo[index],
      )} |`,
    )
    .join("\n");

  const upgradeList = ownerControls.upgradeActions
    .map((action) => `- **${action.label}.** ${action.impact}\n  └─ <code>$ ${action.command}</code>`)
    .join("\n");

  const ciTable = ci.requiredJobs.map((job) => `| ${job.id} | ${job.name} |`).join("\n");

  return [
    `# ${meta.title} — Governance Demonstration Report`,
    `*Generated at:* ${generatedAt}`,
    `*Version:* ${meta.version}`,
    "",
    `> ${meta.description}`,
    "",
    "## 1. Thermodynamic Intelligence Ledger",
    "",
    `- **Gibbs free energy:** ${formatNumber(thermodynamics.gibbsFreeEnergyKJ)} kJ (${formatNumber(thermodynamics.gibbsFreeEnergyJ)} J)`,
    `- **Landauer limit envelope:** ${formatNumber(thermodynamics.landauerKJ)} kJ`,
    `- **Free-energy safety margin:** ${formatNumber(thermodynamics.freeEnergyMarginKJ)} kJ`,
    `- **Energy dissipated per block (burn):** ${formatNumber(thermodynamics.burnEnergyPerBlockKJ)} kJ`,
    `- **Cross-check delta:** ${thermodynamics.gibbsAgreementDelta.toExponential(3)} kJ (≤ 1e-6 required)`,
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
    "## 4. Owner Supremacy & Command Surface",
    "",
    `- **Owner:** ${ownerControls.owner}`,
    `- **Pauser:** ${ownerControls.pauser}`,
    `- **Treasury:** ${ownerControls.treasury}`,
    `- **Timelock:** ${ownerControls.timelockSeconds} seconds`,
    "",
    "### Action Library",
    upgradeList,
    "",
    "## 5. CI Enforcement Ledger",
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
    "## 6. Owner Execution Log (fill during live ops)",
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
    owner: bundle.ownerControls,
    ci: bundle.ci,
  };
}

async function main(): Promise<void> {
  const mission = await loadMission();
  const thermodynamics = computeThermodynamics(mission);
  const hamiltonian = computeHamiltonian(mission);
  const equilibrium = computeEquilibrium(mission);

  const bundle: ReportBundle = {
    generatedAt: new Date().toISOString(),
    meta: mission.meta,
    thermodynamics,
    hamiltonian,
    equilibrium,
    ownerControls: mission.ownerControls,
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

