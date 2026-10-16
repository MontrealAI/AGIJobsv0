const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Reputation v3 terminal accounting', function () {
  let engine, registry, other, owner, agent, validator, dissent, stranger;
  const token = 10n ** 18n;
  beforeEach(async function () {
    [owner, agent, validator, dissent, stranger] = await ethers.getSigners();
    const manager = await (
      await ethers.getContractFactory(
        'contracts/v2/mocks/VersionMock.sol:VersionMock'
      )
    ).deploy(2);
    engine = await (
      await ethers.getContractFactory('ReputationGrowthHarness')
    ).deploy(await manager.getAddress());
    const Factory = await ethers.getContractFactory(
      'TerminalReputationRegistryHarness'
    );
    registry = await Factory.deploy();
    other = await Factory.deploy();
    for (const r of [registry, other]) {
      await engine.setJobRegistry(await r.getAddress(), true);
      await r.setValidationModule(owner.address);
    }
    await engine.setCaller(owner.address, true);
  });
  async function open(id = 1, r = registry) {
    await r.open(id, await engine.getAddress());
    await r.assign(id, agent.address);
    await r.submit(id);
  }
  async function round(
    id = 1,
    validators = [validator.address, dissent.address],
    revealed = [true, true],
    votes = [true, false]
  ) {
    return engine.recordRound(
      await registry.getAddress(),
      id,
      1,
      validators,
      revealed,
      votes,
      true
    );
  }
  it('does not award provisional votes; terminal success credits once and uses actual gain for validators', async function () {
    await engine.add(agent.address, 19036);
    await open();
    await round();
    expect(await engine.reputation(agent.address)).equal(19036);
    await registry.settle(1, agent.address, true, false, 100n * token);
    const gain = (24n * 88888n ** 2n) / (88888n ** 2n + 19036n ** 2n);
    expect(await engine.reputation(agent.address)).equal(19036n + gain);
    await expect(
      registry.settle(1, agent.address, true, false, 100n * token)
    ).revertedWithCustomError(engine, 'InvalidJobAccountingState');
    await engine
      .connect(stranger)
      .accountValidator(await registry.getAddress(), 1, 0);
    expect(await engine.reputation(validator.address)).equal(
      (gain * 8n) / 100n
    );
    await engine.accountValidator(await registry.getAddress(), 1, 1);
    expect(await engine.reputation(dissent.address)).equal(0);
    await expect(
      engine.accountValidator(await registry.getAddress(), 1, 0)
    ).revertedWithCustomError(engine, 'ValidatorAlreadyAccounted');
  });
  it('uses creation policy and assignment score despite later owner and score changes', async function () {
    await engine.add(agent.address, 100);
    await registry.open(1, await engine.getAddress());
    await engine.setFailurePenaltyPolicy(10000, 88888);
    await registry.assign(1, agent.address);
    await registry.submit(1);
    await engine.add(agent.address, 100);
    const before = await engine.reputation(agent.address);
    await registry.settle(1, agent.address, false, true, 0);
    expect(await engine.reputation(agent.address)).equal(before - 10n);
    expect(await engine.isBlacklisted(agent.address)).equal(false);
  });
  it('caps concurrent debits at remaining score without blacklist, keeping assigned success usable', async function () {
    await engine.setPremiumThreshold(1);
    await engine.add(agent.address, 1);
    await open(1);
    await open(2);
    await open(3);
    await registry.settle(1, agent.address, false, true, 0);
    expect(await engine.reputation(agent.address)).equal(0);
    expect(await engine.isBlacklisted(agent.address)).equal(false);
    await expect(engine.onApply(agent.address)).revertedWith(
      'insufficient reputation'
    );
    await registry.settle(2, agent.address, false, true, 0);
    expect(await engine.reputation(agent.address)).equal(0);
    await registry.settle(3, agent.address, true, false, 100n * token);
    expect(await engine.reputation(agent.address)).equal(24);
    await engine.onApply(agent.address);
  });
  it('keeps zero policy valid and does not invent recovery from zero-point jobs', async function () {
    await engine.setFailurePenaltyPolicy(0, 0);
    await engine.add(agent.address, 1);
    await open();
    await registry.settle(1, agent.address, false, true, 0);
    expect(await engine.reputation(agent.address)).equal(1);
    await open(2);
    await registry.settle(2, agent.address, true, false, 46n * token);
    expect(await engine.reputation(agent.address)).equal(1);
  });
  it('keeps cancellation and unattributed employer refund neutral', async function () {
    await registry.open(1, await engine.getAddress());
    await registry.settle(1, ethers.ZeroAddress, false, false, 0);
    await engine.add(agent.address, 100);
    await open(2);
    await round(2);
    await registry.settle(2, agent.address, false, false, 0);
    expect(await engine.reputation(agent.address)).equal(100);
    await engine.accountValidator(await registry.getAddress(), 2, 0);
    expect(await engine.reputation(validator.address)).equal(0);
  });
  it('scores disagreement only against attributed terminal outcome and preserves immutable facts', async function () {
    await engine.add(validator.address, 10);
    await engine.add(dissent.address, 10);
    await open();
    await round();
    expect(await engine.reputation(validator.address)).equal(10);
    await registry.settle(1, agent.address, false, true, 0);
    await engine.accountValidator(await registry.getAddress(), 1, 0);
    await engine.accountValidator(await registry.getAddress(), 1, 1);
    expect(await engine.reputation(validator.address)).equal(9);
    expect(await engine.reputation(dissent.address)).equal(10);
    expect(await engine.isBlacklisted(validator.address)).equal(false);
  });
  it('applies objective non-reveal once at closure and no duplicate terminal penalty', async function () {
    await engine.add(validator.address, 10);
    await open();
    await round(1, [validator.address], [false], [false]);
    expect(await engine.reputation(validator.address)).equal(9);
    await expect(
      round(1, [validator.address], [false], [false])
    ).revertedWithCustomError(engine, 'InvalidRound');
    await registry.settle(1, agent.address, false, true, 0);
    await engine.accountValidator(await registry.getAddress(), 1, 0);
    expect(await engine.reputation(validator.address)).equal(9);
  });
  it('binds registry, job, agent, authorized validation and terminal shape', async function () {
    await open();
    await open(1, other);
    await expect(
      engine
        .connect(stranger)
        .recordRound(await registry.getAddress(), 1, 1, [], [], [], true)
    ).revertedWithCustomError(engine, 'InvalidTerminalRegistry');
    await expect(
      registry.settle(1, stranger.address, true, false, 100n * token)
    ).revertedWithCustomError(engine, 'InvalidJobAccountingState');
    await expect(
      registry.settle(1, agent.address, false, false, 1)
    ).revertedWithCustomError(engine, 'InvalidJobAccountingState');
    await registry.settle(1, agent.address, true, false, 100n * token);
    await other.settle(1, agent.address, true, false, 100n * token);
    expect(await engine.reputation(agent.address)).equal(47);
  });
  for (const count of [100, 256, 257])
    it(`records ${count} immutable facts without a hidden committee cap and permits independent claims`, async function () {
      await open();
      const validators = Array.from({ length: count }, (_, i) =>
        ethers.getAddress(
          '0x' + (BigInt(i) + 1000n).toString(16).padStart(40, '0')
        )
      );
      const tx = await round(
        1,
        validators,
        Array(count).fill(true),
        Array(count).fill(true)
      );
      const receipt = await tx.wait();
      console.log(`round ${count} gas ${receipt.gasUsed}`);
      expect(receipt.gasUsed).lt(15000000);
      await registry.settle(1, agent.address, true, false, 100n * token);
      await engine.accountValidator(await registry.getAddress(), 1, count - 1);
      expect(await engine.reputation(validators[count - 1])).equal(1);
      await engine.accountValidator(await registry.getAddress(), 1, 0);
      await expect(
        engine.accountValidator(await registry.getAddress(), 1, count - 1)
      ).revertedWithCustomError(engine, 'ValidatorAlreadyAccounted');
    });
});
