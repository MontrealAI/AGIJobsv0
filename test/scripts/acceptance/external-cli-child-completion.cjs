'use strict';
// Test-harness-only guard against Hardhat hiding a signaled TS child's null code.
// All returned diagnostics are fixed-schema, bounded metadata, never log content.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const validPid = (value) => Number.isSafeInteger(value) && value > 0;
const isoDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value));
function readPrivate(file, limit) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    assert(
      stat.isFile() &&
        stat.uid === process.getuid() &&
        stat.nlink === 1 &&
        !(stat.mode & 0o077)
    );
    assert(stat.size > 0 && stat.size <= limit);
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(
        fd,
        bytes,
        offset,
        bytes.length - offset,
        offset
      );
      assert(count > 0);
      offset += count;
    }
    assert.equal(fs.fstatSync(fd).size, bytes.length);
    return bytes.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}
function inspectHardhatCompletion(directory, item, scriptEntrypoint) {
  const result = {
    schema: 'jobs-external-cli-child-completion-v1',
    accepted: false,
    reason: 'invalid-expectation',
    parentFinal: false,
    childCloseCount: null,
    childCloses: [],
  };
  try {
    assert(
      /^[a-z0-9-]+$/.test(item.label) &&
        validPid(item.pid) &&
        validPid(item.parentPid)
    );
    assert(/^[A-Za-z0-9_.-]+\.ts$/.test(scriptEntrypoint));
    result.reason = 'child-close-evidence-unreadable';
    const text = readPrivate(
      path.join(directory, `${item.label}-${item.pid}-forks.jsonl`),
      16384
    );
    assert(text.endsWith('\n'));
    const closes = text.slice(0, -1).split('\n').map(JSON.parse);
    result.childCloseCount = closes.length;
    // Retain at most two sanitized records on a refusal to diagnose extra forks.
    result.childCloses = closes.slice(0, 2).map((record) => ({
      parentPid: validPid(record?.parentPid) ? record.parentPid : null,
      childPid: validPid(record?.childPid) ? record.childPid : null,
      code: Number.isInteger(record?.code) ? record.code : null,
      signal:
        typeof record?.signal === 'string' &&
        /^SIG[A-Z0-9]+$/.test(record.signal)
          ? record.signal
          : null,
      closedAt: isoDate(record?.closedAt) ? record.closedAt : null,
    }));
    result.reason = 'parent-metrics-unreadable';
    const parent = JSON.parse(
      readPrivate(path.join(directory, `${item.label}-${item.pid}.json`), 65536)
    );
    result.parentFinal = parent.final === true;
    result.reason = 'parent-metrics-inconsistent';
    assert.equal(parent.schema, 'jobs-external-cli-process-metrics-v1');
    assert.equal(parent.pid, item.pid);
    assert.equal(parent.parentPid, item.parentPid);
    assert.equal(parent.label, item.label);
    assert.equal(parent.entrypoint, item.entrypoint);
    assert.equal(parent.final, true);
    assert.deepEqual(parent.forkObservations, {
      spawned: 1,
      closed: 1,
      writeErrors: 0,
    });
    result.reason = 'child-close-count';
    assert.equal(closes.length, 1);
    const close = closes[0];
    result.reason = 'child-close-inconsistent';
    assert.deepEqual(
      Object.keys(close).sort(),
      [
        'schema',
        'label',
        'parentPid',
        'childPid',
        'code',
        'signal',
        'closedAt',
      ].sort()
    );
    assert.equal(close.schema, 'jobs-external-cli-child-close-v1');
    assert.equal(close.label, item.label);
    assert.equal(close.parentPid, item.pid);
    assert(
      validPid(close.childPid) &&
        close.childPid !== item.pid &&
        isoDate(close.closedAt)
    );
    result.reason = 'child-close-unsuccessful';
    assert.equal(close.code, 0);
    assert.equal(close.signal, null);
    result.reason = 'child-metrics-unreadable';
    const child = JSON.parse(
      readPrivate(
        path.join(directory, `${item.label}-${close.childPid}.json`),
        65536
      )
    );
    result.reason = 'child-metrics-inconsistent';
    assert.equal(child.schema, 'jobs-external-cli-process-metrics-v1');
    assert.equal(child.final, true);
    assert.equal(child.pid, close.childPid);
    assert.equal(child.parentPid, item.pid);
    assert.equal(child.label, item.label);
    assert.equal(child.entrypoint, scriptEntrypoint);
    assert.equal(child.forkObservations?.writeErrors, 0);
    result.reason = 'wrapper-unsuccessful';
    assert.equal(item.code, 0);
    assert.equal(item.signal, null);
    result.accepted = true;
    result.reason = 'complete';
  } catch {
    /* Fixed diagnostic reason above; never include arbitrary file content. */
  }
  return result;
}
module.exports = { inspectHardhatCompletion };
