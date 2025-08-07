const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationEngine", function () {
  let engine, owner, caller, user;

  beforeEach(async () => {
    [owner, caller, user] = await ethers.getSigners();
    const Engine = await ethers.getContractFactory("ReputationEngine");
    engine = await Engine.deploy(owner.address);
  });

  it("updates reputation and tracks penalties", async () => {
    await engine.connect(owner).setCaller(caller.address, true);
    await engine.connect(owner).setPenaltyThreshold(2);

    await engine.connect(caller).addReputation(user.address, 5);
    expect(await engine.reputationOf(user.address)).to.equal(5);

    await engine.connect(caller).subtractReputation(user.address, 3);
    expect(await engine.reputationOf(user.address)).to.equal(2);
    expect(await engine.penaltyCount(user.address)).to.equal(1);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);

    await engine.connect(caller).subtractReputation(user.address, 5);
    expect(await engine.reputationOf(user.address)).to.equal(0);
    expect(await engine.penaltyCount(user.address)).to.equal(2);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);
  });

  it("reverts for unauthorized callers", async () => {
    await expect(
      engine.connect(caller).addReputation(user.address, 1)
    ).to.be.revertedWith("not authorized");
  });
});

