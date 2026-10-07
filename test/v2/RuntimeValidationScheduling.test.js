const { expect } = require('chai');
const { ethers } = require('hardhat');
const { MetaOrchestrator } = require('../../apps/orchestrator/service');
const {
  prepareValidationCommitment,
} = require('../../shared/validationProtocol');
const audit = require('../../apps/orchestrator/audit');

function schedulerFixture(failingRead) {
  const validator = '0x0000000000000000000000000000000000000001';
  const key = `1:${validator}`;
  let commitment = ethers.ZeroHash;
  let readFails = true;
  const calls = { commit: 0, reveal: 0 };
  const writer = {
    commitValidation: async (_jobId, hash) => {
      calls.commit++;
      commitment = hash;
      return {
        hash: ethers.id('commit transaction'),
        wait: async () => ({ status: 1 }),
      };
    },
    revealValidation: async () => {
      calls.reveal++;
      throw new Error('reveal response lost after possible broadcast');
    },
  };
  const state = Object.assign(Object.create(MetaOrchestrator.prototype), {
    provider: {
      getNetwork: async () => ({ chainId: 31337n }),
      getBlock: async () => {
        if (failingRead === 'block' && readFails)
          throw new Error('temporary block RPC error');
        return { timestamp: 150 };
      },
    },
    validationModule: {
      jobNonce: async () => 1n,
      DOMAIN_SEPARATOR: async () => ethers.id('validation module domain'),
      commitments: async () => commitment,
      rounds: async () => {
        if (failingRead === 'round' && readFails)
          throw new Error('temporary round RPC error');
        return { commitDeadline: 100n, revealDeadline: 200n };
      },
      connect: () => writer,
    },
    registry: {
      getSpecHash: async () => ethers.id('spec'),
      burnEvidenceStatus: async () => [false, true],
    },
    config: {},
    commits: new Map(),
    commitTimers: new Map(),
    appliedJobs: new Map(),
    validationContext: async () => ({
      classification: { category: 'research' },
      spec: null,
    }),
    clearReviewTimer: () => {},
  });
  return {
    state,
    calls,
    key,
    identity: {
      address: validator,
      label: 'validator',
      wallet: { connect: () => ({}) },
    },
    recover: () => {
      readFails = false;
    },
  };
}

