const { expect } = require('chai');
const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const isolatedValidationStore = require('../helpers/validation-store.cjs');
const { VALIDATION_PROTOCOL_ABI } = require('../../shared/validationProtocol');

async function setupChain() {
  const [owner, employer, v1, v2, v3, v4] = await ethers.getSigners();
  const spec = JSON.stringify({
    category: 'research',
    title: 'Public integrity rehearsal',
  });
  const payload = JSON.stringify({
    success: true,
    finding: 'Reproducible public fixture',
  });
  const specUri = 'ipfs://automaticLifecycleSpec';
  const resultUri = `data:application/json,${encodeURIComponent(payload)}`;
  const stake = await (
    await ethers.getContractFactory('MockStakeManager')
  ).deploy();
  const registryFactory = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const registry = await registryFactory.deploy(
    ethers.ZeroAddress,
    await stake.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    owner.address,
    await deployImplementations('JobRegistry', registryFactory.runner)
  );
  const workerIdentity = await (
    await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    )
  ).deploy();
  await workerIdentity.setResult(true);
  await registry.setIdentityRegistry(await workerIdentity.getAddress());
  await registry
    .connect(employer)
    .createJob(1, (await time.latest()) + 3600, ethers.id(spec), specUri);
  await registry.connect(owner).applyForJob(1, 'worker', []);
  await registry
    .connect(owner)
    .submit(1, ethers.id(payload), resultUri, 'worker', []);
  const factory = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const validation = await factory.deploy(
    await registry.getAddress(),
    await stake.getAddress(),
    60,
    60,
    3,
    3,
    [],
    await deployImplementations('ValidationModule', factory.runner)
  );
  const identity = await (
    await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    )
  ).deploy();
  await validation.setIdentityRegistry(await identity.getAddress());
  for (const signer of [v1, v2, v3, v4]) {
    await identity.addAdditionalValidator(signer.address);
    await stake.setStake(signer.address, 1, ethers.parseEther('100'));
  }
  await validation.setValidatorPool([v1.address, v2.address, v3.address]);
  async function select() {
    await validation.connect(v1).selectValidators(1, 0);
    const target = await validation.selectionBlock(1);
    await validation.connect(v2).selectValidators(1, 1);
    while (BigInt(await ethers.provider.getBlockNumber()) <= target)
      await ethers.provider.send('evm_mine', []);
    await validation.connect(v1).selectValidators(1, 0);
  }
  await select();
  return {
    registry,
    validation,
    select,
    rotateCommittee: async (includeValidator) => {
      await validation.resetJobNonce(1);
      await validation.setValidatorPool([
        (includeValidator ? v1 : v4).address,
        v2.address,
        v3.address,
      ]);
      await select();
    },
    v1,
    spec,
    client: new ethers.Contract(
      await validation.getAddress(),
      VALIDATION_PROTOCOL_ABI,
      ethers.provider
    ),
    submission: {
      jobId: '1',
      worker: owner.address,
      resultHash: ethers.id(payload),
      resultURI: resultUri,
      subdomain: 'worker',
      receivedAt: '2026-10-07T00:00:00.000Z',
    },
  };
}

