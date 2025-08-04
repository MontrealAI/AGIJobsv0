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
      await manager.setValidationRewardPercentage(800);
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
      const validatorPayoutTotal = (payout * 800n) / 10000n;
    const agentExpected = payout - burnAmount - validatorPayoutTotal;
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

      const validatorPayoutTotal = (payout * 800n) / 10000n;
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
    const validatorPayoutTotal = (payout * 800n) / 10000n;
    const agentExpected = payout - burnAmount - validatorPayoutTotal;

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

  it("keeps pending validator jobs after other jobs are finalized", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("100");

    // Fund employer for multiple jobs
    await token.mint(employer.address, payout * 3n);

    // Job 0: validator approves and job finalizes
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash1", payout, 1000, "details1");
    await manager.connect(agent).applyForJob(0, "", []);
    await manager.connect(agent).requestJobCompletion(0, "result1");
    await manager.connect(validator).validateJob(0, "", []);
    await expect(
      manager.validatorApprovedJobs(validator.address, 0)
    ).to.be.reverted;

    // Increase thresholds so subsequent jobs remain pending
    await manager.setRequiredValidatorApprovals(2);
    await manager.setRequiredValidatorDisapprovals(2);

    // Job 1: validator approves but job remains pending
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash2", payout, 1000, "details2");
    await manager.connect(agent).applyForJob(1, "", []);
    await manager.connect(agent).requestJobCompletion(1, "result2");
    await manager.connect(validator).validateJob(1, "", []);

    // Job 2: validator disapproves and job remains pending
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash3", payout, 1000, "details3");
    await manager.connect(agent).applyForJob(2, "", []);
    await manager.connect(agent).requestJobCompletion(2, "result3");
    await manager.connect(validator).disapproveJob(2, "", []);

    expect(
      await manager.validatorApprovedJobs(validator.address, 0)
    ).to.equal(1n);
    expect(
      await manager.validatorDisapprovedJobs(validator.address, 0)
    ).to.equal(2n);
  });

  it("handles employer-win disputes and allows stake withdrawal", async function () {
    const { token, manager, owner, employer, agent, validator, validator2 } =
      await deployFixture();

    await manager.setRequiredValidatorApprovals(2);
    await manager.setRequiredValidatorDisapprovals(1);
    await manager.setSlashingPercentage(5000);

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

    const validatorPayoutTotal = (payout * 800n) / 10000n;
    const slashAmount = (stakeAmount * 5000n) / 10000n;
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
    await expect(
      manager.validatorApprovedJobs(validator.address, 0)
    ).to.be.reverted;
    await expect(
      manager.validatorDisapprovedJobs(validator2.address, 0)
    ).to.be.reverted;
  });

  it("allows owner to update validator incentive parameters atomically", async function () {
    const { manager, employer, validator } = await deployFixture();
    const cfg = {
      rewardPct: 500,
      stakeReq: 123n,
      slashPct: 250,
      minRep: 42n,
      approvals: 2,
      disapprovals: 3,
      recipient: validator.address,
    };

    await expect(
      manager
        .connect(employer)
        .setValidatorConfig(
          cfg.rewardPct,
          cfg.stakeReq,
          cfg.slashPct,
          cfg.minRep,
          cfg.approvals,
          cfg.disapprovals,
          cfg.recipient
        )
    )
      .to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount")
      .withArgs(employer.address);

    await expect(
      manager.setValidatorConfig(
        cfg.rewardPct,
        cfg.stakeReq,
        cfg.slashPct,
        cfg.minRep,
        cfg.approvals,
        cfg.disapprovals,
        cfg.recipient
      )
    )
      .to.emit(manager, "ValidatorConfigUpdated")
      .withArgs(
        cfg.rewardPct,
        cfg.stakeReq,
        cfg.slashPct,
        cfg.minRep,
        cfg.approvals,
        cfg.disapprovals,
        cfg.recipient
      );

    expect(await manager.validationRewardPercentage()).to.equal(cfg.rewardPct);
    expect(await manager.stakeRequirement()).to.equal(cfg.stakeReq);
    expect(await manager.slashingPercentage()).to.equal(cfg.slashPct);
    expect(await manager.minValidatorReputation()).to.equal(cfg.minRep);
    expect(await manager.requiredValidatorApprovals()).to.equal(cfg.approvals);
    expect(await manager.requiredValidatorDisapprovals()).to.equal(
      cfg.disapprovals
    );
    expect(await manager.slashedStakeRecipient()).to.equal(cfg.recipient);
  });

  it("cleans up validator history enabling stake withdrawal after many jobs", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("10");
    const stakeAmount = ethers.parseEther("100");

    await token.mint(validator.address, stakeAmount);
    await token.connect(validator).approve(await manager.getAddress(), stakeAmount);
    await manager.connect(validator).stake(stakeAmount);

    const numJobs = 50;
    const totalPayout = payout * BigInt(numJobs);
    await token.connect(employer).approve(await manager.getAddress(), totalPayout);

    for (let i = 0; i < numJobs; i++) {
      await manager
        .connect(employer)
        .createJob("jobhash" + i, payout, 1000, "details");
      await manager.connect(agent).applyForJob(i, "", []);
      await manager.connect(agent).requestJobCompletion(i, "result");
      await manager.connect(validator).validateJob(i, "", []);
      await expect(
        manager.validatorApprovedJobs(validator.address, 0)
      ).to.be.reverted;
    }

    await expect(
      manager.connect(validator).withdrawStake(stakeAmount)
    ).not.to.be.reverted;
  });
});
