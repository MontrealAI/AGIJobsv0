import { ethers } from "hardhat";

async function main() {
  const agiJobManagerV1 = await ethers.deployContract("AGIJobManagerV1");
  await agiJobManagerV1.waitForDeployment();

  console.log(`AGIJobManagerV1 deployed to: ${agiJobManagerV1.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
