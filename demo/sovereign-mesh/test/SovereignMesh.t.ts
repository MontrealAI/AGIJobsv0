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

const deployHub = async (agi: string): Promise<Hub> => {
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
  await (await stake.setJobRegistry(await job.getAddress())).wait();
  await (await val.setJobRegistry(await job.getAddress())).wait();
  await (await disp.setJobRegistry(await job.getAddress())).wait();
  await (await cert.setJobRegistry(await job.getAddress())).wait();
  await (await stake.setDisputeModule(await disp.getAddress())).wait();
  await (await cert.setStakeManager(await stake.getAddress())).wait();

  return { stake, rep, id, val, disp, cert, job };
};

describe("Sovereign Mesh multi-hub lifecycle", function () {
  it("creates, validates, and finalizes jobs on two hubs", async function () {
    const [employer, v1, v2] = await ethers.getSigners();
    const AGI = await ethers.getContractFactory("AGIALPHAToken");
    const agi = await AGI.deploy("AGIALPHA", "AGIA", 18);
    await agi.waitForDeployment();
    const agiAddress = await agi.getAddress();

    const hub1 = await deployHub(agiAddress);
    const hub2 = await deployHub(agiAddress);

    await (await hub1.job.setIdentityRegistry(await hub1.id.getAddress())).wait();
    await (await hub1.val.setIdentityRegistry(await hub1.id.getAddress())).wait();
    await (await hub2.job.setIdentityRegistry(await hub2.id.getAddress())).wait();
    await (await hub2.val.setIdentityRegistry(await hub2.id.getAddress())).wait();

    for (const validator of [v1, v2]) {
      await (await hub1.id.addAdditionalValidator(validator.address)).wait();
      await (await hub2.id.addAdditionalValidator(validator.address)).wait();
    }

    for (const wallet of [employer, v1, v2]) {
      await (await agi.mint(wallet.address, ethers.parseEther("10"))).wait();
    }

    for (const validator of [v1, v2]) {
      await (await agi.connect(validator).approve(await hub1.stake.getAddress(), ethers.parseEther("1"))).wait();
      await (await hub1.stake.connect(validator).depositStake(1, ethers.parseEther("1"))).wait();
      await (await agi.connect(validator).approve(await hub2.stake.getAddress(), ethers.parseEther("1"))).wait();
      await (await hub2.stake.connect(validator).depositStake(1, ethers.parseEther("1"))).wait();
    }

    const createJob = async (hub: Hub, label: string) => {
      await (await agi.connect(employer).approve(await hub.job.getAddress(), ethers.parseEther("1"))).wait();
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const specHash = ethers.id(`spec-${label}`);
      const tx = await hub.job.connect(employer).createJob(
        ethers.parseEther("1"),
        deadline,
        specHash,
        `ipfs://mesh/${label}`
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => log.fragment?.name === "JobCreated");
      return event?.args?.jobId as bigint;
    };

    const job1 = await createJob(hub1, "hub1");
    const job2 = await createJob(hub2, "hub2");

    const salts = [ethers.id("salt1"), ethers.id("salt2")];

    for (const [index, validator] of [v1, v2].entries()) {
      const commit = ethers.keccak256(
        ethers.solidityPacked(["bool", "bytes32"], [true, salts[index]])
      );
      await (await hub1.val.connect(validator).commitValidation(job1, commit, "validator", [])).wait();
      await (await hub2.val.connect(validator).commitValidation(job2, commit, "validator", [])).wait();
    }

    for (const [index, validator] of [v1, v2].entries()) {
      await (await hub1.val.connect(validator).revealValidation(job1, true, salts[index])).wait();
      await (await hub2.val.connect(validator).revealValidation(job2, true, salts[index])).wait();
    }

    await (await hub1.val.finalize(job1)).wait();
    await (await hub2.val.finalize(job2)).wait();

    const remaining = await agi.balanceOf(employer.address);
    expect(remaining).to.equal(ethers.parseEther("8"));
  });
});
