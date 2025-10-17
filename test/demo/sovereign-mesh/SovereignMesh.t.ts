import { expect } from "chai";
import { ethers } from "hardhat";

type Hub = {
  stake: any;
  reputation: any;
  identity: any;
  validation: any;
  dispute: any;
  certificate: any;
  job: any;
};

async function deployHub(agi: string): Promise<Hub> {
  const StakeManager = await ethers.getContractFactory("StakeManager");
  const stake = await StakeManager.deploy(agi);
  await stake.waitForDeployment();
  const Reputation = await (await ethers.getContractFactory("ReputationEngine")).deploy();
  await Reputation.waitForDeployment();
  const Identity = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
  await Identity.waitForDeployment();
  const Validation = await (await ethers.getContractFactory("ValidationModule")).deploy();
  await Validation.waitForDeployment();
  const Dispute = await (await ethers.getContractFactory("DisputeModule")).deploy();
  await Dispute.waitForDeployment();
  const Certificate = await (await ethers.getContractFactory("CertificateNFT")).deploy();
  await Certificate.waitForDeployment();
  const Job = await (await ethers.getContractFactory("JobRegistry")).deploy(agi);
  await Job.waitForDeployment();

  await (
    await Job.setModules(
      await Validation.getAddress(),
      await stake.getAddress(),
      await Reputation.getAddress(),
      await Dispute.getAddress(),
      await Certificate.getAddress(),
      ethers.ZeroAddress,
      []
    )
  ).wait();

  await (await Job.setIdentityRegistry(await Identity.getAddress())).wait();
  await (await Validation.setJobRegistry(await Job.getAddress())).wait();
  await (await Validation.setIdentityRegistry(await Identity.getAddress())).wait();
  await (await stake.setJobRegistry(await Job.getAddress())).wait();
  await (await stake.setDisputeModule(await Dispute.getAddress())).wait();
  await (await Dispute.setJobRegistry(await Job.getAddress())).wait();
  await (await Certificate.setJobRegistry(await Job.getAddress())).wait();
  await (await Certificate.setStakeManager(await stake.getAddress())).wait();

  return { stake, reputation: Reputation, identity: Identity, validation: Validation, dispute: Dispute, certificate: Certificate, job: Job };
}

describe("Sovereign Mesh multi-hub orchestration", function () {
  it("creates and finalizes jobs on two hubs", async function () {
    const [employer, validatorA, validatorB] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("AGIALPHAToken");
    const token = await Token.deploy("AGIALPHA", "AGIA", 18);
    await token.waitForDeployment();
    const agi = await token.getAddress();

    const hubA = await deployHub(agi);
    const hubB = await deployHub(agi);

    for (const hub of [hubA, hubB]) {
      await (await hub.job.setIdentityRegistry(await hub.identity.getAddress())).wait();
      await (await hub.validation.setIdentityRegistry(await hub.identity.getAddress())).wait();
    }

    await (await hubA.identity.addAdditionalValidator(validatorA.address)).wait();
    await (await hubA.identity.addAdditionalValidator(validatorB.address)).wait();
    await (await hubB.identity.addAdditionalValidator(validatorA.address)).wait();
    await (await hubB.identity.addAdditionalValidator(validatorB.address)).wait();

    for (const signer of [employer, validatorA, validatorB]) {
      await (await token.mint(signer.address, ethers.parseEther("10"))).wait();
    }

    for (const validator of [validatorA, validatorB]) {
      await (await token.connect(validator).approve(await hubA.stake.getAddress(), ethers.parseEther("1"))).wait();
      await (await hubA.stake.connect(validator).depositStake(1, ethers.parseEther("1"))).wait();
      await (await token.connect(validator).approve(await hubB.stake.getAddress(), ethers.parseEther("1"))).wait();
      await (await hubB.stake.connect(validator).depositStake(1, ethers.parseEther("1"))).wait();
    }

    const createJob = async (hub: Hub, uri: string) => {
      await (await token.connect(employer).approve(await hub.job.getAddress(), ethers.parseEther("1"))).wait();
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const specHash = ethers.id(uri);
      const tx = await hub.job.connect(employer).createJob(
        ethers.parseEther("1"),
        deadline,
        specHash,
        uri
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find((log: any) => log.fragment?.name === "JobCreated");
      return event!.args!.jobId as bigint;
    };

    const jobIdA = await createJob(hubA, "ipfs://mesh/hubA");
    const jobIdB = await createJob(hubB, "ipfs://mesh/hubB");

    const salts = [ethers.id("salt-a"), ethers.id("salt-b")];

    const commitFor = async (hub: Hub, jobId: bigint, validator: any, salt: string) => {
      const hash = ethers.keccak256(ethers.solidityPacked(["bool", "bytes32"], [true, salt]));
      await (await hub.validation.connect(validator).commitValidation(jobId, hash, "validator", [])).wait();
    };

    await commitFor(hubA, jobIdA, validatorA, salts[0]);
    await commitFor(hubA, jobIdA, validatorB, salts[1]);
    await commitFor(hubB, jobIdB, validatorA, salts[0]);
    await commitFor(hubB, jobIdB, validatorB, salts[1]);

    for (const validator of [validatorA, validatorB]) {
      const salt = validator === validatorA ? salts[0] : salts[1];
      await (await hubA.validation.connect(validator).revealValidation(jobIdA, true, salt)).wait();
      await (await hubB.validation.connect(validator).revealValidation(jobIdB, true, salt)).wait();
    }

    await (await hubA.validation.finalize(jobIdA)).wait();
    await (await hubB.validation.finalize(jobIdB)).wait();

    const remaining = await token.balanceOf(employer.address);
    expect(remaining).to.equal(ethers.parseEther("8"));
  });
});
