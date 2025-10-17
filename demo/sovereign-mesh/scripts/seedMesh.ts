import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

async function main() {
  const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8")) as Record<string, {
    addresses: Record<string, string>;
  }>;

  const [employer] = await ethers.getSigners();
  const erc20 = new ethers.Interface(["function approve(address,uint256) returns (bool)"]);
  const jobRegistry = new ethers.Interface([
    "function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)"
  ]);

  for (const [hubId, hub] of Object.entries(hubs)) {
    const reward = ethers.parseEther("1");
    const uri = `ipfs://mesh/seed/${hubId}`;
    const now = Math.floor(Date.now() / 1000);
    const deadline = now + 30 * 24 * 3600;
    const specHash = ethers.id(`seed-${hubId}`);

    await (
      await employer.sendTransaction({
        to: hub.addresses.AGIALPHA,
        data: erc20.encodeFunctionData("approve", [hub.addresses.JobRegistry, reward])
      })
    ).wait();

    const tx = await employer.sendTransaction({
      to: hub.addresses.JobRegistry,
      data: jobRegistry.encodeFunctionData("createJob", [reward, deadline, specHash, uri])
    });
    await tx.wait();
    console.log(`🌱 Seeded job on ${hubId} (${tx.hash})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
