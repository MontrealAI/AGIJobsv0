const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ValidationModule", function () {
  let validation, owner, challenger, stakeManager;

  beforeEach(async () => {
    [owner, challenger] = await ethers.getSigners();

    const StakeManager = await ethers.getContractFactory(
      "contracts/mocks/StubStakeManager.sol:StubStakeManager"
    );
    stakeManager = await StakeManager.deploy();
    const stakeAddr = await stakeManager.getAddress();

    const ValidationModule = await ethers.getContractFactory(
      "contracts/ValidationModule.sol:ValidationModule"
    );
    validation = await ValidationModule.deploy(owner.address);
    await validation.connect(owner).setStakeManager(stakeAddr);
    await validation.connect(owner).setChallengeWindow(1000);
    await validation.connect(owner).setDisputeBond(50);
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
});

