import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

const HUBS_FILE = path.join(__dirname, "../config/hubs.mainnet.json");
const TARGETS = [
  "StakeManager",
  "JobRegistry",
  "ValidationModule",
  "ReputationEngine",
  "DisputeModule",
  "CertificateNFT",
  "PlatformRegistry",
  "JobRouter",
  "PlatformIncentives",
  "FeePool",
  "TaxPolicy",
  "IdentityRegistry",
  "SystemPause",
];

const NEW_OWNER = process.env.GOVERNANCE_SAFE;

if (!NEW_OWNER) {
  throw new Error("Set GOVERNANCE_SAFE to the target owner address");
}

async function main() {
  const hubs = JSON.parse(fs.readFileSync(HUBS_FILE, "utf8"));
  const [operator] = await ethers.getSigners();
  const iface = new ethers.Interface([
    "function setGovernance(address)",
    "function transferOwnership(address)",
  ]);

  for (const hubId of Object.keys(hubs)) {
    const hub = hubs[hubId];
    console.log(`\nRotating governance for hub: ${hub.label || hubId}`);
    for (const key of TARGETS) {
      const address = hub.addresses?.[key];
      if (!address || address === ethers.ZeroAddress) continue;
      const contract = new ethers.Contract(address, iface, operator);
      let updated = false;
      try {
        const tx = await contract.setGovernance(NEW_OWNER);
        await tx.wait();
        console.log(`  setGovernance(${key}) -> ${NEW_OWNER}`);
        updated = true;
      } catch (err) {
        try {
          const tx = await contract.transferOwnership(NEW_OWNER);
          await tx.wait();
          console.log(`  transferOwnership(${key}) -> ${NEW_OWNER}`);
          updated = true;
        } catch (inner) {
          console.warn(`  Skipped ${key}: ${(inner as Error).message}`);
        }
      }
      if (!updated) {
        // Already logged warning
      }
    }
  }
  console.log("Governance rotation complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
