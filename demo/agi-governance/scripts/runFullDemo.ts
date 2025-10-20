import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { performance } from "perf_hooks";

import {
  generateGovernanceDemo,
  REPORT_DIR as DEMO_REPORT_DIR,
  REPORT_FILE as GOVERNANCE_REPORT_FILE,
  SUMMARY_FILE as GOVERNANCE_SUMMARY_FILE,
  DASHBOARD_FILE as GOVERNANCE_DASHBOARD_FILE,
  OWNER_MATRIX_JSON_FILE,
  OWNER_MATRIX_MARKDOWN_FILE,
  type GovernanceDemoOptions,
  type ReportBundle,
} from "./executeDemo";
import {
  validateGovernanceDemo,
  VALIDATION_JSON as VALIDATION_JSON_FILE,
  VALIDATION_MARKDOWN as VALIDATION_MARKDOWN_FILE,
  type ValidationOptions,
  type ValidationReport,
} from "./validateReport";
import {
  verifyCiShield,
  assessCiShield,
  OUTPUT_FILE as CI_OUTPUT_FILE,
  type MissionCi,
  type VerificationResult,
  type VerifyCiOptions,
} from "./verifyCiStatus";
import {
  collectOwnerDiagnostics,
  JSON_REPORT as OWNER_JSON_FILE,
  MARKDOWN_REPORT as OWNER_MARKDOWN_FILE,
  type AggregatedReport,
  type OwnerDiagnosticsOptions,
} from "./collectOwnerDiagnostics";

const FULL_RUN_JSON = path.join(DEMO_REPORT_DIR, "governance-demo-full-run.json");
const FULL_RUN_MARKDOWN = path.join(DEMO_REPORT_DIR, "governance-demo-full-run.md");

export interface FullDemoOptions {
  demo?: GovernanceDemoOptions;
  validation?: ValidationOptions;
  ci?: VerifyCiOptions;
  owner?: OwnerDiagnosticsOptions;
  outputJson?: string;
  outputMarkdown?: string;
}

type StepStatus = "success" | "warning" | "error";

type StepSummary = {
  id: string;
  label: string;
  status: StepStatus;
  durationMs: number;
  details: string;
};

type FullRunSummary = {
  generatedAt: string;
  totalDurationMs: number;
  steps: StepSummary[];
  metrics: {
    gibbsFreeEnergyKJ: number;
    freeEnergyMarginKJ: number;
    antifragilitySecondDerivative: number;
    equilibriumMaxDeviation: number;
    riskPortfolioResidual: number;
    jacobianStable: boolean;
    ownerFullCoverage: boolean;
    ownerAllCommandsPresent: boolean;
    ownerAllVerificationsPresent: boolean;
    ownerSupremacyIndex: number;
    ownerSupremacySatisfied: boolean;
    ciShieldOk: boolean;
    ownerReadiness: AggregatedReport["readiness"];
    alphaFieldConfidence: number;
    alphaFieldWithinBound: boolean;
    alphaFieldEnergyMargin: boolean;
    alphaFieldSuperintelligence: number;
    alphaFieldSuperintelligenceSatisfied: boolean;
    alphaFieldThermoAssurance: number;
    alphaFieldGovernanceAssurance: number;
    alphaFieldAntifragilityAssurance: number;
    alphaFieldOwnerAssurance: number;
    quantumConfidence: number;
    quantumChargeWithinTolerance: boolean;
    quantumThermoDeltaKJ: number;
    quantumThermoAligned: boolean;
    quantumThermoDriftMaximumKJ: number;
    quantumEntropyBits: number;
  };
  ciIssues: string[];
  ownerWarnings: number;
  ownerErrors: number;
  artifacts: {
    report: string;
    summary: string;
    dashboard: string;
    ownerMatrixJson: string;
    ownerMatrixMarkdown: string;
    validationJson: string;
    validationMarkdown: string;
    ciReport: string;
    ownerJson: string;
    ownerMarkdown: string;
  };
};

function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(digits);
}

