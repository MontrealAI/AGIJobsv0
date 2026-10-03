const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  sealBundle,
  verifyBundle,
  assertSimulation,
  requiredChecks,
} = require('../../scripts/production/evidence.cjs');
function report() {
  return {
    schemaVersion: 1,
    kind: 'production-rehearsal',
    evidenceClass: 'simulation',
    productionApproved: false,
    independentReview: false,
    status: 'passed',
    source: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) },
    checks: requiredChecks.map((id) => ({ id, status: 'passed', exitCode: 0 })),
  };
}
function fixture(t) {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), 'rehearsal-evidence-test-')
  );
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const output = path.join(temp, 'evidence');
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report()));
  fs.writeFileSync(path.join(output, 'check.log'), 'fixture check passed\n');
  sealBundle(output, temp);
  return output;
}
test('verifies real ephemeral SSH signatures without shipping the private key', (t) => {
  const output = fixture(t);
  assert.equal(verifyBundle(output).productionApproved, false);
  assert.equal(
    fs.readdirSync(output).some((name) => name === 'rehearsal-key'),
    false
  );
});
test('rejects changed evidence and extra or missing files', (t) => {
  const output = fixture(t),
    file = path.join(output, 'check.log');
  fs.appendFileSync(file, 'changed');
  assert.throws(() => verifyBundle(output), /hash mismatch/);
  fs.writeFileSync(file, 'fixture check passed\n');
  fs.writeFileSync(path.join(output, 'unlisted-claim.txt'), 'approved');
  assert.throws(() => verifyBundle(output), /inventory changed/);
  fs.unlinkSync(path.join(output, 'unlisted-claim.txt'));
  fs.unlinkSync(file);
  assert.throws(() => verifyBundle(output), /inventory changed/);
});
test('rejects a modified signed manifest and symlink substitutions', (t) => {
  const output = fixture(t),
    manifest = path.join(output, 'manifest.json');
  const original = fs.readFileSync(manifest);
  fs.appendFileSync(manifest, ' ');
  assert.throws(() => verifyBundle(output));
  fs.writeFileSync(manifest, original);
  fs.symlinkSync('report.json', path.join(output, 'escape'));
  assert.throws(() => verifyBundle(output), /symlinks/);
});
test('cannot label rehearsal evidence as production approval or independent review', () => {
  for (const change of [
    { productionApproved: true },
    { independentReview: true },
    { evidenceClass: 'production' },
  ])
    assert.throws(
      () => assertSimulation({ ...report(), ...change }),
      /must not claim/
    );
});
test('cannot report a failed, omitted, or duplicate check as a complete passing rehearsal', () => {
  const failed = report();
  failed.checks[0].exitCode = 1;
  assert.throws(() => assertSimulation(failed), /successful checks/);
  for (const checks of [
    report().checks.slice(1),
    [...report().checks, report().checks[0]],
  ])
    assert.throws(
      () => assertSimulation({ ...report(), checks }),
      /every required/
    );
});
