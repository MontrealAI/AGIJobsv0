'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ethers } = require('ethers');

class ValidatorRecoveryError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ValidatorRecoveryError';
    this.code = code;
  }
}
const fail = (code) => {
  throw new ValidatorRecoveryError(code);
};
const uint = (value) =>
  typeof value === 'string' &&
  /^(0|[1-9][0-9]*)$/.test(value) &&
  BigInt(value) < 1n << 256n;
const bytes32 = (value) =>
  typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value);
const validSelection = (selection) =>
  selection &&
  Number.isSafeInteger(selection.blockNumber) &&
  selection.blockNumber >= 0 &&
  bytes32(selection.blockHash) &&
  Number.isSafeInteger(selection.logIndex) &&
  selection.logIndex >= 0;

// Matches ValidationModuleBase._revealValidation's domain-bound encoding.
function commitHash({
  jobId,
  nonce,
  specHash,
  approve,
  burnTxHash,
  salt,
  validator,
  chainId,
  domainSeparator,
}) {
  if (typeof approve !== 'boolean') fail('VALIDATOR_DECISION_INVALID');
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const outcome = ethers.keccak256(
    coder.encode(
      ['uint256', 'bytes32', 'bool', 'bytes32'],
      [nonce, specHash, approve, burnTxHash]
    )
  );
  return ethers.keccak256(
    coder.encode(
      ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
      [jobId, outcome, salt, validator, chainId, domainSeparator]
    )
  );
}

function normalizeScope(scope) {
  if (
    !scope ||
    !uint(String(scope.chainId)) ||
    !ethers.isAddress(scope.validationModule) ||
    !ethers.isAddress(scope.validator)
  ) {
    fail('VALIDATOR_SCOPE_INVALID');
  }
  return {
    chainId: String(scope.chainId),
    validationModule: scope.validationModule.toLowerCase(),
    validator: scope.validator.toLowerCase(),
  };
}

function checkPrivate(stat, directory) {
  if (
    typeof process.getuid !== 'function' ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o077) !== 0 ||
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)
  ) {
    fail('VALIDATOR_JOURNAL_PERMISSIONS');
  }
}

