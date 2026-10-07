const { expect } = require('chai');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const {
  VALIDATION_PROTOCOL_ABI,
  VALIDATION_REGISTRY_ABI,
} = require('../../shared/validationProtocol');

let sequence = 0;
async function setup() {
  const [owner, employer, v1, v2, v3] = await ethers.getSigners();
  const jobId = String(Date.now() * 100 + sequence++);
  const stake = await (
    await ethers.getContractFactory('MockStakeManager')
  ).deploy();
  const registry = await (
    await ethers.getContractFactory('MockJobRegistry')
  ).deploy();
  await registry.setStakeManager(await stake.getAddress());
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
  for (const signer of [v1, v2, v3]) {
    await identity.addAdditionalValidator(signer.address);
    await stake.setStake(signer.address, 1, ethers.parseEther('100'));
  }
  await validation.setValidatorPool([v1.address, v2.address, v3.address]);
  await registry.setJob(jobId, {
    employer: employer.address,
    agent: ethers.ZeroAddress,
    reward: 0,
    stake: 0,
    success: false,
    status: 3,
    uriHash: ethers.ZeroHash,
    resultHash: ethers.ZeroHash,
  });
  async function select() {
    await validation.connect(v1).selectValidators(jobId, 0);
    const target = await validation.selectionBlock(jobId);
    await validation.connect(v2).selectValidators(jobId, 1);
    while (BigInt(await ethers.provider.getBlockNumber()) <= target)
      await ethers.provider.send('evm_mine', []);
    await validation.connect(v1).selectValidators(jobId, 0);
  }
  await select();
  const client = new ethers.Contract(
    await validation.getAddress(),
    VALIDATION_PROTOCOL_ABI,
    ethers.provider
  );
  const registryClient = new ethers.Contract(
    await registry.getAddress(),
    VALIDATION_REGISTRY_ABI,
    ethers.provider
  );
  return { owner, v1, jobId, select, client, registryClient, validation };
}

const {
  inspectStoredValidationRound,
} = require('../../agent-gateway/validationRound');

