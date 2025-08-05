const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("finalizeAfterTimeout", function () {
  async function deployFixture() {
    const [employer, agent, validator1, validator2, validator3] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy();
    await token.waitForDeployment();
    await token.mint(employer.address, ethers.parseEther("1000"));

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
    await manager.setBurnPercentage(1000);
    await manager.setCommitRevealWindows(1000, 1000);
    await manager.setReviewWindow(2000);
    await manager.setGracePeriod(1000);
    await manager.addAdditionalAgent(agent.address);
    await manager.addAdditionalValidator(validator1.address);
    await manager.addAdditionalValidator(validator2.address);
    await manager.addAdditionalValidator(validator3.address);
    await manager.setValidatorsPerJob(3);

    return { token, manager, employer, agent };
  }

  it("allows employer to reclaim funds after timeout", async function () {
    const { token, manager, employer, agent } = await deployFixture();
    const payout = ethers.parseEther("1000");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    await time.increase(5001);
    await manager.connect(employer).finalizeAfterTimeout(jobId, false);
    expect(await token.balanceOf(employer.address)).to.equal(payout);
  });

  it("pays agent after timeout and burns portion", async function () {
    const { token, manager, employer, agent } = await deployFixture();
    const payout = ethers.parseEther("1000");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("hash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "res");
    await time.increase(5001);
    await manager.connect(agent).finalizeAfterTimeout(jobId, true);
    const burnAmount = (payout * 1000n) / 10000n;
    const burnAddr = await manager.burnAddress();
    expect(await token.balanceOf(agent.address)).to.equal(payout - burnAmount);
    expect(await token.balanceOf(burnAddr)).to.equal(burnAmount);
  });

  it("reverts if called before timeout", async function () {
    const { token, manager, employer, agent } = await deployFixture();
    const payout = ethers.parseEther("1000");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("early", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "res");
    await time.increase(1000);
    await expect(
      manager.connect(employer).finalizeAfterTimeout(jobId, false)
    ).to.be.revertedWithCustomError(manager, "TimeoutNotReached");
  });
});
