const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Reputation incentives', function () {
  let engine,
    registry,
    owner,
    caller,
    successfulAgent,
    approvingValidator,
    failedAgent,
    disagreeingValidator,
    validationModule;

  beforeEach(async () => {
    [
      owner,
      caller,
      successfulAgent,
      approvingValidator,
      failedAgent,
      disagreeingValidator,
      validationModule,
    ] = await ethers.getSigners();
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
    await engine.connect(owner).setPremiumThreshold(1);
  });

  const discount = (deltas, delta) =>
    deltas.reduce(
      (acc, value, index) => acc + value * Math.pow(delta, index),
      0
    );

  const growth = (current, points, maximum) => {
    const gain =
      (points * maximum * maximum) / (maximum * maximum + current * current);
    return current + (gain < maximum - current ? gain : maximum - current);
  };

  async function openApprovedJob(jobId, agent, validator) {
    await registry.open(jobId, await engine.getAddress());
    await registry.assign(jobId, agent.address);
    await registry.submit(jobId);
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

  // Compare equal starting scores, including the original zero-score case.
  // Protocol-outcome disagreement alone does not establish dishonesty.
  for (const initialScore of [0n, 10n]) {
    it(`terminal success has greater discounted score change than attributed failure from score ${initialScore}`, async () => {
      const payout = ethers.parseEther('100');
      const rounds = 3;
      const gamma = 0.9;
      const points = await engine.calculateReputationPoints(payout, 0);
      const maximum = await engine.MAX_REPUTATION();
      const percentage = await engine.validationRewardPercentage();
      const percentageScale = await engine.PERCENTAGE_SCALE();
      const registryAddress = await registry.getAddress();
      const agentSuccessChanges = [];
      const agentFailureChanges = [];
      const validatorSuccessChanges = [];
      const validatorFailureChanges = [];

      for (const actor of [
        successfulAgent,
        approvingValidator,
        failedAgent,
        disagreeingValidator,
      ]) {
        await engine.connect(caller).add(actor.address, initialScore);
        expect(await engine.reputationOf(actor.address)).to.equal(initialScore);
      }

      for (let index = 0; index < rounds; index++) {
        const successId = index * 2 + 1;
        const failureId = successId + 1;
        const agentBefore = await engine.reputationOf(successfulAgent.address);
        const validatorBefore = await engine.reputationOf(
          approvingValidator.address
        );
        const failedAgentBefore = await engine.reputationOf(
          failedAgent.address
        );
        const disagreeingBefore = await engine.reputationOf(
          disagreeingValidator.address
        );
        await openApprovedJob(successId, successfulAgent, approvingValidator);
        await openApprovedJob(failureId, failedAgent, disagreeingValidator);

        // Provisional approvals alone must not change either side's scores.
        expect(await engine.reputationOf(successfulAgent.address)).to.equal(
          agentBefore
        );
        expect(await engine.reputationOf(approvingValidator.address)).to.equal(
          validatorBefore
        );
        expect(await engine.reputationOf(failedAgent.address)).to.equal(
          failedAgentBefore
        );
        expect(
          await engine.reputationOf(disagreeingValidator.address)
        ).to.equal(disagreeingBefore);

        await registry.settle(
          successId,
          successfulAgent.address,
          true,
          false,
          payout
        );
        const expectedAgent = growth(agentBefore, points, maximum);
        const actualGain = expectedAgent - agentBefore;
        expect(await engine.reputationOf(successfulAgent.address)).to.equal(
          expectedAgent
        );
        expect(
          (await engine.jobAccounting(registryAddress, successId))
            .actualAgentGain
        ).to.equal(actualGain);
        agentSuccessChanges.push(Number(actualGain));

        await engine
          .connect(caller)
          .accountValidator(registryAddress, successId, 0);
        const validatorPoints = (actualGain * percentage) / percentageScale;
        const expectedValidator = growth(
          validatorBefore,
          validatorPoints,
          maximum
        );
        expect(await engine.reputationOf(approvingValidator.address)).to.equal(
          expectedValidator
        );
        validatorSuccessChanges.push(
          Number(expectedValidator - validatorBefore)
        );

        // Failure settles with no payout, applying the creation-time policy
        // to the assignment-time score instead of an arbitrary negative gain.
        const failure = await engine.jobAccounting(registryAddress, failureId);
        let expectedDebit =
          (failedAgentBefore * failure.penaltyBps + 9999n) / 10000n;
        if (expectedDebit > failure.penaltyCap)
          expectedDebit = failure.penaltyCap;
        expect(failure.maximumDebit).to.equal(expectedDebit);
        if (expectedDebit > failedAgentBefore)
          expectedDebit = failedAgentBefore;
        await registry.settle(failureId, failedAgent.address, false, true, 0);
        expect(await engine.reputationOf(failedAgent.address)).to.equal(
          failedAgentBefore - expectedDebit
        );
        agentFailureChanges.push(-Number(expectedDebit));

        await engine
          .connect(successfulAgent)
          .accountValidator(registryAddress, failureId, 0);
        const validatorDebit = disagreeingBefore > 0n ? 1n : 0n;
        expect(
          await engine.reputationOf(disagreeingValidator.address)
        ).to.equal(disagreeingBefore - validatorDebit);
        validatorFailureChanges.push(-Number(validatorDebit));
        expect(await engine.isBlacklisted(failedAgent.address)).to.equal(false);
        expect(
          await engine.isBlacklisted(disagreeingValidator.address)
        ).to.equal(false);
        expect(await engine.entropy(disagreeingValidator.address)).to.equal(0n);

        // Replays cannot improve the successful side or repeat a failure debit.
        await expect(
          registry.settle(
            successId,
            successfulAgent.address,
            true,
            false,
            payout
          )
        ).to.be.revertedWithCustomError(engine, 'InvalidJobAccountingState');
        await expect(
          registry.settle(failureId, failedAgent.address, false, true, 0)
        ).to.be.revertedWithCustomError(engine, 'InvalidJobAccountingState');
        for (const jobId of [successId, failureId]) {
          await expect(
            engine.accountValidator(registryAddress, jobId, 0)
          ).to.be.revertedWithCustomError(engine, 'ValidatorAlreadyAccounted');
        }
        for (const actor of [
          successfulAgent,
          approvingValidator,
          failedAgent,
          disagreeingValidator,
        ]) {
          expect(await engine.reputationOf(actor.address)).to.be.lte(maximum);
        }
      }

      expect(discount(agentSuccessChanges, gamma)).to.be.gt(
        discount(agentFailureChanges, gamma)
      );
      expect(discount(validatorSuccessChanges, gamma)).to.be.gt(
        discount(validatorFailureChanges, gamma)
      );
      expect(agentSuccessChanges.every((delta) => delta > 0)).to.equal(true);
      // Floor-rounded marginal gains may be zero at positive reputation.
      expect(validatorSuccessChanges.every((delta) => delta >= 0)).to.equal(
        true
      );
      if (initialScore > 0n) {
        expect(agentFailureChanges.every((delta) => delta < 0)).to.equal(true);
        expect(validatorFailureChanges.every((delta) => delta === -1)).to.equal(
          true
        );
      }
    });
  }
});
