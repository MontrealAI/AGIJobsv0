import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const hubsPath = path.join(__dirname, "..", "config", "hubs.mainnet.json");

async function main() {
  const newOwner = process.env.GOVERNANCE_SAFE;
  if (!newOwner) {
    throw new Error("Set GOVERNANCE_SAFE to the Safe / governance address.");
  }
  if (!fs.existsSync(hubsPath)) {
    throw new Error("hubs.mainnet.json not found. Deploy hubs first.");
  }
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8"));
  const iface = new ethers.Interface([
    "function setGovernance(address)",
    "function transferOwnership(address)"
  ]);
  const [signer] = await ethers.getSigners();
  for (const hubKey of Object.keys(hubs)) {
    const addresses = hubs[hubKey].addresses as Record<string, string>;
    for (const [label, addr] of Object.entries(addresses)) {
      if (!addr || addr === ethers.ZeroAddress) continue;
      const contract = new ethers.Contract(addr, iface, signer);
      try {
        const tx = await contract.setGovernance(newOwner);
        await tx.wait();
        console.log(`setGovernance(${hubKey}.${label}) -> ${newOwner}`);
        continue;
      } catch (error) {
        // ignore, try transferOwnership
      }
      try {
        const tx = await contract.transferOwnership(newOwner);
        await tx.wait();
        console.log(`transferOwnership(${hubKey}.${label}) -> ${newOwner}`);
      } catch (error) {
        console.log(`Skipped ${hubKey}.${label} — no governance method.`);
      }
    }
  }
  console.log("Governance rotation complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