function ensureDirectory(directory) {
  // Reject symlink ancestors, including user-supplied state-directory aliases.
  let current = path.parse(directory).root;
  for (const part of directory
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    let created = false;
    try {
      fs.mkdirSync(current, { mode: 0o700 });
      created = true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    if (created) {
      const parent = fs.openSync(
        path.dirname(current),
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
      );
      try {
        fs.fsyncSync(parent);
      } finally {
        fs.closeSync(parent);
      }
    }
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      fail('VALIDATOR_JOURNAL_PATH_UNSAFE');
  }
  checkPrivate(fs.lstatSync(directory), true);
}

class RevealJournal {
  constructor(root, scope) {
    this.scope = normalizeScope(scope);
    if (typeof root !== 'string' || root.length === 0)
      fail('VALIDATOR_JOURNAL_PATH_REQUIRED');
    if (!path.isAbsolute(root)) fail('VALIDATOR_JOURNAL_PATH_INVALID');
    const parent = path.resolve(root);
    ensureDirectory(parent);
    const key = crypto
      .createHash('sha256')
      .update(JSON.stringify(this.scope))
      .digest('hex');
    this.directory = path.join(parent, key);
    ensureDirectory(this.directory);
  }

  file(jobId, nonce, suffix = '.json', selection) {
    if (
      !uint(String(jobId)) ||
      !uint(String(nonce)) ||
      !validSelection(selection)
    )
      fail('VALIDATOR_RECORD_ID_INVALID');
    return path.join(
      this.directory,
      `${jobId}-${nonce}-${selection.blockHash.slice(2)}-${
        selection.logIndex
      }${suffix}`
    );
  }

  read(file) {
    checkPrivate(fs.lstatSync(this.directory), true);
    let descriptor;
    try {
      descriptor = fs.openSync(
        file,
        fs.constants.O_RDONLY |
          fs.constants.O_NOFOLLOW |
          fs.constants.O_NONBLOCK
      );
      const stat = fs.fstatSync(descriptor);
      checkPrivate(stat, false);
      if (stat.size > 65536) fail('VALIDATOR_JOURNAL_CORRUPT');
      const raw = fs.readFileSync(descriptor, 'utf8');
      try {
        return JSON.parse(raw);
      } catch {
        fail('VALIDATOR_JOURNAL_CORRUPT');
      }
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }

  // Immutable, exclusive publication prevents two processes from replacing salts
  // or broadcasting the same phase. Both data and directory entries are synced.
  publish(file, data) {
    checkPrivate(fs.lstatSync(this.directory), true);
    const temp = path.join(this.directory, `.pending-${crypto.randomUUID()}`);
    let descriptor;
    try {
      descriptor = fs.openSync(
        temp,
        fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_NOFOLLOW,
        0o600
      );
      fs.writeFileSync(descriptor, JSON.stringify(data));
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      try {
        fs.linkSync(temp, file);
      } catch (err) {
        if (err.code === 'EEXIST') return false;
        throw err;
      }
      return true;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
      const dir = fs.openSync(
        this.directory,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
      );
      try {
        fs.fsyncSync(dir);
      } finally {
        fs.closeSync(dir);
      }
    }
  }

  validate(record) {
    if (record?.version === 1) fail('VALIDATOR_JOURNAL_LEGACY_REQUIRES_REVIEW');
    if (
      !record ||
      record.version !== 2 ||
      !validSelection(record.selection) ||
      !uint(record.jobId) ||
      !uint(record.nonce) ||
      typeof record.approve !== 'boolean' ||
      !bytes32(record.specHash) ||
      !bytes32(record.burnTxHash) ||
      !bytes32(record.salt) ||
      !bytes32(record.commitHash) ||
      !bytes32(record.domainSeparator) ||
      !record.scope ||
      JSON.stringify(normalizeScope(record.scope)) !==
        JSON.stringify(this.scope) ||
      typeof record.subdomain !== 'string' ||
      !/^[a-z0-9-]{1,63}$/.test(record.subdomain) ||
      !Array.isArray(record.revealProof) ||
      record.revealProof.length > 256 ||
      !record.revealProof.every(bytes32) ||
      !Array.isArray(record.commitProof) ||
      record.commitProof.length > 256 ||
      !record.commitProof.every(bytes32)
    ) {
      fail('VALIDATOR_JOURNAL_CORRUPT');
    }
    const expected = commitHash({
      ...record,
      validator: this.scope.validator,
      chainId: this.scope.chainId,
    });
    if (record.commitHash !== expected)
      fail('VALIDATOR_JOURNAL_COMMITMENT_MISMATCH');
    return record;
  }

  load(jobId, nonce, selection) {
    try {
      const record = this.validate(
        this.read(this.file(jobId, nonce, '.json', selection))
      );
      if (
        record.jobId !== String(jobId) ||
        record.nonce !== String(nonce) ||
        JSON.stringify(record.selection) !== JSON.stringify(selection)
      )
        fail('VALIDATOR_JOURNAL_CORRUPT');
      return record;
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  prepare(record) {
    this.validate(record);
    const file = this.file(
      record.jobId,
      record.nonce,
      '.json',
      record.selection
    );
    if (!this.publish(file, record)) {
      const previous = this.load(record.jobId, record.nonce, record.selection);
      if (JSON.stringify(previous) !== JSON.stringify(record))
        fail('VALIDATOR_JOURNAL_DUPLICATE_MISMATCH');
    }
    return record;
  }

  records() {
    checkPrivate(fs.lstatSync(this.directory), true);
    return fs
      .readdirSync(this.directory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const record = this.validate(
          this.read(path.join(this.directory, name))
        );
        if (
          path.basename(
            this.file(record.jobId, record.nonce, '.json', record.selection)
          ) !== name
        )
          fail('VALIDATOR_JOURNAL_CORRUPT');
        for (const phase of ['commit', 'reveal', 'complete'])
          this.has(record, phase);
        return record;
      });
  }

  has(record, phase) {
    if (!['commit', 'reveal', 'complete'].includes(phase))
      fail('VALIDATOR_PHASE_INVALID');
    try {
      const marker = this.read(
        this.file(record.jobId, record.nonce, `.${phase}`, record.selection)
      );
      if (marker.version !== 1 || marker.commitHash !== record.commitHash)
        fail('VALIDATOR_JOURNAL_CORRUPT');
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }

  mark(record, phase) {
    if (this.has(record, phase)) return false;
    return this.publish(
      this.file(record.jobId, record.nonce, `.${phase}`, record.selection),
      {
        version: 1,
        commitHash: record.commitHash,
      }
    );
  }
}

// The nonce is deleted during contract cleanup and can be reused. The canonical
// ValidatorsSelected log gives each round a distinct, reorg-aware identity.
async function resolveSelection(
  reader,
  provider,
  jobId,
  validator,
  blockNumber
) {
  const filter = reader.filters.ValidatorsSelected(jobId);
  let toBlock = blockNumber;
  let pageSize = 2000;
  while (toBlock >= 0) {
    const fromBlock = Math.max(0, toBlock - pageSize + 1);
    let events;
    try {
      events = await reader.queryFilter(filter, fromBlock, toBlock);
    } catch (error) {
      if (pageSize === 1) throw error;
      pageSize = Math.max(1, Math.floor(pageSize / 2));
      continue;
    }
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (
        event.removed ||
        !event.args ||
        String(event.args.jobId ?? event.args[0]) !== String(jobId)
      )
        continue;
      const selection = {
        blockNumber: event.blockNumber,
        blockHash: event.blockHash?.toLowerCase(),
        logIndex: event.index,
      };
      const validators = event.args.validators ?? event.args[1];
      if (
        !validSelection(selection) ||
        selection.blockNumber > blockNumber ||
        !Array.isArray(validators) ||
        !validators.some((address) => address.toLowerCase() === validator)
      )
        fail('VALIDATOR_SELECTION_UNAVAILABLE');
      const anchor = await provider.getBlock(selection.blockNumber);
      if (anchor?.hash?.toLowerCase() !== selection.blockHash)
        fail('VALIDATOR_ROUND_CHANGED');
      return selection;
    }
    toBlock = fromBlock - 1;
  }
  fail('VALIDATOR_SELECTION_UNAVAILABLE');
}

async function assertPreviousRoundClosed(
  journal,
  reader,
  provider,
  previous,
  next
) {
  const old = previous.selection;
  const anchor = await provider.getBlock(old.blockNumber);
  if (
    anchor?.hash?.toLowerCase() !== old.blockHash ||
    next.blockNumber < old.blockNumber ||
    (next.blockNumber === old.blockNumber && next.logIndex <= old.logIndex)
  )
    fail('VALIDATOR_ROUND_CHANGED');
  if (!journal.has(previous, 'commit')) return;
  // A pending old transaction must not be mistaken for a settled old round.
  const filter = reader.filters.ValidationCommitted(
    previous.jobId,
    journal.scope.validator
  );
  let toBlock = next.blockNumber;
  let pageSize = 2000;
  while (toBlock >= old.blockNumber) {
    const fromBlock = Math.max(old.blockNumber, toBlock - pageSize + 1);
    let events;
    try {
      events = await reader.queryFilter(filter, fromBlock, toBlock);
    } catch (error) {
      if (pageSize === 1) throw error;
      pageSize = Math.max(1, Math.floor(pageSize / 2));
      continue;
    }
    for (const event of events) {
      if (
        event.removed ||
        !event.args ||
        String(event.args.jobId ?? event.args[0]) !== previous.jobId ||
        (event.args.validator ?? event.args[1])?.toLowerCase() !==
          journal.scope.validator ||
        (event.args.commitHash ?? event.args[2])?.toLowerCase() !==
          previous.commitHash ||
        event.blockNumber < old.blockNumber ||
        event.blockNumber > next.blockNumber ||
        (event.blockNumber === old.blockNumber &&
          event.index <= old.logIndex) ||
        (event.blockNumber === next.blockNumber && event.index >= next.logIndex)
      )
        continue;
      const block = await provider.getBlock(event.blockNumber);
      if (block?.hash?.toLowerCase() === event.blockHash?.toLowerCase()) return;
    }
    toBlock = fromBlock - 1;
  }
  fail('VALIDATOR_PREVIOUS_COMMIT_UNCERTAIN');
}

function safeErrorCode(err) {
  return err instanceof ValidatorRecoveryError
    ? err.code
    : 'VALIDATOR_RPC_OR_STORAGE_FAILURE';
}

async function resolveJobBurnReceipt(registry, provider, jobId) {
  const status = await registry.burnEvidenceStatus(jobId);
  if (!(status.burnRequired ?? status[0])) return ethers.ZeroHash;
  if (!(status.burnSatisfied ?? status[1]))
    fail('VALIDATOR_BURN_EVIDENCE_REQUIRED');
  const filter = registry.filters.BurnConfirmed(jobId);
  let toBlock = await provider.getBlockNumber();
  if (!Number.isSafeInteger(toBlock) || toBlock < 0)
    fail('VALIDATOR_BLOCK_UNAVAILABLE');
  let pageSize = 2000;
  while (toBlock >= 0) {
    const fromBlock = Math.max(0, toBlock - pageSize + 1);
    let events;
    try {
      events = await registry.queryFilter(filter, fromBlock, toBlock);
    } catch (error) {
      if (pageSize === 1) throw error;
      pageSize = Math.max(1, Math.floor(pageSize / 2));
      continue;
    }
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (
        event.removed ||
        !event.args ||
        String(event.args.jobId ?? event.args[0]) !== String(jobId)
      )
        continue;
      const candidate = event.args.burnTxHash ?? event.args[1];
      if (
        !ethers.isHexString(candidate, 32) ||
        candidate === ethers.ZeroHash ||
        !(await registry.hasBurnReceipt(jobId, candidate))
      )
        fail('VALIDATOR_BURN_RECEIPT_UNAVAILABLE');
      return candidate.toLowerCase();
    }
    toBlock = fromBlock - 1;
  }
  fail('VALIDATOR_BURN_RECEIPT_UNAVAILABLE');
}

async function assertRecordedBurnEvidence(registry, record) {
  const status = await registry.burnEvidenceStatus(record.jobId);
  if (status.burnRequired ?? status[0]) {
    if (!(status.burnSatisfied ?? status[1]))
      fail('VALIDATOR_BURN_EVIDENCE_REQUIRED');
    if (record.burnTxHash === ethers.ZeroHash)
      fail('VALIDATOR_BURN_RECEIPT_UNAVAILABLE');
  }
  if (
    record.burnTxHash !== ethers.ZeroHash &&
    !(await registry.hasBurnReceipt(record.jobId, record.burnTxHash))
  ) {
    fail('VALIDATOR_BURN_RECEIPT_UNAVAILABLE');
  }
}

function createValidatorRuntime({
  journal,
  reader,
  writer,
  registry,
  provider,
  validatorLabel,
  approve,
  commitProof = [],
  revealProof = [],
  report = () => {},
  confirmationTimeoutMs = 60000,
}) {
  if (
    !Number.isSafeInteger(confirmationTimeoutMs) ||
    confirmationTimeoutMs < 1 ||
    confirmationTimeoutMs > 300000
  )
    fail('VALIDATOR_TIMEOUT_INVALID');
  const pending = new Map();
  const scope = journal.scope;
  const serial = (key, work) => {
    if (pending.has(key)) return pending.get(key);
    const task = Promise.resolve()
      .then(work)
      .finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  };

  async function broadcast(send) {
    let timer;
    try {
      await Promise.race([
        Promise.resolve()
          .then(send)
          .then((tx) => tx.wait(2, confirmationTimeoutMs))
          .then((receipt) => {
            if (!receipt || receipt.status !== 1)
              fail('VALIDATOR_TRANSACTION_NOT_CONFIRMED');
          }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new ValidatorRecoveryError('VALIDATOR_BROADCAST_UNCERTAIN')
              ),
            confirmationTimeoutMs
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function reconcile(record) {
    journal.has(record, 'complete'); // Validate the marker, but re-check chain state after reorgs.
    const network = await provider.getNetwork();
    if (String(network.chainId) !== scope.chainId)
      fail('VALIDATOR_CHAIN_CHANGED');
    // Recover only against a consistent block with two confirmations.
    const latest = await provider.getBlock('latest');
    if (!latest) fail('VALIDATOR_BLOCK_UNAVAILABLE');
    const block = await provider.getBlock(Math.max(0, latest.number - 1));
    if (!block) fail('VALIDATOR_BLOCK_UNAVAILABLE');
    if (block.number < record.selection.blockNumber)
      return 'awaiting-confirmations';
    const selection = await resolveSelection(
      reader,
      provider,
      record.jobId,
      scope.validator,
      block.number
    );
    if (JSON.stringify(selection) !== JSON.stringify(record.selection))
      fail('VALIDATOR_ROUND_CHANGED');
    const options = { blockTag: block.number };
    const [nonce, hash, revealed, round, specHash, domainSeparator] =
      await Promise.all([
        reader.jobNonce(record.jobId, options),
        reader.commitments(
          record.jobId,
          scope.validator,
          record.nonce,
          options
        ),
        reader.revealed(record.jobId, scope.validator, options),
        reader.rounds(record.jobId, options),
        registry.getSpecHash(record.jobId, options),
        reader.DOMAIN_SEPARATOR(options),
      ]);
    if (
      String(nonce) !== record.nonce ||
      specHash.toLowerCase() !== record.specHash ||
      domainSeparator.toLowerCase() !== record.domainSeparator
    ) {
      fail('VALIDATOR_ROUND_CHANGED');
    }
    if (hash !== ethers.ZeroHash && hash.toLowerCase() !== record.commitHash)
      fail('VALIDATOR_ONCHAIN_COMMITMENT_MISMATCH');
    if (revealed && hash.toLowerCase() === record.commitHash) {
      journal.mark(record, 'complete');
      return 'complete';
    }
    if (round.tallied || BigInt(block.timestamp) > BigInt(round.revealDeadline))
      fail('VALIDATOR_ROUND_CLOSED');
    if (hash === ethers.ZeroHash) {
      if (journal.has(record, 'commit')) return 'commit-uncertain';
      if (
        BigInt(round.commitDeadline) === 0n ||
        BigInt(block.timestamp) > BigInt(round.commitDeadline)
      )
        fail('VALIDATOR_COMMIT_WINDOW_CLOSED');
      await assertRecordedBurnEvidence(registry, record);
      if (!journal.mark(record, 'commit')) return 'commit-uncertain';
      await broadcast(() =>
        writer.commitValidation(
          record.jobId,
          record.commitHash,
          record.subdomain,
          record.commitProof
        )
      );
      report('commit', record.jobId);
      return 'committed';
    }
    if (BigInt(block.timestamp) <= BigInt(round.commitDeadline))
      return 'waiting-for-reveal';
    if (journal.has(record, 'reveal')) return 'reveal-uncertain';
    await assertRecordedBurnEvidence(registry, record);
    if (!journal.mark(record, 'reveal')) return 'reveal-uncertain';
    await broadcast(() =>
      writer.revealValidation(
        record.jobId,
        record.approve,
        record.burnTxHash,
        record.salt,
        record.subdomain,
        record.revealProof
      )
    );
    // The next reconciliation checks canonical on-chain state before completion.
    report('reveal', record.jobId);
    return 'revealed';
  }

  async function recover() {
    const records = journal.records(); // Validate the whole journal before any send.
    const outcomes = [];
    for (const record of records) {
      try {
        const status = await serial(record.jobId, () => reconcile(record));
        outcomes.push({ jobId: record.jobId, status });
      } catch (err) {
        outcomes.push({ jobId: record.jobId, status: safeErrorCode(err) });
      }
    }
    return outcomes;
  }

  async function selected(jobId, validators) {
    if (
      !Array.isArray(validators) ||
      !validators.some((v) => String(v).toLowerCase() === scope.validator)
    )
      return;
    const key = String(jobId);
    return serial(key, async () => {
      const previousRecords = journal.records(); // Validate before preparing any vote.
      const block = await provider.getBlock('latest');
      if (!block) fail('VALIDATOR_BLOCK_UNAVAILABLE');
      const options = { blockTag: block.number };
      const selection = await resolveSelection(
        reader,
        provider,
        jobId,
        scope.validator,
        block.number
      );
      const nonce = String(await reader.jobNonce(jobId, options));
      let record = journal.load(key, nonce, selection);
      if (!record) {
        for (const previous of previousRecords.filter(
          (entry) => entry.jobId === key
        )) {
          await assertPreviousRoundClosed(
            journal,
            reader,
            provider,
            previous,
            selection
          );
        }
        const [specHash, domainSeparator, burnTxHash] = await Promise.all([
          registry.getSpecHash(jobId, options),
          reader.DOMAIN_SEPARATOR(options),
          resolveJobBurnReceipt(registry, provider, jobId),
        ]);
        record = {
          version: 2,
          selection,
          scope,
          jobId: key,
          nonce,
          specHash: specHash.toLowerCase(),
          domainSeparator: domainSeparator.toLowerCase(),
          approve,
          burnTxHash,
          salt: ethers.hexlify(ethers.randomBytes(32)),
          subdomain: validatorLabel,
          commitProof: [...commitProof],
          revealProof: [...revealProof],
        };
        record.commitHash = commitHash({
          ...record,
          validator: scope.validator,
          chainId: scope.chainId,
        });
        journal.prepare(record); // Must succeed before any network mutation.
      }
      return reconcile(record);
    });
  }
  return { recover, selected };
}

module.exports = {
  RevealJournal,
  ValidatorRecoveryError,
  commitHash,
  createValidatorRuntime,
  resolveJobBurnReceipt,
  safeErrorCode,
};
