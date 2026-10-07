const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ethers } = require('ethers');
const {
  RevealJournal,
  commitHash,
  createValidatorRuntime,
  resolveJobBurnReceipt,
  safeErrorCode,
} = require('../../examples/agentic/validator-recovery');
const { parseDecision } = require('../../examples/agentic/v2-validator');

const hex = (byte, length = 32) => `0x${byte.repeat(length)}`;
const scope = {
  chainId: '31337',
  validationModule: hex('11', 20),
  validator: hex('22', 20),
};
const specHash = hex('33');
const domainSeparator = hex('44');
function makeRecord(overrides = {}) {
  const record = {
    version: 1,
    scope,
    jobId: '7',
    nonce: '1',
    specHash,
    domainSeparator,
    approve: true,
    burnTxHash: ethers.ZeroHash,
    salt: hex('55'),
    subdomain: 'reviewer',
    commitProof: [],
    revealProof: [hex('66')],
    ...overrides,
  };
  record.commitHash = commitHash({
    ...record,
    validator: scope.validator,
    chainId: scope.chainId,
  });
  return record;
}

describe('generic validator durable reveal recovery', () => {
  let directory;
  beforeEach(() => {
    directory = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), 'validator-recovery-')
    );
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const journalAt = (root, selectedScope = scope) =>
    new RevealJournal(root, selectedScope);

  function fixture(journal) {
    const state = {
      nonce: 1n,
      commitment: ethers.ZeroHash,
      revealed: false,
      timestamp: 50,
      chainId: 31337n,
      specHash,
      domainSeparator,
      tallied: false,
    };
    const calls = { commit: [], reveal: [] };
    const reader = {
      jobNonce: async () => state.nonce,
      commitments: async () => state.commitment,
      revealed: async () => state.revealed,
      rounds: async () => ({
        commitDeadline: 100n,
        revealDeadline: 200n,
        tallied: state.tallied,
      }),
      DOMAIN_SEPARATOR: async () => state.domainSeparator,
    };
    const writer = {
      commitValidation: async (...args) => {
        assert.equal(journal.has(journal.load('7', '1'), 'commit'), true);
        calls.commit.push(args);
        state.commitment = args[1];
        return { wait: async () => ({ status: 1 }) };
      },
      revealValidation: async (...args) => {
        assert.equal(journal.has(journal.load('7', '1'), 'reveal'), true);
        calls.reveal.push(args);
        state.revealed = true;
        return { wait: async () => ({ status: 1 }) };
      },
    };
    const options = {
      journal,
      reader,
      writer,
      registry: {
        getSpecHash: async () => state.specHash,
        burnEvidenceStatus: async () => [false, true],
        hasBurnReceipt: async () => false,
      },
      provider: {
        getNetwork: async () => ({ chainId: state.chainId }),
        getBlockNumber: async () => 21,
        getBlock: async (tag) => ({
          number: tag === 'latest' ? 21 : tag,
          timestamp: state.timestamp,
        }),
      },
      validatorLabel: 'reviewer',
      approve: true,
      revealProof: [hex('66')],
    };
    return { state, calls, options, runtime: createValidatorRuntime(options) };
  }

  it('uses the exact domain-bound contract encoding and separates jobs, rounds, networks and validators', () => {
    const record = makeRecord();
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const outcome = ethers.keccak256(
      coder.encode(
        ['uint256', 'bytes32', 'bool', 'bytes32'],
        [1n, specHash, true, ethers.ZeroHash]
      )
    );
    const expected = ethers.keccak256(
      coder.encode(
        ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
        [7n, outcome, record.salt, scope.validator, 31337n, domainSeparator]
      )
    );
    assert.equal(record.commitHash, expected);
    const fields = {
      ...record,
      validator: scope.validator,
      chainId: scope.chainId,
    };
    for (const mutation of [
      { jobId: 8n },
      { nonce: 2n },
      { chainId: 1n },
      { validator: hex('77', 20) },
      { approve: false },
      { burnTxHash: hex('88') },
      { specHash: hex('99') },
    ]) {
      assert.notEqual(commitHash({ ...fields, ...mutation }), expected);
    }
  });

  it('resolves each required burn receipt through bounded provider-adaptive pages without skipping failed ranges', async () => {
    const calls = [];
    const accepted = [];
    const receipt = hex('91');
    const registry = {
      burnEvidenceStatus: async () => ({
        burnRequired: true,
        burnSatisfied: true,
      }),
      filters: { BurnConfirmed: (jobId) => ({ jobId: String(jobId) }) },
      queryFilter: async (filter, from, to) => {
        calls.push([from, to]);
        assert.equal(filter.jobId, '7');
        if (to - from + 1 > 250) throw new Error('provider log range exceeded');
        accepted.push([from, to]);
        return from <= 1950 && to >= 1950
          ? [
              { args: { jobId: 7n, burnTxHash: receipt } },
              { args: { jobId: 8n, burnTxHash: hex('92') } },
              { removed: true, args: { jobId: 7n, burnTxHash: hex('93') } },
            ]
          : [];
      },
      hasBurnReceipt: async (jobId, hash) => {
        assert.equal(String(jobId), '7');
        return hash === receipt;
      },
    };
    assert.equal(
      await resolveJobBurnReceipt(
        registry,
        { getBlockNumber: async () => 5010 },
        7n
      ),
      receipt
    );
    assert.ok(calls.every(([from, to]) => to - from + 1 <= 2000));
    assert.ok(calls.slice(0, 4).every(([, to]) => to === 5010));
    for (let i = 1; i < accepted.length; i++)
      assert.equal(accepted[i][1], accepted[i - 1][0] - 1);
  });

  it('uses zero only when burn evidence is not required and fails before recording an unsatisfied job', async () => {
    assert.equal(
      await resolveJobBurnReceipt(
        { burnEvidenceStatus: async () => [false, true] },
        {},
        7n
      ),
      ethers.ZeroHash
    );
    const journal = journalAt(directory);
    const { runtime, options, calls } = fixture(journal);
    options.registry.burnEvidenceStatus = async () => [true, false];
    await assert.rejects(
      runtime.selected(7n, [scope.validator]),
      /VALIDATOR_BURN_EVIDENCE_REQUIRED/
    );
    assert.equal(journal.records().length, 0);
    assert.equal(calls.commit.length, 0);
  });

  it('rejects missing, zero or invalid current receipts before creating an irreversible commitment', async () => {
    const journal = journalAt(directory);
    const { runtime, options, calls } = fixture(journal);
    options.registry.burnEvidenceStatus = async () => [true, true];
    options.registry.filters = { BurnConfirmed: () => ({}) };
    for (const events of [
      [],
      [{ args: [7n, ethers.ZeroHash] }],
      [{ args: [7n, hex('91')] }],
      [{ args: [8n, hex('92')] }],
    ]) {
      options.registry.queryFilter = async () => events;
      await assert.rejects(
        runtime.selected(7n, [scope.validator]),
        /VALIDATOR_BURN_RECEIPT_UNAVAILABLE/
      );
      assert.equal(journal.records().length, 0);
    }
    assert.equal(calls.commit.length, 0);
  });

  it('propagates failed single-block receipt lookups instead of treating RPC failures as absent evidence', async () => {
    const widths = [];
    const failure = new Error('RPC body containing private provider details');
    const registry = {
      burnEvidenceStatus: async () => [true, true],
      filters: { BurnConfirmed: () => ({}) },
      queryFilter: async (_filter, from, to) => {
        widths.push(to - from + 1);
        throw failure;
      },
    };
    await assert.rejects(
      resolveJobBurnReceipt(registry, { getBlockNumber: async () => 3000 }, 7n),
      (error) => error === failure
    );
    assert.equal(widths[widths.length - 1], 1);
    assert.equal(widths.filter((width) => width === 1).length, 1);
    assert.equal(safeErrorCode(failure), 'VALIDATOR_RPC_OR_STORAGE_FAILURE');
  });

  it('rechecks preserved per-job burn evidence before either broadcast and never replaces a saved receipt', async () => {
    const journal = journalAt(directory);
    const saved = makeRecord({ burnTxHash: hex('91') });
    journal.prepare(saved);
    const { runtime, calls, state } = fixture(journal);
    assert.equal(
      (await runtime.recover())[0].status,
      'VALIDATOR_BURN_RECEIPT_UNAVAILABLE'
    );
    assert.equal(journal.has(saved, 'commit'), false);
    state.commitment = saved.commitHash;
    state.timestamp = 101;
    assert.equal(
      (await runtime.recover())[0].status,
      'VALIDATOR_BURN_RECEIPT_UNAVAILABLE'
    );
    assert.equal(journal.has(saved, 'reveal'), false);
    assert.deepEqual(journal.load('7', '1'), saved);
    assert.equal(calls.commit.length + calls.reveal.length, 0);
  });

  it('does not report confirmation when a transaction has no successful receipt', async () => {
    const journal = journalAt(directory);
    const { options } = fixture(journal);
    let reported = false;
    options.writer.commitValidation = async () => ({
      wait: async () => ({ status: 0 }),
    });
    const runtime = createValidatorRuntime({
      ...options,
      report: () => {
        reported = true;
      },
    });
    await assert.rejects(
      runtime.selected(7n, [scope.validator]),
      /VALIDATOR_TRANSACTION_NOT_CONFIRMED/
    );
    assert.equal(reported, false);
    assert.equal(journal.has(journal.load('7', '1'), 'commit'), true);
  });

  it('requires an explicit valid rehearsal decision instead of approving by default', () => {
    for (const value of [undefined, '', 'maybe', true, 'aproove'])
      assert.throws(
        () => parseDecision(value),
        /EXPLICIT_REHEARSAL_DECISION_REQUIRED/
      );
    assert.equal(parseDecision('approve'), true);
    assert.equal(parseDecision('reject'), false);
  });

  it('persists owner-private secrets and recovers the same reveal after a fresh process', async () => {
    const journal = journalAt(directory);
    const { state, calls, options, runtime } = fixture(journal);
    await runtime.selected(7n, [scope.validator]);
    const original = journal.load('7', '1');
    assert.equal(fs.statSync(journal.directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(journal.file('7', '1')).mode & 0o777, 0o600);
    const script = `const { RevealJournal } = require(${JSON.stringify(
      path.resolve('examples/agentic/validator-recovery.js')
    )}); const j = new RevealJournal(process.argv[1], JSON.parse(process.argv[2])); process.stdout.write(j.load('7','1').commitHash);`;
    assert.equal(
      execFileSync(
        process.execPath,
        ['-e', script, directory, JSON.stringify(scope)],
        { encoding: 'utf8' }
      ),
      original.commitHash
    );
    state.timestamp = 101;
    const restarted = createValidatorRuntime({
      ...options,
      journal: journalAt(directory),
    });
    assert.deepEqual(await restarted.recover(), [
      { jobId: '7', status: 'revealed' },
    ]);
    assert.deepEqual(calls.reveal[0], [
      '7',
      true,
      ethers.ZeroHash,
      original.salt,
      'reviewer',
      [hex('66')],
    ]);
    assert.deepEqual(await restarted.recover(), [
      { jobId: '7', status: 'complete' },
    ]);
    assert.equal(calls.commit.length, 1);
    assert.equal(calls.reveal.length, 1);
  });

  it('commits a prepared pre-broadcast record after restart without changing its salt', async () => {
    const journal = journalAt(directory);
    const record = makeRecord();
    journal.prepare(record);
    const { calls, runtime } = fixture(journalAt(directory));
    assert.deepEqual(await runtime.recover(), [
      { jobId: '7', status: 'committed' },
    ]);
    assert.equal(calls.commit[0][1], record.commitHash);
    assert.equal(journal.load('7', '1').salt, record.salt);
  });

  it('suppresses concurrent duplicate selection callbacks and restart duplicates', async () => {
    const journal = journalAt(directory);
    const { calls, runtime, options } = fixture(journal);
    await Promise.all([
      runtime.selected(7n, [scope.validator]),
      runtime.selected(7n, [scope.validator]),
    ]);
    await createValidatorRuntime({
      ...options,
      journal: journalAt(directory),
    }).selected(7n, [scope.validator]);
    assert.equal(calls.commit.length, 1);
    assert.equal(journal.records().length, 1);
  });

  it('never overwrites a recorded salt or broadcasts a duplicate across journal instances', () => {
    const journal = journalAt(directory);
    const record = makeRecord();
    journal.prepare(record);
    journal.prepare(record);
    assert.throws(
      () => journal.prepare(makeRecord({ salt: hex('77') })),
      /DUPLICATE_MISMATCH/
    );
    assert.equal(journal.mark(record, 'commit'), true);
    assert.equal(journalAt(directory).mark(record, 'commit'), false);
    assert.equal(journal.load('7', '1').salt, record.salt);
  });

  it('retains an ambiguous commit and does not broadcast again on restart', async () => {
    const journal = journalAt(directory);
    const { runtime, options, calls, state } = fixture(journal);
    options.writer.commitValidation = async () => {
      throw new Error(`RPC response includes secret ${hex('55')}`);
    };
    await assert.rejects(runtime.selected(7n, [scope.validator]));
    const original = journal.load('7', '1');
    const restarted = createValidatorRuntime({
      ...options,
      journal: journalAt(directory),
    });
    assert.deepEqual(await restarted.recover(), [
      { jobId: '7', status: 'commit-uncertain' },
    ]);
    assert.equal(calls.commit.length, 0);
    state.commitment = original.commitHash;
    state.timestamp = 101;
    assert.deepEqual(await restarted.recover(), [
      { jobId: '7', status: 'revealed' },
    ]);
    assert.equal(calls.reveal.length, 1);
  });

  it('retains an ambiguous reveal, reconciles a mined result, and never resends', async () => {
    const journal = journalAt(directory);
    const { runtime, options, state, calls } = fixture(journal);
    await runtime.selected(7n, [scope.validator]);
    state.timestamp = 101;
    options.writer.revealValidation = async () => {
      throw new Error('uncertain broadcast');
    };
    assert.deepEqual(await runtime.recover(), [
      { jobId: '7', status: 'VALIDATOR_RPC_OR_STORAGE_FAILURE' },
    ]);
    const restarted = createValidatorRuntime({
      ...options,
      journal: journalAt(directory),
    });
    assert.deepEqual(await restarted.recover(), [
      { jobId: '7', status: 'reveal-uncertain' },
    ]);
    state.revealed = true;
    assert.deepEqual(await restarted.recover(), [
      { jobId: '7', status: 'complete' },
    ]);
    assert.equal(calls.reveal.length, 0);
  });

  it('rechecks completion after reorg and quarantines an orphaned reveal without resending', async () => {
    const journal = journalAt(directory);
    const { runtime, state, calls } = fixture(journal);
    await runtime.selected(7n, [scope.validator]);
    state.timestamp = 101;
    await runtime.recover();
    await runtime.recover();
    state.revealed = false;
    assert.deepEqual(await runtime.recover(), [
      { jobId: '7', status: 'reveal-uncertain' },
    ]);
    assert.equal(calls.reveal.length, 1);
  });

  it('blocks mismatched commitments, changed rounds/specs/domains/networks, and expired windows', async () => {
    for (const [key, value, expected] of [
      ['commitment', hex('88'), 'VALIDATOR_ONCHAIN_COMMITMENT_MISMATCH'],
      ['nonce', 2n, 'VALIDATOR_ROUND_CHANGED'],
      ['specHash', hex('88'), 'VALIDATOR_ROUND_CHANGED'],
      ['domainSeparator', hex('88'), 'VALIDATOR_ROUND_CHANGED'],
      ['chainId', 1n, 'VALIDATOR_CHAIN_CHANGED'],
      ['timestamp', 201, 'VALIDATOR_ROUND_CLOSED'],
      ['timestamp', 101, 'VALIDATOR_COMMIT_WINDOW_CLOSED'],
    ]) {
      const journal = journalAt(path.join(directory, key + String(value)));
      journal.prepare(makeRecord());
      const { state, calls, runtime } = fixture(journal);
      state[key] = value;
      assert.equal((await runtime.recover())[0].status, expected);
      assert.equal(calls.commit.length + calls.reveal.length, 0);
    }
  });

  it('bounds a dropped transaction wait and still reconciles later jobs', async () => {
    const journal = journalAt(directory);
    journal.prepare(makeRecord());
    journal.prepare(makeRecord({ jobId: '8' }));
    const { options } = fixture(journal);
    let broadcasts = 0;
    options.writer.commitValidation = async () => {
      broadcasts += 1;
      return { wait: () => new Promise(() => {}) };
    };
    const runtime = createValidatorRuntime({
      ...options,
      confirmationTimeoutMs: 5,
    });
    const outcomes = await runtime.recover();
    assert.equal(outcomes.length, 2);
    assert.equal(broadcasts, 2);
    assert.ok(
      outcomes.every(({ status }) => status === 'VALIDATOR_BROADCAST_UNCERTAIN')
    );
    assert.ok(
      (await runtime.recover()).every(
        ({ status }) => status === 'commit-uncertain'
      )
    );
    assert.equal(broadcasts, 2);
  });

  it('fails before broadcast if durable persistence fails', async () => {
    const journal = journalAt(directory);
    const { runtime, calls } = fixture(journal);
    journal.publish = () => {
      throw new Error('disk full');
    };
    await assert.rejects(runtime.selected(7n, [scope.validator]), /disk full/);
    assert.equal(calls.commit.length, 0);
  });

  it('rejects corrupt state and does not disclose salts in sanitized errors', async () => {
    const journal = journalAt(directory);
    journal.prepare(makeRecord());
    fs.writeFileSync(journal.file('7', '1'), '{bad');
    const { runtime, calls } = fixture(journal);
    await assert.rejects(runtime.recover(), /JOURNAL_CORRUPT/);
    assert.equal(calls.commit.length + calls.reveal.length, 0);
    assert.equal(
      safeErrorCode(new Error(`calldata=${hex('55')}`)),
      'VALIDATOR_RPC_OR_STORAGE_FAILURE'
    );
  });

  it('rejects a valid record copied into another scope or job filename', () => {
    const journal = journalAt(directory);
    journal.prepare(makeRecord());
    const other = journalAt(directory, { ...scope, chainId: '1' });
    fs.copyFileSync(journal.file('7', '1'), other.file('7', '1'));
    assert.throws(() => other.records(), /JOURNAL_CORRUPT/);
    fs.copyFileSync(journal.file('7', '1'), journal.file('8', '1'));
    assert.throws(() => journal.load('8', '1'), /JOURNAL_CORRUPT/);
  });

  it('rejects secret permissions, symlinks, and malformed phase markers', () => {
    const journal = journalAt(directory);
    const record = makeRecord();
    journal.prepare(record);
    fs.chmodSync(journal.file('7', '1'), 0o644);
    assert.throws(() => journal.records(), /JOURNAL_PERMISSIONS/);
    fs.chmodSync(journal.file('7', '1'), 0o600);
    const marker = journal.file('7', '1', '.commit');
    fs.symlinkSync(journal.file('7', '1'), marker);
    assert.throws(() => journal.mark(record, 'commit'));
    fs.unlinkSync(marker);
    fs.writeFileSync(
      marker,
      JSON.stringify({ version: 1, commitHash: hex('00') }),
      { mode: 0o600 }
    );
    assert.throws(() => journal.records(), /JOURNAL_CORRUPT/);
  });

  it('rejects FIFO secret files without blocking', () => {
    const journal = journalAt(directory);
    execFileSync('mkfifo', ['-m', '600', journal.file('7', '1')]);
    assert.throws(() => journal.records(), /JOURNAL_PERMISSIONS/);
  });

  it('rejects missing or relative journal roots before creating files', () => {
    for (const root of [undefined, null, '']) {
      assert.throws(() => journalAt(root), /VALIDATOR_JOURNAL_PATH_REQUIRED/);
    }
    for (const root of [
      'validator-state',
      './validator-state',
      '../validator-state',
    ]) {
      assert.throws(() => journalAt(root), /VALIDATOR_JOURNAL_PATH_INVALID/);
    }
    assert.equal(path.isAbsolute(journalAt(directory).directory), true);
  });

  it('rejects symlink state directories and unsafe existing directory permissions', () => {
    const target = path.join(directory, 'target');
    fs.mkdirSync(target, { mode: 0o700 });
    const alias = path.join(directory, 'alias');
    fs.symlinkSync(target, alias);
    assert.throws(() => journalAt(alias), /PATH_UNSAFE/);
    fs.chmodSync(target, 0o755);
    assert.throws(() => journalAt(target), /JOURNAL_PERMISSIONS/);
  });
});
