import { ethers } from "hardhat";

async function main() {
  const registryAddress = process.env.JOB_REGISTRY;
  const oldModuleAddress = process.env.OLD_DISPUTE_MODULE;

  if (!registryAddress || !oldModuleAddress) {
    throw new Error("JOB_REGISTRY and OLD_DISPUTE_MODULE env vars required");
  }

  const jobRegistry = await ethers.getContractAt(
    "contracts/JobRegistry.sol:JobRegistry",
    registryAddress
  );
  const oldModule = await ethers.getContractAt(
    "contracts/DisputeModule.sol:DisputeModule",
    oldModuleAddress
  );

  const stakeManager = await oldModule.stakeManager();
  const disputeFee = await oldModule.disputeFee();
  const disputeWindow = await oldModule.disputeWindow();
  const moderator = await oldModule.moderator();

  const DisputeFactory = await ethers.getContractFactory(
    "contracts/DisputeModule.sol:DisputeModule"
  );
  const newModule = await DisputeFactory.deploy(
    registryAddress,
    stakeManager,
    disputeFee,
    disputeWindow,
    moderator
  );
  await newModule.waitForDeployment();

  // transfer ownership to match the previous module
  const owner = await oldModule.owner();
  if ((await newModule.owner()) !== owner) {
    await newModule.transferOwnership(owner);
  }

  const validation = await jobRegistry.validationModule();
  const reputation = await jobRegistry.reputationEngine();
  const stake = await jobRegistry.stakeManager();
  const cert = await jobRegistry.certificateNFT();

  await jobRegistry.setModules(
    validation,
    reputation,
    stake,
    cert,
    await newModule.getAddress()
  );

  console.log("Migrated dispute module to", await newModule.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
