import { expect } from "chai";
import { ethers } from "hardhat";

async function deployHub(agi: string) {
  const StakeManager = await ethers.getContractFactory("StakeManager");
  const stake = await StakeManager.deploy(agi);
  await stake.waitForDeployment();

  const ReputationEngine = await (await ethers.getContractFactory("ReputationEngine")).deploy();
  await ReputationEngine.waitForDeployment();

  const IdentityRegistry = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
  await IdentityRegistry.waitForDeployment();

  const ValidationModule = await (await ethers.getContractFactory("ValidationModule")).deploy();
  await ValidationModule.waitForDeployment();

  const DisputeModule = await (await ethers.getContractFactory("DisputeModule")).deploy();
  await DisputeModule.waitForDeployment();

  const CertificateNFT = await (await ethers.getContractFactory("CertificateNFT")).deploy();
  await CertificateNFT.waitForDeployment();

  const JobRegistry = await (await ethers.getContractFactory("JobRegistry")).deploy(agi);
  await JobRegistry.waitForDeployment();

  await (
    await JobRegistry.setModules(
      await ValidationModule.getAddress(),
      await stake.getAddress(),
      await ReputationEngine.getAddress(),
      await DisputeModule.getAddress(),
      await CertificateNFT.getAddress(),
      ethers.ZeroAddress,
      []
    )
  ).wait();
  await (await stake.setJobRegistry(await JobRegistry.getAddress())).wait();
  await (await ValidationModule.setJobRegistry(await JobRegistry.getAddress())).wait();
  await (await DisputeModule.setJobRegistry(await JobRegistry.getAddress())).wait();
  await (await CertificateNFT.setJobRegistry(await JobRegistry.getAddress())).wait();
  await (await stake.setDisputeModule(await DisputeModule.getAddress())).wait();
  await (await CertificateNFT.setStakeManager(await stake.getAddress())).wait();

  return { stake, ReputationEngine, IdentityRegistry, ValidationModule, DisputeModule, CertificateNFT, JobRegistry };
}

describe("Sovereign Mesh multi-hub lifecycle", () => {
  it("orchestrates validation across two hubs", async () => {
    const [employer, validator1, validator2] = await ethers.getSigners();

    const AGI = await ethers.getContractFactory("AGIALPHAToken");
    const token = await AGI.deploy("AGIALPHA", "AGIA", 18);
    await token.waitForDeployment();
    const agiAddress = await token.getAddress();

    const hubA = await deployHub(agiAddress);
    const hubB = await deployHub(agiAddress);

    await (await hubA.JobRegistry.setIdentityRegistry(await hubA.IdentityRegistry.getAddress())).wait();
    await (await hubA.ValidationModule.setIdentityRegistry(await hubA.IdentityRegistry.getAddress())).wait();
    await (await hubB.JobRegistry.setIdentityRegistry(await hubB.IdentityRegistry.getAddress())).wait();
    await (await hubB.ValidationModule.setIdentityRegistry(await hubB.IdentityRegistry.getAddress())).wait();

    for (const validator of [validator1, validator2]) {
      await (await hubA.IdentityRegistry.addAdditionalValidator(validator.address)).wait();
      await (await hubB.IdentityRegistry.addAdditionalValidator(validator.address)).wait();
    }

    for (const signer of [employer, validator1, validator2]) {
      await (await token.mint(signer.address, ethers.parseEther("10"))).wait();
    }

    for (const validator of [validator1, validator2]) {
      await (await token.connect(validator).approve(await hubA.stake.getAddress(), ethers.parseEther("1"))).wait();
      await (await hubA.stake.connect(validator).depositStake(1, ethers.parseEther("1"))).wait();
      await (await token.connect(validator).approve(await hubB.stake.getAddress(), ethers.parseEther("1"))).wait();
      await (await hubB.stake.connect(validator).depositStake(1, ethers.parseEther("1"))).wait();
    }

    await (await token.connect(employer).approve(await hubA.JobRegistry.getAddress(), ethers.parseEther("1"))).wait();
    const deadlineA = Math.floor(Date.now() / 1000) + 86400;
    const specA = ethers.id("mesh-spec-a");
    const txA = await hubA.JobRegistry.connect(employer).createJob(
      ethers.parseEther("1"),
      deadlineA,
      specA,
      "ipfs://mesh/hubA/job"
    );
    const rcA = await txA.wait();
    const jobIdA = rcA!.logs.find((log: any) => log.fragment?.name === "JobCreated")!.args.jobId as bigint;

    await (await token.connect(employer).approve(await hubB.JobRegistry.getAddress(), ethers.parseEther("1"))).wait();
    const deadlineB = Math.floor(Date.now() / 1000) + 86400;
    const specB = ethers.id("mesh-spec-b");
    const txB = await hubB.JobRegistry.connect(employer).createJob(
      ethers.parseEther("1"),
      deadlineB,
      specB,
      "ipfs://mesh/hubB/job"
    );
    const rcB = await txB.wait();
    const jobIdB = rcB!.logs.find((log: any) => log.fragment?.name === "JobCreated")!.args.jobId as bigint;

    const salt1 = ethers.id("validator-one");
    const salt2 = ethers.id("validator-two");

    const commitHashA1 = ethers.keccak256(ethers.solidityPacked(["bool", "bytes32"], [true, salt1]));
    const commitHashA2 = ethers.keccak256(ethers.solidityPacked(["bool", "bytes32"], [true, salt2]));
    await (await hubA.ValidationModule.connect(validator1).commitValidation(jobIdA, commitHashA1, "validator", [])).wait();
    await (await hubA.ValidationModule.connect(validator2).commitValidation(jobIdA, commitHashA2, "validator", [])).wait();

    const commitHashB1 = ethers.keccak256(ethers.solidityPacked(["bool", "bytes32"], [true, salt1]));
    const commitHashB2 = ethers.keccak256(ethers.solidityPacked(["bool", "bytes32"], [true, salt2]));
    await (await hubB.ValidationModule.connect(validator1).commitValidation(jobIdB, commitHashB1, "validator", [])).wait();
    await (await hubB.ValidationModule.connect(validator2).commitValidation(jobIdB, commitHashB2, "validator", [])).wait();

    await (await hubA.ValidationModule.connect(validator1).revealValidation(jobIdA, true, salt1)).wait();
    await (await hubA.ValidationModule.connect(validator2).revealValidation(jobIdA, true, salt2)).wait();
    await (await hubB.ValidationModule.connect(validator1).revealValidation(jobIdB, true, salt1)).wait();
    await (await hubB.ValidationModule.connect(validator2).revealValidation(jobIdB, true, salt2)).wait();

    await (await hubA.ValidationModule.finalize(jobIdA)).wait();
    await (await hubB.ValidationModule.finalize(jobIdB)).wait();

    const employerBalance = await token.balanceOf(employer.address);
    expect(employerBalance).to.equal(ethers.parseEther("8"));
  });
});
