const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveNamespace } = require('../../demo/aurora/bin/report-paths.cjs');

test('default namespaces keep AURORA and ASI Take-Off receipts separate', () => {
  assert.equal(resolveNamespace('aurora', {}), 'aurora');
  assert.equal(resolveNamespace('asi-takeoff', {}), 'asi-takeoff');
  assert.notEqual(
    resolveNamespace('aurora', {}),
    resolveNamespace('asi-takeoff', {})
  );
});

test('explicit report namespaces remain supported', () => {
  assert.equal(
    resolveNamespace('asi-takeoff', {
      AURORA_REPORT_NAMESPACE: ' operator-run ',
    }),
    'operator-run'
  );
  assert.equal(
    resolveNamespace('asi-takeoff', { AURORA_REPORT_NAMESPACE: ' ' }),
    'asi-takeoff'
  );
});

test('scope defaults and explicit namespaces both reject path traversal', () => {
  for (const value of [
    '',
    '.',
    '..',
    '../aurora',
    'other/report',
    'other\\report',
  ]) {
    assert.throws(
      () => resolveNamespace(value, {}),
      /Invalid report namespace/
    );
    if (value)
      assert.throws(
        () => resolveNamespace('aurora', { AURORA_REPORT_NAMESPACE: value }),
        /Invalid report namespace/
      );
  }
});
