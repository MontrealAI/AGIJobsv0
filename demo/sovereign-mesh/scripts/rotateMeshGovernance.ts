import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";

const GOVERNANCE_SAFE = process.env.GOVERNANCE_SAFE;

if (!GOVERNANCE_SAFE) {
  throw new Error("Set GOVERNANCE_SAFE to the Safe or timelock address");
}

const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");

async function main() {
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8")) as Record<string, { addresses: Record<string, string> }>;
  const iface = new ethers.Interface([
    "function setGovernance(address)",
    "function transferOwnership(address)"
  ]);

  const [signer] = await ethers.getSigners();
  const modules = [
    "JobRegistry",
    "StakeManager",
    "ValidationModule",
    "DisputeModule",
    "IdentityRegistry",
    "CertificateNFT",
    "ReputationEngine",
    "FeePool"
  ];

  for (const [hubId, hub] of Object.entries(hubs)) {
    for (const module of modules) {
      const addr = hub.addresses[module];
      if (!addr || addr === ethers.ZeroAddress) continue;
      const contract = new ethers.Contract(addr, iface, signer);
      try {
        const tx = await contract.setGovernance(GOVERNANCE_SAFE);
        await tx.wait();
        console.log(`Hub ${hubId} • ${module}: setGovernance(${GOVERNANCE_SAFE})`);
        continue;
      } catch (setErr) {
        try {
          const tx = await contract.transferOwnership(GOVERNANCE_SAFE);
          await tx.wait();
          console.log(`Hub ${hubId} • ${module}: transferOwnership(${GOVERNANCE_SAFE})`);
        } catch (ownErr) {
          console.warn(`Hub ${hubId} • ${module}: unable to rotate (${(ownErr as Error).message})`);
        }
      }
    }
  }
  console.log("Governance rotation attempted for all hubs.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
