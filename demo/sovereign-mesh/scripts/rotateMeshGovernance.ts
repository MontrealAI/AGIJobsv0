import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");

async function main() {
  const target = process.env.GOVERNANCE_SAFE;
  if (!target) {
    throw new Error("Set GOVERNANCE_SAFE to the new owner address");
  }
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8"));
  const iface = new ethers.Interface([
    "function setGovernance(address)",
    "function transferOwnership(address)"
  ]);
  const [signer] = await ethers.getSigners();

  for (const key of Object.keys(hubs)) {
    const addresses: Record<string, string> = hubs[key].addresses;
    for (const [module, addr] of Object.entries(addresses)) {
      if (!addr || addr === "0x0000000000000000000000000000000000000000") continue;
      const contract = new ethers.Contract(addr, iface, signer);
      let rotated = false;
      try {
        await (await contract.setGovernance(target)).wait();
        rotated = true;
      } catch (err) {
        try {
          await (await contract.transferOwnership(target)).wait();
          rotated = true;
        } catch (inner) {
          console.warn(`Skipping ${module} on ${key}: no governance setter`, inner instanceof Error ? inner.message : inner);
        }
      }
      if (rotated) {
        console.log(`Rotated ${module} on ${key} to ${target}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
