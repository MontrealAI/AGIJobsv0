import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("contracts/v2/AGIALPHAToken.sol:AGIALPHAToken");
  const token = await Token.deploy();
  await token.waitForDeployment();

  const Stake = await ethers.getContractFactory("contracts/v2/StakeManager.sol:StakeManager");
  const stake = await Stake.deploy(
    await token.getAddress(),
    0,
    0,
    0,
    deployer.address,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );
  await stake.waitForDeployment();

  const Reputation = await ethers.getContractFactory("contracts/v2/ReputationEngine.sol:ReputationEngine");
  const reputation = await Reputation.deploy(await stake.getAddress());
  await reputation.waitForDeployment();

  const ENS = await ethers.getContractFactory("contracts/mocks/MockENS.sol:MockENS");
  const ens = await ENS.deploy();
  await ens.waitForDeployment();
  const Wrapper = await ethers.getContractFactory("contracts/mocks/MockNameWrapper.sol:MockNameWrapper");
  const wrapper = await Wrapper.deploy();
  await wrapper.waitForDeployment();

  const Identity = await ethers.getContractFactory("contracts/v2/IdentityRegistry.sol:IdentityRegistry");
  const identity = await Identity.deploy(
    await ens.getAddress(),
    await wrapper.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash
  );
  await identity.waitForDeployment();

  const Validation = await ethers.getContractFactory("contracts/v2/mocks/ValidationStub.sol:ValidationStub");
  const validation = await Validation.deploy();
  await validation.waitForDeployment();

  const NFT = await ethers.getContractFactory("contracts/v2/CertificateNFT.sol:CertificateNFT");
  const nft = await NFT.deploy("Cert", "CERT");
  await nft.waitForDeployment();

  const Registry = await ethers.getContractFactory("contracts/v2/JobRegistry.sol:JobRegistry");
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await nft.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    []
  );
  await registry.waitForDeployment();

  const Dispute = await ethers.getContractFactory("contracts/v2/DisputeModule.sol:DisputeModule");
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    await stake.getAddress(),
    deployer.address,
    0
  );
  await dispute.waitForDeployment();

  await stake.setModules(await registry.getAddress(), await dispute.getAddress());
  await validation.setJobRegistry(await registry.getAddress());
  await nft.setJobRegistry(await registry.getAddress());
  await nft.setStakeManager(await stake.getAddress());
  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress(),
    ethers.ZeroAddress,
    []
  );
  await registry.setIdentityRegistry(await identity.getAddress());
  await reputation.setCaller(await registry.getAddress(), true);

  console.log("Token:", await token.getAddress());
  console.log("StakeManager:", await stake.getAddress());
  console.log("ReputationEngine:", await reputation.getAddress());
  console.log("IdentityRegistry:", await identity.getAddress());
  console.log("JobRegistry:", await registry.getAddress());
  console.log("DisputeModule:", await dispute.getAddress());
  console.log("CertificateNFT:", await nft.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
