import path from "path";
import { generateGovernanceDemo, type GovernanceDemoOptions } from "../../agi-governance/scripts/executeDemo";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission.alpha-meta.json");
const REPORT_FILE = path.join(REPORT_DIR, "meta-governance-report.md");
const SUMMARY_FILE = path.join(REPORT_DIR, "meta-governance-summary.json");
const DASHBOARD_FILE = path.join(REPORT_DIR, "meta-governance-dashboard.html");

async function main(): Promise<void> {
  const options: GovernanceDemoOptions = {
    missionFile: MISSION_FILE,
    reportDir: REPORT_DIR,
    reportFile: REPORT_FILE,
    summaryFile: SUMMARY_FILE,
    dashboardFile: DASHBOARD_FILE,
  };

  await generateGovernanceDemo(options);

  console.log("✅ Alpha Meta governance dossier generated.");
  console.log(`   Mission: ${MISSION_FILE}`);
  console.log(`   Report: ${REPORT_FILE}`);
  console.log(`   Summary: ${SUMMARY_FILE}`);
  console.log(`   Dashboard: ${DASHBOARD_FILE}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to generate Alpha Meta sovereign lattice dossier:", error);
    process.exitCode = 1;
  });
}
