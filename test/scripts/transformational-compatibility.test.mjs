import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { validateNativeReport } from '../../scripts/release/verify-transformational-compatibility.mjs';
const require = createRequire(import.meta.url);
const { profile } = require('../../scripts/release/source-profile-rc16.cjs');
const jobsCommit = 'a'.repeat(40),
  jobsTree = 'b'.repeat(40);
function fixture() {
  return {
    schema: 'agijobsv0/native-ti-compatibility/1',
    jobsCommit,
    jobsTree,
    alphaCommit: profile.nativeCompatibility.commit,
    alphaTree: profile.nativeCompatibility.tree,
    sources: structuredClone(profile.nativeCompatibility.files),
    currencyCaps: { AGIALPHABaseUnits: '0', USDCBaseUnits: '0' },
    nativeFreeInspection: true,
    positiveAGIALPHARefused: true,
    staleBindingsRefused: true,
    authorityExpansionRefused: true,
    credentialFieldsRefused: true,
    privateURLsRefused: true,
    sourceCheckedBeforeAndAfter: true,
    currencySpend: '0',
    chainOperations: 0,
    independentProof: false,
    executionAuthority: false,
  };
}
test('native archive must retain the complete pinned free-inspection and refusal result', () => {
  assert.deepEqual(
    validateNativeReport(fixture(), { jobsCommit, jobsTree }),
    fixture()
  );
  assert.throws(() => validateNativeReport(fixture()), /exact expected Jobs/);
  const absent = fixture();
  delete absent.jobsCommit;
  delete absent.jobsTree;
  assert.throws(() => validateNativeReport(absent), /exact expected Jobs/);
  for (const mutate of [
    (x) => {
      x.alphaCommit = '0'.repeat(40);
    },
    (x) => {
      x.jobsTree = '0'.repeat(40);
    },
    (x) => {
      delete x.sources['docs/assets/successor/engine.mjs'];
    },
    (x) => {
      x.sources['examples/transformational-intelligence/inspector.mjs'] =
        '0'.repeat(64);
    },
    (x) => {
      x.currencyCaps.AGIALPHABaseUnits = '1';
    },
    (x) => {
      x.currencyCaps.USDCBaseUnits = '1';
    },
    (x) => {
      x.currencySpend = '1';
    },
    (x) => {
      x.chainOperations = 1;
    },
    (x) => {
      x.executionAuthority = true;
    },
    (x) => {
      x.independentProof = true;
    },
    (x) => {
      x.sourceCheckedBeforeAndAfter = false;
    },
    (x) => {
      x.nativeFreeInspection = false;
    },
    (x) => {
      x.positiveAGIALPHARefused = false;
    },
    (x) => {
      delete x.staleBindingsRefused;
    },
    (x) => {
      delete x.credentialFieldsRefused;
    },
    (x) => {
      x.privateURLsRefused = false;
    },
    (x) => {
      x.authorityExpansionRefused = false;
    },
  ]) {
    const report = fixture();
    mutate(report);
    assert.throws(() => validateNativeReport(report, { jobsCommit, jobsTree }));
  }
});
test('CI selects the same exact native source and emits retained real-parser evidence', () => {
  const workflow = fs.readFileSync(
    new URL(
      '../../.github/workflows/transformational-compatibility.yml',
      import.meta.url
    ),
    'utf8'
  );
  assert(workflow.includes('ref: ' + profile.nativeCompatibility.commit));
  assert(
    workflow.includes(
      'node scripts/release/verify-transformational-compatibility.mjs'
    )
  );
  assert(
    workflow.includes(
      'native-ti-compatibility-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}'
    )
  );
  assert(workflow.includes('persist-credentials: false'));
  assert(
    !workflow.includes('continue-on-error') &&
      !workflow.includes('inspectWorkRequest:async')
  );
});
