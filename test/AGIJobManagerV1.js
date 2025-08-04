const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AGIJobManagerV1 payouts", function () {
  async function deployFixture(burnPct = 1000) {
    const [owner, employer, agent, validator, validator2] = await ethers.getSigners();

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
    await manager.addAdditionalValidator(validator2.address);

    return { token, manager, owner, employer, agent, validator, validator2 };
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

  it("restricts burn address updates to owner and emits event", async function () {
    const { manager, employer } = await deployFixture();
    const newAddress = ethers.getAddress(
      "0x000000000000000000000000000000000000BEEF"
    );

    await expect(
      manager.connect(employer).setBurnAddress(newAddress)
    )
      .to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount")
      .withArgs(employer.address);

    await expect(manager.setBurnAddress(newAddress))
      .to.emit(manager, "BurnAddressUpdated")
      .withArgs(newAddress);
  });

  it("restricts burn percentage updates to owner and emits event", async function () {
    const { manager, employer } = await deployFixture();
    const newPercentage = 500;

    await expect(
      manager.connect(employer).setBurnPercentage(newPercentage)
    )
      .to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount")
      .withArgs(employer.address);

    await expect(manager.setBurnPercentage(newPercentage))
      .to.emit(manager, "BurnPercentageUpdated")
      .withArgs(newPercentage);
  });

  it("allows owner to update burn config atomically", async function () {
    const { manager } = await deployFixture();
    const newAddress = ethers.getAddress(
      "0x000000000000000000000000000000000000BEEF"
    );
    const newPercentage = 750;

    await expect(manager.setBurnConfig(newAddress, newPercentage))
      .to.emit(manager, "BurnAddressUpdated")
      .withArgs(newAddress)
      .and.to.emit(manager, "BurnPercentageUpdated")
      .withArgs(newPercentage);

    expect(await manager.burnAddress()).to.equal(newAddress);
    expect(await manager.burnPercentage()).to.equal(newPercentage);
  });

  it("restricts root node and Merkle root updates to owner and emits events", async function () {
    const { manager, employer } = await deployFixture();
    const newClub = ethers.id("club");
    const newAgent = ethers.id("agent");
    const newValidatorRoot = ethers.id("validator");
    const newAgentRoot = ethers.id("agentRoot");

    await expect(
      manager.connect(employer).setClubRootNode(newClub)
    )
      .to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount")
      .withArgs(employer.address);

    await expect(manager.setClubRootNode(newClub))
      .to.emit(manager, "ClubRootNodeUpdated")
      .withArgs(newClub);

    await expect(manager.setAgentRootNode(newAgent))
      .to.emit(manager, "AgentRootNodeUpdated")
      .withArgs(newAgent);

    await expect(manager.setValidatorMerkleRoot(newValidatorRoot))
      .to.emit(manager, "ValidatorMerkleRootUpdated")
      .withArgs(newValidatorRoot);

    await expect(manager.setAgentMerkleRoot(newAgentRoot))
      .to.emit(manager, "AgentMerkleRootUpdated")
      .withArgs(newAgentRoot);
  });

  it("restricts ENS and NameWrapper updates to owner and emits events", async function () {
    const { manager, employer } = await deployFixture();
    const newEns = ethers.getAddress(
      "0x000000000000000000000000000000000000dEaD"
    );
    const newWrapper = ethers.getAddress(
      "0x000000000000000000000000000000000000bEEF"
    );

    await expect(manager.connect(employer).setENS(newEns))
      .to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount")
      .withArgs(employer.address);

    await expect(manager.setENS(newEns))
      .to.emit(manager, "ENSAddressUpdated")
      .withArgs(newEns);

    await expect(manager.setNameWrapper(newWrapper))
      .to.emit(manager, "NameWrapperAddressUpdated")
      .withArgs(newWrapper);
  });

  it("emits JobFinalizedAndBurned with correct payouts", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("1000");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    const burnAmount = (payout * 1000n) / 10000n;
    const remaining = payout - burnAmount;
    const validatorPayoutTotal = (remaining * 8n) / 100n;
    const agentExpected = remaining - validatorPayoutTotal;

    await expect(
      manager.connect(validator).validateJob(jobId, "", [])
    )
      .to.emit(manager, "JobFinalizedAndBurned")
      .withArgs(jobId, agent.address, employer.address, agentExpected, burnAmount);
  });

  it("tracks validator job disapprovals separately from approvals", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("1000");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");

    await manager.connect(validator).disapproveJob(jobId, "", []);

    await expect(
      manager.validatorApprovedJobs(validator.address, 0)
    ).to.be.reverted;
    expect(
      await manager.validatorDisapprovedJobs(validator.address, 0)
    ).to.equal(0n);
  });

  it("handles employer-win disputes and allows stake withdrawal", async function () {
    const { token, manager, owner, employer, agent, validator, validator2 } =
      await deployFixture();

    await manager.setRequiredValidatorApprovals(2);
    await manager.setRequiredValidatorDisapprovals(1);
    await manager.setSlashingPercentage(50);

    const payout = ethers.parseEther("1000");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");

    const stakeAmount = ethers.parseEther("100");
    await token.mint(validator.address, stakeAmount);
    await token.mint(validator2.address, stakeAmount);
    await token.connect(validator).approve(await manager.getAddress(), stakeAmount);
    await token
      .connect(validator2)
      .approve(await manager.getAddress(), stakeAmount);
    await manager.connect(validator).stake(stakeAmount);
    await manager.connect(validator2).stake(stakeAmount);

    await manager.connect(validator).validateJob(jobId, "", []);
    await manager.connect(validator2).disapproveJob(jobId, "", []);

    await manager.addModerator(owner.address);
    await manager.resolveDispute(jobId, 1); // 1 = DisputeOutcome.EmployerWin

    const validatorPayoutTotal = (payout * 8n) / 100n;
    const slashAmount = (stakeAmount * 50n) / 100n;
    const employerRefund = payout - validatorPayoutTotal;

    expect(await token.balanceOf(validator2.address)).to.equal(
      validatorPayoutTotal + slashAmount
    );
    expect(await token.balanceOf(employer.address)).to.equal(employerRefund);
    await expect(
      manager
        .connect(validator)
        .withdrawStake(stakeAmount - slashAmount)
    ).not.to.be.reverted;
  });
});
