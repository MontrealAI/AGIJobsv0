const { expect } = require('chai');
const { ethers } = require('hardhat');
const { AGIALPHA } = require('../../scripts/constants');
const {
  readProviderConfiguration,
  deployProviderAgnostic,
} = require('../../scripts/deploy/providerAgnosticDeploy');

describe('Provider-agnostic deployment configuration', function () {
  it('normalizes explicit duration units and exact numeric seconds before deployment', function () {
    const config = readProviderConfiguration(18, {
      COMMIT_WINDOW: '30m',
      REVEAL_WINDOW: '1h 30m',
      DISPUTE_WINDOW: '86400',
      MIN_STAKE: '1.25',
      JOB_STAKE: '0.5',
      JOB_FEE_PCT: '0.02',
    });
    expect(
      readProviderConfiguration(18, { COMMIT_WINDOW: '9007199254740971' })
        .commitWindow
    ).to.equal(9007199254740971);
    expect(config.commitWindow).to.equal(1800);
    expect(config.revealWindow).to.equal(5400);
    expect(config.disputeWindow).to.equal(86400);
    expect(config.minStake).to.equal(ethers.parseEther('1.25'));
    expect(config.jobStake).to.equal(ethers.parseEther('0.5'));
    expect(config.feePct).to.equal(2);
    expect(
      readProviderConfiguration(18, { COMMIT_WINDOW: '0.5m' }).commitWindow
    ).to.equal(30);
  });

  it('rejects malformed, rounded, unsafe and out-of-range settings', function () {
    for (const env of [
      { COMMIT_WINDOW: '30m trailing' },
      { REVEAL_WINDOW: '0.1s' },
      { DISPUTE_WINDOW: '-1' },
      { COMMIT_WINDOW: '9007199254740992' },
      { COMMIT_WINDOW: '' },
      { MIN_VALIDATORS: 'NaN' },
      { MIN_VALIDATORS: '2' },
      { MIN_VALIDATORS: '4', MAX_VALIDATORS: '3' },
      { MAX_VALIDATORS: '9007199254740992' },
      { JOB_STAKE: '-1' },
      { DISPUTE_FEE: '1.0000000000000000001' },
      { EMPLOYER_SLASH_PCT: '1', TREASURY_SLASH_PCT: '100' },
    ]) {
      expect(
        () => readProviderConfiguration(18, env),
        JSON.stringify(env)
      ).to.throw();
    }
  });

  for (const [key, value] of [
    ['COMMIT_WINDOW', '30m trailing'],
    ['MAX_VALIDATORS', '2'],
  ]) {
    it(`rejects invalid ${key} before any transaction or local token mutation`, async function () {
      const previous = process.env[key];
      process.env[key] = value;
      try {
        const [deployer] = await ethers.getSigners();
        const before = {
          nonce: await ethers.provider.getTransactionCount(deployer.address),
          block: await ethers.provider.getBlockNumber(),
          token: await ethers.provider.getCode(AGIALPHA),
        };
        let error;
        try {
          await deployProviderAgnostic();
        } catch (caught) {
          error = caught;
        }
        expect(error).to.be.instanceOf(Error);
        expect(error.message).to.include(
          key === 'COMMIT_WINDOW' ? 'commitWindow' : key
        );
        expect(
          await ethers.provider.getTransactionCount(deployer.address)
        ).to.equal(before.nonce);
        expect(await ethers.provider.getBlockNumber()).to.equal(before.block);
        expect(await ethers.provider.getCode(AGIALPHA)).to.equal(before.token);
      } finally {
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
      }
    });
  }
});
