import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { AGIALPHA } from "../../../scripts/constants";
import { ensureAgialphaStub } from "../shared/ensureAgialpha";

async function main() {
  await ensureAgialphaStub();
  const hubs = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../config/hubs.mainnet.json"), "utf8")
  ) as Record<string, any>;
  const [employer] = await ethers.getSigners();
  const token = await ethers.getContractAt(
    "contracts/test/MockERC20.sol:MockERC20",
    AGIALPHA
  );

  const reward = ethers.parseEther("1");
  await token.mint(employer.address, reward * BigInt(Object.keys(hubs).length));

  for (const [hubKey, hub] of Object.entries(hubs)) {
    const jobRegistry = await ethers.getContractAt("JobRegistry", hub.addresses.JobRegistry);
    const stakeManager = hub.addresses.StakeManager;
    const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const specHash = ethers.id(`seed-${hubKey}`);
    const uri = `ipfs://mesh/seed/${hubKey}`;

    await token.connect(employer).approve(stakeManager, reward);
    const tx = await jobRegistry
      .connect(employer)
      .createJob(reward, deadline, specHash, uri);
    const receipt = await tx.wait();
    const jobId = receipt!.logs.find((log) => log.fragment?.name === "JobCreated")!.args!.jobId;
    console.log(`Seeded job ${jobId} on ${hubKey}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
