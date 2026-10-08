const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ethers, artifacts } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const {
  createReviewedValidator,
  VALIDATION_ABI,
  REGISTRY_ABI,
  DISPUTE_ABI,
} = require('../../apps/validator/runtime');
const { RevealJournal } = require('../../examples/agentic/validator-recovery');

describe('reviewed validator service with current deployed contracts', function () {
  this.timeout(30000);
  let directory;
  beforeEach(() => {
    directory = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), 'reviewed-validator-')
    );
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  async function setup() {
    const [owner, employer, agent, v1, v2, v3] = await ethers.getSigners();
    const stake = await (
      await ethers.getContractFactory('MockStakeManager')
    ).deploy();
    const identity = await (
      await ethers.getContractFactory(
        'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
      )
    ).deploy();
    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const actualRegistry = await Registry.deploy(
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
      await deployImplementations('JobRegistry', Registry.runner)
    );
    await actualRegistry.setIdentityRegistry(await identity.getAddress());
    await actualRegistry.setJobParameters(1000, 0);
    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    const actual = await Validation.deploy(
      await actualRegistry.getAddress(),
      await stake.getAddress(),
      60,
      60,
      3,
      3,
      [],
      await deployImplementations('ValidationModule', Validation.runner)
    );
    await actual.setIdentityRegistry(await identity.getAddress());
    for (const v of [v1, v2, v3]) {
      await identity.addAdditionalValidator(v.address);
      await stake.setStake(v.address, 1, ethers.parseEther('100'));
    }
    await actual.setValidatorPool([v1.address, v2.address, v3.address]);
    await actualRegistry
      .connect(employer)
      .createJob(
        100,
        (await time.latest()) + 3600,
        ethers.id('independently reviewed work specification'),
        'ipfs://reviewed-spec'
      );
    await actualRegistry.connect(agent).applyForJob(1, 'agent', []);
    await actualRegistry
      .connect(agent)
      .submit(
        1,
        ethers.id('candidate deliverable'),
        'ipfs://candidate',
        'agent',
        []
      );
    async function select() {
      await actual.connect(v1).selectValidators(1, 0);
      const target = await actual.selectionBlock(1);
      await actual.connect(v2).selectValidators(1, 1);
      while (BigInt(await ethers.provider.getBlockNumber()) <= target)
        await ethers.provider.send('evm_mine', []);
      await actual.connect(v1).selectValidators(1, 0);
      await ethers.provider.send('evm_mine', []);
    }
    await select();
    const reader = new ethers.Contract(
      await actual.getAddress(),
      VALIDATION_ABI,
      ethers.provider
    );
    const registry = new ethers.Contract(
      await actualRegistry.getAddress(),
      REGISTRY_ABI,
      ethers.provider
    );
    // Mine a real additional block so the two-confirmation runtime progresses
    // under an automining local test network without weakening its rule.
    const connected = reader.connect(v1);
    const calls = { commit: 0, reveal: 0 };
    const instrumented = new Proxy(reader, {
      get(target, property) {
        if (property === 'connect')
          return () =>
            Object.fromEntries(
              ['commitValidation', 'revealValidation'].map((method) => [
                method,
                async (...args) => {
                  calls[method === 'commitValidation' ? 'commit' : 'reveal']++;
                  const tx = await connected[method](...args);
                  await tx.wait();
                  await ethers.provider.send('evm_mine', []);
                  return tx;
                },
              ])
            );
        return Reflect.get(target, property);
      },
    });
    const options = {
      provider: ethers.provider,
      reader: instrumented,
      registry,
      signer: v1,
      validatorAddress: v1.address,
      validatorLabel: 'reviewer',
      stateDirectory: path.join(directory, 'secrets'),
      reportDirectory: path.join(directory, 'reports'),
      reviewFile: path.join(directory, 'reviews.json'),
      evaluate: async () => ({
        approve: true,
        notes: ['Integrity check only'],
      }),
      expectedChainId: '31337',
      confirmationTimeoutMs: 5000,
    };
    const runtime = await createReviewedValidator(options);
    const draft = await runtime.inspect('1');
    function admit(approve = true) {
      const data = structuredClone(draft);
      Object.assign(data.decisions[0], {
        approve,
        reviewedBy: 'Independent test reviewer',
        reviewedAt: new Date().toISOString(),
      });
      fs.writeFileSync(options.reviewFile, JSON.stringify(data), {
        mode: 0o600,
      });
      return data;
    }
    const journal = new RevealJournal(
      path.join(
        options.stateDirectory,
        (await registry.getAddress()).toLowerCase()
      ),
      draft
    );
    return {
      actual,
      actualRegistry,
      options,
      runtime,
      draft,
      admit,
      calls,
      journal,
      v1,
      owner,
      select,
    };
  }

  it('matches all configured registry, validation and dispute functions/events to actual artifacts', async () => {
    for (const [abi, source] of [
      [VALIDATION_ABI, 'contracts/v2/ValidationModule.sol:ValidationModule'],
      [REGISTRY_ABI, 'contracts/v2/JobRegistry.sol:JobRegistry'],
      [DISPUTE_ABI, 'contracts/v2/modules/DisputeModule.sol:DisputeModule'],
    ]) {
      const canonical = new ethers.Interface(
        (await artifacts.readArtifact(source)).abi
      );
      for (const fragment of new ethers.Interface(abi).fragments) {
        const actual =
          fragment.type === 'event'
            ? canonical.getEvent(fragment.name)
            : canonical.getFunction(fragment.name);
        assert.equal(actual.format('sighash'), fragment.format('sighash'));
        if (fragment.type === 'event')
          assert.deepEqual(
            actual.inputs.map((x) => Boolean(x.indexed)),
            fragment.inputs.map((x) => Boolean(x.indexed))
          );
        if (fragment.type === 'function')
          assert.deepEqual(
            actual.outputs.map((x) => x.format('sighash')),
            fragment.outputs.map((x) => x.format('sighash'))
          );
      }
    }
  });
  for (const approve of [true, false])
    it(`persists and recovers an explicitly reviewed ${
      approve ? 'approval' : 'rejection'
    } on the real contract`, async () => {
      const ctx = await setup();
      ctx.admit(approve);
      assert.equal(
        await ctx.runtime.selected(1n, [ctx.v1.address]),
        'committed'
      );
      const record = ctx.journal.records()[0];
      assert.equal(record.approve, approve);
      assert.equal(
        await ctx.actual.commitments(1, ctx.v1.address, record.nonce),
        record.commitHash
      );
      const resumed = await createReviewedValidator({
        ...ctx.options,
        evaluate: async () => {
          throw new Error('must not reevaluate a saved vote');
        },
      });
      const round = await ctx.actual.rounds(1);
      await time.increaseTo(round.commitDeadline + 1n);
      await ethers.provider.send('evm_mine', []);
      assert.deepEqual(await resumed.recover(), [
        { jobId: '1', status: 'revealed' },
      ]);
      assert.equal(await ctx.actual.revealed(1, ctx.v1.address), true);
      assert.equal(await ctx.actual.votes(1, ctx.v1.address), approve);
      assert.deepEqual(await resumed.recover(), [
        { jobId: '1', status: 'complete' },
      ]);
      assert.equal(ctx.journal.records()[0].salt, record.salt);
      assert.deepEqual(ctx.calls, { commit: 1, reveal: 1 });
    });
  it('abstains on missing review and binds changed result, nonce and selection', async () => {
    const ctx = await setup();
    fs.writeFileSync(
      ctx.options.reviewFile,
      JSON.stringify({ ...ctx.draft, decisions: [] }),
      { mode: 0o600 }
    );
    assert.equal(
      await ctx.runtime.selected(1n, [ctx.v1.address]),
      'review-required'
    );
    const data = ctx.admit();
    data.decisions[0].resultHash = ethers.id('wrong result');
    fs.writeFileSync(ctx.options.reviewFile, JSON.stringify(data));
    assert.equal(
      await ctx.runtime.selected(1n, [ctx.v1.address]),
      'review-required'
    );
    ctx.admit();
    await ctx.actual.resetJobNonce(1);
    await ctx.select();
    assert.equal(
      await ctx.runtime.selected(1n, [ctx.v1.address]),
      'review-required'
    );
    assert.equal(ctx.journal.records().length, 0);
    assert.equal(ctx.calls.commit, 0);
  });
  it('does not turn a failed artifact-integrity check into approval', async () => {
    const ctx = await setup();
    ctx.admit();
    const runtime = await createReviewedValidator({
      ...ctx.options,
      evaluate: async () => ({ approve: false }),
    });
    await assert.rejects(
      runtime.selected(1n, [ctx.v1.address]),
      /VALIDATOR_REVIEW_ARTIFACT_MISMATCH/
    );
    assert.equal(ctx.journal.records().length, 0);
    assert.equal(ctx.calls.commit, 0);
  });
  it('keeps inspection read-only and refuses mismatched network or registry routing', async () => {
    const ctx = await setup();
    const inspector = await createReviewedValidator({
      ...ctx.options,
      signer: undefined,
      stateDirectory: path.join(directory, 'unused'),
    });
    assert.equal((await inspector.inspect('1')).decisions[0].approve, null);
    assert.equal(fs.existsSync(path.join(directory, 'unused')), false);
    await assert.rejects(
      createReviewedValidator({ ...ctx.options, expectedChainId: '1' }),
      /VALIDATOR_CHAIN_MISMATCH/
    );
    const replacement = await (
      await ethers.getContractFactory('MockJobRegistry')
    ).deploy();
    await ctx.actual.setJobRegistry(await replacement.getAddress());
    await assert.rejects(
      ctx.runtime.selected(1n, [ctx.v1.address]),
      /VALIDATOR_REGISTRY_MISMATCH/
    );
    assert.equal(ctx.calls.commit, 0);
  });
});
