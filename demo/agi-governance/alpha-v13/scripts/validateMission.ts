import path from "path";
import { validateGovernanceDemo, type ValidationOptions } from "../../scripts/validateReport";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission@v13.json");
const SUMMARY_FILE = path.join(REPORT_DIR, "governance-demo-summary-v13.json");
const VALIDATION_JSON = path.join(REPORT_DIR, "governance-demo-validation-v13.json");
const VALIDATION_MARKDOWN = path.join(REPORT_DIR, "governance-demo-validation-v13.md");

async function main(): Promise<void> {
  const options: ValidationOptions = {
    missionFile: MISSION_FILE,
    summaryFile: SUMMARY_FILE,
    outputJson: VALIDATION_JSON,
    outputMarkdown: VALIDATION_MARKDOWN,
  };

  const report = await validateGovernanceDemo(options);

  if (report.totals.failed === 0) {
    console.log("✅ α-field v13 dossier validated by independent recomputation.");
  } else {
    console.warn("⚠️ Validation detected discrepancies — inspect the report.");
  }

  console.log(`   Summary source: ${SUMMARY_FILE}`);
  console.log(`   Validation JSON: ${VALIDATION_JSON}`);
  console.log(`   Validation Markdown: ${VALIDATION_MARKDOWN}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to validate α-field governance dossier:", error);
    process.exitCode = 1;
  });
}
