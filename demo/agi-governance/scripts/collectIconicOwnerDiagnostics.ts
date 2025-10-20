import path from "path";

import { collectOwnerDiagnostics } from "./collectOwnerDiagnostics";

const REPORT_DIR = path.join(__dirname, "..", "reports");
const COMMAND_DECK_OWNER_JSON = path.join(REPORT_DIR, "command-deck-owner-diagnostics.json");
const COMMAND_DECK_OWNER_MD = path.join(REPORT_DIR, "command-deck-owner-diagnostics.md");

async function run(): Promise<void> {
  const report = await collectOwnerDiagnostics({
    jsonFile: COMMAND_DECK_OWNER_JSON,
    markdownFile: COMMAND_DECK_OWNER_MD,
  });

  console.log("✅ Command Deck owner diagnostics complete.");
  console.log(`   JSON: ${COMMAND_DECK_OWNER_JSON}`);
  console.log(`   Markdown: ${COMMAND_DECK_OWNER_MD}`);

  if (report.readiness !== "ready") {
    console.warn(`⚠️ Owner readiness = ${report.readiness}. Check diagnostics.`);
    if (report.readiness === "blocked") {
      process.exitCode = 1;
    }
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error("❌ Command Deck owner diagnostics failed:", error);
    process.exitCode = 1;
  });
}

export { COMMAND_DECK_OWNER_JSON, COMMAND_DECK_OWNER_MD };
