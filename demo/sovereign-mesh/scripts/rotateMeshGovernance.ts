import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

const GOVERNANCE_SAFE = process.env.GOVERNANCE_SAFE;

if (!GOVERNANCE_SAFE) {
  throw new Error("Set GOVERNANCE_SAFE to the multisig address");
}

const GOVERNABLE_ABI = [
  "function setGovernance(address)",
  "function transferOwnership(address)"
];

const MODULES = [
  "JobRegistry",
  "StakeManager",
  "ValidationModule",
  "DisputeModule",
  "IdentityRegistry",
  "CertificateNFT",
  "ReputationEngine",
  "FeePool"
];

async function rotate(address: string, signer: any) {
  const contract = new ethers.Contract(address, GOVERNABLE_ABI, signer);
  try {
    const tx = await contract.setGovernance(GOVERNANCE_SAFE);
    await tx.wait();
    console.log(`setGovernance -> ${address}`);
    return;
  } catch (error) {
    if ((error as Error).message.includes("function selector was not recognized")) {
      // Fall back to transferOwnership
    } else {
      console.warn(`setGovernance failed for ${address}: ${(error as Error).message}`);
    }
  }
  try {
    const tx = await contract.transferOwnership(GOVERNANCE_SAFE);
    await tx.wait();
    console.log(`transferOwnership -> ${address}`);
  } catch (error) {
    console.warn(`transferOwnership failed for ${address}: ${(error as Error).message}`);
  }
}

async function main() {
  const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8")) as Record<string, {
    addresses: Record<string, string>;
  }>;
  const [signer] = await ethers.getSigners();

  for (const [hubId, hub] of Object.entries(hubs)) {
    console.log(`\n🔁 Rotating governance for ${hubId}`);
    for (const module of MODULES) {
      const address = hub.addresses[module];
      if (!address || address === ethers.ZeroAddress) continue;
      await rotate(address, signer);
    }
  }

  console.log("✅ Sovereign Mesh governance rotated to", GOVERNANCE_SAFE);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
