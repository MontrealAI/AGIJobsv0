import path from "path";

import { assessCiShield, verifyCiShield } from "./verifyCiStatus";
import { MISSION_V2 } from "./runIconicCommandDeck";

const REPORT_DIR = path.join(__dirname, "..", "reports");
const COMMAND_DECK_CI = path.join(REPORT_DIR, "command-deck-ci-verification.json");

async function run(): Promise<void> {
  const { ciConfig, verification } = await verifyCiShield({
    missionFile: MISSION_V2,
    outputFile: COMMAND_DECK_CI,
  });

  const assessment = assessCiShield(ciConfig, verification);
  if (!assessment.ok) {
    console.error("❌ Command Deck CI guardrail mismatch.");
    for (const issue of assessment.issues) {
      console.error(`   → ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("✅ Command Deck CI shield enforced.");
  console.log(`   Report: ${COMMAND_DECK_CI}`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error("❌ Command Deck CI verification failed:", error);
    process.exitCode = 1;
  });
}

export { COMMAND_DECK_CI };
