import path from "path";
import {
  generateGovernanceDemo,
  type GovernanceDemoOptions,
} from "../../agi-governance/scripts/executeDemo";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission@alpha-meta.json");
const REPORT_FILE = path.join(REPORT_DIR, "alpha-meta-governance-report.md");
const SUMMARY_FILE = path.join(REPORT_DIR, "alpha-meta-governance-summary.json");
const DASHBOARD_FILE = path.join(REPORT_DIR, "alpha-meta-governance-dashboard.html");
const OWNER_MATRIX_JSON = path.join(REPORT_DIR, "alpha-meta-owner-matrix.json");
const OWNER_MATRIX_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-owner-matrix.md");

async function main(): Promise<void> {
  const options: GovernanceDemoOptions = {
    missionFile: MISSION_FILE,
    reportDir: REPORT_DIR,
    reportFile: REPORT_FILE,
    summaryFile: SUMMARY_FILE,
    dashboardFile: DASHBOARD_FILE,
    ownerMatrixJsonFile: OWNER_MATRIX_JSON,
    ownerMatrixMarkdownFile: OWNER_MATRIX_MARKDOWN,
  };

  await generateGovernanceDemo(options);

  console.log("✅ Alpha-Meta governance dossier generated.");
  console.log(`   Mission manifest: ${MISSION_FILE}`);
  console.log(`   Markdown report: ${REPORT_FILE}`);
  console.log(`   JSON summary: ${SUMMARY_FILE}`);
  console.log(`   Interactive dashboard: ${DASHBOARD_FILE}`);
  console.log(`   Owner matrix JSON: ${OWNER_MATRIX_JSON}`);
  console.log(`   Owner matrix Markdown: ${OWNER_MATRIX_MARKDOWN}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to generate Alpha-Meta dossier:", error);
    process.exitCode = 1;
  });
}
