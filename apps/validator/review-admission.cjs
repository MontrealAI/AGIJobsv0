'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');
const {
  ValidatorRecoveryError,
  ensurePrivateDirectory,
} = require('../../examples/agentic/validator-recovery');

const fail = (code) => {
  throw new ValidatorRecoveryError(code);
};
const uint = (value) =>
  typeof value === 'string' &&
  /^(0|[1-9][0-9]*)$/.test(value) &&
  BigInt(value) < 1n << 256n;
const hash = (value) =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
const address = (value) =>
  typeof value === 'string' &&
  ethers.isAddress(value) &&
  value !== ethers.ZeroAddress;
const sameHash = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.toLowerCase() === b.toLowerCase();

function readPrivateJson(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file))
    fail('VALIDATOR_REVIEW_PATH_INVALID');
  // A private leaf is insufficient if an ancestor redirects the configuration.
  let current = path.parse(file).root;
  for (const part of path
    .dirname(file)
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      fail('VALIDATOR_REVIEW_PATH_UNSAFE');
  }
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const stat = fs.fstatSync(descriptor);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      typeof process.getuid !== 'function' ||
      ![0, process.getuid()].includes(stat.uid) ||
      (stat.mode & 0o077) !== 0
    )
      fail('VALIDATOR_REVIEW_PERMISSIONS');
    if (stat.size > 1024 * 1024) fail('VALIDATOR_REVIEW_TOO_LARGE');
    // Bound the actual read too, including a concurrently growing regular file.
    const buffer = Buffer.alloc(1024 * 1024 + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = fs.readSync(
        descriptor,
        buffer,
        size,
        buffer.length - size,
        null
      );
      if (!count) break;
      size += count;
    }
    if (size > 1024 * 1024) fail('VALIDATOR_REVIEW_TOO_LARGE');
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          buffer.subarray(0, size)
        )
      );
    } catch {
      fail('VALIDATOR_REVIEW_INVALID');
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

function validateReviewFile(data) {
  if (
    !data ||
    data.version !== 1 ||
    !uint(data.chainId) ||
    data.chainId === '0' ||
    !address(data.validationModule) ||
    !address(data.jobRegistry) ||
    !address(data.validator) ||
    !Array.isArray(data.decisions) ||
    data.decisions.length > 1024
  )
    fail('VALIDATOR_REVIEW_INVALID');
  const ids = new Set();
  for (const entry of data.decisions) {
    if (
      !entry ||
      !uint(entry.jobId) ||
      entry.jobId === '0' ||
      !uint(entry.nonce) ||
      !hash(entry.specHash) ||
      entry.specHash === ethers.ZeroHash ||
      !hash(entry.resultHash) ||
      entry.resultHash === ethers.ZeroHash ||
      typeof entry.approve !== 'boolean' ||
      !entry.selection ||
      !Number.isSafeInteger(entry.selection.blockNumber) ||
      entry.selection.blockNumber < 0 ||
      !Number.isSafeInteger(entry.selection.logIndex) ||
      entry.selection.logIndex < 0 ||
      !hash(entry.selection.blockHash) ||
      typeof entry.reviewedBy !== 'string' ||
      !entry.reviewedBy.trim() ||
      entry.reviewedBy.length > 160 ||
      typeof entry.reviewedAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(entry.reviewedAt) ||
      !Number.isFinite(Date.parse(entry.reviewedAt))
    )
      fail('VALIDATOR_REVIEW_INVALID');
    const id = `${entry.jobId}:${
      entry.nonce
    }:${entry.selection.blockHash.toLowerCase()}:${entry.selection.logIndex}`;
    if (ids.has(id)) fail('VALIDATOR_REVIEW_DUPLICATE');
    ids.add(id);
  }
  return data;
}

function readReviewDecision(file, context, jobRegistry, resultHash) {
  if (!file) return null;
  const data = validateReviewFile(readPrivateJson(file));
  if (
    data.chainId !== context.scope.chainId ||
    !sameHash(data.validationModule, context.scope.validationModule) ||
    !sameHash(data.validator, context.scope.validator) ||
    !sameHash(data.jobRegistry, jobRegistry)
  )
    fail('VALIDATOR_REVIEW_SCOPE_MISMATCH');
  const entry = data.decisions.find(
    (item) =>
      item.jobId === context.jobId &&
      item.nonce === context.nonce &&
      sameHash(item.specHash, context.specHash) &&
      sameHash(item.resultHash, resultHash) &&
      item.selection.blockNumber === context.selection.blockNumber &&
      item.selection.logIndex === context.selection.logIndex &&
      sameHash(item.selection.blockHash, context.selection.blockHash)
  );
  return entry || null;
}

function reviewTemplate(context, jobRegistry, resultHash) {
  return {
    version: 1,
    ...context.scope,
    jobRegistry,
    decisions: [
      {
        jobId: context.jobId,
        nonce: context.nonce,
        selection: context.selection,
        specHash: context.specHash,
        resultHash,
        approve: null,
        reviewedBy: '',
        reviewedAt: '',
      },
    ],
  };
}

function writePrivateReport(directory, name, data) {
  if (!/^[a-zA-Z0-9-]+\.json$/.test(name))
    fail('VALIDATOR_REPORT_NAME_INVALID');
  ensurePrivateDirectory(directory);
  const temporary = path.join(
    directory,
    `.report-${require('node:crypto').randomUUID()}`
  );
  let descriptor;
  try {
    descriptor = fs.openSync(
      temporary,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600
    );
    const encoded = JSON.stringify(data, null, 2);
    if (Buffer.byteLength(encoded) > 1024 * 1024)
      fail('VALIDATOR_REPORT_TOO_LARGE');
    fs.writeFileSync(descriptor, encoded);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, path.join(directory, name));
    const dir = fs.openSync(
      directory,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
    );
    try {
      fs.fsyncSync(dir);
    } finally {
      fs.closeSync(dir);
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

module.exports = {
  readPrivateJson,
  validateReviewFile,
  readReviewDecision,
  reviewTemplate,
  writePrivateReport,
};

if (require.main === module) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--check')
      fail('VALIDATOR_REVIEW_USAGE');
    const data = validateReviewFile(readPrivateJson(process.argv[3]));
    console.log(
      `Validated ${data.decisions.length} review entries. Runtime chain, round and artifact checks are still required.`
    );
  } catch (error) {
    console.error(
      require('../../examples/agentic/validator-recovery').safeErrorCode(error)
    );
    process.exitCode = 1;
  }
}
