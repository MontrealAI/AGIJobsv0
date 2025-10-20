import path from "path";

import {
  generateGovernanceDemo,
  type GovernanceDemoOptions,
} from "./executeDemo";
import { validateGovernanceDemo } from "./validateReport";

const REPORT_DIR = path.join(__dirname, "..", "reports");
const COMMAND_DECK_REPORT = path.join(REPORT_DIR, "command-deck-report.md");
const COMMAND_DECK_SUMMARY = path.join(REPORT_DIR, "command-deck-summary.json");
const COMMAND_DECK_DASHBOARD = path.join(REPORT_DIR, "command-deck-dashboard.html");
const COMMAND_DECK_VALIDATION = path.join(REPORT_DIR, "command-deck-validation.json");
const COMMAND_DECK_VALIDATION_MD = path.join(REPORT_DIR, "command-deck-validation.md");
const MISSION_V2 = path.join(__dirname, "..", "config", "mission@v2.json");

function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(digits);
}

function formatBoolean(value: boolean): string {
  return value ? "yes" : "no";
}

async function run(): Promise<void> {
  const options: GovernanceDemoOptions = {
    missionFile: MISSION_V2,
    reportFile: COMMAND_DECK_REPORT,
    summaryFile: COMMAND_DECK_SUMMARY,
    dashboardFile: COMMAND_DECK_DASHBOARD,
  };

  const bundle = await generateGovernanceDemo(options);

  await validateGovernanceDemo({
    missionFile: MISSION_V2,
    summaryFile: COMMAND_DECK_SUMMARY,
    outputJson: COMMAND_DECK_VALIDATION,
    outputMarkdown: COMMAND_DECK_VALIDATION_MD,
  });

  const {
    thermodynamics,
    hamiltonian,
    antifragility,
    risk,
    owner,
    alphaField,
    quantum,
  } = bundle;

  console.log("✅ Command Deck dossier generated.");
  console.log(`   Report: ${COMMAND_DECK_REPORT}`);
  console.log(`   Summary: ${COMMAND_DECK_SUMMARY}`);
  console.log(`   Dashboard: ${COMMAND_DECK_DASHBOARD}`);
  console.log(`   Validation: ${COMMAND_DECK_VALIDATION}`);

  console.log("―――― Mission Metrics ――――");
  console.log(
    `Gibbs free energy = ${formatNumber(thermodynamics.gibbsFreeEnergyKJ)} kJ | margin = ${formatNumber(
      thermodynamics.freeEnergyMarginKJ,
    )} kJ | Landauer satisfied = ${formatBoolean(thermodynamics.landauerWithinMargin)}`,
  );
  console.log(
    `Hamiltonian value = ${formatNumber(hamiltonian.hamiltonianValue)} | Δ = ${formatNumber(
      hamiltonian.difference,
    )}`,
  );
  console.log(
    `Antifragility quadratic derivative = ${formatNumber(antifragility.quadraticSecondDerivative)} | monotonic increase = ${formatBoolean(
      antifragility.monotonicIncrease,
    )}`,
  );
  console.log(
    `Risk residual = ${formatNumber(risk.portfolioResidual)} | within bounds = ${formatBoolean(risk.withinBounds)}`,
  );
  console.log(
    `Owner coverage = ${formatBoolean(owner.fullCoverage)} | commands complete = ${formatBoolean(
      owner.allCommandsPresent,
    )} | verifications present = ${formatBoolean(owner.allVerificationsPresent)}`,
  );
  console.log(
    `α-field assurance :: thermo ${formatNumber(alphaField.thermodynamicAssurance)} | governance ${formatNumber(
      alphaField.governanceAssurance,
    )} | antifragility ${formatNumber(alphaField.antifragilityAssurance)} | owner ${formatNumber(
      alphaField.ownerAssurance,
    )} | quantum ${formatNumber(alphaField.quantumAssurance)}`,
  );
  console.log(
    `Quantum confidence = ${formatNumber(quantum.quantumConfidence)} | entropy bits = ${formatNumber(
      quantum.stateEntropyBits,
    )}`,
  );
}

if (require.main === module) {
  run().catch((error) => {
    console.error("❌ Command Deck generation failed:", error);
    process.exitCode = 1;
  });
}

export {
  COMMAND_DECK_REPORT,
  COMMAND_DECK_SUMMARY,
  COMMAND_DECK_DASHBOARD,
  COMMAND_DECK_VALIDATION,
  COMMAND_DECK_VALIDATION_MD,
  MISSION_V2,
};
