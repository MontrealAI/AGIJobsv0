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

  file(jobId, nonce, suffix = '.json') {
    if (!uint(String(jobId)) || !uint(String(nonce)))
      fail('VALIDATOR_RECORD_ID_INVALID');
    return path.join(this.directory, `${jobId}-${nonce}${suffix}`);
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
    if (
      !record ||
      record.version !== 1 ||
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

  load(jobId, nonce) {
    try {
      const record = this.validate(this.read(this.file(jobId, nonce)));
      if (record.jobId !== String(jobId) || record.nonce !== String(nonce))
        fail('VALIDATOR_JOURNAL_CORRUPT');
      return record;
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  prepare(record) {
    this.validate(record);
    const file = this.file(record.jobId, record.nonce);
    if (!this.publish(file, record)) {
      const previous = this.load(record.jobId, record.nonce);
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
        if (path.basename(this.file(record.jobId, record.nonce)) !== name)
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
        this.file(record.jobId, record.nonce, `.${phase}`)
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
    return this.publish(this.file(record.jobId, record.nonce, `.${phase}`), {
      version: 1,
      commitHash: record.commitHash,
    });
  }
}

function safeErrorCode(err) {
  return err instanceof ValidatorRecoveryError
    ? err.code
    : 'VALIDATOR_RPC_OR_STORAGE_FAILURE';
}

function createValidatorRuntime({
  journal,
  reader,
  writer,
  registry,
  provider,
  validatorLabel,
  approve,
  burnTxHash,
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
          .then((tx) => tx.wait(2, confirmationTimeoutMs)),
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
      const nonce = String(await reader.jobNonce(jobId));
      let record = journal.load(key, nonce);
      if (!record) {
        const [specHash, domainSeparator] = await Promise.all([
          registry.getSpecHash(jobId),
          reader.DOMAIN_SEPARATOR(),
        ]);
        record = {
          version: 1,
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
  safeErrorCode,
};
