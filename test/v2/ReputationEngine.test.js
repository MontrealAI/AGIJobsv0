const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationEngine", function () {
  let engine, owner, caller, user;

  beforeEach(async () => {
    [owner, caller, user] = await ethers.getSigners();
    const Engine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    engine = await Engine.deploy(ethers.ZeroAddress);
    await engine
      .connect(owner)
      .setAuthorizedCaller(caller.address, true);
    await engine.connect(owner).setPremiumThreshold(2);
  });

  it("applies reputation gains and decay with blacklisting", async () => {
    await engine.connect(caller).add(user.address, 3);
    expect(await engine.reputationOf(user.address)).to.equal(3);

    await engine.connect(caller).subtract(user.address, 2);
    expect(await engine.reputationOf(user.address)).to.equal(1);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);

    await engine.connect(caller).add(user.address, 2);
    expect(await engine.reputationOf(user.address)).to.equal(3);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
  });

  it("rejects unauthorized callers", async () => {
    await expect(engine.connect(user).add(user.address, 1)).to.be.revertedWith(
      "not authorized"
    );
  });

  it("allows owner to manually set blacklist status", async () => {
    await engine.connect(owner).blacklist(user.address, true);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);
    await engine.connect(owner).blacklist(user.address, false);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
  });

  it("handles onApply and onFinalize hooks", async () => {
    const payout = ethers.parseEther("1");
    const duration = 1000;
    await expect(engine.connect(caller).onApply(user.address)).to.be.revertedWith(
      "insufficient reputation"
    );
    await engine.connect(caller).add(user.address, 3);
    await expect(engine.connect(caller).onApply(user.address)).to.not.be.reverted;
    const gain = await engine.calculateReputationPoints(payout, duration);
    const max = 88888n;
    const enforceGrowth = (current, points) => {
      let newRep = current + points;
      let diminished = newRep - (current * points) / max;
      return diminished > max ? max : diminished;
    };
    const expected = enforceGrowth(3n, gain);
    await expect(
      engine.connect(caller).onFinalize(user.address, true, payout, duration)
    )
      .to.emit(engine, "ReputationUpdated")
      .withArgs(user.address, expected - 3n, expected);
    expect(await engine.reputationOf(user.address)).to.equal(expected);
  });

  it("rewards validators based on agent gain", async () => {
    const agentGain = 100n;
    const expectedGain = (agentGain * 8n) / 100n;
    await expect(
      engine.connect(caller).rewardValidator(user.address, agentGain)
    )
      .to.emit(engine, "ReputationUpdated")
      .withArgs(user.address, expectedGain, expectedGain);
    expect(await engine.reputationOf(user.address)).to.equal(expectedGain);
  });
});
