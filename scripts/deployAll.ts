import { ethers } from "hardhat";
import { writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();

  // ---------------------------------------------------------------------------
  // Deploy token with 6 decimals so on-chain math aligns with StakeManager.
  // ---------------------------------------------------------------------------
  const Token = await ethers.getContractFactory(
    "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
  );
  const token = await Token.deploy(deployer.address);
  await token.waitForDeployment();
  await token.mint(deployer.address, ethers.parseUnits("1000000", 6));

  // StakeManager must be deployed first as many modules depend on it.
  const Stake = await ethers.getContractFactory(
    "contracts/v2/StakeManager.sol:StakeManager"
  );
  const stake = await Stake.deploy(
    await token.getAddress(),
    deployer.address,
    deployer.address
  );
  await stake.waitForDeployment();

  // JobRegistry coordinates modules and tax acknowledgement.
  const Registry = await ethers.getContractFactory(
    "contracts/v2/JobRegistry.sol:JobRegistry"
  );
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();

  // Simple tax policy used for sample deployments.
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
  const reputation = await Reputation.deploy(deployer.address);
  await reputation.waitForDeployment();

  const NFT = await ethers.getContractFactory(
    "contracts/v2/modules/CertificateNFT.sol:CertificateNFT"
  );
  const nft = await NFT.deploy("Cert", "CERT", deployer.address);
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

  // FeePool receives protocol fees and streams them to staked operators.
  const FeePool = await ethers.getContractFactory(
    "contracts/v2/FeePool.sol:FeePool"
  );
  const feePool = await FeePool.deploy(
    await token.getAddress(),
    await stake.getAddress(),
    2, // IStakeManager.Role.Platform
    deployer.address
  );
  await feePool.waitForDeployment();

  // Optional ETH revenue distributor for off-chain jobs.
  const RevenueDistributor = await ethers.getContractFactory(
    "contracts/v2/modules/RevenueDistributor.sol:RevenueDistributor"
  );
  const distributor = await RevenueDistributor.deploy(
    await stake.getAddress(),
    deployer.address
  );
  await distributor.waitForDeployment();

  // PlatformRegistry tracks platforms; min stake uses 6‑decimal scaling.
  const PlatformRegistry = await ethers.getContractFactory(
    "contracts/v2/PlatformRegistry.sol:PlatformRegistry"
  );
  const minPlatformStake = ethers.parseUnits("1000", 6); // 1,000 tokens (6 decimals)
  const platformRegistry = await PlatformRegistry.deploy(
    await stake.getAddress(),
    await reputation.getAddress(),
    minPlatformStake,
    deployer.address
  );
  await platformRegistry.waitForDeployment();

  // Wire up modules after deployment.
  await stake.setJobRegistry(await registry.getAddress());
  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress()
  );

  // Route protocol fees to FeePool and set a 5% fee cut.
  await registry.setFeePool(await feePool.getAddress());
  await registry.setFeePct(5);

  const addresses = {
    agiAlphaToken: await token.getAddress(),
    stakeManager: await stake.getAddress(),
    jobRegistry: await registry.getAddress(),
    validationModule: await validation.getAddress(),
    reputationEngine: await reputation.getAddress(),
    disputeModule: await dispute.getAddress(),
    certificateNFT: await nft.getAddress(),
    platformRegistry: await platformRegistry.getAddress(),
    feePool: await feePool.getAddress(),
    revenueDistributor: await distributor.getAddress(),
    taxPolicy: await tax.getAddress(),
  };

  console.log("Deployment addresses", addresses);

  // Persist addresses for scripts like registerPlatform.ts
  writeFileSync(
    join(__dirname, "..", "docs", "deployment-addresses.json"),
    JSON.stringify(addresses, null, 2)
  );

  // Example: gas estimation for a deployment (optional, for reference only).
  // const stakeTx = Stake.getDeployTransaction(
  //   addresses.agiAlphaToken,
  //   deployer.address,
  //   deployer.address
  // );
  // const gas = await deployer.provider.estimateGas(stakeTx);
  // console.log("Estimated gas for StakeManager deployment:", gas.toString());
  // Hardhat/ethers auto-estimates gas; explicit estimates help plan costs.
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

