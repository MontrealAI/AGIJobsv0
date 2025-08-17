const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ValidationModule", function () {
  let validation, owner, challenger, stakeManager, validator;

  beforeEach(async () => {
    [owner, challenger, validator] = await ethers.getSigners();

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
});

