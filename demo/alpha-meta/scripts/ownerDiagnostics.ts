import path from "path";
import {
  collectOwnerDiagnostics,
  type OwnerDiagnosticsOptions,
} from "../../agi-governance/scripts/collectOwnerDiagnostics";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const OUTPUT_JSON = path.join(REPORT_DIR, "alpha-meta-owner-diagnostics.json");
const OUTPUT_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-owner-diagnostics.md");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission@alpha-meta.json");

async function main(): Promise<void> {
  const options: OwnerDiagnosticsOptions = {
    silent: true,
    reportDir: REPORT_DIR,
    jsonFile: OUTPUT_JSON,
    markdownFile: OUTPUT_MARKDOWN,
    missionFile: MISSION_FILE,
    offline: true,
  };

  const report = await collectOwnerDiagnostics(options);
  const warningCount = report.totals.warning;
  const errorCount = report.totals.error;

  if (errorCount > 0) {
    console.error("❌ Owner diagnostics produced blocking errors:");
    report.results
      .filter((result) => result.severity === "error")
      .forEach((result) => console.error(`   - [${result.script}] ${result.summary}`));
    process.exitCode = 1;
    return;
  }

  const prefix = warningCount > 0 ? "⚠️" : "✅";
  console.log(`${prefix} Alpha-Meta owner automation diagnostics complete.`);
  console.log(`   JSON: ${OUTPUT_JSON}`);
  console.log(`   Markdown: ${OUTPUT_MARKDOWN}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to execute Alpha-Meta owner diagnostics:", error);
    process.exitCode = 1;
  });
}
