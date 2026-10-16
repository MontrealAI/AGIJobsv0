const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Reputation v3 bounded incremental arithmetic', function () {
  let engine, owner, agent;
  const M = 88888n;
  const U = (1n << 256n) - 1n;
  beforeEach(async function () {
    [owner, agent] = await ethers.getSigners();
    const manager = await (
      await ethers.getContractFactory(
        'contracts/v2/mocks/VersionMock.sol:VersionMock'
      )
    ).deploy(2);
    engine = await (
      await ethers.getContractFactory('ReputationGrowthHarness')
    ).deploy(await manager.getAddress());
    await engine.setCaller(owner.address, true);
  });

  it('uses v3 capability and refuses unkeyed legacy lifecycle calls', async function () {
    expect(await engine.version()).equal(3);
    expect(await engine.terminalPolicyId()).equal(
      ethers.id('AGIJobs:terminal-reputation-v3')
    );
    await expect(
      engine.onFinalize(agent.address, true, 1, 0)
    ).revertedWithCustomError(engine, 'LegacyReputationLifecycleUnsupported');
    await expect(
      engine.rewardValidator(agent.address, 1)
    ).revertedWithCustomError(engine, 'LegacyReputationLifecycleUnsupported');
    await expect(
      engine.updateScores(1, agent.address, [], true, [], [], 1, 0)
    ).revertedWithCustomError(engine, 'LegacyReputationLifecycleUnsupported');
  });

  it('matches full-precision floor arithmetic, is monotonic, and saturates safely', async function () {
    for (const current of [
      0n,
      1n,
      9n,
      10n,
      100n,
      19036n,
      M - 1n,
      M,
      M + 1n,
      U,
    ]) {
      for (const points of [0n, 1n, 2n, 24n, 143n, M, U]) {
        const raw =
          current >= M ? 0n : (points * M * M) / (M * M + current * current);
        const gain = current >= M ? 0n : raw < M - current ? raw : M - current;
        const result = await engine.growth(current, points);
        expect(result).equal(current + gain);
        expect(result).gte(current);
        if (current <= M) expect(result).lte(M);
      }
    }
  });

  it('preserves the external correction monotonic-award and sequential-credit properties', async function () {
    // PR #3971 eee944d2 supplied these properties; v3 uses its reviewed current-score formula.
    let seed = 0x3971n;
    const next = () => {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) & U;
      return seed;
    };
    for (let i = 0; i < 32; i++) {
      const current = next() % (M + 1n);
      const a = next();
      const b = next();
      const lower = a < b ? a : b;
      const upper = a < b ? b : a;
      const lowScore = await engine.growth(current, lower);
      const highScore = await engine.growth(current, upper);
      expect(lowScore).gte(current);
      expect(highScore).gte(lowScore);
      expect(highScore).lte(M);
      expect(highScore - current).lte(upper);
      expect(await engine.growth(current, 0)).equal(current);
    }
    await engine.add(agent.address, 20000);
    for (let i = 0; i < 16; i++) {
      const before = await engine.reputation(agent.address);
      const award = next() % 1001n;
      await engine.add(agent.address, award);
      const after = await engine.reputation(agent.address);
      expect(after).gte(before);
      expect(after).lte(M);
      expect(after - before).lte(award);
    }
    await engine.subtract(agent.address, U);
    expect(await engine.reputation(agent.address)).equal(0);
    await engine.add(agent.address, 20000);
    expect(await engine.reputation(agent.address)).equal(20000);
  });

  it('preserves high scores and permits zero rounded gains instead of panicking', async function () {
    await engine.add(agent.address, 19036);
    expect(await engine.reputation(agent.address)).equal(19036);
    await expect(engine.add(agent.address, 1))
      .emit(engine, 'ReputationUpdated')
      .withArgs(agent.address, 0, 19036);
    await engine.add(agent.address, U);
    expect(await engine.reputation(agent.address)).equal(M);
    await expect(engine.add(agent.address, U))
      .emit(engine, 'ReputationUpdated')
      .withArgs(agent.address, 0, M);
  });

  it('uses actual 18-decimal payout, preserves the disclosed cliff, and gives no duration bonus', async function () {
    for (const [tokens, points] of [
      [0n, 0n],
      [1n, 0n],
      [10n, 0n],
      [46n, 0n],
      [47n, 20n],
      [100n, 24n],
      [1000n, 34n],
      [1000000n, 64n],
    ]) {
      expect(
        await engine.calculateReputationPoints(tokens * 10n ** 18n, 0)
      ).equal(points);
      expect(
        await engine.calculateReputationPoints(tokens * 10n ** 18n, U)
      ).equal(points);
    }
    const bound = 2n * ((1n << 128n) - 1n);
    await engine.calculateReputationPoints(bound, 0);
    await expect(
      engine.calculateReputationPoints(bound + 1n, 0)
    ).revertedWithCustomError(engine, 'ScoringPayoutTooLarge');
  });

  it('computes validator fractions safely even for maximal external point inputs', async function () {
    expect(await engine.calculateValidatorReputationPoints(U)).equal(
      (U * 8n) / 100n
    );
    await engine.setValidationRewardPercentage(100);
    expect(await engine.calculateValidatorReputationPoints(U)).equal(U);
    await engine.setValidationRewardPercentage(0);
    expect(await engine.calculateValidatorReputationPoints(U)).equal(0);
  });

  it('preserves zero admission floor and bounds owner-adjustable failure defaults', async function () {
    expect(await engine.premiumThreshold()).equal(0);
    expect(await engine.failurePenaltyBps()).equal(1000);
    expect(await engine.failurePenaltyCap()).equal(10);
    await expect(
      engine.connect(agent).setFailurePenaltyPolicy(0, 0)
    ).revertedWithCustomError(engine, 'OwnableUnauthorizedAccount');
    await expect(
      engine.setFailurePenaltyPolicy(10001, 10)
    ).revertedWithCustomError(engine, 'InvalidFailurePenalty');
    await expect(
      engine.setFailurePenaltyPolicy(1000, M + 1n)
    ).revertedWithCustomError(engine, 'InvalidFailurePenalty');
    await expect(engine.setFailurePenaltyPolicy(0, 0))
      .emit(engine, 'FailurePenaltyPolicyUpdated')
      .withArgs(0, 0);
    await engine.setFailurePenaltyPolicy(10000, M);
  });
});
