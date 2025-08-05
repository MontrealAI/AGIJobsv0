const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AGIJobManagerV1 payouts", function () {
    async function deployFixture(burnPct = 1000) {
    const [owner, employer, agent, validator, validator2, validator3] = await ethers.getSigners();

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
    await manager.setCommitRevealWindows(1000, 1000);
    await manager.addAdditionalAgent(agent.address);
    await manager.addAdditionalValidator(validator.address);
    await manager.addAdditionalValidator(validator2.address);
    await manager.addAdditionalValidator(validator3.address);

    return { token, manager, owner, employer, agent, validator, validator2, validator3 };
  }

  it("distributes burn, validator, and agent payouts equal to job.payout", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("1000");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    const salt = ethers.id("payout1");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt);
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

  it("sends validator leftovers to slashedStakeRecipient", async function () {
    const { token, manager, owner, employer, agent, validator, validator2, validator3 } = await deployFixture();
    await manager.setRequiredValidatorApprovals(3);
    const payout = ethers.parseEther("1000");
    const initialOwnerBalance = await token.balanceOf(owner.address);

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");

    const validators = [validator, validator2, validator3];
    const salts = [ethers.id("lv1"), ethers.id("lv2"), ethers.id("lv3")];
    for (let i = 0; i < validators.length; i++) {
      const commitment = ethers.solidityPackedKeccak256(
        ["address", "uint256", "bool", "bytes32"],
        [validators[i].address, jobId, true, salts[i]]
      );
      await manager
        .connect(validators[i])
        .commitValidation(jobId, commitment, "", []);
    }
    await time.increase(1001);
    for (let i = 0; i < validators.length; i++) {
      await manager
        .connect(validators[i])
        .revealValidation(jobId, true, salts[i]);
    }

    await manager.connect(validator).validateJob(jobId, "", []);
    await manager.connect(validator2).validateJob(jobId, "", []);
    await expect(
      manager.connect(validator3).validateJob(jobId, "", [])
    )
      .to.emit(manager, "LeftoverTransferred")
      .withArgs(owner.address, 2n);

    const burnAddr = await manager.burnAddress();
    const burnAmount = (payout * 1000n) / 10000n;
    const validatorPayoutTotal = (payout * 800n) / 10000n;
    const baseReward = validatorPayoutTotal / 3n;
    const leftover = validatorPayoutTotal - baseReward * 3n;
    const agentExpected = payout - burnAmount - validatorPayoutTotal;

    expect(await token.balanceOf(validator.address)).to.equal(baseReward);
    expect(await token.balanceOf(validator2.address)).to.equal(baseReward);
    expect(await token.balanceOf(validator3.address)).to.equal(baseReward);
    expect(await token.balanceOf(owner.address)).to.equal(
      initialOwnerBalance + leftover
    );
    expect(await token.balanceOf(burnAddr)).to.equal(burnAmount);
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
    const salt2 = ethers.id("payout2");
    const commitment2 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt2]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment2, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt2);
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

  it("enforces review window before validation", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("1000");

    await manager.setReviewWindow(5000);

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    const salt = ethers.id("rw1");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt]
    );
    await manager.connect(validator).commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt);
    await expect(
      manager.connect(validator).validateJob(jobId, "", [])
    ).to.be.revertedWith("Review window active");

    await time.increase(5000);
    await manager.connect(validator).validateJob(jobId, "", []);
  });

  it("enforces review window before disapproval", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("1000");

    await manager.setReviewWindow(5000);

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    const salt = ethers.id("rw2");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, false, salt]
    );
    await manager.connect(validator).commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, false, salt);
    await expect(
      manager.connect(validator).disapproveJob(jobId, "", [])
    ).to.be.revertedWith("Review window active");

    await time.increase(5000);
    await manager.connect(validator).disapproveJob(jobId, "", []);
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
    const salt = ethers.id("emit1");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt);
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
    const salt3 = ethers.id("dis1");
    const commitment3 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, false, salt3]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment3, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, false, salt3);
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
    const salt4 = ethers.id("job0");
    const commitment4 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, 0, true, salt4]
    );
    await manager
      .connect(validator)
      .commitValidation(0, commitment4, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(0, true, salt4);
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
    const salt5 = ethers.id("job1");
    const commitment5 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, 1, true, salt5]
    );
    await manager
      .connect(validator)
      .commitValidation(1, commitment5, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(1, true, salt5);
    await manager.connect(validator).validateJob(1, "", []);

    // Job 2: validator disapproves and job remains pending
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash3", payout, 1000, "details3");
    await manager.connect(agent).applyForJob(2, "", []);
    await manager.connect(agent).requestJobCompletion(2, "result3");
    const salt6 = ethers.id("job2");
    const commitment6 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, 2, false, salt6]
    );
    await manager
      .connect(validator)
      .commitValidation(2, commitment6, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(2, false, salt6);
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
    const salt7 = ethers.id("dispA");
    const commit7 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt7]
    );
    const salt8 = ethers.id("dispB");
    const commit8 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator2.address, jobId, false, salt8]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commit7, "", []);
    await manager
      .connect(validator2)
      .commitValidation(jobId, commit8, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt7);
    await manager.connect(validator2).revealValidation(jobId, false, salt8);
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
      const salt = ethers.id("loop" + i);
      const commitment = ethers.solidityPackedKeccak256(
        ["address", "uint256", "bool", "bytes32"],
        [validator.address, i, true, salt]
      );
      await manager
        .connect(validator)
        .commitValidation(i, commitment, "", []);
      await time.increase(1001);
      await manager.connect(validator).revealValidation(i, true, salt);
      await manager.connect(validator).validateJob(i, "", []);
      await expect(
        manager.validatorApprovedJobs(validator.address, 0)
      ).to.be.reverted;
    }

    await expect(
      manager.connect(validator).withdrawStake(stakeAmount)
    ).not.to.be.reverted;
  });

  describe("commit-reveal workflow", function () {
    it("allows on-time commit and reveal", async function () {
      const { token, manager, employer, agent, validator } = await deployFixture();
      await manager.setCommitRevealWindows(100, 100);
      const payout = ethers.parseEther("100");
      await token.connect(employer).approve(await manager.getAddress(), payout);
      await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
      const jobId = 0;
      await manager.connect(agent).applyForJob(jobId, "", []);
      await manager.connect(agent).requestJobCompletion(jobId, "result");
      const salt = ethers.id("salt");
      const commitment = ethers.solidityPackedKeccak256(
        ["address", "uint256", "bool", "bytes32"],
        [validator.address, jobId, true, salt]
      );
      await expect(
        manager
          .connect(validator)
          .commitValidation(jobId, commitment, "", [])
      )
        .to.emit(manager, "ValidationCommitted")
        .withArgs(jobId, validator.address, commitment);

      await time.increase(101);

      await expect(
        manager.connect(validator).revealValidation(jobId, true, salt)
      )
        .to.emit(manager, "ValidationRevealed")
        .withArgs(jobId, validator.address, true);

      await manager.connect(validator).validateJob(jobId, "", []);
      expect(await manager.balanceOf(employer.address)).to.equal(1n);
    });

    it("reverts when revealing after the window", async function () {
      const { token, manager, employer, agent, validator } = await deployFixture();
      await manager.setCommitRevealWindows(100, 100);
      const payout = ethers.parseEther("100");
      await token.connect(employer).approve(await manager.getAddress(), payout);
      await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
      const jobId = 0;
      await manager.connect(agent).applyForJob(jobId, "", []);
      await manager.connect(agent).requestJobCompletion(jobId, "result");
      const salt = ethers.id("salt2");
      const commitment = ethers.solidityPackedKeccak256(
        ["address", "uint256", "bool", "bytes32"],
        [validator.address, jobId, true, salt]
      );
      await manager
        .connect(validator)
        .commitValidation(jobId, commitment, "", []);

      await time.increase(201);

      await expect(
        manager.connect(validator).revealValidation(jobId, true, salt)
      ).to.be.revertedWith("Reveal phase over");
    });

    it("blocks stake withdrawal with pending commits", async function () {
      const { token, manager, employer, agent, validator } = await deployFixture();
      await manager.setCommitRevealWindows(100, 100);
      const stakeAmount = ethers.parseEther("100");
      await token.mint(validator.address, stakeAmount);
      await token
        .connect(validator)
        .approve(await manager.getAddress(), stakeAmount);
      await manager.connect(validator).stake(stakeAmount);
      const payout = ethers.parseEther("100");
      await token.connect(employer).approve(await manager.getAddress(), payout);
      await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
      const jobId = 0;
      await manager.connect(agent).applyForJob(jobId, "", []);
      await manager.connect(agent).requestJobCompletion(jobId, "result");
      const salt = ethers.id("pendingCommit");
      const commitment = ethers.solidityPackedKeccak256(
        ["address", "uint256", "bool", "bytes32"],
        [validator.address, jobId, true, salt]
      );
      await manager
        .connect(validator)
        .commitValidation(jobId, commitment, "", []);
      await expect(
        manager.connect(validator).withdrawStake(stakeAmount)
      ).to.be.revertedWith("Pending commitments");
    });
  });
});
