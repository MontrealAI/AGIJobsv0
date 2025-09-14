const { expect } = require('chai');
const { ethers } = require('hardhat');

const TOKEN_SCALE = 10n ** 18n;

describe('Reputation entropy integration', function () {
  let engine, registry, owner, caller, operator, stake;

  beforeEach(async () => {
    [owner, caller, operator] = await ethers.getSigners();
    const Stake = await ethers.getContractFactory('MockStakeManager');
    stake = await Stake.deploy();
    const Engine = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    engine = await Engine.deploy(await stake.getAddress());
    await engine.connect(owner).setCaller(caller.address, true);
    const Registry = await ethers.getContractFactory(
      'contracts/v2/PlatformRegistry.sol:PlatformRegistry'
    );
    registry = await Registry.deploy(
      await stake.getAddress(),
      await engine.getAddress(),
      0
    );
  });

  it('does not adjust entropy on positive updates', async () => {
    await engine.connect(caller).update(operator.address, 5);
    expect(await engine.getEntropy(operator.address)).to.equal(0n);
    const rep = await engine.reputation(operator.address);
    const repW = await engine.reputationWeight();
    const score = await registry.getScore(operator.address);
    expect(score).to.equal((rep * repW) / TOKEN_SCALE);
  });

  it('tracks entropy on negative updates and reduces routing score', async () => {
    await engine.connect(caller).update(operator.address, 10);
    await engine.connect(caller).update(operator.address, -3);
    expect(await engine.getEntropy(operator.address)).to.equal(3n);
    const rep = await engine.reputation(operator.address);
    const repW = await engine.reputationWeight();
    const adjusted = rep > 3n ? rep - 3n : 0n;
    const score = await registry.getScore(operator.address);
    expect(score).to.equal((adjusted * repW) / TOKEN_SCALE);
  });
});
