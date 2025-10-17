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

describe("Sovereign Mesh orchestration", () => {
  it("finalizes missions across multiple hubs", async () => {
    const [employer, validatorA, validatorB] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("AGIALPHAToken");
    const token = await Token.deploy("AGIALPHA", "AGIA", 18);
    await token.waitForDeployment();
    const agi = await token.getAddress();

    const hubA = await deployHub(agi);
    const hubB = await deployHub(agi);

    await (await hubA.job.setIdentityRegistry(await hubA.id.getAddress())).wait();
    await (await hubA.val.setIdentityRegistry(await hubA.id.getAddress())).wait();
    await (await hubB.job.setIdentityRegistry(await hubB.id.getAddress())).wait();
    await (await hubB.val.setIdentityRegistry(await hubB.id.getAddress())).wait();

    for (const validator of [validatorA, validatorB]) {
      await (await hubA.id.addAdditionalValidator(validator.address)).wait();
      await (await hubB.id.addAdditionalValidator(validator.address)).wait();
    }

    const mint = async (who: string) => {
      await (await token.mint(who, ethers.parseEther("10"))).wait();
    };
    await Promise.all([employer.address, validatorA.address, validatorB.address].map(mint));

    for (const validator of [validatorA, validatorB]) {
      await (await token.connect(validator).approve(await hubA.stake.getAddress(), ethers.parseEther("1"))).wait();
      await (await hubA.stake.connect(validator).depositStake(1, ethers.parseEther("1"))).wait();
      await (await token.connect(validator).approve(await hubB.stake.getAddress(), ethers.parseEther("1"))).wait();
      await (await hubB.stake.connect(validator).depositStake(1, ethers.parseEther("1"))).wait();
    }

    const createJob = async (hub: Hub, uri: string) => {
      await (await token.connect(employer).approve(await hub.job.getAddress(), ethers.parseEther("1"))).wait();
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      const specHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
      const tx = await hub.job.connect(employer).createJob(ethers.parseEther("1"), deadline, specHash, uri);
      const receipt = await tx.wait();
      const event = receipt!.logs.find((log: any) => log.fragment?.name === "JobCreated");
      return event!.args!.jobId as bigint;
    };

    const jobA = await createJob(hubA, "ipfs://mesh/hubA");
    const jobB = await createJob(hubB, "ipfs://mesh/hubB");

    const salt1 = ethers.hexlify(ethers.randomBytes(32));
    const salt2 = ethers.hexlify(ethers.randomBytes(32));

    const commit = async (hub: Hub, jobId: bigint, validator: any, salt: string) => {
      const commitHash = ethers.keccak256(ethers.solidityPacked(["bool", "bytes32"], [true, salt]));
      await (await hub.val.connect(validator).commitValidation(jobId, commitHash, "validator", [])).wait();
      await (await hub.val.connect(validator).revealValidation(jobId, true, salt)).wait();
    };

    await commit(hubA, jobA, validatorA, salt1);
    await commit(hubA, jobA, validatorB, salt2);
    await commit(hubB, jobB, validatorA, salt1);
    await commit(hubB, jobB, validatorB, salt2);

    await (await hubA.val.finalize(jobA)).wait();
    await (await hubB.val.finalize(jobB)).wait();

    const balance = await token.balanceOf(employer.address);
    expect(balance).to.equal(ethers.parseEther("8"));
  });
});
