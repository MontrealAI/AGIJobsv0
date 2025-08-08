import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy();

  const Stake = await ethers.getContractFactory(
    "contracts/v2/StakeManager.sol:StakeManager"
  );
  const stake = await Stake.deploy(
    await token.getAddress(),
    deployer.address,
    deployer.address
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
    deployer.address
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
    "contracts/v2/DisputeModule.sol:DisputeModule"
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    deployer.address
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
  await stake.transferOwnership(await registry.getAddress());
  await nft.transferOwnership(await registry.getAddress());
  await dispute.setAppealFee(10);

  console.log("JobRegistry deployed to:", await registry.getAddress());
  console.log("ValidationModule:", await validation.getAddress());
  console.log("StakeManager:", await stake.getAddress());
  console.log("ReputationEngine:", await reputation.getAddress());
  console.log("DisputeModule:", await dispute.getAddress());
  console.log("CertificateNFT:", await nft.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
