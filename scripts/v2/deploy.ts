import { ethers, run } from "hardhat";

async function verify(address: string, args: any[] = []) {
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
    deployer.address,
    deployer.address
  );
  await stake.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    "contracts/v2/JobRegistry.sol:JobRegistry"
  );
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();

  const TaxPolicy = await ethers.getContractFactory(
    "contracts/v2/TaxPolicy.sol:TaxPolicy"
  );
  const tax = await TaxPolicy.deploy(
    deployer.address,
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
    deployer.address
  );
  await validation.waitForDeployment();

  const Reputation = await ethers.getContractFactory(
    "contracts/v2/ReputationEngine.sol:ReputationEngine"
  );
  const reputation = await Reputation.deploy(deployer.address);
  await reputation.waitForDeployment();

  const NFT = await ethers.getContractFactory(
    "contracts/v2/modules/CertificateNFT.sol:CertificateNFT"
  );
  const nft = await NFT.deploy("Cert", "CERT", deployer.address);
  await nft.waitForDeployment();

  const Dispute = await ethers.getContractFactory(
    "contracts/v2/DisputeModule.sol:DisputeModule"
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    deployer.address
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

  await verify(await stake.getAddress(), [await token.getAddress(), deployer.address, deployer.address]);
  await verify(await registry.getAddress(), [deployer.address]);
  await verify(await validation.getAddress(), [await registry.getAddress(), await stake.getAddress(), deployer.address]);
  await verify(await reputation.getAddress(), [deployer.address]);
  await verify(await dispute.getAddress(), [await registry.getAddress(), deployer.address]);
  await verify(await nft.getAddress(), ["Cert", "CERT", deployer.address]);
  await verify(await tax.getAddress(), [deployer.address, "ipfs://policy", "All taxes on participants; contract and owner exempt"]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
