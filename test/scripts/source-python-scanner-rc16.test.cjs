'use strict';
// Pending-contract and real Git metadata tests only: no successful scan fixture.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  profile,
  verifyPublicationReview,
} = require('../../scripts/release/source-profile-rc16.cjs');
const {
  requiredPaths,
  requiredChecks,
} = require('../../scripts/release/qualify-source-release-rc16.cjs');
const {
  expectedPythonSources,
  verifyPythonScannerProducerArchive,
  verifyPythonScannerReviewBinding,
} = require('../../scripts/release/python-scanner-rc16.cjs');
const git = (...args) =>
  execFileSync(
    'git',
    ['--no-replace-objects', '-C', path.resolve(__dirname, '../..'), ...args],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
test('Python source coverage derives all eight immutable integration files', () => {
  const actual = expectedPythonSources(git, profile.pythonScannerBaseline);
  assert.deepEqual(actual, profile.pythonScannerRequiredPaths);
  assert.equal(actual.length, 8);
  assert(requiredPaths.includes(profile.pythonScannerPolicy.workflowPath));
  assert(requiredChecks.includes('Python integration CodeQL analysis'));
});
test('Python evidence refuses incomplete archives and missing external identities before reading reports', () => {
  const unread = () => {
    throw Error('Report must remain unread without external identity');
  };
  assert.throws(
    () => verifyPythonScannerProducerArchive(['python.sarif'], unread),
    /inventory/i
  );
  assert.throws(
    () =>
      verifyPythonScannerProducerArchive(
        profile.pythonScannerPolicy.archiveFiles,
        unread
      ),
    /external|identity/i
  );
});
test('both scanner reviews remain pending and publication fails closed', () => {
  assert.equal(profile.scannerReview, null);
  assert.equal(profile.pythonScannerReview, null);
  assert.throws(
    () =>
      verifyPythonScannerReviewBinding({
        sha: profile.pythonScannerBaseline,
        review: null,
        git,
      }),
    /review/i
  );
  assert.throws(() => verifyPublicationReview(), /publication blocked/);
});
