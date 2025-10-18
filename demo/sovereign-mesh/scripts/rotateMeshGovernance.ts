import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

const NEW_OWNER = process.env.GOVERNANCE_SAFE;

if (!NEW_OWNER) {
  throw new Error("Set GOVERNANCE_SAFE to the multisig or timelock address");
}

const ABI = [
  "function setGovernance(address)",
  "function transferOwnership(address)"
];

async function main() {
  const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8"));
  const [signer] = await ethers.getSigners();

  for (const key of Object.keys(hubs)) {
    const info = hubs[key];
    if (!info?.addresses) continue;
    const governanceTargets = [
      "StakeManager",
      "JobRegistry",
      "ValidationModule",
      "ReputationEngine",
      "IdentityRegistry",
      "CertificateNFT",
      "DisputeModule",
      "FeePool",
      "PlatformRegistry",
      "PlatformIncentives",
      "JobRouter",
      "SystemPause",
      "TaxPolicy"
    ];
    for (const name of governanceTargets) {
      const addr = info.addresses[name];
      if (!addr || addr === ethers.ZeroAddress) continue;
      const contract = new ethers.Contract(addr, ABI, signer);
      let updated = false;
      try {
        const tx = await contract.setGovernance(NEW_OWNER);
        await tx.wait();
        updated = true;
        console.log(`✔ setGovernance ${key}.${name} -> ${NEW_OWNER}`);
      } catch (err) {
        // ignore, try transferOwnership next
      }
      if (updated) continue;
      try {
        const tx = await contract.transferOwnership(NEW_OWNER);
        await tx.wait();
        console.log(`✔ transferOwnership ${key}.${name} -> ${NEW_OWNER}`);
      } catch (err) {
        console.warn(`ℹ skipping ${key}.${name} (${addr}) — no governance setter available`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