describe('Gateway manual validator round recovery', function () {
  let context;
  let utils;
  let storage;
  let previous;
  let file;
  const archives = new Set();
  beforeEach(async () => {
    context = await setup();
    const envKeys = [
      'JOB_REGISTRY_ADDRESS',
      'VALIDATION_MODULE_ADDRESS',
      'KEYSTORE_URL',
    ];
    const environment = Object.fromEntries(
      envKeys.map((key) => [key, process.env[key]])
    );
    Object.assign(process.env, {
      JOB_REGISTRY_ADDRESS: await context.registryClient.getAddress(),
      VALIDATION_MODULE_ADDRESS: await context.client.getAddress(),
      KEYSTORE_URL: 'http://127.0.0.1:1',
    });
    try {
      utils = require('../../agent-gateway/utils');
      storage = require('../../agent-gateway/validationStore');
    } finally {
      for (const [key, value] of Object.entries(environment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    previous = {
      validation: utils.validation,
      registry: utils.registry,
      provider: utils.provider,
      begin: storage.beginCommitRecord,
    };
    utils.validation = context.client;
    utils.registry = context.registryClient;
    utils.provider = {
      getNetwork: () => ethers.provider.getNetwork(),
      lookupAddress: async () => 'validator.club.agi.eth',
    };
    file = path.resolve(
      'storage/validation',
      `${context.jobId}-${context.v1.address.toLowerCase()}.json`
    );
    expect(fs.existsSync(file)).to.equal(false);
  });
  afterEach(() => {
    utils.validation = previous.validation;
    utils.registry = previous.registry;
    utils.provider = previous.provider;
    storage.beginCommitRecord = previous.begin;
    utils.commits.delete(context.jobId);
    fs.rmSync(file, { force: true });
    for (const archived of archives) fs.rmSync(archived, { force: true });
    archives.clear();
  });
  function rememberArchive(record) {
    const digest = crypto
      .createHash('sha256')
      .update(JSON.stringify(record, null, 2))
      .digest('hex');
    const archived = path.resolve(
      'storage/validation/archive',
      `${digest}.json`
    );
    archives.add(archived);
    return archived;
  }
  function load() {
    return storage.loadCommitRecord(context.jobId, context.v1.address);
  }
  function overwrite(record) {
    fs.writeFileSync(file, JSON.stringify(record), { mode: 0o600 });
  }
  async function freshRound() {
    await context.validation.resetJobNonce(context.jobId);
    await context.select();
  }

  it('archives the completed secret and commits/reveals after a real reset reuses the nonce', async () => {
    const { jobId, v1, client, validation } = context;
    await utils.commitHelper(jobId, v1, false, ethers.id('first round'));
    await time.increaseTo((await client.rounds(jobId)).commitDeadline + 1n);
    await utils.revealHelper(jobId, v1);
    const original = load();
    const archived = rememberArchive(original);
    await freshRound();
    expect(await client.jobNonce(jobId)).to.equal(
      BigInt(original.roundScope.nonce)
    );
    await utils.commitHelper(jobId, v1, true, ethers.id('new round'));
    const next = load();
    expect(BigInt(next.roundScope.commitDeadline)).to.be.greaterThan(
      BigInt(original.roundScope.commitDeadline)
    );
    expect(next.salt).not.to.equal(original.salt);
    expect(next.revealTx).to.equal(undefined);
    expect(next.revealedAt).to.equal(undefined);
    expect(JSON.parse(fs.readFileSync(archived, 'utf8'))).to.deep.equal(
      original
    );
    expect(fs.statSync(archived).mode & 0o777).to.equal(0o600);
    utils.commits.delete(jobId);
    await time.increaseTo((await client.rounds(jobId)).commitDeadline + 1n);
    await utils.revealHelper(jobId, v1);
    expect(await validation.votes(jobId, v1.address)).to.equal(true);
  });

  it('classifies restored records through the shared inspector before either runtime acts', async () => {
    const { jobId, v1, client, registryClient } = context;
    const roundContext = {
      validation: client,
      registry: registryClient,
      provider: ethers.provider,
    };
    await utils.commitHelper(jobId, v1, true, ethers.id('shared recovery'));
    const record = load();
    expect(
      (await inspectStoredValidationRound(roundContext, record)).status
    ).to.equal('committed');
    await time.increaseTo((await client.rounds(jobId)).commitDeadline + 1n);
    await utils.revealHelper(jobId, v1);
    expect(
      (await inspectStoredValidationRound(roundContext, load())).status
    ).to.equal('revealed');
    await freshRound();
    const inspected = await inspectStoredValidationRound(roundContext, load());
    expect(inspected.status).to.equal('fresh-round');
    expect(BigInt(inspected.roundScope.commitDeadline)).to.be.greaterThan(
      BigInt(record.roundScope.commitDeadline)
    );
  });

  it('retains a mined same-round commitment and never overwrites its secret', async () => {
    await utils.commitHelper(
      context.jobId,
      context.v1,
      true,
      ethers.id('pending round')
    );
    const original = load();
    await expect(
      utils.commitHelper(
        context.jobId,
        context.v1,
        false,
        ethers.id('replacement')
      )
    ).to.be.rejectedWith('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
    expect(load()).to.deep.equal(original);
  });

  it('blocks a broadcast of unknown outcome even after the round is reset', async () => {
    const { client, jobId, v1 } = context;
    utils.validation = {
      runner: client.runner,
      getAddress: () => client.getAddress(),
      jobNonce: client.jobNonce,
      DOMAIN_SEPARATOR: client.DOMAIN_SEPARATOR,
      commitments: client.commitments,
      rounds: client.rounds,
      connect: () => ({
        commitValidation: async () => {
          throw new Error('simulated transport loss');
        },
      }),
    };
    await expect(
      utils.commitHelper(jobId, v1, true, ethers.id('uncertain secret'))
    ).to.be.rejectedWith('simulated transport loss');
    const original = load();
    expect(original.metadata.manualCommitStatus).to.equal('broadcast-intent');
    expect(original.commitTx).to.equal(undefined);
    expect(
      (
        await inspectStoredValidationRound(
          {
            validation: client,
            registry: context.registryClient,
            provider: ethers.provider,
          },
          original
        )
      ).status
    ).to.equal('uncertain');
    utils.validation = client;
    await freshRound();
    await expect(utils.commitHelper(jobId, v1, false)).to.be.rejectedWith(
      'VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED'
    );
    expect(load()).to.deep.equal(original);
    expect(
      await client.commitments(jobId, v1.address, await client.jobNonce(jobId))
    ).to.equal(ethers.ZeroHash);
  });

  it('rejects legacy, corrupt, cross-deployment and orphaned records without replacing them', async () => {
    const { jobId, v1 } = context;
    await utils.commitHelper(jobId, v1, true, ethers.id('protected secret'));
    const original = load();
    await freshRound();
    for (const mutate of [
      (record) => {
        delete record.roundScope;
      },
      (record) => {
        record.roundScope.validationModule = ethers.ZeroAddress;
      },
      (record) => {
        record.roundScope.chainId = '1';
      },
      (record) => {
        record.roundScope.nonce = '99';
      },
      (record) => {
        record.roundScope.blockHash = ethers.ZeroHash;
      },
      (record) => {
        record.commitTx = ethers.ZeroHash;
      },
    ]) {
      const record = JSON.parse(JSON.stringify(original));
      mutate(record);
      overwrite(record);
      await expect(utils.commitHelper(jobId, v1, false)).to.be.rejectedWith(
        'VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED'
      );
      expect(load()).to.deep.equal(record);
    }
    fs.writeFileSync(file, '{corrupt');
    await expect(utils.commitHelper(jobId, v1, false)).to.be.rejectedWith(
      'VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED'
    );
    expect(fs.readFileSync(file, 'utf8')).to.equal('{corrupt');
  });

  it('rejects stale reveals and refuses broadcast when durable state cannot be created', async () => {
    const { jobId, v1, client } = context;
    const begin = storage.beginCommitRecord;
    storage.beginCommitRecord = () => {
      throw new Error('simulated disk failure');
    };
    await expect(utils.commitHelper(jobId, v1, true)).to.be.rejectedWith(
      'simulated disk failure'
    );
    expect(
      await client.commitments(jobId, v1.address, await client.jobNonce(jobId))
    ).to.equal(ethers.ZeroHash);
    expect(fs.existsSync(file)).to.equal(false);
    storage.beginCommitRecord = begin;
    await utils.commitHelper(jobId, v1, true, ethers.id('stale round'));
    const original = load();
    await freshRound();
    await expect(utils.revealHelper(jobId, v1)).to.be.rejectedWith(
      'VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED'
    );
    expect(load()).to.deep.equal(original);
  });

  for (const phase of ['commit', 'reveal']) {
    it(`does not let a delayed old ${phase} confirmation change the fresh round`, async () => {
      const { jobId, v1, client } = context;
      if (phase === 'reveal') {
        await utils.commitHelper(jobId, v1, false, ethers.id('prior vote'));
        await time.increaseTo((await client.rounds(jobId)).commitDeadline + 1n);
      }
      let release;
      const delayed = new Promise((resolve) => {
        release = resolve;
      });
      let started;
      const waiting = new Promise((resolve) => {
        started = resolve;
      });
      const method =
        phase === 'commit' ? 'commitValidation' : 'revealValidation';
      utils.validation = {
        runner: client.runner,
        getAddress: () => client.getAddress(),
        jobNonce: client.jobNonce,
        DOMAIN_SEPARATOR: client.DOMAIN_SEPARATOR,
        commitments: client.commitments,
        rounds: client.rounds,
        connect: () => ({
          [method]: async (...args) => {
            const tx = await client.connect(v1)[method](...args);
            return {
              hash: tx.hash,
              wait: async () => {
                started();
                await delayed;
                return tx.wait();
              },
            };
          },
        }),
      };
      const pending =
        phase === 'commit'
          ? utils.commitHelper(jobId, v1, false, ethers.id('prior vote'))
          : utils.revealHelper(jobId, v1);
      const failure = pending.catch((err) => err);
      await waiting;
      const original = load();
      rememberArchive(original);
      utils.validation = client;
      await freshRound();
      await utils.commitHelper(jobId, v1, true, ethers.id('current vote'));
      const current = load();
      release();
      expect((await failure).message).to.equal(
        'VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED'
      );
      expect(load()).to.deep.equal(current);
      expect(utils.commits.get(jobId)[v1.address.toLowerCase()].salt).to.equal(
        current.salt
      );
      expect(current.revealTx).to.equal(undefined);
    });
  }

  it('rejects unscoped and wrong-round vote updates while allowing unrelated metadata', async () => {
    await utils.commitHelper(
      context.jobId,
      context.v1,
      true,
      ethers.id('scoped vote')
    );
    const original = load();
    expect(() =>
      storage.updateCommitRecord(context.jobId, context.v1.address, {
        revealTx: ethers.id('old reveal'),
      })
    ).to.throw('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
    expect(() =>
      storage.updateCommitRecord(
        context.jobId,
        context.v1.address,
        { revealedAt: new Date().toISOString() },
        {
          commitHash: original.commitHash,
          roundScope: { ...original.roundScope, commitDeadline: '1' },
        }
      )
    ).to.throw('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
    expect(load()).to.deep.equal(original);
    storage.updateCommitRecord(context.jobId, context.v1.address, {
      metadata: { notified: true },
    });
    expect(load().metadata.notified).to.equal(true);
    expect(load().salt).to.equal(original.salt);
  });

  it('refuses to replace a record changed after reconciliation', async () => {
    await utils.commitHelper(
      context.jobId,
      context.v1,
      true,
      ethers.id('protected record')
    );
    const original = load();
    const changed = {
      ...original,
      metadata: { operator: 'reconciled elsewhere' },
    };
    overwrite(changed);
    expect(() =>
      storage.beginCommitRecord(
        context.jobId,
        context.v1.address,
        original,
        original
      )
    ).to.throw('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
    expect(load()).to.deep.equal(changed);
  });
});
