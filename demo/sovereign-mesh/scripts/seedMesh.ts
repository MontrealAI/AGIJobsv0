import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const erc20Iface = new ethers.Interface([
  "function approve(address spender, uint256 amount) returns (bool)"
]);

const jobIface = new ethers.Interface([
  "function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)"
]);

async function main() {
  const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8"));
  const [employer] = await ethers.getSigners();

  for (const key of Object.keys(hubs)) {
    const hub = hubs[key];
    const reward = ethers.parseEther("1");
    const uri = `ipfs://mesh/seed/${key}`;
    const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const specHash = ethers.id(`seed-${key}`);

    await (await employer.sendTransaction({
      to: hub.addresses.AGIALPHA,
      data: erc20Iface.encodeFunctionData("approve", [hub.addresses.JobRegistry, reward])
    })).wait();

    const tx = await employer.sendTransaction({
      to: hub.addresses.JobRegistry,
      data: jobIface.encodeFunctionData("createJob", [reward, deadline, specHash, uri])
    });
    await tx.wait();
    console.log(`Seeded job on ${key}: ${tx.hash}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