function formatMs(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${formatNumber(value / 1000, 2)} s`;
}

function resolveWithDir(baseFile: string, overrideFile?: string, overrideDir?: string): string {
  if (overrideFile) {
    return path.resolve(overrideFile);
  }
  if (overrideDir) {
    return path.resolve(overrideDir, path.basename(baseFile));
  }
  return path.resolve(baseFile);
}

function statusIcon(status: StepStatus): string {
  switch (status) {
    case "success":
      return "✅";
    case "warning":
      return "⚠️";
    case "error":
      return "❌";
    default:
      return "ℹ️";
  }
}

function statusClass(status: StepStatus): string {
  switch (status) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "error";
    default:
      return "neutral";
  }
}

function buildMermaidTimeline(steps: StepSummary[]): string {
  const nodes = steps
    .map(
      (step, index) =>
        `  ${String.fromCharCode(65 + index)}[${step.label} ${statusIcon(step.status)}]:::${statusClass(step.status)}`,
    )
    .join("\n");
  const edges = steps
    .slice(1)
    .map((_, index) => `  ${String.fromCharCode(65 + index)} --> ${String.fromCharCode(65 + index + 1)}`)
    .join("\n");
  return [
    "```mermaid",
    "graph LR",
    nodes,
    edges,
    "  classDef success fill:#0f172a,stroke:#22d3ee,stroke-width:2px,color:#f8fafc;",
    "  classDef warning fill:#1f2937,stroke:#f97316,stroke-width:2px,color:#fde68a;",
    "  classDef error fill:#450a0a,stroke:#ef4444,stroke-width:2px,color:#fee2e2;",
    "  classDef neutral fill:#111827,stroke:#64748b,stroke-width:2px,color:#cbd5f5;",
    "```",
  ]
    .filter(Boolean)
    .join("\n");
}

function summariseValidation(validation: ValidationReport): string {
  const totalChecks = validation.totals.passed + validation.totals.failed;
  if (validation.totals.failed === 0) {
    return `All ${totalChecks} checks passed`;
  }
  const failed = validation.results.filter((result) => !result.passed).map((result) => result.id);
  return `Failures: ${failed.join(", ")}`;
}

function summariseDiagnostics(report: AggregatedReport): string {
  if (report.readiness === "ready") {
    return "All owner automation commands executed successfully.";
  }
  const warnings = report.results
    .filter((result) => result.severity === "warning")
    .map((result) => `[${result.script}] ${result.summary}`)
    .join(" | ");
  const errors = report.results
    .filter((result) => result.severity === "error")
    .map((result) => `[${result.script}] ${result.summary}`)
    .join(" | ");
  const parts: string[] = [];
  if (warnings) {
    parts.push(`Warnings: ${warnings}`);
  }
  if (errors) {
    parts.push(`Errors: ${errors}`);
  }
  return parts.join(" | ") || "Diagnostics completed.";
}

