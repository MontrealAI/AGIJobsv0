import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import {
  type AntifragilityReport,
  type AlphaFieldReport,
  type BlockchainReport,
  type EquilibriumResult,
  type HamiltonianReport,
  type IncentiveReport,
  type JacobianReport,
  type MissionConfig,
  type OwnerControlReport,
  type RiskReport,
  type StatisticalPhysicsReport,
  type ThermodynamicReport,
  computeAntifragility,
  computeQuantumReport,
  computeAlphaField,
  computeBlockchainReport,
  computeEquilibrium,
  computeHamiltonian,
  computeIncentiveReport,
  computeJacobian,
  computeRiskReport,
  computeStatisticalPhysics,
  computeThermodynamics,
  computeOwnerReport,
  loadMission,
  loadPackageScripts,
  type QuantumReport,
} from "./executeDemo";

const REPORT_DIR = path.join(__dirname, "..", "reports");
const SUMMARY_FILE = path.join(REPORT_DIR, "governance-demo-summary.json");
export const VALIDATION_JSON = path.join(REPORT_DIR, "governance-demo-validation.json");
export const VALIDATION_MARKDOWN = path.join(REPORT_DIR, "governance-demo-validation.md");

interface ReportSummary {
  generatedAt: string;
  version: string;
  thermodynamics: ThermodynamicReport;
  statisticalPhysics: StatisticalPhysicsReport;
  hamiltonian: HamiltonianReport;
  equilibrium: EquilibriumResult;
  antifragility: AntifragilityReport;
  quantum: QuantumReport;
  alphaField: AlphaFieldReport;
  risk: RiskReport;
  incentives: IncentiveReport;
  owner: OwnerControlReport;
  jacobian: JacobianReport;
  blockchain: BlockchainReport;
  ci: MissionConfig["ci"];
}

type CheckResult = {
  id: string;
  description: string;
  passed: boolean;
  details: string;
  delta?: number;
  tolerance?: number;
};

export type ValidationReport = {
  generatedAt: string;
  summaryTimestamp: string;
  missionVersion: string;
  results: CheckResult[];
  totals: {
    passed: number;
    failed: number;
  };
  notes: string[];
};

function formatNumber(value: number, digits = 6): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(digits);
}

function maxAbsDifference(a: number[], b: number[]): number {
  let max = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    const delta = Math.abs(av - bv);
    if (delta > max) {
      max = delta;
    }
  }
  return max;
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0));
}

function replicatorDerivative(state: number[], matrix: number[][]): number[] {
  const payoffs = multiplyMatrixVector(matrix, state);
  const average = state.reduce((sum, value, index) => sum + value * payoffs[index], 0);
  return state.map((value, index) => value * (payoffs[index] - average));
}

function buildNumericCheck(
  id: string,
  description: string,
  expected: number,
  actual: number,
  tolerance: number,
): CheckResult {
  const delta = Math.abs(expected - actual);
  const passed = delta <= tolerance;
  return {
    id,
    description,
    passed,
    details: `expected ${formatNumber(expected)} vs actual ${formatNumber(actual)} (Δ=${formatNumber(delta)}, tol=${formatNumber(
      tolerance,
    )})`,
    delta,
    tolerance,
  };
}

function buildVectorCheck(
  id: string,
  description: string,
  expected: number[],
  actual: number[],
  tolerance: number,
): CheckResult {
  const delta = maxAbsDifference(expected, actual);
  return {
    id,
    description,
    passed: delta <= tolerance,
    details: `max Δ=${formatNumber(delta)} (tol=${formatNumber(tolerance)}) | expected=${expected
      .map((value) => formatNumber(value, 4))
      .join(", ")} actual=${actual.map((value) => formatNumber(value, 4)).join(", ")}`,
    delta,
    tolerance,
  };
}

function buildBooleanCheck(id: string, description: string, expected: boolean, actual: boolean): CheckResult {
  const passed = expected === actual;
  return {
    id,
    description,
    passed,
    details: `expected ${expected ? "true" : "false"}, actual ${actual ? "true" : "false"}`,
  };
}

function capabilityMap(report: OwnerControlReport): Map<string, { present: boolean; scriptExists: boolean }> {
  const map = new Map<string, { present: boolean; scriptExists: boolean }>();
  for (const capability of report.capabilities) {
    map.set(capability.category, { present: capability.present, scriptExists: capability.scriptExists });
  }
  return map;
}

async function loadSummary(): Promise<ReportSummary> {
  const raw = await readFile(SUMMARY_FILE, "utf8");
  return JSON.parse(raw) as ReportSummary;
}

