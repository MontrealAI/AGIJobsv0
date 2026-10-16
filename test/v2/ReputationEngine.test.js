const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('ReputationEngine', function () {
  let engine, registry, owner, caller, user, validator, validationModule;

  const enforceGrowth = (current, points, maximum) => {
    const squaredCap = maximum * maximum;
    const gain = (points * squaredCap) / (squaredCap + current * current);
    const remaining = maximum - current;
    return current + (gain < remaining ? gain : remaining);
  };

  beforeEach(async () => {
    [owner, caller, user, validator, validationModule] =
      await ethers.getSigners();
    const Stake = await ethers.getContractFactory('MockStakeManager');
    const stake = await Stake.deploy();
    const Engine = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    engine = await Engine.deploy(await stake.getAddress());
    const Registry = await ethers.getContractFactory(
      'TerminalReputationRegistryHarness'
    );
    registry = await Registry.deploy();
    await engine
      .connect(owner)
      .setJobRegistry(await registry.getAddress(), true);
    await registry.setValidationModule(validationModule.address);
    await engine.connect(owner).setCaller(caller.address, true);
    await engine.connect(owner).setPremiumThreshold(2);
  });

  async function openSubmittedJob(jobId, agent = user) {
    await registry.open(jobId, await engine.getAddress());
    await registry.assign(jobId, agent.address);
    await registry.submit(jobId);
  }

  async function recordApproval(jobId) {
    await engine
      .connect(validationModule)
      .recordRound(
        await registry.getAddress(),
        jobId,
        1,
        [validator.address],
        [true],
        [true],
        true
      );
  }

  it('rewards validators once from actual terminal agent gain', async () => {
    const payout = ethers.parseEther('100');
    const gain = await engine.calculateReputationPoints(payout, 0);
    const maximum = await engine.MAX_REPUTATION();
    const expectedAgent = enforceGrowth(0n, gain, maximum);
    await openSubmittedJob(1);
    await recordApproval(1);

    // A completed validation round is provisional until the job settles.
    expect(await engine.reputationOf(user.address)).to.equal(0n);
    expect(await engine.reputationOf(validator.address)).to.equal(0n);
    await expect(
      engine.accountValidator(await registry.getAddress(), 1, 0)
    ).to.be.revertedWithCustomError(engine, 'InvalidJobAccountingState');

    await registry.settle(1, user.address, true, false, payout);
    expect(await engine.reputationOf(user.address)).to.equal(expectedAgent);
    const account = await engine.jobAccounting(await registry.getAddress(), 1);
    expect(account.actualAgentGain).to.equal(expectedAgent);
    expect(account.settled).to.equal(true);

    const percentageScale = await engine.PERCENTAGE_SCALE();
    const validatorPercentage = await engine.validationRewardPercentage();
    const validatorGain =
      (account.actualAgentGain * validatorPercentage) / percentageScale;
    const expectedValidator = enforceGrowth(0n, validatorGain, maximum);
    await engine
      .connect(user)
      .accountValidator(await registry.getAddress(), 1, 0);
    expect(await engine.reputationOf(validator.address)).to.equal(
      expectedValidator
    );
    await expect(
      registry.settle(1, user.address, true, false, payout)
    ).to.be.revertedWithCustomError(engine, 'InvalidJobAccountingState');
    await expect(
      engine.accountValidator(await registry.getAddress(), 1, 0)
    ).to.be.revertedWithCustomError(engine, 'ValidatorAlreadyAccounted');
    expect(await engine.reputationOf(user.address)).to.equal(expectedAgent);
    expect(await engine.reputationOf(validator.address)).to.equal(
      expectedValidator
    );
  });

  it('bases validator rewards on capped actual gain rather than nominal points', async () => {
    const maximum = await engine.MAX_REPUTATION();
    await engine.connect(caller).add(user.address, maximum - 10n);
    await openSubmittedJob(1);
    await recordApproval(1);
    const payout = ethers.parseEther('100');
    expect(await engine.calculateReputationPoints(payout, 0)).to.equal(24n);
    await registry.settle(1, user.address, true, false, payout);
    expect(await engine.reputationOf(user.address)).to.equal(maximum);
    expect(
      (await engine.jobAccounting(await registry.getAddress(), 1))
        .actualAgentGain
    ).to.equal(10n);
    await engine.accountValidator(await registry.getAddress(), 1, 0);
    // floor(10 * 8 / 100) is zero; the nominal 24 points would award one.
    expect(await engine.reputationOf(validator.address)).to.equal(0n);
  });

  it('reputation gain scales with the 18-decimal payout', async () => {
    const smallPayout = ethers.parseEther('10');
    const largePayout = ethers.parseEther('100');
    await openSubmittedJob(1);
    await registry.settle(1, user.address, true, false, smallPayout);
    await openSubmittedJob(2, validator);
    await registry.settle(2, validator.address, true, false, largePayout);

    const smallRep = await engine.reputation(user.address);
    const largeRep = await engine.reputation(validator.address);
    expect(smallRep).to.equal(0n);
    expect(largeRep).to.equal(24n);
    expect(largeRep).to.be.gt(smallRep);
    expect(
      await engine.calculateReputationPoints(100n * 10n ** 6n, 100000)
    ).to.equal(0n);
  });

  it('does not reward elapsed time in either quotes or terminal settlement', async () => {
    const payout = ethers.parseEther('100');
    const points = await engine.calculateReputationPoints(payout, 0);
    expect(
      await engine.calculateReputationPoints(payout, ethers.MaxUint256)
    ).to.equal(points);
    await openSubmittedJob(1);
    await registry.settle(1, user.address, true, false, payout);
    await openSubmittedJob(2, validator);
    await time.increase(100000);
    await registry.settle(2, validator.address, true, false, payout);
    expect(await engine.reputation(user.address)).to.equal(points);
    expect(await engine.reputation(validator.address)).to.equal(points);
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

  it('auto clears blacklist when a terminal credit meets the threshold', async () => {
    await openSubmittedJob(1);
    await engine.connect(owner).setBlacklist(user.address, true);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);
    await registry.settle(
      1,
      user.address,
      true,
      false,
      ethers.parseEther('100')
    );
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
    expect(await engine.meetsThreshold(user.address)).to.equal(true);
  });

  it('updates reputation with signed administrative deltas', async () => {
    await engine.connect(caller).update(user.address, -1);
    expect(await engine.reputationOf(user.address)).to.equal(0n);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);
    expect(await engine.entropy(user.address)).to.equal(1n);

    const delta = 5n;
    const expected = enforceGrowth(0n, delta, await engine.MAX_REPUTATION());
    await engine.connect(caller).update(user.address, delta);
    expect(await engine.reputationOf(user.address)).to.equal(expected);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
    expect(await engine.entropy(user.address)).to.equal(1n);

    await engine.connect(caller).update(user.address, -3);
    expect(await engine.reputationOf(user.address)).to.equal(expected - 3n);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
    await engine.connect(caller).subtract(user.address, ethers.MaxUint256);
    expect(await engine.reputationOf(user.address)).to.equal(0n);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);
  });

  it('rejects unauthorized administrative callers', async () => {
    for (const operation of [
      () => engine.connect(user).add(user.address, 1),
      () => engine.connect(user).subtract(user.address, 1),
      () => engine.connect(user).update(user.address, 1),
      () => engine.connect(user).onApply(user.address),
    ]) {
      await expect(operation()).to.be.revertedWith('not authorized');
    }
    expect(await engine.reputationOf(user.address)).to.equal(0n);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
  });

  it('requires explicit registry authorization independently of caller permission', async () => {
    await expect(
      engine.connect(user).setJobRegistry(await registry.getAddress(), true)
    )
      .to.be.revertedWithCustomError(engine, 'OwnableUnauthorizedAccount')
      .withArgs(user.address);
    await expect(
      engine.connect(owner).setJobRegistry(caller.address, true)
    ).to.be.revertedWithCustomError(engine, 'InvalidTerminalRegistry');
    for (const operation of [
      () => engine.connect(caller).registerJob(1),
      () => engine.connect(caller).assignJob(1, user.address),
      () => engine.connect(caller).submitJob(1),
      () => engine.connect(caller).finalizeJob(1, user.address, true, false, 0),
    ]) {
      await expect(operation()).to.be.revertedWithCustomError(
        engine,
        'InvalidTerminalRegistry'
      );
    }
    await engine
      .connect(owner)
      .setJobRegistry(await registry.getAddress(), false);
    await expect(
      registry.open(1, await engine.getAddress())
    ).to.be.revertedWithCustomError(engine, 'InvalidTerminalRegistry');
    expect(
      (await engine.jobAccounting(await registry.getAddress(), 1)).exists
    ).to.equal(false);
  });

  it('rejects legacy lifecycle hooks even for authorized callers', async () => {
    const payout = ethers.parseEther('100');
    for (const signer of [caller, user]) {
      await expect(
        engine.connect(signer).onFinalize(user.address, true, payout, 100000)
      ).to.be.revertedWithCustomError(
        engine,
        'LegacyReputationLifecycleUnsupported'
      );
      await expect(
        engine.connect(signer).rewardValidator(validator.address, 24)
      ).to.be.revertedWithCustomError(
        engine,
        'LegacyReputationLifecycleUnsupported'
      );
      await expect(
        engine
          .connect(signer)
          .updateScores(
            1,
            user.address,
            [validator.address],
            true,
            [true],
            [true],
            payout,
            100000
          )
      ).to.be.revertedWithCustomError(
        engine,
        'LegacyReputationLifecycleUnsupported'
      );
    }
    expect(await engine.reputationOf(user.address)).to.equal(0n);
    expect(await engine.reputationOf(validator.address)).to.equal(0n);
  });

  it('pauses administrative updates and terminal transitions without consuming them', async () => {
    await openSubmittedJob(1);
    await recordApproval(1);
    await engine.connect(owner).pause();
    for (const operation of [
      () => engine.connect(caller).add(user.address, 1),
      () => engine.connect(caller).subtract(user.address, 1),
      () => engine.connect(caller).update(user.address, 1),
      () => engine.connect(caller).onApply(user.address),
      async () => registry.open(2, await engine.getAddress()),
      () =>
        registry.settle(1, user.address, true, false, ethers.parseEther('100')),
    ]) {
      await expect(operation()).to.be.revertedWithCustomError(
        engine,
        'EnforcedPause'
      );
    }
    expect(
      (await engine.jobAccounting(await registry.getAddress(), 1)).settled
    ).to.equal(false);
    expect(await engine.reputationOf(user.address)).to.equal(0n);
    await engine.connect(owner).unpause();
    await registry.settle(
      1,
      user.address,
      true,
      false,
      ethers.parseEther('100')
    );
    await engine.connect(owner).pause();
    await expect(
      engine.accountValidator(await registry.getAddress(), 1, 0)
    ).to.be.revertedWithCustomError(engine, 'EnforcedPause');
    expect(
      await engine.validatorAccounted(await registry.getAddress(), 1, 0)
    ).to.equal(false);
    await engine.connect(owner).unpause();
    await engine.accountValidator(await registry.getAddress(), 1, 0);
    expect(await engine.reputationOf(validator.address)).to.equal(1n);
  });

  it('handles large payouts without overflow and keeps reputation within bounds', async () => {
    const largePayout = ethers.parseEther('1000000000');
    const gain = await engine.calculateReputationPoints(largePayout, 1000000);
    expect(gain).to.be.gt(0n);
    await openSubmittedJob(1);
    await expect(registry.settle(1, user.address, true, false, largePayout)).to
      .not.be.reverted;
    const rep = await engine.reputationOf(user.address);
    const maximum = await engine.MAX_REPUTATION();
    expect(rep).to.equal(enforceGrowth(0n, gain, maximum));
    expect(rep).to.be.gt(0n);
    expect(rep).to.be.lte(maximum);
    await engine.connect(caller).add(user.address, ethers.MaxUint256);
    expect(await engine.reputationOf(user.address)).to.equal(maximum);
  });

  it('rejects payouts above the canonical bound without consuming settlement', async () => {
    const maximumPayout = await engine.MAX_SCORING_PAYOUT();
    expect(await engine.calculateReputationPoints(maximumPayout, 0)).to.be.gt(
      0n
    );
    await expect(engine.calculateReputationPoints(maximumPayout + 1n, 0))
      .to.be.revertedWithCustomError(engine, 'ScoringPayoutTooLarge')
      .withArgs(maximumPayout + 1n);
    await openSubmittedJob(1);
    await expect(
      registry.settle(1, user.address, true, false, maximumPayout + 1n)
    )
      .to.be.revertedWithCustomError(engine, 'ScoringPayoutTooLarge')
      .withArgs(maximumPayout + 1n);
    expect(
      (await engine.jobAccounting(await registry.getAddress(), 1)).settled
    ).to.equal(false);
    expect(await engine.reputationOf(user.address)).to.equal(0n);
    await registry.settle(1, user.address, true, false, maximumPayout);
    expect(await engine.reputationOf(user.address)).to.be.gt(0n);
    expect(await engine.reputationOf(user.address)).to.be.lte(
      await engine.MAX_REPUTATION()
    );
  });
});
