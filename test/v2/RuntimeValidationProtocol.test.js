const { expect } = require('chai');
const { ethers, artifacts } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const {
  VALIDATION_PROTOCOL_ABI,
  VALIDATION_REGISTRY_ABI,
  prepareValidationCommitment,
  validationCommitmentHash,
  assertValidationReveal,
  validationRevealDelay,
} = require('../../shared/validationProtocol');

async function setup() {
  const [owner, employer, v1, v2, v3] = await ethers.getSigners();
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
  await registry.setJob(1, {
    employer: employer.address,
    agent: ethers.ZeroAddress,
    reward: 0,
    stake: 0,
    success: false,
    status: 3,
    uriHash: ethers.ZeroHash,
    resultHash: ethers.ZeroHash,
  });
  await validation.connect(v1).selectValidators(1, 0);
  const target = await validation.selectionBlock(1);
  await validation.connect(v2).selectValidators(1, 1);
  while (BigInt(await ethers.provider.getBlockNumber()) <= target)
    await ethers.provider.send('evm_mine', []);
  await validation.connect(v1).selectValidators(1, 0);
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
  return {
    owner,
    employer,
    v1,
    v2,
    v3,
    stake,
    registry,
    validation,
    client,
    registryClient,
  };
}

describe('Runtime v2 validator protocol', function () {
  it('keeps runtime function inputs and getter outputs aligned with compiled contracts', async () => {
    const actual = new ethers.Interface(
      (
        await artifacts.readArtifact(
          'contracts/v2/ValidationModule.sol:ValidationModule'
        )
      ).abi
    );
    const client = new ethers.Interface(VALIDATION_PROTOCOL_ABI);
    for (const fragment of client.fragments) {
      const compiled = actual.getFunction(fragment.name);
      expect(fragment.format('sighash')).to.equal(compiled.format('sighash'));
      expect(fragment.outputs.map((x) => [x.type, x.name])).to.deep.equal(
        compiled.outputs.map((x) => [x.type, x.name])
      );
    }
  });

  it('commits and reveals both outcomes through the runtime ABI against the real ValidationModule', async () => {
    const { client, registryClient, validation, v1, v2 } = await setup();
    const votes = [];
    for (const [signer, approve] of [
      [v1, true],
      [v2, false],
    ]) {
      const vote = await prepareValidationCommitment(
        client,
        registryClient,
        ethers.provider,
        1n,
        signer.address,
        approve,
        ethers.hexlify(ethers.randomBytes(32))
      );
      expect(vote.burnTxHash).to.equal(ethers.ZeroHash);
      await client
        .connect(signer)
        .commitValidation(1, vote.commitHash, 'validator', []);
      votes.push({ signer, vote });
    }
    const round = await client.rounds(1);
    expect(round.commitDeadline).to.equal(
      (await validation.rounds(1)).commitDeadline
    );
    expect(round.committeeSize).to.equal(3n);
    await time.increaseTo(round.commitDeadline + 1n);
    for (const { signer, vote } of votes) {
      await assertValidationReveal(
        client,
        registryClient,
        ethers.provider,
        1n,
        signer.address,
        vote.approve,
        vote.salt,
        vote.burnTxHash
      );
      await expect(
        client
          .connect(signer)
          .revealValidation(
            1,
            vote.approve,
            vote.burnTxHash,
            vote.salt,
            'validator',
            []
          )
      )
        .to.emit(validation, 'ValidationRevealed')
        .withArgs(
          1,
          signer.address,
          vote.approve,
          ethers.ZeroHash,
          'validator'
        );
      expect(await validation.revealed(1, signer.address)).to.equal(true);
      expect(await validation.votes(1, signer.address)).to.equal(vote.approve);
    }
    expect((await client.rounds(1)).revealedCount).to.equal(2n);
  });

  it('rejects the obsolete four-field runtime commitment on the real contract', async () => {
    const { client, validation, v1 } = await setup();
    const salt = ethers.id('old runtime secret');
    const commit = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32'],
      [1n, await client.jobNonce(1), true, salt]
    );
    await client.connect(v1).commitValidation(1, commit, 'validator', []);
    await time.increaseTo((await client.rounds(1)).commitDeadline + 1n);
    await expect(
      client
        .connect(v1)
        .revealValidation(1, true, ethers.ZeroHash, salt, 'validator', [])
    ).to.be.revertedWithCustomError(validation, 'InvalidReveal');
  });

  it('executes the orchestrator service commit/reveal methods against the real contract', async () => {
    const { MetaOrchestrator } = require('../../apps/orchestrator/service');
    const audit = require('../../apps/orchestrator/audit');
    const previousAudit = audit.auditLog;
    audit.auditLog = () => {};
    const { client, registryClient, validation, v1 } = await setup();
    const prototype = MetaOrchestrator.prototype;
    const state = {
      provider: ethers.provider,
      validationModule: client,
      registry: registryClient,
      config: {},
      commits: new Map(),
      commitTimers: new Map(),
      appliedJobs: new Map(),
      validationContext: async () => ({
        classification: { category: 'research' },
        spec: null,
      }),
      clearReviewTimer: () => {},
    };
    Object.setPrototypeOf(state, prototype);
    const identity = {
      address: v1.address,
      label: 'validator',
      wallet: { connect: () => v1 },
    };
    try {
      await prototype.commitValidation.call(state, 1n, identity);
      const data = state.commits.get(`1:${v1.address.toLowerCase()}`);
      expect(data.burnTxHash).to.equal(ethers.ZeroHash);
      expect(data.approve).to.equal(false);
      for (const timer of state.commitTimers.values()) clearTimeout(timer);
      await time.increaseTo((await client.rounds(1)).commitDeadline + 1n);
      await prototype.revealValidation.call(state, 1n, identity);
      expect(await validation.revealed(1, v1.address)).to.equal(true);
      expect(state.commits.size).to.equal(0);
    } finally {
      for (const timer of state.commitTimers.values()) clearTimeout(timer);
      audit.auditLog = previousAudit;
    }
  });

  it('gateway manual helpers preserve explicit burn evidence through stored-state reload', async () => {
    const { client, registryClient, validation, v1 } = await setup();
    const oldEnv = { ...process.env };
    Object.assign(process.env, {
      JOB_REGISTRY_ADDRESS: await registryClient.getAddress(),
      VALIDATION_MODULE_ADDRESS: await client.getAddress(),
      KEYSTORE_URL: 'http://127.0.0.1:1',
    });
    const utils = require('../../agent-gateway/utils');
    const storage = require('../../agent-gateway/validationStore');
    const previous = {
      registry: utils.registry,
      validation: utils.validation,
      provider: utils.provider,
      load: storage.loadCommitRecord,
      update: storage.updateCommitRecord,
      begin: storage.beginCommitRecord,
    };
    let saved;
    utils.registry = registryClient;
    utils.validation = client;
    utils.provider = {
      getNetwork: () => ethers.provider.getNetwork(),
      lookupAddress: async () => 'validator.club.agi.eth',
    };
    storage.loadCommitRecord = () => saved ?? null;
    storage.beginCommitRecord = (_jobId, _validator, update) =>
      (saved = { jobId: '1', validator: v1.address.toLowerCase(), ...update });
    storage.updateCommitRecord = (_jobId, _validator, update) =>
      (saved = { ...saved, ...update });
    try {
      await utils.commitHelper('1', v1, true, ethers.id('gateway secret'));
      expect(saved.burnTxHash).to.equal(ethers.ZeroHash);
      const original = { ...saved };
      await expect(
        utils.commitHelper('1', v1, false, ethers.id('replacement'))
      ).to.be.rejectedWith('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
      expect(saved).to.deep.equal(original);
      utils.commits.clear();
      await time.increaseTo((await client.rounds(1)).commitDeadline + 1n);
      await utils.revealHelper('1', v1);
      expect(await validation.revealed(1, v1.address)).to.equal(true);
      expect(saved.revealTx).to.match(/^0x/);
      utils.commits.clear();
      saved = { ...original, burnTxHash: undefined };
      await expect(utils.revealHelper('1', v1)).to.be.rejectedWith(
        'VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED'
      );
    } finally {
      utils.registry = previous.registry;
      utils.validation = previous.validation;
      utils.provider = previous.provider;
      storage.loadCommitRecord = previous.load;
      storage.updateCommitRecord = previous.update;
      storage.beginCommitRecord = previous.begin;
      utils.commits.clear();
      for (const key of [
        'JOB_REGISTRY_ADDRESS',
        'VALIDATION_MODULE_ADDRESS',
        'KEYSTORE_URL',
      ]) {
        if (oldEnv[key] === undefined) delete process.env[key];
        else process.env[key] = oldEnv[key];
      }
    }
  });

  it('gateway automatic validation abstains before staking, notifying, persisting or voting on computer work', async () => {
    const { v1 } = await setup();
    const utils = require('../../agent-gateway/utils');
    const storage = require('../../agent-gateway/validationStore');
    const identity = require('../../agent-gateway/identity');
    const staking = require('../../agent-gateway/stakeCoordinator');
    const security = require('../../agent-gateway/security');
    const gateway = require('../../agent-gateway/validator');
    const previous = {
      registry: utils.registry,
      validation: utils.validation,
      provider: utils.provider,
      walletManager: utils.walletManager,
      load: storage.loadCommitRecord,
      update: storage.updateCommitRecord,
      ensureIdentity: identity.ensureIdentity,
      ensureStake: staking.ensureStake,
      log: security.secureLogAction,
      fetch: global.fetch,
    };
    let forbiddenWrites = 0;
    const write = () => {
      forbiddenWrites++;
      throw new Error('Unexpected automatic validation write');
    };
    utils.validation = {
      connect: write,
      getAddress: async () => ethers.ZeroAddress,
      rounds: async () => ({ commitDeadline: 13000n, tallied: false }),
      jobNonce: async () => 1n,
      DOMAIN_SEPARATOR: async () => ethers.id('domain'),
      validators: async () => [v1.address],
    };
    utils.provider = {
      getBlockNumber: async () => 12000,
      getNetwork: async () => ({ chainId: 31337n }),
      getBlock: async () => ({
        number: 12000,
        hash: ethers.id('block'),
        timestamp: 12000,
      }),
    };
    utils.walletManager = { list: () => [v1.address], get: () => v1 };
    identity.ensureIdentity = async () => ({
      address: v1.address,
      label: 'validator',
      role: 'validator',
    });
    staking.ensureStake = write;
    storage.loadCommitRecord = () => null;
    storage.updateCommitRecord = write;
    security.secureLogAction = async () => {};
    try {
      for (const [index, spec, changed] of [
        [1, { category: 'computer-work' }, false],
        [
          2,
          {
            category: 'research',
            metadata: { computerWork: { goal: 'Browser work' } },
          },
          false,
        ],
        [3, { category: 'computer-work' }, true],
      ]) {
        for (const submissionFirst of [false, true]) {
          gateway.clearValidatorState();
          const body = JSON.stringify(spec);
          const hash = ethers.id(body);
          utils.registry = {
            filters: { JobCreated: () => ({}) },
            queryFilter: async () => [
              {
                args: {
                  specHash: hash,
                  uri: 'https://ipfs.io/ipfs/fixtureSpec',
                },
              },
            ],
            getSpecHash: async () => hash,
            connect: write,
          };
          global.fetch = async (url) => {
            expect(String(url)).to.equal('https://ipfs.io/ipfs/fixtureSpec');
            return new Response(
              changed ? JSON.stringify({ category: 'research' }) : body
            );
          };
          const submission = {
            jobId: String(index),
            worker: ethers.ZeroAddress,
            resultHash: ethers.id('self-attested success'),
            resultURI: 'https://unapproved.invalid/result',
            receivedAt: new Date().toISOString(),
          };
          if (submissionFirst)
            await gateway.handleJobAwaitingValidation(submission);
          await gateway.handleValidatorSelection(String(index), [v1.address]);
          if (!submissionFirst)
            await gateway.handleJobAwaitingValidation(submission);
          const [assignment] = gateway.listValidatorAssignments().active;
          expect(assignment.status).to.equal(
            changed ? 'reconciliation-required' : 'awaiting-review'
          );
          expect(assignment.attempts).to.equal(0);
          expect(assignment.commitTx).to.equal(undefined);
          expect(assignment.notifiedAt).to.equal(undefined);
          expect(assignment.error).to.match(
            changed ? /hash mismatch/ : /INDEPENDENT_REVIEW_REQUIRED/
          );
        }
      }
      expect(forbiddenWrites).to.equal(0);
    } finally {
      gateway.clearValidatorState();
      Object.assign(utils, {
        registry: previous.registry,
        validation: previous.validation,
        provider: previous.provider,
        walletManager: previous.walletManager,
      });
      storage.loadCommitRecord = previous.load;
      storage.updateCommitRecord = previous.update;
      identity.ensureIdentity = previous.ensureIdentity;
      staking.ensureStake = previous.ensureStake;
      security.secureLogAction = previous.log;
      global.fetch = previous.fetch;
    }
  });

  it('treats corrupt or unreadable saved commitments as reconciliation failures, not missing state', () => {
    const fs = require('fs');
    const path = require('path');
    const fixture = require('../helpers/validation-store.cjs')();
    const storage = fixture.store;
    const original = fs.openSync;
    fs.mkdirSync(fixture.root, { mode: 0o700 });
    const file = path.join(fixture.root, `1-${ethers.ZeroAddress}.json`);
    try {
      for (const body of ['{broken', 'null', '{}']) {
        fs.writeFileSync(file, body, { mode: 0o600 });
        expect(() =>
          storage.loadCommitRecord('1', ethers.ZeroAddress)
        ).to.throw('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
      }
      fs.openSync = (...args) => {
        if (args[0] === file)
          throw Object.assign(new Error('denied'), { code: 'EACCES' });
        return original(...args);
      };
      expect(() => storage.loadCommitRecord('1', ethers.ZeroAddress)).to.throw(
        'VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED'
      );
      fs.openSync = original;
      fs.unlinkSync(file);
      expect(storage.loadCommitRecord('1', ethers.ZeroAddress)).to.equal(null);
    } finally {
      fs.openSync = original;
      fixture.cleanup();
    }
  });

  it('prevents replacing a mined commitment or inventing missing persisted reveal fields', async () => {
    const { client, registryClient, v1 } = await setup();
    const vote = await prepareValidationCommitment(
      client,
      registryClient,
      ethers.provider,
      1n,
      v1.address,
      true,
      ethers.id('saved secret')
    );
    await client
      .connect(v1)
      .commitValidation(1, vote.commitHash, 'validator', []);
    await expect(
      prepareValidationCommitment(
        client,
        registryClient,
        ethers.provider,
        1n,
        v1.address,
        false,
        ethers.id('replacement')
      )
    ).to.be.rejectedWith('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
    await expect(
      assertValidationReveal(
        client,
        registryClient,
        ethers.provider,
        1n,
        v1.address,
        true,
        vote.salt,
        undefined
      )
    ).to.be.rejectedWith('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
    await expect(
      assertValidationReveal(
        client,
        registryClient,
        ethers.provider,
        1n,
        v1.address,
        false,
        vote.salt,
        vote.burnTxHash
      )
    ).to.be.rejectedWith('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
    expect(await client.commitments(1, v1.address, vote.nonce)).to.equal(
      vote.commitHash
    );
  });

  it('binds the commitment to chain, module domain and validator identity', async () => {
    const { client, registryClient, validation, v1, v2, v3 } = await setup();
    const votes = [];
    for (const [signer, change] of [
      [v1, { chainId: 1n }],
      [v2, { domain: ethers.id('other module') }],
      [v3, { validator: v1.address }],
    ]) {
      const vote = await prepareValidationCommitment(
        client,
        registryClient,
        ethers.provider,
        1n,
        signer.address,
        true,
        ethers.hexlify(ethers.randomBytes(32))
      );
      await client
        .connect(signer)
        .commitValidation(
          1,
          validationCommitmentHash({ ...vote, ...change }),
          'validator',
          []
        );
      votes.push({ signer, vote });
    }
    await time.increaseTo((await client.rounds(1)).commitDeadline + 1n);
    for (const { signer, vote } of votes) {
      await expect(
        client
          .connect(signer)
          .revealValidation(
            1,
            true,
            vote.burnTxHash,
            vote.salt,
            'validator',
            []
          )
      ).to.be.revertedWithCustomError(validation, 'InvalidReveal');
    }
  });

  it('refuses a burn-required commitment until confirmed receipt evidence is available', async () => {
    const { client, registryClient, stake, registry, v1 } = await setup();
    await stake.setBurnPct(5);
    await expect(
      prepareValidationCommitment(
        client,
        registryClient,
        ethers.provider,
        1n,
        v1.address,
        true,
        ethers.id('burn vote')
      )
    ).to.be.rejectedWith('VALIDATION_BURN_EVIDENCE_REQUIRED');
    await registry.setBurnConfirmed(1, true);
    await expect(
      prepareValidationCommitment(
        client,
        registryClient,
        ethers.provider,
        1n,
        v1.address,
        true,
        ethers.id('burn vote')
      )
    ).to.be.rejectedWith('VALIDATION_BURN_RECEIPT_UNAVAILABLE');
    expect(
      await client.commitments(1, v1.address, await client.jobNonce(1))
    ).to.equal(ethers.ZeroHash);
  });

  it('binds nonzero specification and confirmed burn evidence from the real JobRegistry', async () => {
    const { owner, employer, client, stake, validation, v1 } = await setup();
    const factory = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const registry = await factory.deploy(
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
      await deployImplementations('JobRegistry', factory.runner)
    );
    const specHash = ethers.id('authoritative employer specification');
    const burnTxHash = ethers.id('confirmed employer receipt');
    const identity = await (
      await ethers.getContractFactory(
        'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
      )
    ).deploy();
    await identity.setResult(true);
    await registry.setIdentityRegistry(await identity.getAddress());
    await registry
      .connect(employer)
      .createJob(1, (await time.latest()) + 3600, specHash, 'ipfs://spec');
    await registry.connect(owner).applyForJob(1, 'worker', []);
    await registry
      .connect(owner)
      .submit(1, ethers.id('result'), 'ipfs://result', 'worker', []);
    await stake.setBurnPct(5);
    await registry.connect(employer).submitBurnReceipt(1, burnTxHash, 1, 1);
    await registry.connect(employer).confirmEmployerBurn(1, burnTxHash);
    await validation.setJobRegistry(await registry.getAddress());
    const registryClient = new ethers.Contract(
      await registry.getAddress(),
      VALIDATION_REGISTRY_ABI,
      ethers.provider
    );
    const vote = await prepareValidationCommitment(
      client,
      registryClient,
      ethers.provider,
      1n,
      v1.address,
      true,
      ethers.id('confirmed burn vote')
    );
    expect(vote.specHash).to.equal(specHash);
    expect(vote.burnTxHash).to.equal(burnTxHash);
    await client
      .connect(v1)
      .commitValidation(1, vote.commitHash, 'validator', []);
    await time.increaseTo((await client.rounds(1)).commitDeadline + 1n);
    await expect(
      client
        .connect(v1)
        .revealValidation(1, true, burnTxHash, vote.salt, 'validator', [])
    )
      .to.emit(validation, 'ValidationRevealed')
      .withArgs(1, v1.address, true, burnTxHash, 'validator');
  });

  it('uses current round boundaries and rejects closed or unrepresentable timer windows', () => {
    const round = { commitDeadline: 1000n, revealDeadline: 1060n };
    expect(validationRevealDelay(round, 900)).to.equal(101000);
    expect(validationRevealDelay(round, 1010)).to.equal(0);
    expect(validationRevealDelay(round, 900, 60)).to.equal(159000);
    expect(() => validationRevealDelay(round, 1060)).to.throw(
      'VALIDATION_REVEAL_WINDOW_CLOSED'
    );
    expect(() =>
      validationRevealDelay(
        { commitDeadline: 3000000n, revealDeadline: 3000060n },
        0
      )
    ).to.throw('VALIDATION_REVEAL_DELAY_OUT_OF_RANGE');
  });
});
