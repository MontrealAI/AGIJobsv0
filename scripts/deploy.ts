import { ethers } from "hardhat";
import { writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy();

  const Stake = await ethers.getContractFactory(
    "contracts/v2/StakeManager.sol:StakeManager"
  );
  const stake = await Stake.deploy(
    await token.getAddress(),
    0,
    0,
    0,
    deployer.address,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );

  const Registry = await ethers.getContractFactory(
    "contracts/v2/JobRegistry.sol:JobRegistry"
  );
  const registry = await Registry.deploy(deployer.address);

  const Validation = await ethers.getContractFactory(
    "contracts/v2/ValidationModule.sol:ValidationModule"
  );
  const validation = await Validation.deploy(
    await registry.getAddress(),
    await stake.getAddress(),
    60,
    60,
    1,
    3,
    []
  );

  const Reputation = await ethers.getContractFactory(
    "contracts/v2/ReputationEngine.sol:ReputationEngine"
  );
  const reputation = await Reputation.deploy(deployer.address);

  const NFT = await ethers.getContractFactory(
    "contracts/v2/modules/CertificateNFT.sol:CertificateNFT"
  );
  const nft = await NFT.deploy("Cert", "CERT", deployer.address);

  const Dispute = await ethers.getContractFactory(
    "contracts/v2/modules/DisputeModule.sol:DisputeModule"
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    ethers.ZeroAddress
  );

  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress()
  );

  await validation.setReputationEngine(await reputation.getAddress());
  await reputation.setCaller(await registry.getAddress(), true);
  await reputation.setThreshold(1);
  await nft.setJobRegistry(await registry.getAddress());
  await stake.setJobRegistry(await registry.getAddress());
  await nft.transferOwnership(await registry.getAddress());
  await dispute.setAppealFee(10);

  const addresses = {
    jobRegistry: await registry.getAddress(),
    validationModule: await validation.getAddress(),
    stakeManager: await stake.getAddress(),
    reputationEngine: await reputation.getAddress(),
    disputeModule: await dispute.getAddress(),
    certificateNFT: await nft.getAddress(),
    token: await token.getAddress(),
  };

  console.log("JobRegistry deployed to:", addresses.jobRegistry);
  console.log("ValidationModule:", addresses.validationModule);
  console.log("StakeManager:", addresses.stakeManager);
  console.log("ReputationEngine:", addresses.reputationEngine);
  console.log("DisputeModule:", addresses.disputeModule);
  console.log("CertificateNFT:", addresses.certificateNFT);

  const doc = `# Deployment Addresses\n\n` +
    `- JobRegistry: ${addresses.jobRegistry}\n` +
    `- ValidationModule: ${addresses.validationModule}\n` +
    `- StakeManager: ${addresses.stakeManager}\n` +
    `- ReputationEngine: ${addresses.reputationEngine}\n` +
    `- DisputeModule: ${addresses.disputeModule}\n` +
    `- CertificateNFT: ${addresses.certificateNFT}\n` +
    `- MockERC20: ${addresses.token}\n`;

  writeFileSync(join(__dirname, "..", "docs", "deployment-addresses.md"), doc);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
