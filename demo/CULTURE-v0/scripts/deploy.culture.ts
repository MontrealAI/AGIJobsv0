import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying CULTURE contracts with ${deployer.address}`);

  const identityRegistry = process.env.IDENTITY_REGISTRY_ADDRESS ?? ethers.ZeroAddress;
  const validationModule = process.env.VALIDATION_MODULE_ADDRESS ?? ethers.ZeroAddress;
  const stakeManager = process.env.STAKE_MANAGER_ADDRESS ?? ethers.ZeroAddress;

  const CultureRegistry = await ethers.getContractFactory("CultureRegistry");
  const cultureRegistry = await CultureRegistry.deploy(deployer.address, identityRegistry);
  await cultureRegistry.waitForDeployment();

  const SelfPlayArena = await ethers.getContractFactory("SelfPlayArena");
  const selfPlayArena = await SelfPlayArena.deploy(deployer.address, validationModule, stakeManager);
  await selfPlayArena.waitForDeployment();

  console.log(`CultureRegistry deployed at ${await cultureRegistry.getAddress()}`);
  console.log(`SelfPlayArena deployed at ${await selfPlayArena.getAddress()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
