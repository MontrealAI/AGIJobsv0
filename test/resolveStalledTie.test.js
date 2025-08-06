const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("resolveStalledJob ties", function () {
  async function deployFixture() {
    const [owner, employer, agent, validator] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy();
    await token.waitForDeployment();

    await token.mint(employer.address, ethers.parseEther("10"));

    const ENSMock = await ethers.getContractFactory("MockENS");
    const ens = await ENSMock.deploy();
    await ens.waitForDeployment();

    const WrapperMock = await ethers.getContractFactory("MockNameWrapper");
    const wrapper = await WrapperMock.deploy();
    await wrapper.waitForDeployment();

    const Manager = await ethers.getContractFactory("AGIJobManagerV1");
    const manager = await Manager.deploy(
      await token.getAddress(),
      "ipfs://",
      await ens.getAddress(),
      await wrapper.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash,
      ethers.ZeroHash,
      ethers.ZeroHash
    );
    await manager.waitForDeployment();

    await manager.setRequiredValidatorApprovals(1);
    await manager.setRequiredValidatorDisapprovals(1);
    await manager.setValidatorsPerJob(1);
    await manager.setCommitDuration(5);
    await manager.setRevealDuration(5);
    await manager.setReviewWindow(20);
    await manager.setResolveGracePeriod(5);

    await manager.addAdditionalAgent(agent.address);
    await manager.addAdditionalValidator(validator.address);

    const payout = ethers.parseEther("1");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");

    return { manager, owner, jobId };
  }

  it("moves job to Disputed on tie and emits JobTie", async function () {
    const { manager, owner, jobId } = await deployFixture();
    await time.increase(5 + 5 + 5 + 1);
    await expect(manager.connect(owner).resolveStalledJob(jobId))
      .to.emit(manager, "JobTie")
      .withArgs(jobId, owner.address)
      .and.to.emit(manager, "JobDisputed")
      .withArgs(jobId, owner.address, 2);
    const job = await manager.jobs(jobId);
    expect(job.status).to.equal(2);
  });
});