export async function validateGovernanceDemo(): Promise<ValidationReport> {
  const notes: string[] = [];
  let summary: ReportSummary;
  try {
    summary = await loadSummary();
  } catch (error) {
    throw new Error(
      `Unable to load summary report at ${SUMMARY_FILE}. Run \"npm run demo:agi-governance\" before validating.`,
    );
  }

  const mission = await loadMission();
  const packageScripts = await loadPackageScripts();

  const thermodynamics = computeThermodynamics(mission);
  const statisticalPhysics = computeStatisticalPhysics(mission, thermodynamics);
  const hamiltonian = computeHamiltonian(mission);
  const equilibrium = computeEquilibrium(mission);
  const antifragility = computeAntifragility(mission, mission.gameTheory.payoffMatrix, equilibrium, thermodynamics);
  const quantum = computeQuantumReport(mission, thermodynamics);
  const risk = computeRiskReport(mission);
  const incentives = computeIncentiveReport(mission);
  const owner = computeOwnerReport(mission, packageScripts);
  const alphaField = computeAlphaField(
    mission,
    thermodynamics,
    statisticalPhysics,
    equilibrium,
    antifragility,
    risk,
    owner,
    quantum,
  );
  const jacobian = computeJacobian(mission.gameTheory.payoffMatrix, equilibrium.closedForm);
  const blockchain = computeBlockchainReport(mission);

  const results: CheckResult[] = [];

  results.push(
    buildNumericCheck(
      "thermo:gibbs",
      "Gibbs free energy consistency",
      thermodynamics.gibbsFreeEnergyKJ,
      summary.thermodynamics.gibbsFreeEnergyKJ,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "thermo:landauer",
      "Landauer limit reproduction",
      thermodynamics.landauerKJ,
      summary.thermodynamics.landauerKJ,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "stat:partition",
      "Partition function cross-check",
      statisticalPhysics.partitionFunction,
      summary.statisticalPhysics.partitionFunction,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "stat:free-energy",
      "Statistical free energy",
      statisticalPhysics.freeEnergyKJ,
      summary.statisticalPhysics.freeEnergyKJ,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "hamiltonian:value",
      "Hamiltonian energy",
      hamiltonian.hamiltonianValue,
      summary.hamiltonian.hamiltonianValue,
      1e-6,
    ),
  );
  results.push(
    buildVectorCheck(
      "equilibrium:replicator",
      "Replicator equilibrium vector",
      equilibrium.replicator,
      summary.equilibrium.replicator,
      1e-6,
    ),
  );
  results.push(
    buildVectorCheck(
      "equilibrium:closed-form",
      "Closed-form equilibrium vector",
      equilibrium.closedForm,
      summary.equilibrium.closedForm,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "equilibrium:max-deviation",
      "Maximum deviation across methods",
      equilibrium.maxMethodDeviation,
      summary.equilibrium.maxMethodDeviation,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "equilibrium:closed-form-payoff",
      "Closed-form equilibrium payoff",
      equilibrium.closedFormPayoff,
      summary.equilibrium.closedFormPayoff,
      1e-6,
    ),
  );
  results.push(
    buildVectorCheck(
      "equilibrium:kkt-residuals",
      "KKT payoff residuals",
      equilibrium.kktResiduals,
      summary.equilibrium.kktResiduals,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "equilibrium:kkt-max",
      "Maximum KKT residual",
      equilibrium.kktMaxResidual,
      summary.equilibrium.kktMaxResidual,
      1e-9,
    ),
  );
  results.push(
    buildNumericCheck(
      "equilibrium:simplex",
      "Probability simplex residual",
      equilibrium.simplexResidual,
      summary.equilibrium.simplexResidual,
      1e-9,
    ),
  );
  results.push(
    buildBooleanCheck(
      "equilibrium:kkt-certified",
      "KKT conditions certified",
      equilibrium.kktCertified,
      summary.equilibrium.kktCertified,
    ),
  );
  results.push(
    buildNumericCheck(
      "antifragility:curvature",
      "Antifragility quadratic curvature",
      antifragility.quadraticSecondDerivative,
      summary.antifragility.quadraticSecondDerivative,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "alpha-field:stackelberg-advantage",
      "Stackelberg advantage",
      alphaField.stackelbergAdvantage,
      summary.alphaField.stackelbergAdvantage,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "alpha-field:gibbs-delta",
      "Gibbs delta",
      alphaField.gibbsDeltaKJ,
      summary.alphaField.gibbsDeltaKJ,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "alpha-field:sigma-gain",
      "Sigma welfare gain",
      alphaField.sigmaGain,
      summary.alphaField.sigmaGain,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "alpha-field:confidence",
      "Alpha-field confidence score",
      alphaField.confidenceScore,
      summary.alphaField.confidenceScore,
      1e-6,
    ),
  );
  results.push(
    buildBooleanCheck(
      "alpha-field:stackelberg-bound",
      "Stackelberg advantage within bound",
      alphaField.stackelbergWithinBound,
      summary.alphaField.stackelbergWithinBound,
    ),
  );
  results.push(
    buildBooleanCheck(
      "alpha-field:stackelberg-floor",
      "Stackelberg advantage floor satisfied",
      alphaField.stackelbergAdvantageSatisfiesFloor,
      summary.alphaField.stackelbergAdvantageSatisfiesFloor,
    ),
  );
  results.push(
    buildBooleanCheck(
      "alpha-field:gibbs-within",
      "Gibbs delta within tolerance",
      alphaField.gibbsWithinTolerance,
      summary.alphaField.gibbsWithinTolerance,
    ),
  );
  results.push(
    buildBooleanCheck(
      "alpha-field:divergence",
      "Equilibrium divergence within limit",
      alphaField.divergenceWithinLimit,
      summary.alphaField.divergenceWithinLimit,
    ),
  );
  results.push(
    buildBooleanCheck(
      "alpha-field:entropy",
      "Entropy above floor",
      alphaField.entropyAboveFloor,
      summary.alphaField.entropyAboveFloor,
    ),
  );
  results.push(
    buildBooleanCheck(
      "alpha-field:antifragility",
      "Antifragility curvature meets minimum",
      alphaField.antifragilityMeetsMinimum,
      summary.alphaField.antifragilityMeetsMinimum,
    ),
  );
  results.push(
    buildBooleanCheck(
      "alpha-field:sigma",
      "Sigma gain satisfied",
      alphaField.sigmaGainSatisfied,
      summary.alphaField.sigmaGainSatisfied,
    ),
  );
  results.push(
    buildBooleanCheck(
      "alpha-field:owner-coverage",
      "Owner coverage minimum met",
      alphaField.ownerCoverageSatisfied,
      summary.alphaField.ownerCoverageSatisfied,
    ),
  );
  results.push(
    buildBooleanCheck(
      "alpha-field:energy-margin",
      "Energy margin floor met",
      alphaField.energyMarginSatisfied,
      summary.alphaField.energyMarginSatisfied,
    ),
  );
  results.push(
    buildBooleanCheck(
      "alpha-field:quantum-confidence-floor",
      "Quantum confidence floor satisfied",
      alphaField.quantumConfidenceSatisfied,
      summary.alphaField.quantumConfidenceSatisfied,
    ),
  );
  results.push(
    buildNumericCheck(
      "quantum:coherence",
      "Quantum coherence confidence",
      quantum.quantumConfidence,
      summary.quantum.quantumConfidence,
      1e-9,
    ),
  );
  results.push(
    buildNumericCheck(
      "quantum:thermo-delta",
      "Quantum free-energy delta",
      quantum.thermoMarginDeltaKJ,
      summary.quantum.thermoMarginDeltaKJ,
      1e-9,
    ),
  );
  results.push(
    buildNumericCheck(
      "quantum:charge-delta",
      "Noether charge delta",
      quantum.chargeDelta,
      summary.quantum.chargeDelta,
      1e-9,
    ),
  );
  results.push(
    buildNumericCheck(
      "quantum:state-entropy",
      "Quantum state entropy",
      quantum.stateEntropyBits,
      summary.quantum.stateEntropyBits,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "quantum:weight-sum",
      "Quantum weight sum delta",
      quantum.weightSumDelta,
      summary.quantum.weightSumDelta,
      1e-9,
    ),
  );
  results.push(
    buildBooleanCheck(
      "quantum:charge-within",
      "Noether charge within tolerance",
      quantum.chargeWithinTolerance,
      summary.quantum.chargeWithinTolerance,
    ),
  );
  results.push(
    buildNumericCheck(
      "risk:portfolio",
      "Portfolio residual risk",
      risk.portfolioResidual,
      summary.risk.portfolioResidual,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "incentives:mint",
      "Total minted tokens",
      incentives.mint.totalMinted,
      summary.incentives.mint.totalMinted,
      1e-6,
    ),
  );
  results.push(
    buildNumericCheck(
      "incentives:equality",
      "Agent ↔ treasury mint parity",
      incentives.mint.equalityDelta,
      summary.incentives.mint.equalityDelta,
      1e-6,
    ),
  );
  results.push(
    buildVectorCheck(
      "jacobian:analytic",
      "Jacobian analytic entries",
      jacobian.analytic.flat(),
      summary.jacobian.analytic.flat(),
      1e-6,
    ),
  );
  results.push(
    buildVectorCheck(
      "jacobian:numeric",
      "Jacobian numeric entries",
      jacobian.numeric.flat(),
      summary.jacobian.numeric.flat(),
      1e-6,
    ),
  );

  const capabilityComparison = buildBooleanCheck(
    "owner:full-coverage",
    "Owner capability coverage",
    owner.fullCoverage,
    summary.owner.fullCoverage,
  );
  results.push(capabilityComparison);

  const commandsComparison = buildBooleanCheck(
    "owner:command-scripts",
    "Owner command scripts present",
    owner.allCommandsPresent,
    summary.owner.allCommandsPresent,
  );
  results.push(commandsComparison);

  const capabilityDelta = (() => {
    const expected = capabilityMap(owner);
    const actual = capabilityMap(summary.owner);
    let mismatch = false;
    for (const [category, info] of expected.entries()) {
      const target = actual.get(category);
      if (!target || target.present !== info.present || target.scriptExists !== info.scriptExists) {
        mismatch = true;
        break;
      }
    }
    return buildBooleanCheck(
      "owner:capability-map",
      "Owner capability presence parity",
      true,
      !mismatch,
    );
  })();
  results.push(capabilityDelta);

  const missionDivergenceCheck = buildBooleanCheck(
    "equilibrium:divergence",
    "Equilibrium divergence within mission tolerance",
    true,
    summary.equilibrium.divergenceAtEquilibrium <= mission.hamiltonian.divergenceTolerance,
  );
  results.push(missionDivergenceCheck);

  const antifragilitySignCheck = buildBooleanCheck(
    "antifragility:positive-curvature",
    "Antifragility curvature positive",
    true,
    summary.antifragility.quadraticSecondDerivative > 0,
  );
  results.push(antifragilitySignCheck);

  const mintParityCheck = buildBooleanCheck(
    "incentives:mirror-share",
    "Treasury mirror share matches agent share",
    true,
    Math.abs(summary.incentives.mint.mintedAgent - summary.incentives.mint.mintedTreasury) <= summary.incentives.mint.tolerance,
  );
  results.push(mintParityCheck);

  results.push(
    buildBooleanCheck(
      "risk:within-bounds",
      "Risk portfolio within threshold",
      risk.withinBounds,
      summary.risk.withinBounds,
    ),
  );

  results.push(
    buildBooleanCheck(
      "blockchain:safe-mainnet",
      "Blockchain configuration marked mainnet-safe",
      blockchain.safeForMainnet,
      summary.blockchain.safeForMainnet,
    ),
  );

  results.push(
    buildBooleanCheck(
      "owner:address",
      "Owner address matches mission manifest",
      true,
      summary.owner.owner === mission.ownerControls.owner,
    ),
  );

  results.push(
    buildBooleanCheck(
      "ci:workflow",
      "CI workflow label matches mission manifest",
      true,
      summary.ci.workflow === mission.ci.workflow,
    ),
  );

  const derivative = replicatorDerivative(summary.equilibrium.closedForm, mission.gameTheory.payoffMatrix);
  const derivativeNorm = Math.sqrt(derivative.reduce((sum, value) => sum + value * value, 0));
  results.push(
    buildNumericCheck(
      "equilibrium:derivative-norm",
      "Replicator derivative norm",
      0,
      derivativeNorm,
      1e-6,
    ),
  );

  const totals = {
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
  };

  if (totals.failed === 0) {
    notes.push("All validation checks passed without deviation beyond tolerance.");
  } else {
    notes.push("One or more validation checks exceeded tolerance. Inspect the report for details.");
  }

  const validationReport: ValidationReport = {
    generatedAt: new Date().toISOString(),
    summaryTimestamp: summary.generatedAt,
    missionVersion: mission.meta.version,
    results,
    totals,
    notes,
  };

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(VALIDATION_JSON, JSON.stringify(validationReport, null, 2), "utf8");

  const markdownLines = [
    "# Governance Demo Validation",
    `*Generated at:* ${validationReport.generatedAt}`,
    `*Summary timestamp:* ${summary.generatedAt}`,
    `*Mission version:* ${mission.meta.version}`,
    "",
    "| Check | Status | Details |",
    "| --- | --- | --- |",
    ...results.map((result) => `| ${result.id} | ${result.passed ? "✅" : "❌"} | ${result.details.replace(/\\|/g, "\\|")} |`),
    "",
    ...notes.map((note) => `- ${note}`),
  ];
  await writeFile(VALIDATION_MARKDOWN, markdownLines.join("\n"), "utf8");

  return validationReport;
}

async function main(): Promise<void> {
  const validationReport = await validateGovernanceDemo();

  if (validationReport.totals.failed === 0) {
    console.log(`✅ Governance dossier validation passed: ${VALIDATION_JSON}`);
    console.log(`   Markdown summary: ${VALIDATION_MARKDOWN}`);
  } else {
    console.error("❌ Governance dossier validation detected failures.");
    console.error(`   See ${VALIDATION_JSON}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to validate governance demo report:", error);
    process.exitCode = 1;
  });
}
