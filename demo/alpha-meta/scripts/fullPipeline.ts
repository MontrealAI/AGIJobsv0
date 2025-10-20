import path from "path";
import { runFullDemo, type FullDemoOptions } from "../../agi-governance/scripts/runFullDemo";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission.alpha-meta.json");

const REPORT_FILE = path.join(REPORT_DIR, "meta-governance-report.md");
const SUMMARY_FILE = path.join(REPORT_DIR, "meta-governance-summary.json");
const DASHBOARD_FILE = path.join(REPORT_DIR, "meta-governance-dashboard.html");
const VALIDATION_JSON = path.join(REPORT_DIR, "meta-governance-validation.json");
const VALIDATION_MARKDOWN = path.join(REPORT_DIR, "meta-governance-validation.md");
const CI_REPORT = path.join(REPORT_DIR, "ci-verification-alpha-meta.json");
const OWNER_JSON = path.join(REPORT_DIR, "owner-diagnostics-alpha-meta.json");
const OWNER_MARKDOWN = path.join(REPORT_DIR, "owner-diagnostics-alpha-meta.md");
const FULL_JSON = path.join(REPORT_DIR, "meta-governance-full-run.json");
const FULL_MARKDOWN = path.join(REPORT_DIR, "meta-governance-full-run.md");

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
    console.error("❌ Full Alpha Meta sovereign lattice pipeline completed with errors.");
    process.exitCode = 1;
  } else if (hasWarning) {
    console.warn("⚠️ Full Alpha Meta sovereign lattice pipeline completed with warnings.");
  } else {
    console.log("✅ Full Alpha Meta sovereign lattice pipeline executed cleanly.");
  }

  console.log(`   Aggregated JSON: ${FULL_JSON}`);
  console.log(`   Aggregated Markdown: ${FULL_MARKDOWN}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to orchestrate Alpha Meta sovereign lattice full pipeline:", error);
    process.exitCode = 1;
  });
}
