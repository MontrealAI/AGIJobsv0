import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const GOVERNANCE_SAFE = process.env.GOVERNANCE_SAFE;

if (!GOVERNANCE_SAFE) {
  throw new Error("GOVERNANCE_SAFE environment variable must be set");
}

const ABI = ["function setGovernance(address)", "function transferOwnership(address)"];

async function main() {
  const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8")) as Record<string, any>;
  const [signer] = await ethers.getSigners();

  for (const [hubKey, details] of Object.entries(hubs)) {
    for (const [moduleName, address] of Object.entries(details.addresses)) {
      if (!address || address === "0x0000000000000000000000000000000000000000") continue;
      const contract = new ethers.Contract(address as string, ABI, signer);
      try {
        const tx = await contract.setGovernance(GOVERNANCE_SAFE);
        await tx.wait();
        console.log(`[${hubKey}] ${moduleName} → governance set to ${GOVERNANCE_SAFE}`);
        continue;
      } catch {}
      try {
        const tx = await contract.transferOwnership(GOVERNANCE_SAFE);
        await tx.wait();
        console.log(`[${hubKey}] ${moduleName} → ownership transferred to ${GOVERNANCE_SAFE}`);
      } catch (error) {
        console.warn(`[${hubKey}] ${moduleName} skipped: ${(error as Error).message}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
