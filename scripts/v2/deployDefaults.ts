import { ethers, run } from "hardhat";
import { AGIALPHA_DECIMALS } from "../constants";

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
  const [owner] = await ethers.getSigners();
  const withTax = !process.argv.includes("--no-tax");
  const governanceArgIndex = process.argv.indexOf("--governance");
  const governance =
    governanceArgIndex !== -1
      ? process.argv[governanceArgIndex + 1]
      : owner.address;

  const Deployer = await ethers.getContractFactory(
    "contracts/v2/Deployer.sol:Deployer"
  );
  const deployer = await Deployer.deploy();
  await deployer.waitForDeployment();
  const deployerAddress = await deployer.getAddress();
  console.log("Deployer", deployerAddress);

  const ids = {
    ens: ethers.ZeroAddress,
    nameWrapper: ethers.ZeroAddress,
    clubRootNode: ethers.ZeroHash,
    agentRootNode: ethers.ZeroHash,
    validatorMerkleRoot: ethers.ZeroHash,
    agentMerkleRoot: ethers.ZeroHash,
  };

  const tx = withTax
    ? await deployer.deployDefaults(ids, governance)
    : await deployer.deployDefaultsWithoutTaxPolicy(ids, governance);
  const receipt = await tx.wait();
  const log = receipt.logs.find((l) => l.address === deployerAddress)!;
  const decoded = deployer.interface.decodeEventLog(
    "Deployed",
    log.data,
    log.topics
  );

  const [
    stakeManager,
    jobRegistry,
    validationModule,
    reputationEngine,
    disputeModule,
    certificateNFT,
    platformRegistry,
    jobRouter,
    platformIncentives,
    feePool,
    taxPolicy,
    identityRegistry,
    systemPause,
  ] = decoded as string[];

  await verify(deployerAddress);
  await verify(stakeManager, [
    ethers.parseUnits("1", AGIALPHA_DECIMALS),
    0,
    100,
    governance,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    governance,
  ]);
  await verify(jobRegistry, [
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    5,
    0,
    [stakeManager],
  ]);
  await verify(validationModule, [
    jobRegistry,
    stakeManager,
    86400,
    86400,
    0,
    0,
    [],
  ]);
  await verify(reputationEngine);
  await verify(disputeModule, [jobRegistry, 0, 0, governance]);
  await verify(certificateNFT, ["Cert", "CERT"]);
  await verify(platformRegistry, [stakeManager, reputationEngine, 0]);
  await verify(jobRouter, [platformRegistry]);
  await verify(platformIncentives, [
    stakeManager,
    platformRegistry,
    jobRouter,
  ]);
  await verify(feePool, [stakeManager, 2, governance]);
  await verify(identityRegistry, [
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    reputationEngine,
    ethers.ZeroHash,
    ethers.ZeroHash,
  ]);
  await verify(systemPause, [
    jobRegistry,
    stakeManager,
    validationModule,
    disputeModule,
    platformRegistry,
    feePool,
    reputationEngine,
    governance,
  ]);
  if (withTax) {
    await verify(taxPolicy, [
      "ipfs://policy",
      "All taxes on participants; contract and owner exempt",
    ]);
  }

  console.log("Deployment complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