export async function runFullDemo(options: FullDemoOptions = {}): Promise<FullRunSummary> {
  const demoOptions: GovernanceDemoOptions = options.demo ?? {};
  const reportFile = resolveWithDir(GOVERNANCE_REPORT_FILE, demoOptions.reportFile, demoOptions.reportDir);
  const summaryFile = resolveWithDir(GOVERNANCE_SUMMARY_FILE, demoOptions.summaryFile, demoOptions.reportDir);
  const dashboardFile = resolveWithDir(GOVERNANCE_DASHBOARD_FILE, demoOptions.dashboardFile, demoOptions.reportDir);
  const ownerMatrixJsonPath = resolveWithDir(
    OWNER_MATRIX_JSON_FILE,
    demoOptions.ownerMatrixJsonFile,
    demoOptions.reportDir,
  );
  const ownerMatrixMarkdownPath = resolveWithDir(
    OWNER_MATRIX_MARKDOWN_FILE,
    demoOptions.ownerMatrixMarkdownFile,
    demoOptions.reportDir,
  );

  const generationOptions: GovernanceDemoOptions = {
    ...demoOptions,
    reportDir: path.dirname(reportFile),
    reportFile,
    summaryFile,
    dashboardFile,
    ownerMatrixJsonFile: ownerMatrixJsonPath,
    ownerMatrixMarkdownFile: ownerMatrixMarkdownPath,
  };

  const validationSummaryPath = resolveWithDir(
    GOVERNANCE_SUMMARY_FILE,
    options.validation?.summaryFile,
    path.dirname(summaryFile),
  );
  const validationJsonPath = resolveWithDir(
    VALIDATION_JSON_FILE,
    options.validation?.outputJson,
    path.dirname(validationSummaryPath),
  );
  const validationMarkdownPath = resolveWithDir(
    VALIDATION_MARKDOWN_FILE,
    options.validation?.outputMarkdown,
    path.dirname(validationSummaryPath),
  );

  const validationOptions: ValidationOptions = {
    ...options.validation,
    missionFile: options.validation?.missionFile ?? demoOptions.missionFile,
    summaryFile: validationSummaryPath,
    outputJson: validationJsonPath,
    outputMarkdown: validationMarkdownPath,
  };

  const ciOutputPath = resolveWithDir(CI_OUTPUT_FILE, options.ci?.outputFile, demoOptions.reportDir);
  const ciOptions: VerifyCiOptions = {
    ...options.ci,
    missionFile: options.ci?.missionFile ?? demoOptions.missionFile,
    outputFile: ciOutputPath,
  };

  const ownerJsonPath = resolveWithDir(
    OWNER_JSON_FILE,
    options.owner?.jsonFile,
    options.owner?.reportDir ?? demoOptions.reportDir,
  );
  const ownerMarkdownPath = resolveWithDir(
    OWNER_MARKDOWN_FILE,
    options.owner?.markdownFile,
    options.owner?.reportDir ?? demoOptions.reportDir,
  );
  const ownerOptions: OwnerDiagnosticsOptions = {
    ...options.owner,
    silent: options.owner?.silent ?? true,
    jsonFile: ownerJsonPath,
    markdownFile: ownerMarkdownPath,
    missionFile: options.owner?.missionFile ?? demoOptions.missionFile,
  };

  const fullRunJsonPath = resolveWithDir(FULL_RUN_JSON, options.outputJson, demoOptions.reportDir);
  const fullRunMarkdownPath = resolveWithDir(FULL_RUN_MARKDOWN, options.outputMarkdown, demoOptions.reportDir);

  await mkdir(path.dirname(fullRunJsonPath), { recursive: true });
  await mkdir(path.dirname(fullRunMarkdownPath), { recursive: true });

  const steps: StepSummary[] = [];
  const start = performance.now();

  const generateStart = performance.now();
  const bundle = await generateGovernanceDemo(generationOptions);
  steps.push({
    id: "generate",
    label: "Generate dossier",
    status: "success",
    durationMs: performance.now() - generateStart,
    details: `Free-energy margin ${formatNumber(bundle.thermodynamics.freeEnergyMarginKJ, 2)} kJ · Max method deviation ${formatNumber(
      bundle.equilibrium.maxMethodDeviation,
      6,
    )}`,
  });

  const validationStart = performance.now();
  const validation = await validateGovernanceDemo(validationOptions);
  const validationStatus: StepStatus = validation.totals.failed === 0 ? "success" : "error";
  steps.push({
    id: "validate",
    label: "Validate physics",
    status: validationStatus,
    durationMs: performance.now() - validationStart,
    details: summariseValidation(validation),
  });

  const ciStart = performance.now();
  const { ciConfig, verification } = await verifyCiShield(ciOptions);
  const ciAssessment = assessCiShield(ciConfig, verification);
  const ciStatus: StepStatus = ciAssessment.ok ? "success" : "error";
  steps.push({
    id: "ci",
    label: "Audit CI shield",
    status: ciStatus,
    durationMs: performance.now() - ciStart,
    details: ciAssessment.ok ? "All enforcement guards locked." : ciAssessment.issues.join(" | "),
  });

  const diagnosticsStart = performance.now();
  const diagnostics = await collectOwnerDiagnostics(ownerOptions);
  const diagnosticsStatus: StepStatus =
    diagnostics.readiness === "ready"
      ? "success"
      : diagnostics.readiness === "attention"
      ? "warning"
      : "error";
  steps.push({
    id: "owner",
    label: "Owner diagnostics",
    status: diagnosticsStatus,
    durationMs: performance.now() - diagnosticsStart,
    details: summariseDiagnostics(diagnostics),
  });

  const summary: FullRunSummary = {
    generatedAt: new Date().toISOString(),
    totalDurationMs: performance.now() - start,
    steps,
    metrics: {
      gibbsFreeEnergyKJ: bundle.thermodynamics.gibbsFreeEnergyKJ,
      freeEnergyMarginKJ: bundle.thermodynamics.freeEnergyMarginKJ,
      antifragilitySecondDerivative: bundle.antifragility.quadraticSecondDerivative,
      equilibriumMaxDeviation: bundle.equilibrium.maxMethodDeviation,
      riskPortfolioResidual: bundle.risk.portfolioResidual,
      jacobianStable: bundle.jacobian.stable,
      ownerFullCoverage: bundle.owner.fullCoverage,
      ownerAllCommandsPresent: bundle.owner.allCommandsPresent,
      ownerAllVerificationsPresent: bundle.owner.allVerificationsPresent,
      ownerSupremacyIndex: bundle.alphaField.ownerSupremacyIndex,
      ownerSupremacySatisfied: bundle.alphaField.ownerSupremacySatisfied,
      ciShieldOk: ciAssessment.ok,
      ownerReadiness: diagnostics.readiness,
      alphaFieldConfidence: bundle.alphaField.confidenceScore,
      alphaFieldWithinBound: bundle.alphaField.stackelbergWithinBound,
      alphaFieldEnergyMargin: bundle.alphaField.energyMarginSatisfied,
      alphaFieldSuperintelligence: bundle.alphaField.superintelligenceIndex,
      alphaFieldSuperintelligenceSatisfied: bundle.alphaField.superintelligenceSatisfied,
      alphaFieldThermoAssurance: bundle.alphaField.thermodynamicAssurance,
      alphaFieldGovernanceAssurance: bundle.alphaField.governanceAssurance,
      alphaFieldAntifragilityAssurance: bundle.alphaField.antifragilityAssurance,
      alphaFieldOwnerAssurance: bundle.alphaField.ownerAssurance,
      quantumConfidence: bundle.quantum.quantumConfidence,
      quantumChargeWithinTolerance: bundle.quantum.chargeWithinTolerance,
      quantumThermoDeltaKJ: bundle.alphaField.thermoQuantumDeltaKJ,
      quantumThermoAligned: bundle.alphaField.thermoQuantumAligned,
      quantumThermoDriftMaximumKJ: bundle.alphaField.thermoQuantumDriftMaximumKJ,
      quantumEntropyBits: bundle.quantum.stateEntropyBits,
    },
    ciIssues: ciAssessment.issues,
    ownerWarnings: diagnostics.totals.warning,
    ownerErrors: diagnostics.totals.error,
    artifacts: {
      report: reportFile,
      summary: summaryFile,
      dashboard: dashboardFile,
      ownerMatrixJson: ownerMatrixJsonPath,
      ownerMatrixMarkdown: ownerMatrixMarkdownPath,
      validationJson: validationJsonPath,
      validationMarkdown: validationMarkdownPath,
      ciReport: ciOutputPath,
      ownerJson: ownerJsonPath,
      ownerMarkdown: ownerMarkdownPath,
    },
  };

  await writeFile(fullRunJsonPath, JSON.stringify(summary, null, 2), "utf8");

  const stepTable = [
    "| Step | Status | Duration | Details |",
    "| --- | --- | --- | --- |",
    ...steps.map(
      (step) =>
        `| ${step.label} | ${statusIcon(step.status)} | ${formatMs(step.durationMs)} | ${step.details.replace(/\\|/g, "\\|")} |`,
    ),
  ].join("\n");

  const metricsList = [
    `- Gibbs free energy: ${formatNumber(summary.metrics.gibbsFreeEnergyKJ, 2)} kJ`,
    `- Free-energy margin: ${formatNumber(summary.metrics.freeEnergyMarginKJ, 2)} kJ`,
    `- Antifragility curvature (2a): ${summary.metrics.antifragilitySecondDerivative.toExponential(2)}`,
    `- Equilibrium max deviation: ${formatNumber(summary.metrics.equilibriumMaxDeviation, 6)}`,
    `- Risk portfolio residual: ${formatNumber(summary.metrics.riskPortfolioResidual, 3)}`,
    `- Alpha-field confidence: ${(summary.metrics.alphaFieldConfidence * 100).toFixed(1)}%`,
    `- Superintelligence index: ${(summary.metrics.alphaFieldSuperintelligence * 100).toFixed(1)}% (${summary.metrics.alphaFieldSuperintelligenceSatisfied ? "✅" : "⚠️"})`,
    `- Stackelberg bound respected: ${summary.metrics.alphaFieldWithinBound ? "✅" : "⚠️"}`,
    `- Thermodynamic assurance: ${(summary.metrics.alphaFieldThermoAssurance * 100).toFixed(1)}%`,
    `- Governance assurance: ${(summary.metrics.alphaFieldGovernanceAssurance * 100).toFixed(1)}%`,
    `- Antifragility assurance: ${(summary.metrics.alphaFieldAntifragilityAssurance * 100).toFixed(1)}%`,
    `- Owner assurance: ${(summary.metrics.alphaFieldOwnerAssurance * 100).toFixed(1)}%`,
    `- Quantum coherence: ${(summary.metrics.quantumConfidence * 100).toFixed(1)}% (${summary.metrics.quantumChargeWithinTolerance ? "aligned charge" : "⚠️ charge drift"})`,
    `- Quantum free-energy delta: ${summary.metrics.quantumThermoDeltaKJ.toExponential(3)} kJ`,
    `- Thermo ↔ quantum alignment: ${summary.metrics.quantumThermoAligned ? "✅" : "⚠️"} (limit ${summary.metrics.quantumThermoDriftMaximumKJ.toExponential(3)} kJ)`,
    `- Quantum state entropy: ${summary.metrics.quantumEntropyBits.toFixed(3)} bits`,
    `- Energy margin floor met: ${summary.metrics.alphaFieldEnergyMargin ? "✅" : "⚠️"}`,
    `- Jacobian stable: ${summary.metrics.jacobianStable ? "✅" : "❌"}`,
    `- Owner capability coverage: ${summary.metrics.ownerFullCoverage ? "✅" : "⚠️"}`,
    `- All owner commands present: ${summary.metrics.ownerAllCommandsPresent ? "✅" : "⚠️"}`,
    `- All owner verification scripts present: ${summary.metrics.ownerAllVerificationsPresent ? "✅" : "⚠️"}`,
    `- Owner supremacy index: ${(summary.metrics.ownerSupremacyIndex * 100).toFixed(1)}% (${summary.metrics.ownerSupremacySatisfied ? "✅" : "⚠️"})`,
    `- CI shield: ${summary.metrics.ciShieldOk ? "✅ enforced" : "❌ drift detected"}`,
    `- Owner readiness: ${summary.metrics.ownerReadiness}`,
  ].join("\n");

  const mermaid = buildMermaidTimeline(steps);

  const markdown = [
    "# Full Governance Demonstration Run",
    `*Generated at:* ${summary.generatedAt}`,
    `*Total runtime:* ${formatMs(summary.totalDurationMs)}`,
    "",
    mermaid,
    "",
    stepTable,
    "",
    "## Key Metrics",
    metricsList,
    "",
    "## Artifact Index",
    `- Governance dossier: \`${summary.artifacts.report}\``,
    `- Physics summary: \`${summary.artifacts.summary}\``,
    `- Interactive dashboard: \`${summary.artifacts.dashboard}\``,
    `- Owner matrix JSON: \`${summary.artifacts.ownerMatrixJson}\``,
    `- Owner matrix Markdown: \`${summary.artifacts.ownerMatrixMarkdown}\``,
    `- Validation JSON: \`${summary.artifacts.validationJson}\``,
    `- Validation Markdown: \`${summary.artifacts.validationMarkdown}\``,
    `- CI verification: \`${summary.artifacts.ciReport}\``,
    `- Owner diagnostics JSON: \`${summary.artifacts.ownerJson}\``,
    `- Owner diagnostics Markdown: \`${summary.artifacts.ownerMarkdown}\``,
    "",
    summary.ciIssues.length > 0
      ? `> ⚠️ CI shield issues detected: ${summary.ciIssues.join(" | ")}`
      : "> ✅ CI shield verified with all guards active.",
    summary.ownerWarnings > 0 || summary.ownerErrors > 0
      ? `> ⚠️ Owner automation warnings: ${summary.ownerWarnings}, errors: ${summary.ownerErrors}`
      : "> ✅ Owner automation ready without warnings.",
  ].join("\n");

  await writeFile(fullRunMarkdownPath, markdown, "utf8");

  return summary;
}

async function main(): Promise<void> {
  const summary = await runFullDemo();
  const hasError = summary.steps.some((step) => step.status === "error");
  const hasWarning = summary.steps.some((step) => step.status === "warning");

  if (hasError) {
    console.error("❌ Full governance demonstration completed with errors. See:");
    console.error(`   ${FULL_RUN_JSON}`);
    process.exitCode = 1;
    return;
  }

  const prefix = hasWarning ? "⚠️" : "✅";
  console.log(`${prefix} Full governance demonstration complete.`);
  console.log(`   Summary: ${FULL_RUN_MARKDOWN}`);
}

main().catch((error) => {
  console.error("❌ Failed to orchestrate full governance demonstration:", error);
  process.exitCode = 1;
});
