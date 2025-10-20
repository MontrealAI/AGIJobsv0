import path from "path";
import { runFullDemo } from "../../agi-governance/scripts/runFullDemo";
import type { FullDemoOptions } from "../../agi-governance/scripts/runFullDemo";

interface CliOptions {
  missionFile?: string;
  reportDir?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--mission" || arg === "--mission-file") {
      options.missionFile = argv[i + 1];
      i += 1;
    } else if (arg === "--report-dir") {
      options.reportDir = argv[i + 1];
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Meta-Agentic α-Field orchestrator\n\nUsage: npm run demo:alpha-meta -- [options]\n\nOptions:\n  --mission <path>        Override mission manifest (defaults to mission.alpha-meta.json).\n  --report-dir <path>     Write artefacts to a custom directory (defaults to demo/alpha-meta/reports).\n  -h, --help              Show this help message.`);
      process.exit(0);
    }
  }
  return options;
}

function buildOptions(cli: CliOptions): FullDemoOptions {
  const baseDir = path.resolve(__dirname, "..");
  const missionFile = path.resolve(cli.missionFile ?? path.join(baseDir, "config", "mission.alpha-meta.json"));
  const reportDir = path.resolve(cli.reportDir ?? path.join(baseDir, "reports", "alpha-meta"));

  const reportFile = path.join(reportDir, "alpha-meta-governance-report.md");
  const summaryFile = path.join(reportDir, "alpha-meta-summary.json");
  const dashboardFile = path.join(reportDir, "alpha-meta-dashboard.html");
  const validationJson = path.join(reportDir, "alpha-meta-validation.json");
  const validationMarkdown = path.join(reportDir, "alpha-meta-validation.md");
  const ciFile = path.join(reportDir, "alpha-meta-ci.json");
  const ownerJson = path.join(reportDir, "alpha-meta-owner-diagnostics.json");
  const ownerMarkdown = path.join(reportDir, "alpha-meta-owner-diagnostics.md");
  const fullRunJson = path.join(reportDir, "alpha-meta-full-run.json");
  const fullRunMarkdown = path.join(reportDir, "alpha-meta-full-run.md");

  const options: FullDemoOptions = {
    demo: {
      missionFile,
      reportDir,
      reportFile,
      summaryFile,
      dashboardFile,
    },
    validation: {
      missionFile,
      outputJson: validationJson,
      outputMarkdown: validationMarkdown,
    },
    ci: {
      missionFile,
      outputFile: ciFile,
    },
    owner: {
      reportDir,
      jsonFile: ownerJson,
      markdownFile: ownerMarkdown,
    },
    outputJson: fullRunJson,
    outputMarkdown: fullRunMarkdown,
  };

  return options;
}

function renderSummary(summary: Awaited<ReturnType<typeof runFullDemo>>): string {
  const lines: string[] = [];
  lines.push("════════════════════════════════════════════");
  lines.push("🎖️  META-AGENTIC α-FIELD :: OMNIDOMINION RUN");
  lines.push("════════════════════════════════════════════");
  lines.push(`Generated at: ${summary.generatedAt}`);
  lines.push(`Total runtime: ${(summary.totalDurationMs / 1000).toFixed(2)} seconds`);
  lines.push(" ");
  lines.push("Owner Supremacy");
  lines.push(`  • Index: ${(summary.metrics.ownerSupremacyIndex * 100).toFixed(2)}%`);
  lines.push(`  • Full coverage: ${summary.metrics.ownerFullCoverage ? "yes" : "no"}`);
  lines.push("Thermodynamics");
  lines.push(`  • Gibbs free energy margin: ${summary.metrics.freeEnergyMarginKJ.toFixed(2)} kJ`);
  lines.push(`  • Antifragility curvature: ${summary.metrics.antifragilitySecondDerivative.toFixed(4)}`);
  lines.push("Strategic Equilibrium");
  lines.push(`  • Max deviation across solvers: ${(summary.metrics.equilibriumMaxDeviation * 100).toFixed(4)}%`);
  lines.push("Quantum Governance");
  lines.push(`  • Quantum confidence: ${(summary.metrics.quantumConfidence * 100).toFixed(2)}%`);
  lines.push(`  • Charge drift within tolerance: ${summary.metrics.quantumChargeWithinTolerance ? "yes" : "no"}`);
  lines.push("Risk Portfolio");
  lines.push(`  • Residual risk: ${(summary.metrics.riskPortfolioResidual * 100).toFixed(3)}%`);
  lines.push(`  • Jacobian stable: ${summary.metrics.jacobianStable ? "yes" : "no"}`);
  lines.push("CI Shield");
  lines.push(`  • CI enforcement verified: ${summary.metrics.ciShieldOk ? "yes" : "no"}`);
  lines.push(`  • Issues: ${summary.ciIssues.length === 0 ? "none" : summary.ciIssues.join(" | ")}`);
  lines.push("Owner Automation");
  lines.push(`  • Warnings: ${summary.ownerWarnings}`);
  lines.push(`  • Errors: ${summary.ownerErrors}`);
  lines.push(" ");
  lines.push("Key artefacts");
  lines.push(`  • Dossier: ${summary.artifacts.report}`);
  lines.push(`  • Dashboard: ${summary.artifacts.dashboard}`);
  lines.push(`  • Owner matrix: ${summary.artifacts.ownerMarkdown}`);
  lines.push(`  • CI report: ${summary.artifacts.ciReport}`);
  lines.push("════════════════════════════════════════════");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const options = buildOptions(cli);

  const summary = await runFullDemo(options);

  const hasError = summary.steps.some((step) => step.status === "error");
  const hasWarning = summary.steps.some((step) => step.status === "warning");

  console.log(renderSummary(summary));

  if (hasError) {
    console.error("❌ Alpha-meta orchestration completed with errors.");
    process.exitCode = 1;
    return;
  }

  if (hasWarning) {
    console.warn("⚠️ Alpha-meta orchestration completed with warnings. Review artefacts before production deployment.");
  } else {
    console.log("✅ Alpha-meta orchestration complete. Superintelligent labour field is primed under owner command.");
  }
}

main().catch((error) => {
  console.error("❌ Failed to orchestrate alpha-meta demonstration:", error);
  process.exitCode = 1;
});
