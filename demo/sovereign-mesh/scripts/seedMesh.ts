import fs from "fs";
import path from "path";
import { ethers } from "hardhat";
import { AGIALPHA, AGIALPHA_DECIMALS } from "../../scripts/constants";

const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");

async function main() {
  const hubs = JSON.parse(fs.readFileSync(hubsPath, "utf8"));
  const [employer] = await ethers.getSigners();
  const token = await ethers.getContractAt(
    "contracts/test/AGIALPHAToken.sol:AGIALPHAToken",
    AGIALPHA
  );

  await token.mint(employer.address, ethers.parseUnits("1000", AGIALPHA_DECIMALS));

  for (const key of Object.keys(hubs)) {
    const cfg = hubs[key];
    const jobRegistry = await ethers.getContractAt(
      "contracts/v2/JobRegistry.sol:JobRegistry",
      cfg.addresses.JobRegistry,
      employer
    );
    const reward = ethers.parseUnits("1", AGIALPHA_DECIMALS);
    await token.approve(cfg.addresses.JobRegistry, reward);
    const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes(`seed-${key}`));
    const uri = `ipfs://mesh/seed/${key}`;
    const tx = await jobRegistry.createJob(reward, deadline, specHash, uri);
    await tx.wait();
    console.log(`Seeded job on ${key} (${tx.hash})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
