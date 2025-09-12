const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ReputationEngine', function () {
  let engine, owner, caller, user, validator;

  beforeEach(async () => {
    [owner, caller, user, validator] = await ethers.getSigners();
    const Stake = await ethers.getContractFactory('MockStakeManager');
    const stake = await Stake.deploy();
    const Engine = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    engine = await Engine.deploy(await stake.getAddress());
    await engine.connect(owner).setCaller(caller.address, true);
    await engine.connect(owner).setPremiumThreshold(2);
  });

  it('rewards validators based on agent gain', async () => {
    const payout = ethers.parseEther('100');
    const duration = 100000;
    const gain = await engine.calculateReputationPoints(payout, duration);
    const tokenScale = 10n ** 18n;
    const max = BigInt(await engine.MAX_REPUTATION());
    const enforceGrowth = (current, points) => {
      const newRep = current + points;
      const numerator = newRep * newRep * tokenScale;
      const denominator = max * max;
      const factor = tokenScale + numerator / denominator;
      const diminished = (newRep * tokenScale) / factor;
      return diminished > max ? max : diminished;
    };
    const expectedAgent = enforceGrowth(0n, gain);
    await engine
      .connect(caller)
      .onFinalize(user.address, true, payout, duration);
    expect(await engine.reputationOf(user.address)).to.equal(expectedAgent);

    const percentageScale = BigInt(await engine.PERCENTAGE_SCALE());
    const validatorPercentage = BigInt(
      await engine.validationRewardPercentage()
    );
    const validatorGain = (gain * validatorPercentage) / percentageScale;
    const expectedValidator = enforceGrowth(0n, validatorGain);
    await engine.connect(caller).rewardValidator(validator.address, gain);
    expect(await engine.reputationOf(validator.address)).to.equal(
      expectedValidator
    );
  });

  it('reputation gain scales with payout and duration', async () => {
    const smallPayout = ethers.parseEther('10');
    const smallDuration = 1000;
    const largePayout = ethers.parseEther('100');
    const largeDuration = 100000;

    await engine
      .connect(caller)
      .onFinalize(user.address, true, smallPayout, smallDuration);
    await engine
      .connect(caller)
      .onFinalize(validator.address, true, largePayout, largeDuration);

    const smallRep = await engine.reputation(user.address);
    const largeRep = await engine.reputation(validator.address);
    expect(largeRep).to.be.gt(smallRep);
  });

  it('blocks blacklisted users', async () => {
    await engine.connect(owner).setBlacklist(user.address, true);
    await expect(
      engine.connect(caller).onApply(user.address)
    ).to.be.revertedWith('Blacklisted agent');
  });

  it('gates applications by threshold', async () => {
    await expect(
      engine.connect(caller).onApply(user.address)
    ).to.be.revertedWith('insufficient reputation');
    await engine.connect(caller).add(user.address, 3);
    expect(await engine.meetsThreshold(user.address)).to.equal(true);
    await expect(engine.connect(caller).onApply(user.address)).to.not.be
      .reverted;
  });

  it('auto clears blacklist when threshold met', async () => {
    await engine.connect(owner).setBlacklist(user.address, true);
    const payout = ethers.parseEther('100');
    const duration = 100000;
    await engine
      .connect(caller)
      .onFinalize(user.address, true, payout, duration);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
    expect(await engine.meetsThreshold(user.address)).to.equal(true);
  });

  it('updates reputation with signed deltas', async () => {
    // Negative update blacklists below threshold
    await engine.connect(caller).update(user.address, -1);
    expect(await engine.reputationOf(user.address)).to.equal(0n);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);

    // Positive update increases reputation and clears blacklist when threshold met
    const delta = 5n;
    // helper function replicating growth
    const tokenScale = 10n ** 18n;
    const max = BigInt(await engine.MAX_REPUTATION());
    const enforceGrowth = (current, points) => {
      const newRep = current + points;
      const numerator = newRep * newRep * tokenScale;
      const denominator = max * max;
      const factor = tokenScale + numerator / denominator;
      const diminished = (newRep * tokenScale) / factor;
      return diminished > max ? max : diminished;
    };
    const expected = enforceGrowth(0n, delta);

    await engine.connect(caller).update(user.address, delta);
    expect(await engine.reputationOf(user.address)).to.equal(expected);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
  });

  it('rejects unauthorized callers', async () => {
    await expect(engine.connect(user).add(user.address, 1)).to.be.revertedWith(
      'not authorized'
    );
  });

  it('handles large payouts without overflow', async () => {
    const largePayout = ethers.parseEther('1000000000'); // 1 billion tokens
    const largeDuration = 1000000;

    // calculateReputationPoints should return a positive value and not overflow
    const gain = await engine.calculateReputationPoints(
      largePayout,
      largeDuration
    );
    expect(gain).to.be.gt(0n);

    // Finalize with the large payout; reputation should increase but remain
    // within bounds.
    await expect(
      engine
        .connect(caller)
        .onFinalize(user.address, true, largePayout, largeDuration)
    ).to.not.be.reverted;

    const rep = await engine.reputationOf(user.address);
    const max = await engine.MAX_REPUTATION();
    expect(rep).to.be.gt(0n);
    expect(rep).to.be.lte(max);
  });
});
