const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AGIJobManagerV1 payouts", function () {
  async function deployFixture(burnPct = 1000) {
    const [owner, employer, agent, validator] = await ethers.getSigners();

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
    await manager.setBurnPercentage(burnPct);
    await manager.addAdditionalAgent(agent.address);
    await manager.addAdditionalValidator(validator.address);

    return { token, manager, owner, employer, agent, validator };
  }

  it("distributes burn, validator, and agent payouts equal to job.payout", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("1000");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    await manager.connect(validator).validateJob(jobId, "", []);

    const burnAmount = (payout * 1000n) / 10000n;
    const remaining = payout - burnAmount;
    const validatorPayoutTotal = (remaining * 8n) / 100n;
    const agentExpected = remaining - validatorPayoutTotal;
    const burnAddr = await manager.burnAddress();

    expect(await token.balanceOf(burnAddr)).to.equal(burnAmount);
    expect(await token.balanceOf(validator.address)).to.equal(validatorPayoutTotal);
    expect(await token.balanceOf(agent.address)).to.equal(agentExpected);
    expect(agentExpected + validatorPayoutTotal + burnAmount).to.equal(payout);
  });

  it("pays base payout to agent without AGI NFT", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture(0);
    const payout = ethers.parseEther("1000");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    await manager.connect(validator).validateJob(jobId, "", []);

    const validatorPayoutTotal = (payout * 8n) / 100n;
    const agentExpected = payout - validatorPayoutTotal;

    expect(await token.balanceOf(agent.address)).to.equal(agentExpected);
  });

  it("rejects validation before completion is requested", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("1000");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);

    await expect(
      manager.connect(validator).validateJob(jobId, "", [])
    ).to.be.revertedWith("Completion not requested");
  });
});
