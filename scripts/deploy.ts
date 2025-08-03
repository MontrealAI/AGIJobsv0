import { ethers } from "hardhat";

async function main() {
  const agiJobManager = await ethers.deployContract("AGIJobManagerv0");
  await agiJobManager.waitForDeployment();

  console.log(`AGIJobManagerv0 deployed to: ${agiJobManager.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
