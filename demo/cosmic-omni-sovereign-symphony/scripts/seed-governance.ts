import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

const CONFIG_PATH = process.env.AGIJOBS_GOV_CONFIG ?? path.join(__dirname, "..", "config", "multinational-governance.json");
const DEPLOYMENT_LOG = path.join(__dirname, "..", "logs", "deployment-latest.json");

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Configuration file not found at ${CONFIG_PATH}`);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

  let targetAddress = process.env.GOVERNANCE_ADDRESS as string | undefined;
  if (!targetAddress) {
    if (!fs.existsSync(DEPLOYMENT_LOG)) {
      throw new Error("Missing deployment log. Provide GOVERNANCE_ADDRESS env variable or deploy contract first.");
    }
    const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_LOG, "utf-8"));
    targetAddress = deployment.contract;
  }

  const contract = await ethers.getContractAt("GlobalGovernanceCouncil", targetAddress!);
  console.log(`[seed] Using contract ${targetAddress}`);

  for (const nation of config.nations ?? []) {
    const tx = await contract.registerNation(nation.id, nation.governor, BigInt(nation.weight ?? 0), nation.metadataURI ?? "");
    console.log(`[seed] registerNation ${nation.id} → ${tx.hash}`);
    await tx.wait();
  }

  for (const mandate of config.mandates ?? []) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const start = mandate.startDelaySeconds ? now + BigInt(mandate.startDelaySeconds) : now;
    const end = mandate.durationSeconds ? start + BigInt(mandate.durationSeconds) : BigInt(0);
    const tx = await contract.createMandate(mandate.id, BigInt(mandate.quorum ?? 0), Number(start), Number(end), mandate.metadataURI ?? "");
    console.log(`[seed] createMandate ${mandate.id} → ${tx.hash}`);
    await tx.wait();
  }
}

main().catch((error) => {
  console.error("[seed] failed", error);
  process.exitCode = 1;
});
