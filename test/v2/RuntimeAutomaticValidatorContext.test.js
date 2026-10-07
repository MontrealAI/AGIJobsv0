const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Automatic validator context recovery', function () {
  let utils, gateway, storage, identity, staking, security, telemetry, energy;
  let originals,
    timers,
    calls,
    body,
    fetchFailure,
    rpcFailure,
    selectionFailure,
    scopeDeadline;
  const address = '0x0000000000000000000000000000000000000001';
  const submission = {
    jobId: '927301',
    worker: ethers.ZeroAddress,
    resultHash: ethers.id('result'),
    resultURI: 'data:text/plain,result',
    receivedAt: '2026-10-07T00:00:00.000Z',
  };

  beforeEach(() => {
    const env = {
      JOB_REGISTRY_ADDRESS: process.env.JOB_REGISTRY_ADDRESS,
      VALIDATION_MODULE_ADDRESS: process.env.VALIDATION_MODULE_ADDRESS,
      KEYSTORE_URL: process.env.KEYSTORE_URL,
    };
    Object.assign(process.env, {
      JOB_REGISTRY_ADDRESS: ethers.ZeroAddress,
      VALIDATION_MODULE_ADDRESS: ethers.ZeroAddress,
      KEYSTORE_URL: 'http://127.0.0.1:1',
    });
    try {
      utils = require('../../agent-gateway/utils');
      storage = require('../../agent-gateway/validationStore');
      identity = require('../../agent-gateway/identity');
      staking = require('../../agent-gateway/stakeCoordinator');
      security = require('../../agent-gateway/security');
      telemetry = require('../../agent-gateway/telemetry');
      energy = require('../../shared/energyMonitor');
      gateway = require('../../agent-gateway/validator');
    } finally {
      for (const [key, value] of Object.entries(env)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    originals = {
      registry: utils.registry,
      validation: utils.validation,
      provider: utils.provider,
      walletManager: utils.walletManager,
      load: storage.loadCommitRecord,
      update: storage.updateCommitRecord,
      begin: storage.beginCommitRecord,
      identity: identity.ensureIdentity,
      stake: staking.ensureStake,
      log: security.secureLogAction,
      publish: telemetry.publishEnergySample,
      flow: telemetry.recordValidationFlowMetrics,
      start: energy.startEnergySpan,
      end: energy.endEnergySpan,
      fetch: global.fetch,
      setTimeout: global.setTimeout,
      clearTimeout: global.clearTimeout,
      warn: console.warn,
      error: console.error,
    };
    gateway.clearValidatorState();
    timers = [];
    calls = { stake: 0, writes: 0, fetch: 0 };
    body = JSON.stringify({
      category: 'research',
      title: 'Approved public research',
    });
    fetchFailure = false;
    rpcFailure = false;
    selectionFailure = false;
    scopeDeadline = 2000n;
    global.setTimeout = (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    };
    global.clearTimeout = (timer) => {
      if (timer) timer.cleared = true;
    };
    console.warn = () => {};
    console.error = () => {};
    utils.provider = {
      getBlockNumber: async () => {
        if (rpcFailure) throw new Error('temporary RPC unavailable');
        return 100;
      },
      getBlock: async () => {
        if (selectionFailure)
          throw new Error('temporary round snapshot unavailable');
        return {
          number: 100,
          hash: ethers.id('canonical block'),
          timestamp: 1000,
        };
      },
      getNetwork: async () => ({ chainId: 31337n }),
    };
    const write = () => {
      calls.writes++;
      throw new Error('Unexpected transaction or stored vote');
    };
    utils.validation = {
      getAddress: async () => ethers.ZeroAddress,
      rounds: async () => ({
        commitDeadline: scopeDeadline,
        revealDeadline: scopeDeadline + 60n,
        tallied: false,
      }),
      jobNonce: async () => 1n,
      DOMAIN_SEPARATOR: async () => ethers.id('domain'),
      connect: write,
    };
    utils.registry = {
      filters: { JobCreated: () => ({}) },
      queryFilter: async () => [
        {
          args: {
            specHash: ethers.id(body),
            uri: 'https://ipfs.io/ipfs/contextFixture',
          },
        },
      ],
      getSpecHash: async () => ethers.id(body),
      connect: write,
    };
    utils.walletManager = { list: () => [address], get: () => ({ address }) };
    identity.ensureIdentity = async () => ({
      address,
      label: 'validator',
      role: 'validator',
    });
    storage.loadCommitRecord = () => null;
    storage.beginCommitRecord = write;
    storage.updateCommitRecord = write;
    staking.ensureStake = async () => {
      calls.stake++;
      throw new Error('TEST_STAKE_BOUNDARY');
    };
    security.secureLogAction = async () => {};
    telemetry.publishEnergySample = async () => {};
    telemetry.recordValidationFlowMetrics = () => {};
    energy.startEnergySpan = () => ({});
    energy.endEnergySpan = async () => ({});
    global.fetch = async () => {
      calls.fetch++;
      if (fetchFailure) throw new Error('temporary IPFS gateway unavailable');
      return new Response(body);
    };
  });

  afterEach(() => {
    gateway.clearValidatorState();
    Object.assign(utils, {
      registry: originals.registry,
      validation: originals.validation,
      provider: originals.provider,
      walletManager: originals.walletManager,
    });
    storage.loadCommitRecord = originals.load;
    storage.updateCommitRecord = originals.update;
    storage.beginCommitRecord = originals.begin;
    identity.ensureIdentity = originals.identity;
    staking.ensureStake = originals.stake;
    security.secureLogAction = originals.log;
    telemetry.publishEnergySample = originals.publish;
    telemetry.recordValidationFlowMetrics = originals.flow;
    energy.startEnergySpan = originals.start;
    energy.endEnergySpan = originals.end;
    global.fetch = originals.fetch;
    global.setTimeout = originals.setTimeout;
    global.clearTimeout = originals.clearTimeout;
    console.warn = originals.warn;
    console.error = originals.error;
  });
  const active = () => gateway.listValidatorAssignments().active[0];
  async function runRetry() {
    const timer = timers.find(
      (entry) => entry.delay === 5000 && !entry.cleared
    );
    expect(timer, 'bounded context/selection retry').to.exist;
    timer.cleared = true;
    timer.callback();
    for (let i = 0; i < 30; i++) await new Promise(setImmediate);
  }
  async function start() {
    await gateway.handleValidatorSelection(submission.jobId, [address]);
    await gateway.handleJobAwaitingValidation(submission);
  }

  for (const source of ['RPC', 'IPFS']) {
    it(`retries a transient ${source} lookup before reaching the stake boundary`, async () => {
      if (source === 'RPC') rpcFailure = true;
      else fetchFailure = true;
      await start();
      expect(active().status).to.equal('context-retry');
      expect(active().attempts).to.equal(0);
      expect(calls.stake).to.equal(0);
      expect(calls.writes).to.equal(0);
      rpcFailure = false;
      fetchFailure = false;
      await runRetry();
      expect(calls.stake).to.equal(1);
      expect(active().attempts).to.equal(1);
      expect(active().status).not.to.equal('awaiting-review');
      expect(calls.writes).to.equal(0);
    });
  }

  it('retries failed selection snapshots without requiring a second chain event', async () => {
    selectionFailure = true;
    await start();
    expect(active().status).to.equal('context-retry');
    expect(calls.stake).to.equal(0);
    selectionFailure = false;
    await runRetry();
    expect(calls.stake).to.equal(1);
    expect(calls.writes).to.equal(0);
  });

  it('bounds context retries while a confirmed fresh round gets a fresh budget', async () => {
    fetchFailure = true;
    await start();
    await runRetry();
    await runRetry();
    expect(active().status).to.equal('failed');
    expect(
      timers.filter((entry) => entry.delay === 5000 && !entry.cleared)
    ).to.have.length(0);
    await gateway.handleJobAwaitingValidation(submission);
    await gateway.handleValidatorSelection(submission.jobId, [address]);
    expect(calls.fetch).to.equal(3);
    expect(calls.stake).to.equal(0);
    scopeDeadline += 100n;
    fetchFailure = false;
    await gateway.handleValidatorSelection(submission.jobId, [address]);
    expect(calls.stake).to.equal(1);
    expect(active().attempts).to.equal(1);
  });

  it('keeps verified independent review and modified specification bytes out of the retry loop', async () => {
    body = JSON.stringify({ category: 'computer-work' });
    await start();
    expect(active().status).to.equal('awaiting-review');
    expect(
      timers.filter((entry) => entry.delay === 5000 && !entry.cleared)
    ).to.have.length(0);
    gateway.clearValidatorState();
    global.fetch = async () =>
      new Response(JSON.stringify({ category: 'research' }));
    await start();
    expect(active().status).to.equal('reconciliation-required');
    expect(calls.stake).to.equal(0);
    expect(calls.writes).to.equal(0);
  });

  for (const action of ['completion', 'clear']) {
    it(`cancels pending context continuations after ${action}`, async () => {
      fetchFailure = true;
      await start();
      const timer = timers.find(
        (entry) => entry.delay === 5000 && !entry.cleared
      );
      if (action === 'completion')
        gateway.handleJobCompletionForValidators(submission.jobId);
      else gateway.clearValidatorState();
      expect(timer.cleared).to.equal(true);
      fetchFailure = false;
      timer.callback();
      for (let i = 0; i < 10; i++) await new Promise(setImmediate);
      expect(calls.stake).to.equal(0);
      expect(calls.writes).to.equal(0);
      expect(gateway.listValidatorAssignments().active).to.have.length(0);
    });
  }
});
