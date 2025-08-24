const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("ValidationModule", function () {
  let validation, owner, challenger, stakeManager, validator, validator2;

  beforeEach(async () => {
    [owner, challenger, validator, validator2] = await ethers.getSigners();

    const StakeManager = await ethers.getContractFactory(
      "contracts/mocks/StubStakeManager.sol:StubStakeManager"
    );
    stakeManager = await StakeManager.deploy();
    const stakeAddr = await stakeManager.getAddress();

    const ValidationModule = await ethers.getContractFactory(
      "contracts/ValidationModule.sol:ValidationModule"
    );
    validation = await ValidationModule.deploy();
    await validation.connect(owner).setStakeManager(stakeAddr);
    await validation.connect(owner).setChallengeWindow(1000);
    await validation.connect(owner).setDisputeBond(50);
    await stakeManager.setStake(validator.address, 1);
    await stakeManager.setStake(validator2.address, 1);
  });

  it("returns preset outcomes", async () => {
    await validation.connect(owner).setOutcome(1, true);
    expect(await validation.validate(1)).to.equal(true);
    await validation.connect(owner).setOutcome(2, false);
    expect(await validation.validate(2)).to.equal(false);
  });

  it("allows challenges within deadline and locks bond", async () => {
    await validation.connect(owner).setOutcome(1, true);
    await validation.connect(challenger).challenge(1);
    expect(await validation.challenger(1)).to.equal(challenger.address);
    expect(await stakeManager.locked(challenger.address)).to.equal(50n);
  });

  it("rejects challenges after deadline", async () => {
    await validation.connect(owner).setOutcome(1, true);
    await ethers.provider.send("evm_increaseTime", [1001]);
    await expect(
      validation.connect(challenger).challenge(1)
    ).to.be.revertedWith("expired");
  });

  it("supports commit-reveal flow", async () => {
    await validation.connect(owner).setValidatorsPerJob(1);
    await validation.connect(owner).setCommitWindow(5);
    await validation.connect(owner).setRevealWindow(5);
    await validation
      .connect(owner)
      .setValidatorIdentity(validator.address, true);
    await validation
      .connect(owner)
      .setValidatorPool([validator.address]);
    await validation.connect(owner).selectValidators(1);

    const salt = ethers.encodeBytes32String("salt");
    const commit = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, 1, true, salt]
    );
    await expect(
      validation.connect(validator).commitValidation(1, commit)
    )
      .to.emit(validation, "ValidationCommitted")
      .withArgs(1, validator.address, commit);

    await time.increase(6);

    await expect(
      validation.connect(validator).revealValidation(1, true, salt)
    )
      .to.emit(validation, "ValidationRevealed")
      .withArgs(1, validator.address, true);

    await time.increase(6);

    await expect(validation.finalizeValidation(1)).to.emit(
      validation,
      "ValidationResult"
    );
    expect(await validation.outcomes(1)).to.equal(true);
  });

  it("applies approval threshold and finalizes early", async () => {
    await validation.connect(owner).setValidatorsPerJob(2);
    await validation.connect(owner).setCommitWindow(5);
    await validation.connect(owner).setRevealWindow(5);
    await validation.connect(owner).setApprovalThreshold(60);
    await validation
      .connect(owner)
      .setValidatorIdentity(validator.address, true);
    await validation
      .connect(owner)
      .setValidatorIdentity(validator2.address, true);
    await validation
      .connect(owner)
      .setValidatorPool([validator.address, validator2.address]);
    await validation.connect(owner).selectValidators(1);

    const salt1 = ethers.encodeBytes32String("salt1");
    const commit1 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, 1, true, salt1]
    );
    const salt2 = ethers.encodeBytes32String("salt2");
    const commit2 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator2.address, 1, false, salt2]
    );
    await validation.connect(validator).commitValidation(1, commit1);
    await validation.connect(validator2).commitValidation(1, commit2);

    await time.increase(6);

    await validation.connect(validator).revealValidation(1, true, salt1);
    await validation.connect(validator2).revealValidation(1, false, salt2);

    await expect(validation.finalizeValidation(1))
      .to.emit(validation, "ValidationResult")
      .withArgs(1, false, anyValue);
    expect(await validation.outcomes(1)).to.equal(false);
  });
});