describe('Runtime validation scheduling and bounded burn history', function () {
  for (const failingRead of ['round', 'block']) {
    it(`retains a scheduling retry after a mined commit and a failed ${failingRead} read without resending transactions`, async () => {
      const previous = {
        timeout: global.setTimeout,
        clear: global.clearTimeout,
        log: audit.auditLog,
        error: console.error,
      };
      const timers = [];
      const events = [];
      global.setTimeout = (callback, delay) => {
        const timer = { callback, delay, cleared: false };
        timers.push(timer);
        return timer;
      };
      global.clearTimeout = (timer) => {
        if (timer) timer.cleared = true;
      };
      audit.auditLog = (event) => events.push(event);
      console.error = () => {};
      const { state, calls, key, identity, recover } =
        schedulerFixture(failingRead);
      try {
        await state.commitValidation(1n, identity);
        expect(calls.commit).to.equal(1);
        const saved = state.commits.get(key);
        expect(saved.salt).to.match(/^0x[0-9a-f]{64}$/);
        expect(state.commitTimers.has(key)).to.equal(true);
        expect(timers).to.have.length(1);
        expect(timers[0].delay).to.equal(5000);
        expect(events).to.include('validator.reveal_schedule_retry');
        await state.commitValidation(1n, identity);
        expect(calls.commit).to.equal(1);
        recover();
        timers[0].callback();
        await new Promise(setImmediate);
        expect(state.commits.get(key)).to.equal(saved);
        expect(timers).to.have.length(2);
        expect(timers[1].delay).to.equal(0);
        timers[1].callback();
        await new Promise(setImmediate);
        expect(calls.reveal).to.equal(1);
        expect(state.commitTimers.size).to.equal(0);
        expect(state.commits.get(key)).to.equal(saved);
        timers[0].callback();
        timers[1].callback();
        await new Promise(setImmediate);
        expect(calls).to.deep.equal({ commit: 1, reveal: 1 });
        expect(timers).to.have.length(2);
      } finally {
        global.setTimeout = previous.timeout;
        global.clearTimeout = previous.clear;
        audit.auditLog = previous.log;
        console.error = previous.error;
      }
    });
  }

  it('retains secrets and stops read retries at the configured retry bound or a closed reveal window', async () => {
    const previous = { timeout: global.setTimeout, log: audit.auditLog };
    const events = [];
    global.setTimeout = () => {
      throw new Error('No timer may be armed');
    };
    audit.auditLog = (event) => events.push(event);
    const { state, key, identity, recover } = schedulerFixture('round');
    const saved = { salt: ethers.id('saved secret') };
    state.commits.set(key, saved);
    try {
      await state.scheduleValidationReveal(1n, identity, 12);
      expect(state.commitTimers.size).to.equal(0);
      expect(state.commits.get(key)).to.equal(saved);
      recover();
      state.provider.getBlock = async () => ({ timestamp: 200 });
      await state.scheduleValidationReveal(1n, identity);
      expect(state.commitTimers.size).to.equal(0);
      expect(events).to.deep.equal([
        'validator.reveal_schedule_reconciliation_required',
        'validator.reveal_schedule_reconciliation_required',
      ]);
    } finally {
      global.setTimeout = previous.timeout;
      audit.auditLog = previous.log;
    }
  });

  it('never rearms an in-flight scheduler after its commit state has been cleared', async () => {
    const { state, key, identity, recover } = schedulerFixture('round');
    recover();
    let resolveRound;
    state.validationModule.rounds = () =>
      new Promise((resolve) => {
        resolveRound = resolve;
      });
    state.commits.set(key, { salt: ethers.id('stopped secret') });
    const scheduling = state.scheduleValidationReveal(1n, identity);
    state.commits.clear();
    resolveRound({ commitDeadline: 100n, revealDeadline: 200n });
    await scheduling;
    expect(state.commitTimers.size).to.equal(0);
  });

  function burnFixture(queryFilter) {
    const receipt = ethers.id('confirmed employer burn');
    return {
      receipt,
      validation: {
        jobNonce: async () => 1n,
        DOMAIN_SEPARATOR: async () => ethers.id('domain'),
        commitments: async () => ethers.ZeroHash,
      },
      registry: {
        getSpecHash: async () => ethers.id('spec'),
        burnEvidenceStatus: async () => [true, true],
        filters: { BurnConfirmed: () => 'burn-filter' },
        queryFilter,
        hasBurnReceipt: async (_jobId, hash) => hash === receipt,
      },
      provider: {
        getNetwork: async () => ({ chainId: 31337n }),
        getBlockNumber: async () => 12000,
      },
    };
  }

  it('finds old confirmed burn evidence with bounded ranges and no history cutoff', async () => {
    const ranges = [];
    const fixture = burnFixture(async (_filter, from, to) => {
      expect(Number.isSafeInteger(from) && Number.isSafeInteger(to)).to.equal(
        true
      );
      expect(to - from + 1).to.be.at.most(2000);
      ranges.push([from, to]);
      return from <= 5 && to >= 5 ? [{ args: [1n, fixture.receipt] }] : [];
    });
    const vote = await prepareValidationCommitment(
      fixture.validation,
      fixture.registry,
      fixture.provider,
      1n,
      ethers.ZeroAddress,
      true,
      ethers.id('salt')
    );
    expect(vote.burnTxHash).to.equal(fixture.receipt);
    expect(ranges).to.have.length(6);
    expect(ranges[0]).to.deep.equal([10001, 12000]);
    expect(ranges[5]).to.deep.equal([1, 2000]);
    for (let i = 1; i < ranges.length; i++)
      expect(ranges[i][1]).to.equal(ranges[i - 1][0] - 1);
  });

  it('shrinks provider-limited pages without skipping blocks and rejects unreadable evidence', async () => {
    const ranges = [];
    const fixture = burnFixture(async (_filter, from, to) => {
      ranges.push([from, to]);
      if (to - from + 1 > 500) throw new Error('provider range limit');
      return [{ args: [1n, fixture.receipt] }];
    });
    const vote = await prepareValidationCommitment(
      fixture.validation,
      fixture.registry,
      fixture.provider,
      1n,
      ethers.ZeroAddress,
      true,
      ethers.id('salt')
    );
    expect(vote.burnTxHash).to.equal(fixture.receipt);
    expect(ranges).to.deep.equal([
      [10001, 12000],
      [11001, 12000],
      [11501, 12000],
    ]);
    let requests = 0;
    fixture.registry.queryFilter = async () => {
      requests++;
      throw new Error('archive page unavailable');
    };
    await expect(
      prepareValidationCommitment(
        fixture.validation,
        fixture.registry,
        fixture.provider,
        1n,
        ethers.ZeroAddress,
        true,
        ethers.id('salt')
      )
    ).to.be.rejectedWith('archive page unavailable');
    expect(requests).to.be.at.most(12);
  });
});
