import path from "path";
import {
  validateGovernanceDemo,
  type ValidationOptions,
} from "../../agi-governance/scripts/validateReport";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const SUMMARY_FILE = path.join(REPORT_DIR, "alpha-meta-governance-summary.json");
const OUTPUT_JSON = path.join(REPORT_DIR, "alpha-meta-governance-validation.json");
const OUTPUT_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-governance-validation.md");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission@alpha-meta.json");

async function main(): Promise<void> {
  const options: ValidationOptions = {
    missionFile: MISSION_FILE,
    summaryFile: SUMMARY_FILE,
    outputJson: OUTPUT_JSON,
    outputMarkdown: OUTPUT_MARKDOWN,
  };

  const report = await validateGovernanceDemo(options);
  const { passed, failed } = report.totals;

  if (failed > 0) {
    console.error(
      `❌ Alpha-Meta validation detected ${failed} failing checks (total ${passed + failed}). See ${OUTPUT_MARKDOWN}.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("✅ Alpha-Meta physics validation complete.");
  console.log(`   Validation JSON: ${OUTPUT_JSON}`);
  console.log(`   Validation Markdown: ${OUTPUT_MARKDOWN}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to validate Alpha-Meta dossier:", error);
    process.exitCode = 1;
  });
}
