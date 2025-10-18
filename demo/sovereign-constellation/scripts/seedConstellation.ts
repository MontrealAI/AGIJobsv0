import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

const ERC20_ABI = ["function approve(address,uint256)"];
const JOB_ABI = [
  "function createJob(uint256,uint64,bytes32,string) returns (uint256)"
];

async function main() {
  const hubsPath = path.join(__dirname, "../config/constellation.hubs.json");
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8"));
  const [employer] = await ethers.getSigners();

  const tokenAddress = Object.values<any>(hubs)[0]?.addresses?.AGIALPHA;
  if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
    throw new Error("Hub config must include a valid AGIALPHA token address");
  }

  const tokenOwner = new ethers.Contract(tokenAddress, ["function mint(address,uint256)", "function balanceOf(address) view returns (uint256)"], employer);
  const balance = await tokenOwner.balanceOf(employer.address);
  if (balance === 0n) {
    await (await tokenOwner.mint(employer.address, ethers.parseEther("10"))).wait();
  }

  for (const [key, info] of Object.entries<any>(hubs)) {
    const agi = info.addresses.AGIALPHA;
    const jobRegistry = info.addresses.JobRegistry;
    if (!agi || agi === ethers.ZeroAddress || !jobRegistry || jobRegistry === ethers.ZeroAddress) {
      console.warn(`Skipping ${key}: missing addresses`);
      continue;
    }

    const token = new ethers.Contract(agi, ERC20_ABI, employer);
    const job = new ethers.Contract(jobRegistry, JOB_ABI, employer);
    const reward = ethers.parseEther("1");
    const uri = `ipfs://constellation/seed/${key}`;
    const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const specHash = ethers.id(`seed-${key}`);

    await (await token.approve(jobRegistry, reward)).wait();
    const tx = await job.createJob(reward, deadline, specHash, uri);
    await tx.wait();
    console.log(`Seeded ${key} with job (tx: ${tx.hash})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
