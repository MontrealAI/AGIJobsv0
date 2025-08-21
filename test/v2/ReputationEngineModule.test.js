const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationEngine module", function () {
  let owner, caller, user, validator, engine;

  beforeEach(async () => {
    [owner, caller, user, validator] = await ethers.getSigners();
    const Engine = await ethers.getContractFactory(
      "contracts/v2/modules/ReputationEngine.sol:ReputationEngine"
    );
    engine = await Engine.deploy();
    await engine.waitForDeployment();
    await engine.connect(owner).setCaller(caller.address, true);
    await engine.connect(owner).setPremiumThreshold(2);
  });

  it("accumulates reputation and rewards validators", async () => {
    const payout = ethers.parseEther("100");
    const duration = 100000;
    const gain = await engine.calculateReputationPoints(payout, duration);
    const enforceGrowth = (current, points) => {
      const max = 88888n;
      const newRep = current + points;
      const numerator = newRep * newRep * 10n ** 18n;
      const denominator = max * max;
      const factor = 10n ** 18n + numerator / denominator;
      const diminished = (newRep * 10n ** 18n) / factor;
      return diminished > max ? max : diminished;
    };
    const expectedAgent = enforceGrowth(0n, gain);
    await engine
      .connect(caller)
      .onFinalize(user.address, true, payout, duration);
    expect(await engine.getReputation(0, user.address)).to.equal(expectedAgent);

    const validatorGain = (gain * 8n) / 100n;
    const expectedValidator = enforceGrowth(0n, validatorGain);
    await engine
      .connect(caller)
      .rewardValidator(validator.address, gain);
    expect(await engine.getReputation(1, validator.address)).to.equal(
      expectedValidator
    );
  });

  it("blocks blacklisted users", async () => {
    await engine.connect(owner).blacklist(user.address, true);
    await expect(engine.connect(caller).onApply(user.address)).to.be.revertedWith(
      "Blacklisted agent"
    );
  });

  it("gates applications by threshold", async () => {
    await expect(engine.connect(caller).onApply(user.address)).to.be.revertedWith(
      "insufficient reputation"
    );
    await engine.connect(caller).add(0, user.address, 3);
    await expect(engine.connect(caller).onApply(user.address)).to.not.be
      .reverted;
  });

  it("rejects unauthorized callers", async () => {
    await expect(
      engine.connect(user).add(0, user.address, 1)
    ).to.be.revertedWith("not authorized");
  });
});

