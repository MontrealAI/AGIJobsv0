import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer, platform] = await ethers.getSigners();

  // Load addresses from deployment script output.
  const addresses = JSON.parse(
    readFileSync(join(__dirname, "..", "docs", "deployment-addresses.json"), "utf8")
  );

  const token = await ethers.getContractAt(
    "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken",
    addresses.agiAlphaToken
  );
  const stakeManager = await ethers.getContractAt(
    "contracts/v2/StakeManager.sol:StakeManager",
    addresses.stakeManager
  );
  const platformRegistry = await ethers.getContractAt(
    "contracts/v2/PlatformRegistry.sol:PlatformRegistry",
    addresses.platformRegistry
  );
  const jobRegistry = await ethers.getContractAt(
    "contracts/v2/JobRegistry.sol:JobRegistry",
    addresses.jobRegistry
  );

  // For demonstration we mint tokens to the platform so it can stake.
  const stakeAmount = ethers.parseUnits("5000", 6); // 5,000 tokens using 6 decimals
  await token.connect(deployer).mint(platform.address, stakeAmount);

  // Participants must acknowledge the current tax policy before staking.
  await jobRegistry.connect(platform).acknowledgeTaxPolicy();

  // Approve StakeManager to transfer tokens from the platform.
  await token
    .connect(platform)
    .approve(await stakeManager.getAddress(), stakeAmount);

  // Estimate gas for staking and add a safety buffer.
  // ROLE_PLATFORM = 2 in StakeManager.Role enum.
  const ROLE_PLATFORM = 2;
  const gas = await stakeManager
    .connect(platform)
    .depositStake.estimateGas(ROLE_PLATFORM, stakeAmount);
  const tx = await stakeManager.connect(platform).depositStake(ROLE_PLATFORM, stakeAmount, {
    gasLimit: (gas * 12n) / 10n, // add ~20% to avoid out-of-gas
  });
  await tx.wait();

  // Register the platform after staking.
  const regGas = await platformRegistry.connect(platform).register.estimateGas();
  await platformRegistry.connect(platform).register({ gasLimit: regGas });

  console.log("Platform registered:", platform.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

