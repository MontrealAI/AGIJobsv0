import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const GOVERNANCE_TARGET = process.env.GOVERNANCE_SAFE;

if (!GOVERNANCE_TARGET) {
  throw new Error("Set GOVERNANCE_SAFE to the multisig address");
}

const HUBS_PATH = path.join(__dirname, "../config/hubs.mainnet.json");

async function tryCall(contract: ethers.Contract, method: "setGovernance" | "transferOwnership", target: string) {
  try {
    const tx = await contract[method](target);
    await tx.wait();
    return true;
  } catch (err) {
    return false;
  }
}

async function main() {
  const hubs = JSON.parse(fs.readFileSync(HUBS_PATH, "utf8"));
  const [signer] = await ethers.getSigners();
  const iface = new ethers.Interface([
    "function setGovernance(address)",
    "function transferOwnership(address)"
  ]);

  for (const hubKey of Object.keys(hubs)) {
    const config = hubs[hubKey];
    for (const [label, address] of Object.entries<string>(config.addresses)) {
      if (!address || address === ethers.ZeroAddress) continue;
      const contract = new ethers.Contract(address, iface, signer);
      const setGov = await tryCall(contract, "setGovernance", GOVERNANCE_TARGET);
      const transferred = setGov || (await tryCall(contract, "transferOwnership", GOVERNANCE_TARGET));
      console.log(`${hubKey}:${label} => ${transferred ? "updated" : "skipped"}`);
    }
  }

  console.log("✅ Rotated Sovereign Mesh governance to", GOVERNANCE_TARGET);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
