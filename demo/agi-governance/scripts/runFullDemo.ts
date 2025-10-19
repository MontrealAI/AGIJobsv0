import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { performance } from "perf_hooks";

import {
  generateGovernanceDemo,
  REPORT_DIR as DEMO_REPORT_DIR,
  REPORT_FILE as GOVERNANCE_REPORT_FILE,
  SUMMARY_FILE as GOVERNANCE_SUMMARY_FILE,
  DASHBOARD_FILE as GOVERNANCE_DASHBOARD_FILE,
  type ReportBundle,
} from "./executeDemo";
import {
  validateGovernanceDemo,
  VALIDATION_JSON as VALIDATION_JSON_FILE,
  VALIDATION_MARKDOWN as VALIDATION_MARKDOWN_FILE,
  type ValidationReport,
} from "./validateReport";
import {
  verifyCiShield,
  assessCiShield,
  OUTPUT_FILE as CI_OUTPUT_FILE,
  type MissionCi,
  type VerificationResult,
} from "./verifyCiStatus";
import {
  collectOwnerDiagnostics,
  JSON_REPORT as OWNER_JSON_FILE,
  MARKDOWN_REPORT as OWNER_MARKDOWN_FILE,
  type AggregatedReport,
} from "./collectOwnerDiagnostics";

const FULL_RUN_JSON = path.join(DEMO_REPORT_DIR, "governance-demo-full-run.json");
const FULL_RUN_MARKDOWN = path.join(DEMO_REPORT_DIR, "governance-demo-full-run.md");

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
  };
  ciIssues: string[];
  ownerWarnings: number;
  ownerErrors: number;
  artifacts: {
    report: string;
    summary: string;
    dashboard: string;
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

async function runFullDemo(): Promise<FullRunSummary> {
  await mkdir(DEMO_REPORT_DIR, { recursive: true });

  const steps: StepSummary[] = [];
  const start = performance.now();

  const generateStart = performance.now();
  const bundle = await generateGovernanceDemo();
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
  const validation = await validateGovernanceDemo();
  const validationStatus: StepStatus = validation.totals.failed === 0 ? "success" : "error";
  steps.push({
    id: "validate",
    label: "Validate physics",
    status: validationStatus,
    durationMs: performance.now() - validationStart,
    details: summariseValidation(validation),
  });

  const ciStart = performance.now();
  const { ciConfig, verification } = await verifyCiShield();
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
  const diagnostics = await collectOwnerDiagnostics({ silent: true });
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
    },
    ciIssues: ciAssessment.issues,
    ownerWarnings: diagnostics.totals.warning,
    ownerErrors: diagnostics.totals.error,
    artifacts: {
      report: GOVERNANCE_REPORT_FILE,
      summary: GOVERNANCE_SUMMARY_FILE,
      dashboard: GOVERNANCE_DASHBOARD_FILE,
      validationJson: VALIDATION_JSON_FILE,
      validationMarkdown: VALIDATION_MARKDOWN_FILE,
      ciReport: CI_OUTPUT_FILE,
      ownerJson: OWNER_JSON_FILE,
      ownerMarkdown: OWNER_MARKDOWN_FILE,
    },
  };

  await writeFile(FULL_RUN_JSON, JSON.stringify(summary, null, 2), "utf8");

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
    `- Energy margin floor met: ${summary.metrics.alphaFieldEnergyMargin ? "✅" : "⚠️"}`,
    `- Jacobian stable: ${summary.metrics.jacobianStable ? "✅" : "❌"}`,
    `- Owner capability coverage: ${summary.metrics.ownerFullCoverage ? "✅" : "⚠️"}`,
    `- All owner commands present: ${summary.metrics.ownerAllCommandsPresent ? "✅" : "⚠️"}`,
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

  await writeFile(FULL_RUN_MARKDOWN, markdown, "utf8");

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
