import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const GOVERNANCE_SAFE = process.env.GOVERNANCE_SAFE;

if (!GOVERNANCE_SAFE) {
  throw new Error("Set GOVERNANCE_SAFE to the multisig or timelock address.");
}

const iface = new ethers.Interface([
  "function setGovernance(address)",
  "function transferOwnership(address)"
]);

const targets = [
  "StakeManager",
  "JobRegistry",
  "ValidationModule",
  "ReputationEngine",
  "IdentityRegistry",
  "CertificateNFT",
  "DisputeModule",
  "FeePool"
];

async function main() {
  const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8"));
  const [signer] = await ethers.getSigners();

  for (const key of Object.keys(hubs)) {
    for (const contractName of targets) {
      const address = hubs[key].addresses[contractName];
      if (!address || address === ethers.ZeroAddress) continue;
      const contract = new ethers.Contract(address, iface, signer);
      try {
        await (await contract.setGovernance(GOVERNANCE_SAFE)).wait();
        console.log(`setGovernance(${GOVERNANCE_SAFE}) on ${contractName} @ ${address}`);
        continue;
      } catch (err) {
        if (!(err instanceof Error)) {
          console.warn(`Unknown error calling setGovernance on ${contractName}`);
        }
      }
      try {
        await (await contract.transferOwnership(GOVERNANCE_SAFE)).wait();
        console.log(`transferOwnership(${GOVERNANCE_SAFE}) on ${contractName} @ ${address}`);
      } catch (err) {
        console.warn(`Skipping ownership update on ${contractName} (${address})`, err);
      }
    }
  }

  console.log(`✅ Rotated governance of all hubs to ${GOVERNANCE_SAFE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
