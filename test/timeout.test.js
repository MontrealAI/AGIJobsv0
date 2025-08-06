const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("timeoutJob", function () {
  async function deployFixture() {
    const [employer, agent, validator1, validator2, validator3, other] =
      await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy();
    await token.waitForDeployment();

    await token.mint(employer.address, ethers.parseEther("100"));

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

    await manager.addAdditionalAgent(agent.address);
    await manager.addAdditionalValidator(validator1.address);
    await manager.addAdditionalValidator(validator2.address);
    await manager.addAdditionalValidator(validator3.address);

    return { token, manager, employer, agent, other };
  }

  it("allows employer to timeout an expired job and refunds payout", async function () {
    const { token, manager, employer, agent } = await deployFixture();
    const payout = ethers.parseEther("1");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);

    await time.increase(1001);

    await expect(manager.connect(employer).timeoutJob(jobId))
      .to.emit(manager, "JobTimedOut")
      .withArgs(jobId, employer.address, 3);

    expect((await manager.jobs(jobId)).status).to.equal(3);
    expect(await token.balanceOf(employer.address)).to.equal(
      ethers.parseEther("100")
    );

    await expect(
      manager.connect(agent).requestJobCompletion(jobId, "result")
    ).to.be.revertedWithCustomError(manager, "JobTimedOutAlready");
  });

  it("reverts when called before expiration", async function () {
    const { token, manager, employer, agent } = await deployFixture();
    const payout = ethers.parseEther("1");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);

    await expect(
      manager.connect(employer).timeoutJob(jobId)
    ).to.be.revertedWithCustomError(manager, "JobNotExpired");
  });

  it("reverts when called by non-employer", async function () {
    const { token, manager, employer, agent, other } = await deployFixture();
    const payout = ethers.parseEther("1");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await time.increase(1001);

    await expect(
      manager.connect(other).timeoutJob(jobId)
    ).to.be.revertedWithCustomError(manager, "Unauthorized");
  });

  it("reverts when job is not open", async function () {
    const { token, manager, employer, agent } = await deployFixture();
    const payout = ethers.parseEther("1");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    await time.increase(1001);

    await expect(
      manager.connect(employer).timeoutJob(jobId)
    ).to.be.revertedWithCustomError(manager, "JobNotOpen");
  });
});
