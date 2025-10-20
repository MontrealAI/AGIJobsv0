import path from "path";
import { collectOwnerDiagnostics, type OwnerDiagnosticsOptions } from "../../scripts/collectOwnerDiagnostics";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const JSON_REPORT = path.join(REPORT_DIR, "owner-diagnostics-v14.json");
const MARKDOWN_REPORT = path.join(REPORT_DIR, "owner-diagnostics-v14.md");

async function main(): Promise<void> {
  const options: OwnerDiagnosticsOptions = {
    jsonFile: JSON_REPORT,
    markdownFile: MARKDOWN_REPORT,
    silent: true,
  };

  const report = await collectOwnerDiagnostics(options);

  console.log("✅ Owner supremacy lattice audited for HyperSovereign mission.");
  console.log(`   JSON: ${JSON_REPORT}`);
  console.log(`   Markdown: ${MARKDOWN_REPORT}`);
  console.log(`   Readiness: ${report.readiness}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to aggregate owner diagnostics for α-field v14 HyperSovereign:", error);
    process.exitCode = 1;
  });
}
