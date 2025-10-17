import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");

async function main() {
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8")) as Record<string, any>;
  const [employer] = await ethers.getSigners();

  const erc20 = new ethers.Interface([
    "function approve(address spender, uint256 value) returns (bool)"
  ]);
  const jobRegistry = new ethers.Interface([
    "function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)"
  ]);

  for (const [hubKey, hub] of Object.entries(hubs)) {
    const reward = ethers.parseEther("1");
    const uri = `ipfs://mesh/seed/${hubKey}`;
    const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes(`seed-${hubKey}`));

    const approveTx = await employer.sendTransaction({
      to: hub.addresses.AGIALPHA,
      data: erc20.encodeFunctionData("approve", [hub.addresses.JobRegistry, reward])
    });
    await approveTx.wait();

    const createTx = await employer.sendTransaction({
      to: hub.addresses.JobRegistry,
      data: jobRegistry.encodeFunctionData("createJob", [reward, deadline, specHash, uri])
    });
    await createTx.wait();
    console.log(`Seeded job on ${hubKey} :: ${createTx.hash}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
