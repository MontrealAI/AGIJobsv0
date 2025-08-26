import { ethers, run } from "hardhat";
import { writeFileSync } from "fs";
import { join } from "path";

// rudimentary CLI flag parser
function parseArgs() {
  const argv = process.argv.slice(2);
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

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
  const args = parseArgs();

  const governance =
    typeof args.governance === "string" ? args.governance : deployer.address;
  const governanceSigner = await ethers.getSigner(governance);

  // -------------------------------------------------------------------------
  // optional external token
  // -------------------------------------------------------------------------
  let tokenAddress: string;
  if (typeof args.token === "string") {
    tokenAddress = args.token;
  } else {
    const Token = await ethers.getContractFactory(
      "contracts/legacy/MockERC20.sol:MockERC20"
    );
    const token = await Token.deploy();
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
  }

  const Stake = await ethers.getContractFactory(
    "contracts/v2/StakeManager.sol:StakeManager"
  );
  const treasury =
    typeof args.treasury === "string" ? args.treasury : governance;
  const stake = await Stake.deploy(
    tokenAddress,
    0,
    0,
    0,
    treasury,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    governance
  );
  await stake.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    "contracts/v2/JobRegistry.sol:JobRegistry"
  );
  const registry = await Registry.deploy(
    ethers.ZeroAddress,
    await stake.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    governance
  );
  await registry.waitForDeployment();

  const TaxPolicy = await ethers.getContractFactory(
    "contracts/v2/TaxPolicy.sol:TaxPolicy"
  );
  const tax = await TaxPolicy.deploy(
    "ipfs://policy",
    "All taxes on participants; contract and owner exempt"
  );
  await tax.waitForDeployment();

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
  const appealFee = ethers.parseUnits(
    typeof args.appealFee === "string" ? args.appealFee : "0",
    6
  );
  const disputeWindow =
    typeof args.disputeWindow === "string" ? Number(args.disputeWindow) : 0;
  const moderator =
    typeof args.moderator === "string" ? args.moderator : ethers.ZeroAddress;
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    appealFee,
    disputeWindow,
    moderator
  );
  await dispute.waitForDeployment();

  const FeePool = await ethers.getContractFactory(
    "contracts/v2/FeePool.sol:FeePool"
  );
  const burnPct = typeof args.burnPct === "string" ? parseInt(args.burnPct) : 0;
  const feePool = await FeePool.deploy(
    tokenAddress,
    await stake.getAddress(),
    burnPct,
    treasury
  );
  await feePool.waitForDeployment();

  const PlatformRegistry = await ethers.getContractFactory(
    "contracts/v2/PlatformRegistry.sol:PlatformRegistry"
  );
  const minPlatformStake = ethers.parseUnits(
    typeof args.minPlatformStake === "string" ? args.minPlatformStake : "1000",
    6
  );
  const platformRegistry = await PlatformRegistry.deploy(
    await stake.getAddress(),
    await reputation.getAddress(),
    minPlatformStake
  );
  await platformRegistry.waitForDeployment();

  const JobRouter = await ethers.getContractFactory(
    "contracts/v2/modules/JobRouter.sol:JobRouter"
  );
  const jobRouter = await JobRouter.deploy(
    await platformRegistry.getAddress()
  );
  await jobRouter.waitForDeployment();

  const PlatformIncentives = await ethers.getContractFactory(
    "contracts/v2/PlatformIncentives.sol:PlatformIncentives"
  );
  const incentives = await PlatformIncentives.deploy(
    await stake.getAddress(),
    await platformRegistry.getAddress(),
    await jobRouter.getAddress()
  );
  await incentives.waitForDeployment();

  const Installer = await ethers.getContractFactory(
    "contracts/v2/ModuleInstaller.sol:ModuleInstaller"
  );
  const installer = await Installer.deploy();
  await installer.waitForDeployment();

  await registry.setGovernance(await installer.getAddress());
  await stake.setGovernance(await installer.getAddress());
  await validation.transferOwnership(await installer.getAddress());
  await reputation.transferOwnership(await installer.getAddress());
  await dispute.transferOwnership(await installer.getAddress());
  await nft.transferOwnership(await installer.getAddress());
  await incentives.transferOwnership(await installer.getAddress());
  await platformRegistry.transferOwnership(await installer.getAddress());
  await jobRouter.transferOwnership(await installer.getAddress());
  await feePool.transferOwnership(await installer.getAddress());
  await tax.transferOwnership(await installer.getAddress());

  await installer
    .connect(governanceSigner)
    .initialize(
      await registry.getAddress(),
      await stake.getAddress(),
      await validation.getAddress(),
      await reputation.getAddress(),
      await dispute.getAddress(),
      await nft.getAddress(),
      await incentives.getAddress(),
      await platformRegistry.getAddress(),
      await jobRouter.getAddress(),
      await feePool.getAddress(),
      await tax.getAddress()
    );

  const feePct =
    typeof args.feePct === "string" ? Number(args.feePct) : 5;
  await registry.connect(governanceSigner).setFeePct(feePct);

  const burnPct =
    typeof args.burnPct === "string" ? Number(args.burnPct) : 0;
  await feePool.connect(governanceSigner).setBurnPct(burnPct);

  const minStake = ethers.parseUnits(
    typeof args.minStake === "string" ? args.minStake : "0",
    6
  );
  await stake.connect(governanceSigner).setMinStake(minStake);

  console.log("JobRegistry deployed to:", await registry.getAddress());
  console.log("ValidationModule:", await validation.getAddress());
  console.log("StakeManager:", await stake.getAddress());
  console.log("ReputationEngine:", await reputation.getAddress());
  console.log("DisputeModule:", await dispute.getAddress());
  console.log("CertificateNFT:", await nft.getAddress());
  console.log("TaxPolicy:", await tax.getAddress());
  console.log("FeePool:", await feePool.getAddress());
  console.log("PlatformRegistry:", await platformRegistry.getAddress());
  console.log("JobRouter:", await jobRouter.getAddress());
  console.log("PlatformIncentives:", await incentives.getAddress());

  const addresses = {
    token: tokenAddress,
    stakeManager: await stake.getAddress(),
    jobRegistry: await registry.getAddress(),
    validationModule: await validation.getAddress(),
    reputationEngine: await reputation.getAddress(),
    disputeModule: await dispute.getAddress(),
    certificateNFT: await nft.getAddress(),
    taxPolicy: await tax.getAddress(),
    feePool: await feePool.getAddress(),
    platformRegistry: await platformRegistry.getAddress(),
    jobRouter: await jobRouter.getAddress(),
    platformIncentives: await incentives.getAddress(),
  };

  writeFileSync(
    join(__dirname, "..", "..", "docs", "deployment-addresses.json"),
    JSON.stringify(addresses, null, 2)
  );

  await verify(await stake.getAddress(), [
    tokenAddress,
    0,
    0,
    0,
    treasury,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    governance,
  ]);
  await verify(await registry.getAddress(), [
    ethers.ZeroAddress,
    await stake.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    governance,
  ]);
  await verify(await validation.getAddress(), [
    await registry.getAddress(),
    await stake.getAddress(),
    governance,
  ]);
  await verify(await reputation.getAddress(), [governance]);
  await verify(await dispute.getAddress(), [
    await registry.getAddress(),
    appealFee,
    disputeWindow,
    moderator,
    governance,
  ]);
  await verify(await nft.getAddress(), ["Cert", "CERT", governance]);
  await verify(await tax.getAddress(), [
    governance,
    "ipfs://policy",
    "All taxes on participants; contract and owner exempt",
  ]);
  await verify(await feePool.getAddress(), [
    tokenAddress,
    await stake.getAddress(),
    2,
    governance,
  ]);
  await verify(await platformRegistry.getAddress(), [
    await stake.getAddress(),
    await reputation.getAddress(),
    minPlatformStake,
    governance,
  ]);
  await verify(await jobRouter.getAddress(), [
    await platformRegistry.getAddress(),
    governance,
  ]);
  await verify(await incentives.getAddress(), [
    await stake.getAddress(),
    await platformRegistry.getAddress(),
    await jobRouter.getAddress(),
    governance,
  ]);
  await verify(await installer.getAddress(), []);

  await incentives.connect(governanceSigner).stakeAndActivate(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
