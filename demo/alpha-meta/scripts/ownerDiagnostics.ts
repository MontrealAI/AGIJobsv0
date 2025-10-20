import path from "path";
import { collectOwnerDiagnostics, type OwnerDiagnosticsOptions } from "../../agi-governance/scripts/collectOwnerDiagnostics";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const JSON_REPORT = path.join(REPORT_DIR, "owner-diagnostics-alpha-meta.json");
const MARKDOWN_REPORT = path.join(REPORT_DIR, "owner-diagnostics-alpha-meta.md");

async function main(): Promise<void> {
  const options: OwnerDiagnosticsOptions = {
    jsonFile: JSON_REPORT,
    markdownFile: MARKDOWN_REPORT,
    silent: true,
  };

  const report = await collectOwnerDiagnostics(options);

  console.log("✅ Owner supremacy lattice audited for Alpha Meta mission.");
  console.log(`   JSON: ${JSON_REPORT}`);
  console.log(`   Markdown: ${MARKDOWN_REPORT}`);
  console.log(`   Readiness: ${report.readiness}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to aggregate owner diagnostics for Alpha Meta sovereign lattice:", error);
    process.exitCode = 1;
  });
}
