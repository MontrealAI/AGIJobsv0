import path from "path";
import { runFullDemo, type FullDemoOptions } from "../../scripts/runFullDemo";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission@v17.json");

const REPORT_FILE = path.join(REPORT_DIR, "governance-demo-report-v17.md");
const SUMMARY_FILE = path.join(REPORT_DIR, "governance-demo-summary-v17.json");
const DASHBOARD_FILE = path.join(REPORT_DIR, "governance-demo-dashboard-v17.html");
const VALIDATION_JSON = path.join(REPORT_DIR, "governance-demo-validation-v17.json");
const VALIDATION_MARKDOWN = path.join(REPORT_DIR, "governance-demo-validation-v17.md");
const CI_REPORT = path.join(REPORT_DIR, "ci-verification-v17.json");
const OWNER_JSON = path.join(REPORT_DIR, "owner-diagnostics-v17.json");
const OWNER_MARKDOWN = path.join(REPORT_DIR, "owner-diagnostics-v17.md");
const FULL_JSON = path.join(REPORT_DIR, "governance-demo-full-run-v17.json");
const FULL_MARKDOWN = path.join(REPORT_DIR, "governance-demo-full-run-v17.md");

async function main(): Promise<void> {
  const options: FullDemoOptions = {
    demo: {
      missionFile: MISSION_FILE,
      reportDir: REPORT_DIR,
      reportFile: REPORT_FILE,
      summaryFile: SUMMARY_FILE,
      dashboardFile: DASHBOARD_FILE,
    },
    validation: {
      missionFile: MISSION_FILE,
      summaryFile: SUMMARY_FILE,
      outputJson: VALIDATION_JSON,
      outputMarkdown: VALIDATION_MARKDOWN,
    },
    ci: {
      missionFile: MISSION_FILE,
      outputFile: CI_REPORT,
    },
    owner: {
      jsonFile: OWNER_JSON,
      markdownFile: OWNER_MARKDOWN,
      silent: true,
    },
    outputJson: FULL_JSON,
    outputMarkdown: FULL_MARKDOWN,
  };

  const summary = await runFullDemo(options);

  const hasError = summary.steps.some((step) => step.status === "error");
  const hasWarning = summary.steps.some((step) => step.status === "warning");

  if (hasError) {
    console.error("❌ Full α-field v17 Singularity Dominion pipeline completed with errors.");
    process.exitCode = 1;
  } else if (hasWarning) {
    console.warn("⚠️ Full α-field v17 Singularity Dominion pipeline completed with warnings.");
  } else {
    console.log("✅ Full α-field v17 Singularity Dominion pipeline executed cleanly.");
  }

  console.log(`   Aggregated JSON: ${FULL_JSON}`);
  console.log(`   Aggregated Markdown: ${FULL_MARKDOWN}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to orchestrate α-field v17 Singularity Dominion full pipeline:", error);
    process.exitCode = 1;
  });
}
