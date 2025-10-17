import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

const GOVERNANCE_SAFE = process.env.GOVERNANCE_SAFE;

if (!GOVERNANCE_SAFE) {
  throw new Error("Set GOVERNANCE_SAFE to the target owner address");
}

const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");

const iface = new ethers.Interface([
  "function setGovernance(address)",
  "function transferOwnership(address)"
]);

async function rotate(contractAddress: string) {
  const [signer] = await ethers.getSigners();
  const contract = new ethers.Contract(contractAddress, iface, signer);
  try {
    const tx = await contract.setGovernance(GOVERNANCE_SAFE);
    await tx.wait();
    return true;
  } catch {
    try {
      const tx = await contract.transferOwnership(GOVERNANCE_SAFE);
      await tx.wait();
      return true;
    } catch {
      return false;
    }
  }
}

async function main() {
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8")) as Record<string, any>;
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

  for (const [hubKey, hub] of Object.entries(hubs)) {
    for (const mod of modules) {
      const address = hub.addresses?.[mod];
      if (!address || address === ethers.ZeroAddress) continue;
      const rotated = await rotate(address);
      console.log(`Hub ${hubKey} :: ${mod} -> ${rotated ? "rotated" : "skipped"}`);
    }
  }

  console.log(`Governance rotated to ${GOVERNANCE_SAFE}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
