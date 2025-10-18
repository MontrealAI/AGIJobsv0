import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";

const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");

async function main() {
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8")) as Record<
    string,
    { addresses: Record<string, string> }
  >;
  const [employer] = await ethers.getSigners();
  const erc20 = new ethers.Interface(["function approve(address,uint256) returns (bool)"]);
  const job = new ethers.Interface([
    "function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)"
  ]);

  for (const [hubId, hub] of Object.entries(hubs)) {
    const reward = ethers.parseEther("1");
    const uri = `ipfs://mesh/seed/${hubId}`;
    const now = Math.floor(Date.now() / 1000);
    const deadline = now + 30 * 24 * 60 * 60;
    const specHash = ethers.id(`seed-${hubId}`);

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
    console.log(`Seeded ${hubId} with mission URI ${uri}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
