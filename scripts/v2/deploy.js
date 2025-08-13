const { ethers, run } = require("hardhat");

async function verify(address, args = []) {
  try {
    await run("verify:verify", {
      address,
      constructorArguments: args,
    });
  } catch (err) {
    console.error(`verification failed for ${address}`, err);
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
  const token = await Token.deploy();
  await token.waitForDeployment();

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
  await stake.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    "contracts/v2/JobRegistry.sol:JobRegistry"
  );
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const TaxPolicy = await ethers.getContractFactory(
    "contracts/v2/TaxPolicy.sol:TaxPolicy"
  );
  const tax = await TaxPolicy.deploy(
    "ipfs://policy",
    "All taxes on participants; contract and owner exempt"
  );
  await tax.waitForDeployment();
  await registry.setTaxPolicy(await tax.getAddress());

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
  await validation.waitForDeployment();

  const Reputation = await ethers.getContractFactory(
    "contracts/v2/ReputationEngine.sol:ReputationEngine"
  );
  const reputation = await Reputation.deploy();
  await reputation.waitForDeployment();

  const NFT = await ethers.getContractFactory(
    "contracts/v2/modules/CertificateNFT.sol:CertificateNFT"
  );
  const nft = await NFT.deploy("Cert", "CERT");
  await nft.waitForDeployment();

  const Dispute = await ethers.getContractFactory(
    "contracts/v2/modules/DisputeModule.sol:DisputeModule"
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    ethers.ZeroAddress
  );
  await dispute.waitForDeployment();

  await stake.setJobRegistry(await registry.getAddress());

  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress()
  );

  console.log("JobRegistry deployed to:", await registry.getAddress());
  console.log("ValidationModule:", await validation.getAddress());
  console.log("StakeManager:", await stake.getAddress());
  console.log("ReputationEngine:", await reputation.getAddress());
  console.log("DisputeModule:", await dispute.getAddress());
  console.log("CertificateNFT:", await nft.getAddress());
  console.log("TaxPolicy:", await tax.getAddress());

  await verify(await stake.getAddress(), [await token.getAddress(), deployer.address]);
  await verify(await registry.getAddress(), []);
  await verify(await validation.getAddress(), [await registry.getAddress(), await stake.getAddress()]);
  await verify(await reputation.getAddress(), []);
  await verify(await dispute.getAddress(), [
    await registry.getAddress(),
    0,
    0,
    ethers.ZeroAddress,
  ]);
  await verify(await nft.getAddress(), ["Cert", "CERT"]);
  await verify(await tax.getAddress(), ["ipfs://policy", "All taxes on participants; contract and owner exempt"]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