describe('Automatic validator real-contract lifecycle', function () {
  let chain,
    utils,
    gateway,
    storage,
    isolated,
    identity,
    staking,
    security,
    telemetry,
    energy,
    training;
  let originals,
    timers,
    calls,
    revealMode,
    failedRoundReads,
    auditRelease,
    auditStarted;
  beforeEach(async () => {
    chain = await setupChain();
    const values = {
      JOB_REGISTRY_ADDRESS: await chain.registry.getAddress(),
      VALIDATION_MODULE_ADDRESS: await chain.validation.getAddress(),
      KEYSTORE_URL: 'http://127.0.0.1:1',
    };
    const env = Object.fromEntries(
      Object.keys(values).map((key) => [key, process.env[key]])
    );
    Object.assign(process.env, values);
    try {
      utils = require('../../agent-gateway/utils');
      storage = require('../../agent-gateway/validationStore');
      identity = require('../../agent-gateway/identity');
      staking = require('../../agent-gateway/stakeCoordinator');
      security = require('../../agent-gateway/security');
      telemetry = require('../../agent-gateway/telemetry');
      energy = require('../../shared/energyMonitor');
      training = require('../../shared/trainingRecords');
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
      agents: new Map(utils.agents),
      load: storage.loadCommitRecord,
      begin: storage.beginCommitRecord,
      update: storage.updateCommitRecord,
      identity: identity.ensureIdentity,
      stake: staking.ensureStake,
      log: security.secureLogAction,
      publish: telemetry.publishEnergySample,
      flow: telemetry.recordValidationFlowMetrics,
      start: energy.startEnergySpan,
      end: energy.endEnergySpan,
      training: training.appendTrainingRecord,
      fetch: global.fetch,
      setTimeout: global.setTimeout,
      clearTimeout: global.clearTimeout,
      warn: console.warn,
      error: console.error,
    };
    gateway.clearValidatorState();
    isolated = isolatedValidationStore();
    storage.loadCommitRecord = isolated.store.loadCommitRecord;
    storage.beginCommitRecord = isolated.store.beginCommitRecord;
    storage.updateCommitRecord = isolated.store.updateCommitRecord;
    timers = [];
    calls = { commit: 0, reveal: 0, stake: 0, pendingReveal: null };
    revealMode = 'normal';
    failedRoundReads = 0;
    auditRelease = null;
    auditStarted = false;
    global.setTimeout = (callback, delay, ...args) => {
      if (new Error().stack.includes('/agent-gateway/validator.ts')) {
        const timer = {
          callback: () => callback(...args),
          delay,
          cleared: false,
          gatewayTimer: true,
        };
        timers.push(timer);
        return timer;
      }
      return originals.setTimeout(callback, delay, ...args);
    };
    global.clearTimeout = (timer) => {
      if (timer?.gatewayTimer) timer.cleared = true;
      else originals.clearTimeout(timer);
    };
    console.warn = () => {};
    console.error = () => {};
    utils.registry = chain.registry;
    utils.provider = ethers.provider;
    utils.validation = {
      runner: chain.client.runner,
      getAddress: () => chain.client.getAddress(),
      jobNonce: chain.client.jobNonce,
      DOMAIN_SEPARATOR: chain.client.DOMAIN_SEPARATOR,
      commitments: chain.client.commitments,
      revealed: chain.client.revealed,
      validators: chain.client.validators,
      rounds: async (...args) => {
        if (failedRoundReads > 0) {
          failedRoundReads--;
          throw new Error('temporary round RPC failure');
        }
        return chain.client.rounds(...args);
      },
      connect: (signer) => ({
        commitValidation: async (...args) => {
          calls.commit++;
          return chain.client.connect(signer).commitValidation(...args);
        },
        revealValidation: async (...args) => {
          calls.reveal++;
          if (revealMode === 'unknown') {
            calls.pendingReveal = args;
            throw new Error('unknown reveal response');
          }
          return chain.client.connect(signer).revealValidation(...args);
        },
      }),
    };
    utils.walletManager = {
      list: () => [chain.v1.address],
      get: () => chain.v1,
    };
    utils.agents.clear();
    identity.ensureIdentity = async () => ({
      address: chain.v1.address,
      label: 'validator',
      ensName: 'validator.club.agi.eth',
      role: 'validator',
    });
    staking.ensureStake = async () => {
      calls.stake++;
    };
    security.secureLogAction = async () => {};
    telemetry.publishEnergySample = async () => {};
    telemetry.recordValidationFlowMetrics = () => {};
    energy.startEnergySpan = () => ({});
    energy.endEnergySpan = async () => ({});
    training.appendTrainingRecord = async () => {};
    global.fetch = async (url) => {
      expect(String(url)).to.equal(
        'https://ipfs.io/ipfs/automaticLifecycleSpec'
      );
      return new Response(chain.spec);
    };
  });
  afterEach(async () => {
    if (auditRelease) auditRelease();
    gateway.clearValidatorState();
    await new Promise(setImmediate);
    Object.assign(utils, {
      registry: originals.registry,
      validation: originals.validation,
      provider: originals.provider,
      walletManager: originals.walletManager,
    });
    utils.agents.clear();
    for (const [key, value] of originals.agents) utils.agents.set(key, value);
    storage.loadCommitRecord = originals.load;
    storage.beginCommitRecord = originals.begin;
    storage.updateCommitRecord = originals.update;
    identity.ensureIdentity = originals.identity;
    staking.ensureStake = originals.stake;
    security.secureLogAction = originals.log;
    telemetry.publishEnergySample = originals.publish;
    telemetry.recordValidationFlowMetrics = originals.flow;
    energy.startEnergySpan = originals.start;
    energy.endEnergySpan = originals.end;
    training.appendTrainingRecord = originals.training;
    global.fetch = originals.fetch;
    global.setTimeout = originals.setTimeout;
    global.clearTimeout = originals.clearTimeout;
    console.warn = originals.warn;
    console.error = originals.error;
    isolated.cleanup();
  });
  const active = () => gateway.listValidatorAssignments().active[0];
  const record = () => isolated.store.loadCommitRecord('1', chain.v1.address);
  async function waitFor(predicate, label = 'automatic continuation') {
    for (let i = 0; i < 400; i++) {
      if (await predicate()) return;
      await new Promise((resolve) => originals.setTimeout(resolve, 5));
    }
    throw new Error(`Timed out: ${label}; active=${JSON.stringify(active())}`);
  }
  function timerWithDelay(predicate) {
    const timer = timers.find(
      (entry) => !entry.cleared && predicate(entry.delay)
    );
    expect(timer, 'scheduled validator continuation').to.exist;
    return timer;
  }
  function fire(timer) {
    timer.cleared = true;
    timer.callback();
  }
  async function start(submissionFirst = false) {
    if (submissionFirst)
      await gateway.handleJobAwaitingValidation(chain.submission);
    await gateway.handleValidatorSelection('1', [chain.v1.address]);
    if (!submissionFirst)
      await gateway.handleJobAwaitingValidation(chain.submission);
    expect(active().status, active().error).to.equal('committed');
  }
  async function openReveal() {
    await time.increaseTo((await chain.client.rounds(1)).commitDeadline + 1n);
  }

  it('discards an old selection retry after a real committee rotation and later rejoins', async () => {
    failedRoundReads = 1;
    await gateway.handleValidatorSelection('1', [chain.v1.address]);
    await gateway.handleJobAwaitingValidation(chain.submission);
    expect(active().status).to.equal('context-retry');
    await chain.rotateCommittee(false);
    expect(await chain.client.validators(1)).not.to.include(chain.v1.address);
    fire(timerWithDelay((delay) => delay === 5000));
    await waitFor(() => active().status === 'not-selected');
    expect(active().error).to.equal('VALIDATION_VALIDATOR_NOT_SELECTED');
    expect(record()).to.equal(null);
    expect(calls.stake).to.equal(0);
    expect(calls.commit).to.equal(0);
    expect(
      timers.filter(
        (timer) => !timer.cleared && [5000, 15000].includes(timer.delay)
      )
    ).to.have.length(0);
    await gateway.handleJobAwaitingValidation(chain.submission);
    expect(record()).to.equal(null);
    await chain.rotateCommittee(true);
    await gateway.handleValidatorSelection('1', [chain.v1.address]);
    expect(active().status, active().error).to.equal('committed');
    expect(record().metadata.automaticCommitStatus).to.equal('confirmed');
    expect(calls.commit).to.equal(1);
  });

  for (const delayed of ['selection', 'submission', 'audit']) {
    it(`does not poison future rounds when ${delayed} processing passes the commit deadline`, async () => {
      if (delayed === 'selection') {
        await gateway.handleJobAwaitingValidation(chain.submission);
        await openReveal();
        await gateway.handleValidatorSelection('1', [chain.v1.address]);
      } else {
        await gateway.handleValidatorSelection('1', [chain.v1.address]);
        if (delayed === 'submission') await openReveal();
        else {
          security.secureLogAction = async (entry) => {
            if (entry.action === 'evaluate') await openReveal();
          };
        }
        await gateway.handleJobAwaitingValidation(chain.submission);
      }
      expect(active().error).to.equal('VALIDATION_COMMIT_WINDOW_CLOSED');
      expect(active().status).to.equal('failed');
      expect(record()).to.equal(null);
      expect(calls.commit).to.equal(0);
      expect(
        timers.filter((timer) => !timer.cleared && timer.delay === 15000)
      ).to.have.length(0);
      security.secureLogAction = async () => {};
      await chain.validation.resetJobNonce(1);
      await chain.select();
      await gateway.handleValidatorSelection('1', [chain.v1.address]);
      expect(active().status, active().error).to.equal('committed');
      expect(record().metadata.automaticCommitStatus).to.equal('confirmed');
      expect(calls.commit).to.equal(1);
    });
  }

  it('restores and reveals a saved commitment after its commit window has closed', async () => {
    await start();
    const saved = record();
    gateway.clearValidatorState();
    await openReveal();
    await gateway.handleValidatorSelection('1', [chain.v1.address]);
    expect(active().status, active().error).to.equal('committed');
    expect(record()).to.deep.equal(saved);
    fire(timerWithDelay((delay) => delay < 120000));
    await waitFor(
      () => record().metadata.automaticRevealStatus === 'confirmed'
    );
    expect(calls.commit).to.equal(1);
    expect(calls.reveal).to.equal(1);
  });

  for (const submissionFirst of [false, true]) {
    it(`commits, restores, reveals and advances a reset nonce with ${
      submissionFirst ? 'submission' : 'selection'
    } first`, async () => {
      await start(submissionFirst);
      const first = record();
      expect(first.roundScope.specHash).to.equal(ethers.id(chain.spec));
      expect(first.metadata.automaticCommitStatus).to.equal('confirmed');
      const obsolete = timerWithDelay(
        (delay) => delay > 5000 && delay < 120000
      );
      gateway.clearValidatorState();
      await gateway.handleValidatorSelection('1', [chain.v1.address]);
      expect(active().status).to.equal('committed');
      expect(calls.commit).to.equal(1);
      await openReveal();
      fire(timerWithDelay((delay) => delay < 120000));
      await waitFor(
        () => record().metadata.automaticRevealStatus === 'confirmed',
        'restored reveal'
      );
      expect(await chain.validation.revealed(1, chain.v1.address)).to.equal(
        true
      );
      const completed = record();
      await chain.validation.resetJobNonce(1);
      await chain.select();
      expect(await chain.client.jobNonce(1)).to.equal(
        BigInt(first.roundScope.nonce)
      );
      if (submissionFirst)
        await gateway.handleJobAwaitingValidation(chain.submission);
      await gateway.handleValidatorSelection('1', [chain.v1.address]);
      if (!submissionFirst)
        await gateway.handleJobAwaitingValidation(chain.submission);
      expect(active().status, active().error).to.equal('committed');
      const next = record();
      expect(calls.commit).to.equal(2);
      expect(next.salt).not.to.equal(first.salt);
      expect(next.revealTx).to.equal(undefined);
      expect(next.metadata.automaticRevealStatus).to.equal(undefined);
      const archive = fs
        .readdirSync(path.join(isolated.root, 'archive'))
        .map((name) =>
          JSON.parse(
            fs.readFileSync(path.join(isolated.root, 'archive', name), 'utf8')
          )
        );
      expect(archive).to.deep.include(completed);
      fire(obsolete);
      await new Promise(setImmediate);
      expect(calls.reveal).to.equal(1);
      await openReveal();
      fire(timerWithDelay((delay) => delay < 120000));
      await waitFor(
        () => record().metadata.automaticRevealStatus === 'confirmed',
        'fresh-round reveal'
      );
      expect(calls.reveal).to.equal(2);
      expect(await chain.validation.revealed(1, chain.v1.address)).to.equal(
        true
      );
    });
  }

  it('keeps the fresh-round context attempt when duplicate selections arrive during its lookup', async () => {
    await start();
    await chain.validation.resetJobNonce(1);
    await chain.select();
    let release;
    let contextCalls = 0;
    const deferred = new Promise((resolve) => {
      release = resolve;
    });
    global.fetch = async () => {
      contextCalls++;
      await deferred;
      return new Response(chain.spec);
    };
    const first = gateway.handleValidatorSelection('1', [chain.v1.address]);
    await waitFor(() => contextCalls === 1, 'fresh-round context fetch');
    await ethers.provider.send('evm_mine', []);
    const duplicate = gateway.handleValidatorSelection('1', [chain.v1.address]);
    for (let i = 0; i < 10; i++) await new Promise(setImmediate);
    expect(contextCalls).to.equal(1);
    release();
    await Promise.all([first, duplicate]);
    expect(active().status, active().error).to.equal('committed');
    expect(calls.commit).to.equal(2);
    expect(calls.stake).to.equal(2);
    expect(record().metadata.automaticCommitStatus).to.equal('confirmed');
  });

  it('retains an uncertain reveal across duplicate selection and restart, then reconciles its mined outcome', async () => {
    await start();
    await openReveal();
    revealMode = 'unknown';
    const timer = timerWithDelay((delay) => delay < 120000);
    fire(timer);
    await waitFor(
      () => calls.reveal === 1 && active().status === 'reconciliation-required'
    );
    expect(record().metadata.automaticRevealStatus).to.equal(
      'broadcast-intent'
    );
    expect(record().revealTx).to.equal(undefined);
    await gateway.handleValidatorSelection('1', [chain.v1.address]);
    gateway.clearValidatorState();
    await gateway.handleValidatorSelection('1', [chain.v1.address]);
    await gateway.handleJobAwaitingValidation(chain.submission);
    fire(timer);
    await new Promise(setImmediate);
    expect(active().status).to.equal('reconciliation-required');
    expect(calls.reveal).to.equal(1);
    expect(calls.commit).to.equal(1);
    await chain.client
      .connect(chain.v1)
      .revealValidation(...calls.pendingReveal);
    await gateway.handleValidatorSelection('1', [chain.v1.address]);
    expect(active().status).to.equal('revealed');
    expect(calls.reveal).to.equal(1);
  });

  for (const action of ['completion', 'clear']) {
    it(`does not run an obsolete committed reveal timer after ${action}`, async () => {
      await start();
      const timer = timerWithDelay((delay) => delay < 120000);
      if (action === 'completion')
        gateway.handleJobCompletionForValidators('1');
      else gateway.clearValidatorState();
      expect(timer.cleared).to.equal(true);
      await openReveal();
      fire(timer);
      await new Promise(setImmediate);
      expect(calls.reveal).to.equal(0);
      expect(await chain.validation.revealed(1, chain.v1.address)).to.equal(
        false
      );
      expect(gateway.listValidatorAssignments().active).to.have.length(0);
    });
  }

  it('recovers transient reveal preflight while a slow failure audit does not consume the retry', async () => {
    await start();
    await openReveal();
    const audit = new Promise((resolve) => {
      auditRelease = resolve;
    });
    security.secureLogAction = async (entry) => {
      if (entry.action === 'reveal-failed') {
        auditStarted = true;
        await audit;
      }
    };
    failedRoundReads = 1;
    fire(timerWithDelay((delay) => delay < 120000));
    await waitFor(() => auditStarted, 'deferred failure audit');
    expect(calls.reveal).to.equal(0);
    expect(record().metadata.automaticRevealStatus).to.equal(undefined);
    fire(timerWithDelay((delay) => delay === 5000));
    await waitFor(
      () => timers.some((entry) => !entry.cleared && entry.delay < 120000),
      'rescheduled open-window reveal'
    );
    fire(timerWithDelay((delay) => delay < 120000));
    await waitFor(
      () => record().metadata.automaticRevealStatus === 'confirmed',
      'retry reveal'
    );
    auditRelease();
    auditRelease = null;
    await new Promise(setImmediate);
    expect(active().status).to.equal('revealed');
    expect(calls.reveal).to.equal(1);
  });

  it('exposes reconciliation-required after reveal scheduling exhausts its read retries', async () => {
    await start();
    const saved = record();
    failedRoundReads = 100;
    fire(timerWithDelay((delay) => delay < 120000));
    await waitFor(() =>
      timers.some((entry) => !entry.cleared && entry.delay === 5000)
    );
    for (let attempt = 0; attempt < 13; attempt++) {
      const count = timers.length;
      fire(timerWithDelay((delay) => delay === 5000));
      await waitFor(
        () =>
          timers.length > count || active().status === 'reconciliation-required'
      );
    }
    expect(active().status).to.equal('reconciliation-required');
    expect(active().error).to.equal('temporary round RPC failure');
    expect(
      timers.filter((entry) => !entry.cleared && entry.delay < 120000)
    ).to.have.length(0);
    expect(record()).to.deep.equal(saved);
    expect(calls.commit).to.equal(1);
    expect(calls.reveal).to.equal(0);
  });
});
