import { expect } from "chai";
import { ethers } from "hardhat";

type Hub = {
  stake: any;
  rep: any;
  id: any;
  val: any;
  disp: any;
  cert: any;
  job: any;
};

async function deployHub(agi: string): Promise<Hub> {
  const StakeManager = await ethers.getContractFactory("StakeManager");
  const stake = await StakeManager.deploy(agi);
  await stake.waitForDeployment();

  const ReputationEngine = await ethers.getContractFactory("ReputationEngine");
  const rep = await ReputationEngine.deploy();
  await rep.waitForDeployment();

  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const id = await IdentityRegistry.deploy();
  await id.waitForDeployment();

  const ValidationModule = await ethers.getContractFactory("ValidationModule");
  const val = await ValidationModule.deploy();
  await val.waitForDeployment();

  const DisputeModule = await ethers.getContractFactory("DisputeModule");
  const disp = await DisputeModule.deploy();
  await disp.waitForDeployment();

  const CertificateNFT = await ethers.getContractFactory("CertificateNFT");
  const cert = await CertificateNFT.deploy();
  await cert.waitForDeployment();

  const JobRegistry = await ethers.getContractFactory("JobRegistry");
  const job = await JobRegistry.deploy(agi);
  await job.waitForDeployment();

  await (await job.setModules(
    await val.getAddress(),
    await stake.getAddress(),
    await rep.getAddress(),
    await disp.getAddress(),
    await cert.getAddress(),
    ethers.ZeroAddress,
    []
  )).wait();

  await (await job.setIdentityRegistry(await id.getAddress())).wait();
  await (await val.setJobRegistry(await job.getAddress())).wait();
  await (await val.setIdentityRegistry(await id.getAddress())).wait();
  await (await stake.setJobRegistry(await job.getAddress())).wait();
  await (await stake.setDisputeModule(await disp.getAddress())).wait();
  await (await disp.setJobRegistry(await job.getAddress())).wait();
  await (await cert.setJobRegistry(await job.getAddress())).wait();
  await (await cert.setStakeManager(await stake.getAddress())).wait();

  return { stake, rep, id, val, disp, cert, job };
}

describe("Sovereign Mesh — multi-hub lifecycle", () => {
  it("creates, validates, and finalizes jobs across hubs", async () => {
    const [employer, validatorA, validatorB] = await ethers.getSigners();

    const AGI = await ethers.getContractFactory("AGIALPHAToken");
    const token = await AGI.deploy("AGIALPHA", "AGIA", 18);
    await token.waitForDeployment();
    const agiAddress = await token.getAddress();

    const hubA = await deployHub(agiAddress);
    const hubB = await deployHub(agiAddress);

    await (await token.mint(employer.address, ethers.parseEther("10"))).wait();
    await (await token.mint(validatorA.address, ethers.parseEther("10"))).wait();
    await (await token.mint(validatorB.address, ethers.parseEther("10"))).wait();

    for (const hub of [hubA, hubB]) {
      await (await hub.job.setIdentityRegistry(await hub.id.getAddress())).wait();
      await (await hub.val.setIdentityRegistry(await hub.id.getAddress())).wait();
      await (await hub.id.addAdditionalValidator(validatorA.address)).wait();
      await (await hub.id.addAdditionalValidator(validatorB.address)).wait();
    }

    for (const hub of [hubA, hubB]) {
      for (const validator of [validatorA, validatorB]) {
        await (
          await token.connect(validator).approve(await hub.stake.getAddress(), ethers.parseEther("1"))
        ).wait();
        await (await hub.stake.connect(validator).depositStake(1, ethers.parseEther("1"))).wait();
      }
    }

    const specA = ethers.id("mesh-hub-a");
    const specB = ethers.id("mesh-hub-b");
    const deadline = Math.floor(Date.now() / 1000) + 86_400;

    await (
      await token.approve(await hubA.job.getAddress(), ethers.parseEther("1"))
    ).wait();
    const txA = await hubA.job
      .connect(employer)
      .createJob(ethers.parseEther("1"), deadline, specA, "ipfs://mesh/hubA");
    const receiptA = await txA.wait();
    const jobIdA = receiptA!.logs.find((log) => log.fragment?.name === "JobCreated")!.args.jobId;

    await (
      await token.approve(await hubB.job.getAddress(), ethers.parseEther("1"))
    ).wait();
    const txB = await hubB.job
      .connect(employer)
      .createJob(ethers.parseEther("1"), deadline, specB, "ipfs://mesh/hubB");
    const receiptB = await txB.wait();
    const jobIdB = receiptB!.logs.find((log) => log.fragment?.name === "JobCreated")!.args.jobId;

    const saltA1 = ethers.id("salt-a-1");
    const saltA2 = ethers.id("salt-a-2");
    const saltB1 = ethers.id("salt-b-1");
    const saltB2 = ethers.id("salt-b-2");

    const commitA1 = ethers.keccak256(ethers.solidityPacked(["bool", "bytes32"], [true, saltA1]));
    const commitA2 = ethers.keccak256(ethers.solidityPacked(["bool", "bytes32"], [true, saltA2]));
    const commitB1 = ethers.keccak256(ethers.solidityPacked(["bool", "bytes32"], [true, saltB1]));
    const commitB2 = ethers.keccak256(ethers.solidityPacked(["bool", "bytes32"], [true, saltB2]));

    await (await hubA.val.connect(validatorA).commitValidation(jobIdA, commitA1, "validator", [])).wait();
    await (await hubA.val.connect(validatorB).commitValidation(jobIdA, commitA2, "validator", [])).wait();
    await (await hubB.val.connect(validatorA).commitValidation(jobIdB, commitB1, "validator", [])).wait();
    await (await hubB.val.connect(validatorB).commitValidation(jobIdB, commitB2, "validator", [])).wait();

    await (await hubA.val.connect(validatorA).revealValidation(jobIdA, true, saltA1)).wait();
    await (await hubA.val.connect(validatorB).revealValidation(jobIdA, true, saltA2)).wait();
    await (await hubB.val.connect(validatorA).revealValidation(jobIdB, true, saltB1)).wait();
    await (await hubB.val.connect(validatorB).revealValidation(jobIdB, true, saltB2)).wait();

    await (await hubA.val.finalize(jobIdA)).wait();
    await (await hubB.val.finalize(jobIdB)).wait();

    const remaining = await token.balanceOf(employer.address);
    expect(remaining).to.equal(ethers.parseEther("8"));
  });
});
