import path from "path";
import { verifyCiShield, assessCiShield, type VerifyCiOptions } from "../../scripts/verifyCiStatus";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission@v17.json");
const OUTPUT_FILE = path.join(REPORT_DIR, "ci-verification-v17.json");

async function main(): Promise<void> {
  const options: VerifyCiOptions = {
    missionFile: MISSION_FILE,
    outputFile: OUTPUT_FILE,
  };

  const { ciConfig, verification } = await verifyCiShield(options);
  const assessment = assessCiShield(ciConfig, verification);

  if (assessment.ok) {
    console.log("✅ v17 mission confirms the CI (v2) enforcement shield.");
  } else {
    console.error("❌ CI shield drift detected for Singularity Dominion mission:");
    assessment.issues.forEach((issue) => console.error(`   - ${issue}`));
    process.exitCode = 1;
  }

  console.log(`   Mission CI spec: ${ciConfig.workflow}`);
  console.log(`   Verification report: ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to verify CI for α-field v17 Singularity Dominion:", error);
    process.exitCode = 1;
  });
}
