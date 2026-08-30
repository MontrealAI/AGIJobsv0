require('ts-node').register({
  project: require('path').resolve(
    __dirname,
    '../../agent-gateway/tsconfig.json'
  ),
  transpileOnly: true,
  compilerOptions: { module: 'commonjs' },
});
const { expect } = require('chai');

describe('memory cleanup', function () {
  let utils;
  const dummyAddress = '0x0000000000000000000000000000000000000001';
  const sampleJob = {
    jobId: '1',
    employer: '0x0000000000000000000000000000000000000000',
    agent: '0x0000000000000000000000000000000000000000',
    rewardRaw: '0',
    reward: '0',
    stakeRaw: '0',
    stake: '0',
    feeRaw: '0',
    fee: '0',
  };

  before(() => {
    process.env.JOB_REGISTRY_ADDRESS = dummyAddress;
    process.env.VALIDATION_MODULE_ADDRESS = dummyAddress;
    process.env.KEYSTORE_URL = 'http://localhost';
    utils = require('../../agent-gateway/utils');
  });

  afterEach(() => {
    utils.pendingJobs.clear();
    utils.commits.clear();
    utils.jobTimestamps.clear();
    utils.expiryTimers.forEach((t) => clearTimeout(t));
    utils.finalizeTimers.forEach((t) => clearTimeout(t));
    utils.expiryTimers.clear();
    utils.finalizeTimers.clear();
  });

  it('removes entries on JobCompleted', () => {
    utils.pendingJobs.set('agent1', [sampleJob]);
    utils.commits.set('1', { [dummyAddress]: { approve: true, salt: '0x' } });
    utils.jobTimestamps.set('1', Date.now());

    utils.cleanupJob('1');
    utils.jobTimestamps.delete('1');
    expect(utils.pendingJobs.get('agent1')).to.be.empty;
    expect(utils.commits.has('1')).to.equal(false);
    expect(utils.jobTimestamps.has('1')).to.equal(false);
  });

  it('sweeps stale entries', () => {
    utils.pendingJobs.set('agent1', [sampleJob]);
    utils.commits.set('1', { [dummyAddress]: { approve: true, salt: '0x' } });
    utils.jobTimestamps.set('1', 0);

    utils.sweepStaleJobs(Date.now());
    expect(utils.pendingJobs.get('agent1')).to.be.empty;
    expect(utils.commits.has('1')).to.equal(false);
    expect(utils.jobTimestamps.has('1')).to.equal(false);
  });

  it('clears timers on cleanupJob', () => {
    utils.expiryTimers.set(
      '1',
      setTimeout(() => {}, 1000)
    );
    utils.finalizeTimers.set(
      '1',
      setTimeout(() => {}, 1000)
    );

    utils.cleanupJob('1');

    expect(utils.expiryTimers.has('1')).to.equal(false);
    expect(utils.finalizeTimers.has('1')).to.equal(false);
  });

  it('clears timers on expireJob', async () => {
    utils.expiryTimers.set(
      '1',
      setTimeout(() => {}, 1000)
    );
    utils.finalizeTimers.set(
      '1',
      setTimeout(() => {}, 1000)
    );

    utils.automationWallet = undefined;
    await utils.expireJob('1');

    expect(utils.expiryTimers.has('1')).to.equal(false);
    expect(utils.finalizeTimers.has('1')).to.equal(false);
  });

  it('clears timers on finalizeJob', async () => {
    utils.expiryTimers.set(
      '1',
      setTimeout(() => {}, 1000)
    );
    utils.finalizeTimers.set(
      '1',
      setTimeout(() => {}, 1000)
    );

    utils.automationWallet = undefined;
    await utils.finalizeJob('1');

    expect(utils.expiryTimers.has('1')).to.equal(false);
    expect(utils.finalizeTimers.has('1')).to.equal(false);
  });
});
