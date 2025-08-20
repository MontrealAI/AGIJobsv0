const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationEngine", function () {
  let engine, owner, caller, user, validator;

  beforeEach(async () => {
    [owner, caller, user, validator] = await ethers.getSigners();
    const Engine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    engine = await Engine.deploy(ethers.ZeroAddress);
    await engine
      .connect(owner)
      .setAuthorizedCaller(caller.address, true);
    await engine
      .connect(owner)
      .setPremiumReputationThreshold(2);
  });

  it("accumulates reputation and rewards validators", async () => {
    const payout = ethers.parseEther("1");
    const duration = 1000;
    const gain = await engine.calculateReputationPoints(payout, duration);
    const enforceGrowth = (current, points) => {
      const max = 88888n;
      let newRep = current + points;
      let diminished = newRep - (current * points) / max;
      return diminished > max ? max : diminished;
    };
    const expectedAgent = enforceGrowth(0n, gain);
    await engine
      .connect(caller)
      .onFinalize(user.address, true, payout, duration);
    expect(await engine.reputationOf(user.address)).to.equal(expectedAgent);

    const expectedValidator = (gain * 8n) / 100n;
    await engine
      .connect(caller)
      .rewardValidator(validator.address, gain);
    expect(await engine.reputationOf(validator.address)).to.equal(
      expectedValidator
    );
  });

  it("blocks blacklisted users", async () => {
    await engine.connect(owner).setBlacklist(user.address, true);
    await expect(engine.connect(caller).onApply(user.address)).to.be.revertedWith(
      "Blacklisted agent"
    );
  });

  it("gates applications by threshold", async () => {
    await expect(engine.connect(caller).onApply(user.address)).to.be.revertedWith(
      "insufficient reputation"
    );
    await engine.connect(caller).add(user.address, 3);
    expect(await engine.meetsThreshold(user.address)).to.equal(true);
    await expect(engine.connect(caller).onApply(user.address)).to.not.be.reverted;
  });

  it("rejects unauthorized callers", async () => {
    await expect(engine.connect(user).add(user.address, 1)).to.be.revertedWith(
      "not authorized"
    );
  });
});
