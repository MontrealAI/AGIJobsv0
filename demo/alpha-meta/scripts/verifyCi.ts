import path from "path";
import { verifyCiShield, assessCiShield, type VerifyCiOptions } from "../../agi-governance/scripts/verifyCiStatus";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const OUTPUT_FILE = path.join(REPORT_DIR, "alpha-meta-ci-verification.json");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission@alpha-meta.json");

async function main(): Promise<void> {
  const options: VerifyCiOptions = {
    missionFile: MISSION_FILE,
    outputFile: OUTPUT_FILE,
  };

  const { ciConfig, verification } = await verifyCiShield(options);
  const assessment = assessCiShield(ciConfig, verification);

  if (!assessment.ok) {
    console.error("❌ Alpha-Meta CI enforcement drift detected:");
    assessment.issues.forEach((issue) => console.error(`   - ${issue}`));
    process.exitCode = 1;
    return;
  }

  console.log("✅ Alpha-Meta CI shield verified. All mandatory jobs enforced.");
  console.log(`   Workflow: ${ciConfig.workflow}`);
  console.log(`   Verification report: ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to verify CI shield for Alpha-Meta:", error);
    process.exitCode = 1;
  });
}
