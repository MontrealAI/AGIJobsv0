import { expect } from "chai";
import { ethers } from "hardhat";

type HubBundle = {
  job: any;
  stake: any;
  validation: any;
  dispute: any;
  identity: any;
  certificate: any;
};

async function deployHub(token: string): Promise<HubBundle> {
  const StakeManager = await ethers.getContractFactory("StakeManager");
  const stake = await StakeManager.deploy(token);
  await stake.waitForDeployment();

  const ReputationEngine = await ethers.getContractFactory("ReputationEngine");
  const reputation = await ReputationEngine.deploy();
  await reputation.waitForDeployment();

  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identity = await IdentityRegistry.deploy();
  await identity.waitForDeployment();

  const ValidationModule = await ethers.getContractFactory("ValidationModule");
  const validation = await ValidationModule.deploy();
  await validation.waitForDeployment();

  const DisputeModule = await ethers.getContractFactory("DisputeModule");
  const dispute = await DisputeModule.deploy();
  await dispute.waitForDeployment();

  const CertificateNFT = await ethers.getContractFactory("CertificateNFT");
  const certificate = await CertificateNFT.deploy();
  await certificate.waitForDeployment();

  const JobRegistry = await ethers.getContractFactory("JobRegistry");
  const job = await JobRegistry.deploy(token);
  await job.waitForDeployment();

  await (await job.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await certificate.getAddress(),
    ethers.ZeroAddress,
    []
  )).wait();
  await (await job.setIdentityRegistry(await identity.getAddress())).wait();

  await (await stake.setJobRegistry(await job.getAddress())).wait();
  await (await stake.setDisputeModule(await dispute.getAddress())).wait();
  await (await validation.setJobRegistry(await job.getAddress())).wait();
  await (await validation.setIdentityRegistry(await identity.getAddress())).wait();
  await (await dispute.setJobRegistry(await job.getAddress())).wait();
  await (await certificate.setJobRegistry(await job.getAddress())).wait();
  await (await certificate.setStakeManager(await stake.getAddress())).wait();

  return { job, stake, validation, dispute, identity, certificate };
}

describe("Sovereign Mesh multi-hub lifecycle", function () {
  it("deploys two hubs and finalises jobs across both", async function () {
    const [employer, validatorOne, validatorTwo] = await ethers.getSigners();

    const AGI = await ethers.getContractFactory("AGIALPHAToken");
    const token = await AGI.deploy("AGIALPHA", "AGIA", 18);
    await token.waitForDeployment();

    const hubA = await deployHub(await token.getAddress());
    const hubB = await deployHub(await token.getAddress());

    for (const signer of [employer, validatorOne, validatorTwo]) {
      await (await token.mint(signer.address, ethers.parseEther("10"))).wait();
    }

    const allow = async (hub: HubBundle, validator: any) => {
      await (await hub.identity.addAdditionalValidator(validator.address)).wait();
    };
    await allow(hubA, validatorOne);
    await allow(hubA, validatorTwo);
    await allow(hubB, validatorOne);
    await allow(hubB, validatorTwo);

    for (const validator of [validatorOne, validatorTwo]) {
      await (await token.connect(validator).approve(await hubA.stake.getAddress(), ethers.parseEther("1"))).wait();
      await (await hubA.stake.connect(validator).depositStake(1, ethers.parseEther("1"))).wait();
      await (await token.connect(validator).approve(await hubB.stake.getAddress(), ethers.parseEther("1"))).wait();
      await (await hubB.stake.connect(validator).depositStake(1, ethers.parseEther("1"))).wait();
    }

    const createJob = async (hub: HubBundle, uri: string) => {
      await (await token.connect(employer).approve(await hub.job.getAddress(), ethers.parseEther("1"))).wait();
      const deadline = Math.floor(Date.now() / 1000) + 24 * 3600;
      const tx = await hub.job.connect(employer).createJob(
        ethers.parseEther("1"),
        deadline,
        ethers.id(uri),
        uri
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => log.fragment?.name === "JobCreated");
      return event?.args?.jobId as bigint;
    };

    const jobIdA = await createJob(hubA, "ipfs://mesh/hubA");
    const jobIdB = await createJob(hubB, "ipfs://mesh/hubB");

    const commitVote = async (hub: HubBundle, validator: any, jobId: bigint, salt: string) => {
      const hash = ethers.keccak256(ethers.solidityPacked(["bool", "bytes32"], [true, salt]));
      await (await hub.validation.connect(validator).commitValidation(jobId, hash, "validator", [])).wait();
    };

    const revealVote = async (hub: HubBundle, validator: any, jobId: bigint, salt: string) => {
      await (await hub.validation.connect(validator).revealValidation(jobId, true, salt)).wait();
    };

    const saltOne = ethers.id("validator-one");
    const saltTwo = ethers.id("validator-two");

    await commitVote(hubA, validatorOne, jobIdA, saltOne);
    await commitVote(hubA, validatorTwo, jobIdA, saltTwo);
    await commitVote(hubB, validatorOne, jobIdB, saltOne);
    await commitVote(hubB, validatorTwo, jobIdB, saltTwo);

    await revealVote(hubA, validatorOne, jobIdA, saltOne);
    await revealVote(hubA, validatorTwo, jobIdA, saltTwo);
    await revealVote(hubB, validatorOne, jobIdB, saltOne);
    await revealVote(hubB, validatorTwo, jobIdB, saltTwo);

    await (await hubA.validation.finalize(jobIdA)).wait();
    await (await hubB.validation.finalize(jobIdB)).wait();

    const remaining = await token.balanceOf(employer.address);
    expect(remaining).to.equal(ethers.parseEther("8"));
  });
});
