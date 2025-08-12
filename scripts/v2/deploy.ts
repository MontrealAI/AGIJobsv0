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

  const owner =
    typeof args.owner === "string" ? args.owner : deployer.address;
  const ownerSigner = await ethers.getSigner(owner);

  // -------------------------------------------------------------------------
  // optional external token
  // -------------------------------------------------------------------------
  let tokenAddress: string;
  if (typeof args.token === "string") {
    tokenAddress = args.token;
  } else {
    const Token = await ethers.getContractFactory(
      "contracts/mocks/MockERC20.sol:MockERC20"
    );
    const token = await Token.deploy();
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
  }

  const Stake = await ethers.getContractFactory(
    "contracts/v2/StakeManager.sol:StakeManager"
  );
  const treasury =
    typeof args.treasury === "string" ? args.treasury : owner;
  const stake = await Stake.deploy(tokenAddress, owner, treasury);
  await stake.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    "contracts/v2/JobRegistry.sol:JobRegistry"
  );
  const registry = await Registry.deploy(owner);
  await registry.waitForDeployment();

  const TaxPolicy = await ethers.getContractFactory(
    "contracts/v2/TaxPolicy.sol:TaxPolicy"
  );
  const tax = await TaxPolicy.deploy(
    owner,
    "ipfs://policy",
    "All taxes on participants; contract and owner exempt"
  );
  await tax.waitForDeployment();
  await registry.connect(ownerSigner).setTaxPolicy(await tax.getAddress());

  const Validation = await ethers.getContractFactory(
    "contracts/v2/ValidationModule.sol:ValidationModule"
  );
  const validation = await Validation.deploy(
    await registry.getAddress(),
    await stake.getAddress(),
    owner
  );
  await validation.waitForDeployment();

  const Reputation = await ethers.getContractFactory(
    "contracts/v2/ReputationEngine.sol:ReputationEngine"
  );
  const reputation = await Reputation.deploy(owner);
  await reputation.waitForDeployment();

  const NFT = await ethers.getContractFactory(
    "contracts/v2/modules/CertificateNFT.sol:CertificateNFT"
  );
  const nft = await NFT.deploy("Cert", "CERT", owner);
  await nft.waitForDeployment();

  const Dispute = await ethers.getContractFactory(
    "contracts/v2/DisputeModule.sol:DisputeModule"
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    owner
  );
  await dispute.waitForDeployment();

  const FeePool = await ethers.getContractFactory(
    "contracts/v2/FeePool.sol:FeePool"
  );
  const feePool = await FeePool.deploy(
    tokenAddress,
    await stake.getAddress(),
    2, // IStakeManager.Role.Platform
    owner
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
    minPlatformStake,
    owner
  );
  await platformRegistry.waitForDeployment();

  const JobRouter = await ethers.getContractFactory(
    "contracts/v2/modules/JobRouter.sol:JobRouter"
  );
  const jobRouter = await JobRouter.deploy(
    await platformRegistry.getAddress(),
    owner
  );
  await jobRouter.waitForDeployment();

  const PlatformIncentives = await ethers.getContractFactory(
    "contracts/v2/PlatformIncentives.sol:PlatformIncentives"
  );
  const incentives = await PlatformIncentives.deploy(
    await stake.getAddress(),
    await platformRegistry.getAddress(),
    await jobRouter.getAddress(),
    owner
  );
  await incentives.waitForDeployment();

  await stake.connect(ownerSigner).setJobRegistry(await registry.getAddress());

  await registry.connect(ownerSigner).setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress()
  );

  await registry
    .connect(ownerSigner)
    .setFeePool(await feePool.getAddress());

  const feePct =
    typeof args.feePct === "string" ? Number(args.feePct) : 5;
  await registry.connect(ownerSigner).setFeePct(feePct);

  const burnPct =
    typeof args.burnPct === "string" ? Number(args.burnPct) : 0;
  await feePool.connect(ownerSigner).setBurnPct(burnPct);

  const minStake = ethers.parseUnits(
    typeof args.minStake === "string" ? args.minStake : "0",
    6
  );
  await stake.connect(ownerSigner).setMinStake(minStake);

  await platformRegistry
    .connect(ownerSigner)
    .setRegistrar(await incentives.getAddress(), true);
  await jobRouter
    .connect(ownerSigner)
    .setRegistrar(await incentives.getAddress(), true);

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

  await verify(await stake.getAddress(), [tokenAddress, owner, treasury]);
  await verify(await registry.getAddress(), [owner]);
  await verify(await validation.getAddress(), [await registry.getAddress(), await stake.getAddress(), owner]);
  await verify(await reputation.getAddress(), [owner]);
  await verify(await dispute.getAddress(), [await registry.getAddress(), owner]);
  await verify(await nft.getAddress(), ["Cert", "CERT", owner]);
  await verify(await tax.getAddress(), [owner, "ipfs://policy", "All taxes on participants; contract and owner exempt"]);
  await verify(await feePool.getAddress(), [tokenAddress, await stake.getAddress(), 2, owner]);
  await verify(await platformRegistry.getAddress(), [await stake.getAddress(), await reputation.getAddress(), minPlatformStake, owner]);
  await verify(await jobRouter.getAddress(), [await platformRegistry.getAddress(), owner]);
  await verify(await incentives.getAddress(), [await stake.getAddress(), await platformRegistry.getAddress(), await jobRouter.getAddress(), owner]);

  await incentives.connect(ownerSigner).stakeAndActivate(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
