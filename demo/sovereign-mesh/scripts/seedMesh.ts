import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const hubsPath = path.join(__dirname, "..", "config", "hubs.mainnet.json");

async function main() {
  if (!fs.existsSync(hubsPath)) {
    throw new Error("hubs.mainnet.json not found. Deploy hubs first.");
  }
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8"));
  const [employer] = await ethers.getSigners();
  for (const hubKey of Object.keys(hubs)) {
    const hub = hubs[hubKey];
    const reward = ethers.parseEther("1");
    const specHash = ethers.id(`seed-${hubKey}`);
    const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    const approveIface = new ethers.Interface(["function approve(address,uint256) returns (bool)"]);
    const createIface = new ethers.Interface([
      "function createJob(uint256,uint64,bytes32,string) returns (uint256)"
    ]);

    await (
      await employer.sendTransaction({
        to: hub.addresses.AGIALPHA,
        data: approveIface.encodeFunctionData("approve", [hub.addresses.JobRegistry, reward])
      })
    ).wait();

    const tx = await employer.sendTransaction({
      to: hub.addresses.JobRegistry,
      data: createIface.encodeFunctionData("createJob", [
        reward,
        deadline,
        specHash,
        `ipfs://mesh/seed/${hubKey}`
      ])
    });
    await tx.wait();
    console.log(`Seeded job on ${hubKey} (tx: ${tx.hash})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
