import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const HUBS_PATH = path.join(__dirname, "../config/hubs.mainnet.json");

async function main() {
  const hubs = JSON.parse(fs.readFileSync(HUBS_PATH, "utf8"));
  const [employer] = await ethers.getSigners();
  const erc20 = new ethers.Interface(["function approve(address,uint256) returns (bool)"]);
  const job = new ethers.Interface([
    "function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)"
  ]);

  for (const hubKey of Object.keys(hubs)) {
    const hub = hubs[hubKey];
    const reward = ethers.parseEther("1");
    const uri = `ipfs://mesh/seed/${hubKey}`;
    const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const specHash = ethers.id(`seed-${hubKey}`);

    await (
      await employer.sendTransaction({
        to: hub.addresses.AGIALPHA,
        data: erc20.encodeFunctionData("approve", [hub.addresses.JobRegistry, reward])
      })
    ).wait();

    const tx = await employer.sendTransaction({
      to: hub.addresses.JobRegistry,
      data: job.encodeFunctionData("createJob", [reward, deadline, specHash, uri])
    });
    await tx.wait();
    console.log(`Seeded job on ${hubKey} (${tx.hash})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
