const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Reputation incentives', function () {
  let engine, owner, caller, honestAgent, honestValidator, cheatAgent, cheatValidator;

  beforeEach(async () => {
    [owner, caller, honestAgent, honestValidator, cheatAgent, cheatValidator] =
      await ethers.getSigners();
    const Stake = await ethers.getContractFactory('MockStakeManager');
    const stake = await Stake.deploy();
    const Engine = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    engine = await Engine.deploy(await stake.getAddress());
    await engine.connect(owner).setCaller(caller.address, true);
    await engine.connect(owner).setPremiumThreshold(1);
  });

  const discount = (deltas, delta) =>
    deltas.reduce((acc, v, i) => acc + v * Math.pow(delta, i), 0);

  it('net utility favors honesty over repeated rounds', async () => {
    const payout = ethers.parseEther('100');
    const duration = 100000;
    const rounds = 3;
    const gamma = 0.9;
    const gain = Number(await engine.calculateReputationPoints(payout, duration));

    const agentHonest = [];
    const agentCheat = [];
    const validatorHonest = [];
    const validatorCheat = [];

    for (let i = 0; i < rounds; i++) {
      let prev = await engine.reputationOf(honestAgent.address);
      await engine
        .connect(caller)
        .onFinalize(honestAgent.address, true, payout, duration);
      let after = await engine.reputationOf(honestAgent.address);
      agentHonest.push(Number(after - prev));

      prev = await engine.reputationOf(honestValidator.address);
      await engine.connect(caller).rewardValidator(honestValidator.address, gain);
      after = await engine.reputationOf(honestValidator.address);
      validatorHonest.push(Number(after - prev));

      prev = await engine.reputationOf(cheatAgent.address);
      await engine
        .connect(caller)
        .onFinalize(cheatAgent.address, false, payout, duration);
      after = await engine.reputationOf(cheatAgent.address);
      agentCheat.push(Number(after - prev));

      prev = await engine.reputationOf(cheatValidator.address);
      await engine
        .connect(caller)
        .update(cheatValidator.address, -BigInt(gain));
      after = await engine.reputationOf(cheatValidator.address);
      validatorCheat.push(Number(after - prev));
    }

    const honestAgentNPV = discount(agentHonest, gamma);
    const cheatAgentNPV = discount(agentCheat, gamma);
    const honestValidatorNPV = discount(validatorHonest, gamma);
    const cheatValidatorNPV = discount(validatorCheat, gamma);

    expect(honestAgentNPV).to.be.gt(cheatAgentNPV);
    expect(honestValidatorNPV).to.be.gt(cheatValidatorNPV);
  });
});

