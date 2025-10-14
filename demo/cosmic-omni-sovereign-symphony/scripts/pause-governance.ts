import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

const DEPLOYMENT_LOG = path.join(__dirname, "..", "logs", "deployment-latest.json");

async function main() {
  const action = process.argv.includes("--unpause") ? "unpause" : "pause";

  let targetAddress = process.env.GOVERNANCE_ADDRESS as string | undefined;
  if (!targetAddress) {
    if (!fs.existsSync(DEPLOYMENT_LOG)) {
      throw new Error("Missing deployment log. Provide GOVERNANCE_ADDRESS env variable or deploy contract first.");
    }
    const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_LOG, "utf-8"));
    targetAddress = deployment.contract;
  }

  const contract = await ethers.getContractAt("GlobalGovernanceCouncil", targetAddress!);
  const tx = action === "unpause" ? await contract.unpause() : await contract.pause();
  console.log(`[pause] ${action} tx ${tx.hash}`);
  await tx.wait();
}

main().catch((error) => {
  console.error("[pause] failed", error);
  process.exitCode = 1;
});
