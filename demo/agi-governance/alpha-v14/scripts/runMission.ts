import path from "path";
import { generateGovernanceDemo, type GovernanceDemoOptions } from "../../scripts/executeDemo";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission@v14.json");
const REPORT_FILE = path.join(REPORT_DIR, "governance-demo-report-v14.md");
const SUMMARY_FILE = path.join(REPORT_DIR, "governance-demo-summary-v14.json");
const DASHBOARD_FILE = path.join(REPORT_DIR, "governance-demo-dashboard-v14.html");

async function main(): Promise<void> {
  const options: GovernanceDemoOptions = {
    missionFile: MISSION_FILE,
    reportDir: REPORT_DIR,
    reportFile: REPORT_FILE,
    summaryFile: SUMMARY_FILE,
    dashboardFile: DASHBOARD_FILE,
  };

  await generateGovernanceDemo(options);

  console.log("✅ α-field v14 HyperSovereign dossier generated.");
  console.log(`   Mission: ${MISSION_FILE}`);
  console.log(`   Report: ${REPORT_FILE}`);
  console.log(`   Summary: ${SUMMARY_FILE}`);
  console.log(`   Dashboard: ${DASHBOARD_FILE}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to generate α-field v14 HyperSovereign dossier:", error);
    process.exitCode = 1;
  });
}
