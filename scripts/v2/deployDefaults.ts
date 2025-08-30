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
  const [owner] = await ethers.getSigners();
  const withTax = !process.argv.includes("--no-tax");

  const Deployer = await ethers.getContractFactory(
    "contracts/v2/Deployer.sol:Deployer"
  );
  const deployer = await Deployer.deploy();
  await deployer.waitForDeployment();
  const deployerAddress = await deployer.getAddress();
  console.log("Deployer", deployerAddress);

  const tx = withTax
    ? await deployer.deployDefaults()
    : await deployer.deployDefaultsWithoutTaxPolicy();
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
  ] = decoded as string[];

  await verify(deployerAddress);
  await verify(stakeManager, [
    ethers.parseUnits("1", 18),
    0,
    100,
    owner.address,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address,
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
  await verify(disputeModule, [jobRegistry, 0, 0, owner.address]);
  await verify(certificateNFT, ["Cert", "CERT"]);
  await verify(platformRegistry, [stakeManager, reputationEngine, 0]);
  await verify(jobRouter, [platformRegistry]);
  await verify(platformIncentives, [
    stakeManager,
    platformRegistry,
    jobRouter,
  ]);
  await verify(feePool, [
    stakeManager,
    2,
    owner.address,
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
