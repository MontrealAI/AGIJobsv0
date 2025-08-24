const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AGIJobManagerV1 payouts", function () {
    async function deployFixture(burnPct = 1000, useMerkle = false, stakeAgent = true) {
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
    await manager.setReviewWindow(7200);
    await manager.setCommitRevealWindows(1000, 1000);
    await manager.setReviewWindow(2000);
    let proof = [];
    if (useMerkle) {
      const leafAgent = ethers.solidityPackedKeccak256(["address"], [agent.address]);
      const leafOther = ethers.solidityPackedKeccak256(["address"], [validator.address]);
      const [first, second] = leafAgent < leafOther ? [leafAgent, leafOther] : [leafOther, leafAgent];
      const root = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [first, second]);
      await manager.setAgentMerkleRoot(root);
      proof = [leafOther];
      await manager.addAdditionalValidator(validator.address);
      await manager.addAdditionalValidator(validator2.address);
      await manager.addAdditionalValidator(validator3.address);
    } else {
      await manager.addAdditionalAgent(agent.address);
      await manager.addAdditionalValidator(validator.address);
      await manager.addAdditionalValidator(validator2.address);
      await manager.addAdditionalValidator(validator3.address);
    }
    await manager.connect(agent).acceptTerms("ipfs://terms");
    await manager.connect(validator).acceptTerms("ipfs://terms");
    await manager.connect(validator2).acceptTerms("ipfs://terms");
    await manager.connect(validator3).acceptTerms("ipfs://terms");
    await manager.connect(employer).acceptTerms("ipfs://terms");
    await manager.setValidatorsPerJob(3);
    await manager.setValidatorBlacklistThreshold(1000);

    if (stakeAgent) {
      const stakeAmount = ethers.parseEther("100");
      await token.mint(agent.address, stakeAmount);
      await token.connect(agent).approve(await manager.getAddress(), stakeAmount);
      await manager.connect(agent).stakeAgent(stakeAmount);
    }

    return { token, manager, owner, employer, agent, validator, validator2, validator3, proof };
  }

  it("reverts when updating AGI token address to zero", async function () {
    const { manager } = await deployFixture();
    await expect(
      manager.updateAGITokenAddress(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(manager, "InvalidAddress");
  });

  it("reverts when commit or reveal window is zero", async function () {
    const { manager } = await deployFixture();
    await expect(
      manager.setCommitRevealWindows(0, 1)
    ).to.be.revertedWithCustomError(manager, "InvalidDuration");
    await expect(
      manager.setCommitRevealWindows(1, 0)
    ).to.be.revertedWithCustomError(manager, "InvalidDuration");
  });

  it("allows owner to update commit and reveal durations individually", async function () {
    const { manager } = await deployFixture();
    await manager.setCommitDuration(500);
    expect(await manager.commitDuration()).to.equal(500);
    await manager.setRevealDuration(600);
    expect(await manager.revealDuration()).to.equal(600);
  });

  it("reverts when commit or reveal duration exceeds review window", async function () {
    const { manager } = await deployFixture();
    await expect(
      manager.setCommitDuration(1900)
    ).to.be.revertedWithCustomError(manager, "ReviewWindowTooShort");
    await expect(
      manager.setRevealDuration(1900)
    ).to.be.revertedWithCustomError(manager, "ReviewWindowTooShort");
  });

  it("emits event when updating minimum agent reputation", async function () {
    const { manager } = await deployFixture();
    await expect(manager.setMinAgentReputation(10))
      .to.emit(manager, "MinAgentReputationUpdated")
      .withArgs(10);
  });

  it("allows owner to update max reputation", async function () {
    const { manager } = await deployFixture();
    await manager.setMaxReputation(50000);
    expect(await manager.maxReputation()).to.equal(50000);
  });

  it("reverts when agent reputation is below minimum", async function () {
    const { token, manager, employer, agent } = await deployFixture();
    const payout = ethers.parseEther("1");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    await manager.setMinAgentReputation(1);
    await expect(
      manager.connect(agent).applyForJob(0, "", [])
    ).to.be.revertedWithCustomError(manager, "InsufficientReputation");
  });

  it("allows agent to apply for a job using a Merkle proof", async function () {
    const { token, manager, employer, agent, proof } = await deployFixture(1000, true);
    const payout = ethers.parseEther("1");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await expect(
      manager.connect(agent).applyForJob(jobId, "alice", proof)
    )
      .to.emit(manager, "OwnershipVerified")
      .withArgs(agent.address, "alice");
  });

  it("reverts when requesting completion with an empty IPFS hash", async function () {
    const { token, manager, employer, agent } = await deployFixture();
    const payout = ethers.parseEther("1");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await expect(
      manager.connect(agent).requestJobCompletion(jobId, "")
    ).to.be.revertedWithCustomError(manager, "InvalidParameters");
  });

  it("distributes burn, validator, and agent payouts equal to job.payout", async function () {
      const { token, manager, employer, agent, validator } = await deployFixture(500);
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
    await time.increase(1000);
    await manager.connect(validator).validateJob(jobId, "", []);

        const burnAmount = (payout * 500n) / 10000n;
        const validatorPayoutTotal = (payout * 800n) / 10000n;
    const agentExpected = payout - burnAmount - validatorPayoutTotal;
    const burnAddr = await manager.burnAddress();
    expect(await token.balanceOf(burnAddr)).to.equal(burnAmount);
    expect(await token.balanceOf(validator.address)).to.equal(validatorPayoutTotal);
    expect(await token.balanceOf(agent.address)).to.equal(agentExpected);
    expect(agentExpected + validatorPayoutTotal + burnAmount).to.equal(payout);
  });

  it("distributes validator leftovers among correct validators", async function () {
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
    await time.increase(1000);
    await manager.connect(validator).validateJob(jobId, "", []);
    await manager.connect(validator2).validateJob(jobId, "", []);
    await manager.connect(validator3).validateJob(jobId, "", []);

    const burnAddr = await manager.burnAddress();
    const burnAmount = (payout * 1000n) / 10000n;
    const validatorPayoutTotal = (payout * 800n) / 10000n;
    const baseReward = validatorPayoutTotal / 3n;
    const agentExpected = payout - burnAmount - validatorPayoutTotal;

    const vBalances = [
      await token.balanceOf(validator.address),
      await token.balanceOf(validator2.address),
      await token.balanceOf(validator3.address),
    ];
    const totalDistributed = vBalances.reduce((a, b) => a + b, 0n);
    expect(totalDistributed).to.equal(validatorPayoutTotal);
    const higherCount = vBalances.filter((b) => b === baseReward + 1n).length;
    expect(higherCount).to.equal(Number(validatorPayoutTotal % 3n));
    vBalances.forEach((b) =>
      expect([baseReward, baseReward + 1n]).to.include(b)
    );
    expect(await token.balanceOf(owner.address)).to.equal(initialOwnerBalance);
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
    await time.increase(1000);
    await manager.connect(validator).validateJob(jobId, "", []);

      const validatorPayoutTotal = (payout * 800n) / 10000n;
    const agentExpected = payout - validatorPayoutTotal;

    expect(await token.balanceOf(agent.address)).to.equal(agentExpected);
  });

  it("applies NFT bonus reducing validator rewards", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture(500);
    const payout = ethers.parseEther("1000");

    const NFT = await ethers.getContractFactory("MockERC721");
    const nft = await NFT.deploy();
    await nft.waitForDeployment();
    await nft.mint(agent.address);
    await manager.addAGIType(await nft.getAddress(), 500);

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    const salt = ethers.id("bonus1");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt);
    await time.increase(1000);
    await manager.connect(validator).validateJob(jobId, "", []);

    const burnAmount = (payout * 500n) / 10000n;
    const validatorInitial = (payout * 800n) / 10000n;
    const bonusAmount = ((payout - burnAmount - validatorInitial) * 500n) / 10000n;
    const validatorExpected = validatorInitial - bonusAmount;
    const agentExpected = payout - burnAmount - validatorExpected;
    const burnAddr = await manager.burnAddress();

    expect(await token.balanceOf(burnAddr)).to.equal(burnAmount);
    expect(await token.balanceOf(validator.address)).to.equal(validatorExpected);
    expect(await token.balanceOf(agent.address)).to.equal(agentExpected);
  });

  it("ignores malicious NFT contracts when computing bonus", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture(500);
    const payout = ethers.parseEther("1000");

    const Mal = await ethers.getContractFactory("MaliciousERC721");
    const mal = await Mal.deploy();
    await mal.waitForDeployment();

    const NFT = await ethers.getContractFactory("MockERC721");
    const nft = await NFT.deploy();
    await nft.waitForDeployment();
    await nft.mint(agent.address);

    await manager.addAGIType(await mal.getAddress(), 1000);
    await manager.addAGIType(await nft.getAddress(), 500);

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    const salt = ethers.id("malicious");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt);
    await time.increase(1000);
    await manager.connect(validator).validateJob(jobId, "", []);

    const burnAmount = (payout * 500n) / 10000n;
    const validatorInitial = (payout * 800n) / 10000n;
    const bonusAmount = ((payout - burnAmount - validatorInitial) * 500n) / 10000n;
    const validatorExpected = validatorInitial - bonusAmount;
    const agentExpected = payout - burnAmount - validatorExpected;
    const burnAddr = await manager.burnAddress();

    expect(await token.balanceOf(burnAddr)).to.equal(burnAmount);
    expect(await token.balanceOf(validator.address)).to.equal(validatorExpected);
    expect(await token.balanceOf(agent.address)).to.equal(agentExpected);
  });

  it("funds large bonus from validator and burn portions", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture(500);
    const payout = ethers.parseEther("1000");

    const NFT = await ethers.getContractFactory("MockERC721");
    const nft = await NFT.deploy();
    await nft.waitForDeployment();
    await nft.mint(agent.address);
    await manager.addAGIType(await nft.getAddress(), 1000);

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    const salt = ethers.id("bonus2");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt);
    await time.increase(1000);
    await manager.connect(validator).validateJob(jobId, "", []);

    const burnInitial = (payout * 500n) / 10000n;
    const validatorInitial = (payout * 800n) / 10000n;
    const bonusAmount = ((payout - burnInitial - validatorInitial) * 1000n) / 10000n;
    const burnExpected = burnInitial - (bonusAmount - validatorInitial);
    const validatorExpected = 0n;
    const agentExpected = payout - burnExpected - validatorExpected;
    const burnAddr = await manager.burnAddress();

    expect(await token.balanceOf(burnAddr)).to.equal(burnExpected);
    expect(await token.balanceOf(validator.address)).to.equal(validatorExpected);
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
    ).to.be.revertedWithCustomError(manager, "InvalidJobState");
  });

  it("prevents owner from withdrawing escrow or stake", async function () {
    const { token, manager, owner, employer, validator } = await deployFixture();
    const payout = ethers.parseEther("100");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    await token.mint(validator.address, ethers.parseEther("10"));
    await token
      .connect(validator)
      .approve(await manager.getAddress(), ethers.parseEther("10"));
    await manager.connect(validator).stake(ethers.parseEther("10"));

    await expect(
      manager.connect(owner).withdrawAGI(1n)
    ).to.be.revertedWithCustomError(manager, "InvalidAmount");
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
    ).to.be.revertedWithCustomError(manager, "ReviewWindowActive");

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
    ).to.be.revertedWithCustomError(manager, "ReviewWindowActive");

    await time.increase(5000);
    await manager.connect(validator).disapproveJob(jobId, "", []);
  });

  it("restricts commit and reveal to selected validators", async function () {
    const { token, manager, employer, agent, validator, validator2 } = await deployFixture();
    await manager.setValidatorPool([validator.address]);
    await manager.setRequiredValidatorDisapprovals(1);
    await manager.setValidatorsPerJob(1);
    const payout = ethers.parseEther("1000");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await expect(
      manager.connect(agent).requestJobCompletion(jobId, "result")
    )
      .to.emit(manager, "ValidatorsSelected")
      .withArgs(jobId, [validator.address]);
    const salt = ethers.id("sel1");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment, "", []);
    const otherSalt = ethers.id("sel2");
    const otherCommitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator2.address, jobId, true, otherSalt]
    );
    await expect(
      manager
        .connect(validator2)
        .commitValidation(jobId, otherCommitment, "", [])
    ).to.be.revertedWithCustomError(manager, "ValidatorNotSelected");
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt);
    await expect(
      manager
        .connect(validator2)
        .revealValidation(jobId, true, otherSalt)
    ).to.be.revertedWithCustomError(manager, "ValidatorNotSelected");
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

  it("allows owner to remove validators from the selection pool", async function () {
    const { manager, validator } = await deployFixture();
    expect(await manager.isValidatorInPool(validator.address)).to.equal(true);
    await expect(manager.removeAdditionalValidator(validator.address))
      .to.emit(manager, "ValidatorRemoved")
      .withArgs(validator.address);
    expect(await manager.isValidatorInPool(validator.address)).to.equal(false);
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
    await time.increase(1000);
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
    await time.increase(1000);
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
    await time.increase(1000);
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
    await time.increase(1000);
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
    await time.increase(1000);
    await manager.connect(validator).disapproveJob(2, "", []);

    expect(
      await manager.validatorApprovedJobs(validator.address, 0)
    ).to.equal(1n);
  expect(
      await manager.validatorDisapprovedJobs(validator.address, 0)
  ).to.equal(2n);
  });

  it("penalizes validators who fail to commit or reveal", async function () {
    const { token, manager, employer, agent, validator, validator2, validator3 } = await deployFixture();
    await manager.setValidatorSlashingPercentage(5000);
    await manager.setAgentSlashingPercentage(5000);
    const payout = ethers.parseEther("100");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    const stakeAmount = ethers.parseEther("10");
    await token.mint(validator.address, stakeAmount);
    await token.mint(validator2.address, stakeAmount);
    await token.mint(validator3.address, stakeAmount);
    await token.connect(validator).approve(await manager.getAddress(), stakeAmount);
    await token.connect(validator2).approve(await manager.getAddress(), stakeAmount);
    await token.connect(validator3).approve(await manager.getAddress(), stakeAmount);
    await manager.connect(validator).stake(stakeAmount);
    await manager.connect(validator2).stake(stakeAmount);
    await manager.connect(validator3).stake(stakeAmount);
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    await expect(
      manager.connect(validator3).withdrawStake(stakeAmount)
    ).to.be.revertedWithCustomError(manager, "PendingCommitments");
    const saltA = ethers.id("a");
    const commitA = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, saltA]
    );
    await manager.connect(validator).commitValidation(jobId, commitA, "", []);
    const saltB = ethers.id("b");
    const commitB = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator2.address, jobId, true, saltB]
    );
    await manager.connect(validator2).commitValidation(jobId, commitB, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, saltA);
    await time.increase(1001);
    await manager.connect(validator).validateJob(jobId, "", []);
    const slashAmount = (stakeAmount * 5000n) / 10000n;
    expect(await manager.validatorStake(validator.address)).to.equal(stakeAmount);
    expect(await manager.validatorStake(validator2.address)).to.equal(stakeAmount - slashAmount);
    expect(await manager.validatorStake(validator3.address)).to.equal(stakeAmount - slashAmount);
    await expect(
      manager.connect(validator3).withdrawStake(stakeAmount - slashAmount)
    ).not.to.be.reverted;
  });

  it("handles employer-win disputes and allows stake withdrawal", async function () {
    const { token, manager, owner, employer, agent, validator, validator2 } =
      await deployFixture();

    await manager.setRequiredValidatorApprovals(2);
    await manager.setRequiredValidatorDisapprovals(1);
    await manager.setValidatorSlashingPercentage(5000);
    await manager.setAgentSlashingPercentage(5000);

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
    await time.increase(1000);
    await manager.connect(validator).validateJob(jobId, "", []);
    await manager.connect(validator2).disapproveJob(jobId, "", []);

    await manager.addModerator(owner.address);
    const slashAmount = (stakeAmount * 5000n) / 10000n;
    await manager.resolveDispute(jobId, 1);
    const validatorReward = (payout * 800n) / 10000n;
    const burnAmount = (payout * 1000n) / 10000n;
    expect(await token.balanceOf(validator2.address)).to.equal(
      slashAmount + validatorReward
    );
    expect(await token.balanceOf(employer.address)).to.equal(
      payout - validatorReward - burnAmount
    );
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
      repPct: 123,
      stakeReq: 123n,
      validatorSlashPct: 250,
      agentSlashPct: 250,
      minRep: 42n,
      approvals: 1,
      disapprovals: 1,
      recipient: validator.address,
      commitWindow: 60,
      revealWindow: 60,
      reviewWin: 120,
      validatorsCount: 1,
      maxSlashRewardPct: 800,
    };

    await expect(
      manager
        .connect(employer)
        .setValidatorConfig(
          cfg.rewardPct,
          cfg.repPct,
          cfg.stakeReq,
          cfg.validatorSlashPct,
          cfg.agentSlashPct,
          cfg.maxSlashRewardPct,
          cfg.minRep,
          cfg.approvals,
          cfg.disapprovals,
          cfg.recipient,
          cfg.commitWindow,
          cfg.revealWindow,
          cfg.reviewWin,
          cfg.validatorsCount
        )
    )
      .to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount")
      .withArgs(employer.address);

    await expect(
      manager.setValidatorConfig(
        cfg.rewardPct,
        cfg.repPct,
        cfg.stakeReq,
        cfg.validatorSlashPct,
        cfg.agentSlashPct,
        cfg.maxSlashRewardPct,
        cfg.minRep,
        cfg.approvals,
        cfg.disapprovals,
        cfg.recipient,
        cfg.commitWindow,
        cfg.revealWindow,
        cfg.reviewWin,
        cfg.validatorsCount
      )
    )
      .to.emit(manager, "ValidatorConfigUpdated")
      .withArgs(
        cfg.rewardPct,
        cfg.repPct,
        cfg.stakeReq,
        cfg.validatorSlashPct,
        cfg.agentSlashPct,
        cfg.maxSlashRewardPct,
        cfg.minRep,
        cfg.approvals,
        cfg.disapprovals,
        cfg.recipient,
        cfg.commitWindow,
        cfg.revealWindow,
        cfg.reviewWin,
        cfg.validatorsCount
      );

    expect(await manager.validationRewardPercentage()).to.equal(cfg.rewardPct);
    expect(await manager.validatorReputationPercentage()).to.equal(cfg.repPct);
    expect(await manager.stakeRequirement()).to.equal(cfg.stakeReq);
    expect(await manager.validatorSlashingPercentage()).to.equal(
      cfg.validatorSlashPct
    );
    expect(await manager.agentSlashingPercentage()).to.equal(
      cfg.agentSlashPct
    );
    expect(await manager.minValidatorReputation()).to.equal(cfg.minRep);
    expect(await manager.requiredValidatorApprovals()).to.equal(cfg.approvals);
    expect(await manager.requiredValidatorDisapprovals()).to.equal(
      cfg.disapprovals
    );
    expect(await manager.slashedStakeRecipient()).to.equal(cfg.recipient);
    expect(await manager.commitDuration()).to.equal(cfg.commitWindow);
    expect(await manager.revealDuration()).to.equal(cfg.revealWindow);
    expect(await manager.reviewWindow()).to.equal(cfg.reviewWin);
    expect(await manager.validatorsPerJob()).to.equal(cfg.validatorsCount);
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
      await time.increase(1000);
      await manager.connect(validator).validateJob(i, "", []);
      await expect(
        manager.validatorApprovedJobs(validator.address, 0)
      ).to.be.reverted;
    }

    await expect(
      manager.connect(validator).withdrawStake(stakeAmount)
    ).not.to.be.reverted;
  });

  it("enforces agent stake requirement before applying for a job", async function () {
    const { token, manager, owner, employer, agent } = await deployFixture(
      1000,
      false,
      false
    );
    const requirement = ethers.parseEther("10");
    await manager.connect(owner).setAgentStakeRequirement(requirement);
    await manager.connect(owner).setAgentStakePercentage(500); // 5%
    const payout = ethers.parseEther("1");
    await token
      .connect(employer)
      .approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash", payout, 1000, "details");
    await expect(
      manager.connect(agent).applyForJob(0, "", [])
    ).to.be.revertedWithCustomError(manager, "AgentStakeRequired");
    await token.mint(agent.address, requirement);
    await token
      .connect(agent)
      .approve(await manager.getAddress(), requirement);
    await manager.connect(agent).stakeAgent(requirement);
    await expect(manager.connect(agent).applyForJob(0, "", []))
      .to.emit(manager, "JobApplied")
      .withArgs(0, agent.address);
  });

  it("adjusts agent stake requirement and enforces new threshold", async function () {
    const { token, manager, owner, employer, agent } = await deployFixture();
    const payout = ethers.parseEther("1");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const req1 = ethers.parseEther("50");
    await manager.connect(owner).setAgentStakeRequirement(req1);
    await expect(manager.connect(agent).applyForJob(0, "", []))
      .to.emit(manager, "JobApplied")
      .withArgs(0, agent.address);

    const req2 = ethers.parseEther("150");
    await manager.connect(owner).setAgentStakeRequirement(req2);
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash2", payout, 1000, "details");
    await expect(
      manager.connect(agent).applyForJob(1, "", [])
    ).to.be.revertedWithCustomError(manager, "AgentStakeRequired");
    const extra = ethers.parseEther("50");
    await token.mint(agent.address, extra);
    await token.connect(agent).approve(await manager.getAddress(), extra);
    await manager.connect(agent).stakeAgent(extra);
    await expect(manager.connect(agent).applyForJob(1, "", []))
      .to.emit(manager, "JobApplied")
      .withArgs(1, agent.address);
  });

  it("requires additional stake for large payouts based on percentage", async function () {
    const { token, manager, owner, employer, agent } = await deployFixture(
      1000,
      false,
      false
    );
    const baseReq = ethers.parseEther("10");
    await manager.connect(owner).setAgentStakeRequirement(baseReq);
    await expect(
      manager.connect(owner).setAgentStakePercentage(1000)
    )
      .to.emit(manager, "AgentStakePercentageUpdated")
      .withArgs(1000);

    const initialStake = ethers.parseEther("20");
    await token.mint(agent.address, initialStake);
    await token
      .connect(agent)
      .approve(await manager.getAddress(), initialStake);
    await manager.connect(agent).stakeAgent(initialStake);

    const payout = ethers.parseEther("500");
    await token
      .connect(employer)
      .approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("bigjob", payout, 1000, "details");
    await expect(
      manager.connect(agent).applyForJob(0, "", [])
    ).to.be.revertedWithCustomError(manager, "AgentStakeRequired");

    const extraStake = ethers.parseEther("40");
    await token.mint(agent.address, extraStake);
    await token
      .connect(agent)
      .approve(await manager.getAddress(), extraStake);
    await manager.connect(agent).stakeAgent(extraStake);
    await expect(manager.connect(agent).applyForJob(0, "", []))
      .to.emit(manager, "JobApplied")
      .withArgs(0, agent.address);
  });

  it("allows agents to stake and withdraw", async function () {
    const { token, manager, agent } = await deployFixture(1000, false, false);
    const stakeAmount = ethers.parseEther("10");
    await token.mint(agent.address, stakeAmount);
    await token.connect(agent).approve(await manager.getAddress(), stakeAmount);
    await expect(manager.connect(agent).stakeAgent(stakeAmount))
      .to.emit(manager, "AgentStakeDeposited")
      .withArgs(agent.address, stakeAmount);
    await expect(manager.connect(agent).withdrawAgentStake(stakeAmount))
      .to.emit(manager, "AgentStakeWithdrawn")
      .withArgs(agent.address, stakeAmount);
  });

  it("slashes agent stake when employer wins dispute", async function () {
    const { token, manager, owner, employer, agent, validator } = await deployFixture(1000, false, false);
    await manager.setRequiredValidatorApprovals(1);
    await manager.setRequiredValidatorDisapprovals(1);
    await manager.setValidatorSlashingPercentage(5000);
    await manager.setAgentSlashingPercentage(5000);
    const stakeAmount = ethers.parseEther("100");
    await token.mint(agent.address, stakeAmount);
    await token.connect(agent).approve(await manager.getAddress(), stakeAmount);
    await manager.connect(agent).stakeAgent(stakeAmount);
    const payout = ethers.parseEther("100");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    await manager.connect(agent).applyForJob(0, "", []);
    await manager.connect(agent).requestJobCompletion(0, "result");
    const salt = ethers.id("agentSlash");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, 0, false, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(0, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(0, false, salt);
    await time.increase(1000);
    await manager.connect(validator).disapproveJob(0, "", []);
    await manager.addModerator(owner.address);
    await manager.resolveDispute(0, 1);
    const expectedSlash = (stakeAmount * 5000n) / 10000n;
    expect(await manager.agentStake(agent.address)).to.equal(
      stakeAmount - expectedSlash
    );
  });

  it("rewards validators and burns tokens on employer win", async function () {
    const { token, manager, owner, employer, agent, validator } = await deployFixture(500);
    await manager.setRequiredValidatorApprovals(1);
    await manager.setRequiredValidatorDisapprovals(1);
    await manager.setValidatorPool([validator.address]);
    await manager.setValidatorsPerJob(1);
    const payout = ethers.parseEther("1000");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    const salt = ethers.id("employerWin");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, false, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, false, salt);
    await time.increase(1000);
    await manager.connect(validator).disapproveJob(jobId, "", []);
    await manager.addModerator(owner.address);
    await manager.resolveDispute(jobId, 1);
    expect(await token.balanceOf(validator.address)).to.equal(
      ethers.parseEther("80")
    );
    expect(await token.balanceOf(employer.address)).to.equal(
      ethers.parseEther("870")
    );
  });

  it("finalizes disputes even if agent stake falls below requirement", async function () {
    const { token, manager, owner, employer, agent } = await deployFixture();
    const requirement = ethers.parseEther("60");
    await manager.setAgentStakeRequirement(requirement);
    await manager.setAgentSlashingPercentage(5000);
    const payout = ethers.parseEther("100");
    await token
      .connect(employer)
      .approve(await manager.getAddress(), payout * 2n);
    await manager
      .connect(employer)
      .createJob("job0", payout, 1000, "details0");
    await manager
      .connect(employer)
      .createJob("job1", payout, 1000, "details1");
    await manager.connect(agent).applyForJob(0, "", []);
    await manager.connect(agent).applyForJob(1, "", []);
    await manager.connect(agent).requestJobCompletion(0, "result0");
    await manager.connect(agent).requestJobCompletion(1, "result1");
    await time.increase(2001);
    await manager.connect(employer).disputeJob(0);
    await manager.connect(employer).disputeJob(1);
    await manager.addModerator(owner.address);
    await manager.resolveDispute(1, 1);
    const remainingStake = await manager.agentStake(agent.address);
    expect(remainingStake).to.equal(ethers.parseEther("50"));
    await expect(manager.resolveDispute(0, 1)).not.to.be.reverted;
    const job = await manager.jobs(0);
    expect(job.status).to.equal(3);
    expect(await manager.agentStake(agent.address)).to.equal(remainingStake);
    expect(await token.balanceOf(employer.address)).to.equal(
      ethers.parseEther("980")
    );
  });

  describe("dispute timing", function () {
    it("requires review and reveal windows to elapse before disputing", async function () {
      const { token, manager, employer, agent } = await deployFixture();
      const payout = ethers.parseEther("100");

      await token.connect(employer).approve(await manager.getAddress(), payout);
      await manager
        .connect(employer)
        .createJob("jobhash", payout, 1000, "details");

      const jobId = 0;
      await manager.connect(agent).applyForJob(jobId, "", []);
      await manager
        .connect(agent)
        .requestJobCompletion(jobId, "result");

      await expect(
        manager.connect(employer).disputeJob(jobId)
      ).to.be.revertedWithCustomError(manager, "PrematureDispute");

      await time.increase(2001);

      await expect(manager.connect(employer).disputeJob(jobId))
        .to.emit(manager, "JobDisputed")
        .withArgs(jobId, employer.address, 2);
    });
  });

  describe("commit-reveal workflow", function () {
    it("allows on-time commit and reveal", async function () {
      const { token, manager, employer, agent, validator } = await deployFixture();
      await manager.setCommitRevealWindows(100, 100);
      await manager.setReviewWindow(200);
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

      await time.increase(200);
      await manager.connect(validator).validateJob(jobId, "", []);
      expect(await manager.balanceOf(employer.address)).to.equal(1n);
    });

    it("reverts when revealing after the window", async function () {
      const { token, manager, employer, agent, validator } = await deployFixture();
      await manager.setCommitRevealWindows(100, 100);
      await manager.setReviewWindow(200);
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
    ).to.be.revertedWithCustomError(manager, "RevealPhaseOver");
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
      ).to.be.revertedWithCustomError(manager, "PendingCommitments");
    });

    it("exposes address and info helpers", async function () {
      const { manager, owner } = await deployFixture();
      const [tokenAddr, , , ensAddr, wrapperAddr, ownerAddr] = await manager.getAddresses();
      expect(ownerAddr).to.equal(owner.address);
      expect(tokenAddr).to.equal(await manager.agiToken());
      const [termsHash, email, , , , base] = await manager.getGeneralInfo();
      expect(termsHash).to.equal("");
      expect(base).to.equal("ipfs://");
      expect(email).to.equal("");
      expect(wrapperAddr).to.equal(await manager.nameWrapper());
      expect(ensAddr).to.equal(await manager.ens());
    });
  });
});
