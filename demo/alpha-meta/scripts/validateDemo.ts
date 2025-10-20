import path from "path";
import { validateGovernanceDemo, type ValidationOptions } from "../../agi-governance/scripts/validateReport";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission.alpha-meta.json");
const SUMMARY_FILE = path.join(REPORT_DIR, "meta-governance-summary.json");
const VALIDATION_JSON = path.join(REPORT_DIR, "meta-governance-validation.json");
const VALIDATION_MARKDOWN = path.join(REPORT_DIR, "meta-governance-validation.md");

async function main(): Promise<void> {
  const options: ValidationOptions = {
    missionFile: MISSION_FILE,
    summaryFile: SUMMARY_FILE,
    outputJson: VALIDATION_JSON,
    outputMarkdown: VALIDATION_MARKDOWN,
  };

  const report = await validateGovernanceDemo(options);

  if (report.totals.failed === 0) {
    console.log("✅ Alpha Meta dossier independently recomputed without discrepancies.");
  } else {
    console.warn("⚠️ Validation detected discrepancies — inspect the Alpha Meta sovereign lattice report.");
  }

  console.log(`   Summary source: ${SUMMARY_FILE}`);
  console.log(`   Validation JSON: ${VALIDATION_JSON}`);
  console.log(`   Validation Markdown: ${VALIDATION_MARKDOWN}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to validate Alpha Meta sovereign lattice dossier:", error);
    process.exitCode = 1;
  });
}
