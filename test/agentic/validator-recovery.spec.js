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
const selection = { blockNumber: 10, blockHash: hex('aa'), logIndex: 0 };
function makeRecord(overrides = {}) {
  const record = {
    version: 2,
    selection,
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
      selection: { ...selection },
      commitment: ethers.ZeroHash,
      revealed: false,
      timestamp: 50,
      chainId: 31337n,
      specHash,
      domainSeparator,
      tallied: false,
      commitDeadline: 100n,
      revealDeadline: 200n,
      committedEvents: [],
    };
    const calls = { commit: [], reveal: [] };
    const reader = {
      filters: {
        ValidatorsSelected: (jobId) => ({ jobId: String(jobId) }),
        ValidationCommitted: () => ({ commits: true }),
      },
      queryFilter: async (filter, from, to) =>
        filter.commits
          ? state.committedEvents.filter(
              (event) => event.blockNumber >= from && event.blockNumber <= to
            )
          : state.selection.blockNumber >= from &&
            state.selection.blockNumber <= to
          ? [
              {
                args: { jobId: filter.jobId, validators: [scope.validator] },
                blockNumber: state.selection.blockNumber,
                blockHash: state.selection.blockHash,
                index: state.selection.logIndex,
              },
            ]
          : [],
      jobNonce: async () => state.nonce,
      commitments: async () => state.commitment,
      revealed: async () => state.revealed,
      rounds: async () => ({
        commitDeadline: state.commitDeadline,
        revealDeadline: state.revealDeadline,
        tallied: state.tallied,
      }),
      DOMAIN_SEPARATOR: async () => state.domainSeparator,
    };
    const writer = {
      commitValidation: async (...args) => {
        assert.equal(
          journal.has(journal.load('7', '1', state.selection), 'commit'),
          true
        );
        calls.commit.push(args);
        state.commitment = args[1];
        state.committedEvents.push({
          args: {
            jobId: String(args[0]),
            validator: scope.validator,
            commitHash: args[1],
          },
          blockNumber: state.selection.blockNumber,
          blockHash: state.selection.blockHash,
          index: state.selection.logIndex + 1,
        });
        return { wait: async () => ({ status: 1 }) };
      },
      revealValidation: async (...args) => {
        assert.equal(
          journal.has(journal.load('7', '1', state.selection), 'reveal'),
          true
        );
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
        getLogs: async () => [],
        getNetwork: async () => ({ chainId: state.chainId }),
        getBlockNumber: async () => 21,
        getBlock: async (tag) => ({
          number: tag === 'latest' ? 21 : tag,
          timestamp: state.timestamp,
          hash: state.selection.blockHash,
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
    assert.deepEqual(journal.load('7', '1', selection), saved);
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
    assert.equal(
      journal.has(journal.load('7', '1', selection), 'commit'),
      true
    );
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
    const original = journal.load('7', '1', selection);
    assert.equal(fs.statSync(journal.directory).mode & 0o777, 0o700);
    assert.equal(
      fs.statSync(journal.file('7', '1', '.json', selection)).mode & 0o777,
      0o600
    );
    const script = `const { RevealJournal } = require(${JSON.stringify(
      path.resolve('examples/agentic/validator-recovery.js')
    )}); const j = new RevealJournal(process.argv[1], JSON.parse(process.argv[2])); process.stdout.write(j.records()[0].commitHash);`;
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
    assert.equal(journal.load('7', '1', selection).salt, record.salt);
  });

  for (const completed of [false, true]) {
    it(`creates a new durable vote when a ${
      completed ? 'completed' : 'reset'
    } round reuses its nonce`, async () => {
      const journal = journalAt(directory);
      const { runtime, state, calls, options } = fixture(journal);
      await runtime.selected(7n, [scope.validator]);
      const previous = journal.load('7', '1', selection);
      if (completed) {
        state.timestamp = 101;
        await runtime.recover();
        await runtime.recover();
        assert.equal(journal.has(previous, 'complete'), true);
      }
      state.selection = { ...selection, logIndex: 2 };
      state.commitment = ethers.ZeroHash;
      state.revealed = false;
      state.commitDeadline = 300n;
      state.revealDeadline = 400n;
      state.timestamp = 250;
      const restarted = createValidatorRuntime({
        ...options,
        journal: journalAt(directory),
      });
      assert.equal(
        await restarted.selected(7n, [scope.validator]),
        'committed'
      );
      const next = journal.load('7', '1', state.selection);
      assert.notEqual(next.salt, previous.salt);
      assert.notEqual(next.commitHash, previous.commitHash);
      assert.deepEqual(journal.load('7', '1', selection), previous);
      assert.equal(journal.records().length, 2);
      await restarted.selected(7n, [scope.validator]);
      assert.equal(calls.commit.length, 2);
      assert.deepEqual(
        (await restarted.recover()).map((entry) => entry.status),
        ['VALIDATOR_ROUND_CHANGED', 'waiting-for-reveal']
      );
    });
  }

  it('quarantines a selected record if its canonical selection is replaced', async () => {
    const journal = journalAt(directory);
    const { runtime, state, calls } = fixture(journal);
    await runtime.selected(7n, [scope.validator]);
    state.selection = { ...selection, blockHash: hex('bb') };
    state.commitment = ethers.ZeroHash;
    assert.equal(
      (await runtime.recover())[0].status,
      'VALIDATOR_ROUND_CHANGED'
    );
    await assert.rejects(
      runtime.selected(7n, [scope.validator]),
      /VALIDATOR_ROUND_CHANGED/
    );
    assert.equal(calls.commit.length, 1);
  });

  it('does not replace a previous round while its broadcast remains unconfirmed', async () => {
    const journal = journalAt(directory);
    const { runtime, state, calls, options } = fixture(journal);
    options.writer.commitValidation = async () => {
      throw new Error('lost send response');
    };
    await assert.rejects(runtime.selected(7n, [scope.validator]));
    state.selection = { ...selection, logIndex: 2 };
    await assert.rejects(
      runtime.selected(7n, [scope.validator]),
      /VALIDATOR_PREVIOUS_COMMIT_UNCERTAIN/
    );
    assert.equal(journal.records().length, 1);
    assert.equal(calls.commit.length, 0);
  });

  it('requires review of legacy journals instead of silently creating a new vote', async () => {
    const journal = journalAt(directory);
    const record = makeRecord({ version: 1 });
    fs.writeFileSync(
      path.join(journal.directory, '7-1.json'),
      JSON.stringify(record),
      { mode: 0o600 }
    );
    const { runtime, calls } = fixture(journal);
    await assert.rejects(
      runtime.selected(7n, [scope.validator]),
      /VALIDATOR_JOURNAL_LEGACY_REQUIRES_REVIEW/
    );
    assert.equal(calls.commit.length, 0);
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
    assert.equal(journal.load('7', '1', selection).salt, record.salt);
  });

  it('retains an ambiguous commit and does not broadcast again on restart', async () => {
    const journal = journalAt(directory);
    const { runtime, options, calls, state } = fixture(journal);
    options.writer.commitValidation = async () => {
      throw new Error(`RPC response includes secret ${hex('55')}`);
    };
    await assert.rejects(runtime.selected(7n, [scope.validator]));
    const original = journal.load('7', '1', selection);
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

  for (const fault of [
    'none',
    'orphan',
    'receipt',
    'missing-log',
    'wrong-salt',
    'wrong-sender',
    'wrong-selection',
    'unconfirmed',
    'removed',
  ]) {
    it(`recovers a finalized reveal only with matching canonical evidence: ${fault}`, async () => {
      const journal = journalAt(directory);
      const saved = makeRecord();
      journal.prepare(saved);
      journal.mark(saved, 'commit');
      journal.mark(saved, 'reveal');
      const { options, state, calls, runtime } = fixture(journal);
      state.nonce = 0n;
      state.commitDeadline = 0n;
      state.revealDeadline = 0n;
      const iface = new ethers.Interface([
        'event ValidationRevealed(uint256 indexed jobId,address indexed validator,bool approve,bytes32 burnTxHash,string subdomain)',
        'function revealValidation(uint256 jobId,bool approve,bytes32 burnTxHash,bytes32 salt,string subdomain,bytes32[] proof)',
      ]);
      const encoded = iface.encodeEventLog(
        iface.getEvent('ValidationRevealed'),
        [7n, scope.validator, true, ethers.ZeroHash, 'reviewer']
      );
      const log = {
        ...encoded,
        address: scope.validationModule,
        blockNumber: 12,
        blockHash: selection.blockHash,
        index: 2,
        transactionHash: hex('ab'),
        removed: false,
      };
      const receipt = {
        status: 1,
        blockNumber: 12,
        blockHash: selection.blockHash,
        hash: log.transactionHash,
        logs: [log],
      };
      const transaction = {
        hash: log.transactionHash,
        blockHash: selection.blockHash,
        to: scope.validationModule,
        from: scope.validator,
        data: iface.encodeFunctionData('revealValidation', [
          7n,
          true,
          ethers.ZeroHash,
          fault === 'wrong-salt' ? hex('99') : saved.salt,
          'reviewer',
          [],
        ]),
      };
      if (fault === 'orphan') log.blockHash = hex('bb');
      if (fault === 'receipt') receipt.status = 0;
      if (fault === 'missing-log') receipt.logs = [];
      if (fault === 'wrong-sender') transaction.from = hex('99', 20);
      if (fault === 'wrong-selection')
        state.selection = { ...selection, logIndex: 1 };
      if (fault === 'unconfirmed') log.blockNumber = 21;
      if (fault === 'removed') log.removed = true;
      const ranges = [];
      options.provider.getLogs = async ({ fromBlock, toBlock }) => {
        ranges.push([fromBlock, toBlock]);
        if (toBlock - fromBlock + 1 > 2)
          throw new Error('provider range limit');
        return log.blockNumber >= fromBlock && log.blockNumber <= toBlock
          ? [log]
          : [];
      };
      options.provider.getTransactionReceipt = async () => receipt;
      options.provider.getTransaction = async () => transaction;
      const result = (await runtime.recover())[0];
      assert.equal(result.status === 'complete', fault === 'none');
      assert.equal(journal.has(saved, 'complete'), fault === 'none');
      assert.equal(calls.commit.length + calls.reveal.length, 0);
      assert.ok(
        ranges.every(([from, to]) => from >= selection.blockNumber && to <= 20)
      );
    });
  }

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
    fs.writeFileSync(journal.file('7', '1', '.json', selection), '{bad');
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
    fs.copyFileSync(
      journal.file('7', '1', '.json', selection),
      other.file('7', '1', '.json', selection)
    );
    assert.throws(() => other.records(), /JOURNAL_CORRUPT/);
    fs.copyFileSync(
      journal.file('7', '1', '.json', selection),
      journal.file('8', '1', '.json', selection)
    );
    assert.throws(() => journal.load('8', '1', selection), /JOURNAL_CORRUPT/);
  });

  it('rejects secret permissions, symlinks, and malformed phase markers', () => {
    const journal = journalAt(directory);
    const record = makeRecord();
    journal.prepare(record);
    fs.chmodSync(journal.file('7', '1', '.json', selection), 0o644);
    assert.throws(() => journal.records(), /JOURNAL_PERMISSIONS/);
    fs.chmodSync(journal.file('7', '1', '.json', selection), 0o600);
    const marker = journal.file('7', '1', '.commit', selection);
    fs.symlinkSync(journal.file('7', '1', '.json', selection), marker);
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
    execFileSync('mkfifo', [
      '-m',
      '600',
      journal.file('7', '1', '.json', selection),
    ]);
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
