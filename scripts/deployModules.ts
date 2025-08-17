import { writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const multisig = process.env.MULTISIG || deployer.address;

  const Token = await ethers.getContractFactory(
    "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
  );
  const token = await Token.deploy();
  await token.waitForDeployment();
  await token.mint(deployer.address, ethers.parseUnits("1000000", 6));

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

  const Reputation = await ethers.getContractFactory(
    "contracts/v2/ReputationEngine.sol:ReputationEngine"
  );
  const reputation = await Reputation.deploy(await stake.getAddress());
  await reputation.waitForDeployment();

  const Validation = await ethers.getContractFactory(
    "contracts/v2/ValidationModule.sol:ValidationModule"
  );
  const validation = await Validation.deploy(
    ethers.ZeroAddress,
    await stake.getAddress(),
    0,
    0,
    0,
    0,
    []
  );
  await validation.waitForDeployment();

  const Dispute = await ethers.getContractFactory(
    "contracts/v2/modules/DisputeModule.sol:DisputeModule"
  );
  const dispute = await Dispute.deploy(
    ethers.ZeroAddress,
    0,
    0,
    ethers.ZeroAddress
  );
  await dispute.waitForDeployment();

  const NFT = await ethers.getContractFactory(
    "contracts/v2/CertificateNFT.sol:CertificateNFT"
  );
  const nft = await NFT.deploy("Cert", "CERT");
  await nft.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    "contracts/v2/JobRegistry.sol:JobRegistry"
  );
  const registry = await Registry.deploy(
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    []
  );
  await registry.waitForDeployment();

  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress(),
    []
  );

  await validation.setJobRegistry(await registry.getAddress());
  await dispute.setJobRegistry(await registry.getAddress());
  await nft.setJobRegistry(await registry.getAddress());
  await nft.setStakeManager(await stake.getAddress());
  await stake.setModules(await registry.getAddress(), await dispute.getAddress());

  const contracts = [
    token,
    stake,
    reputation,
    validation,
    dispute,
    nft,
    registry,
  ];

  for (const c of contracts) {
    if ((await c.owner()) !== multisig) {
      await c.transferOwnership(multisig);
    }
  }

  const addresses = {
    agiAlphaToken: await token.getAddress(),
    stakeManager: await stake.getAddress(),
    reputationEngine: await reputation.getAddress(),
    validationModule: await validation.getAddress(),
    disputeModule: await dispute.getAddress(),
    certificateNFT: await nft.getAddress(),
    jobRegistry: await registry.getAddress(),
    multisig,
  };

  writeFileSync(
    join(__dirname, "..", "docs", "deployment-summary.json"),
    JSON.stringify(addresses, null, 2)
  );
  console.log("Deployment summary", addresses);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

