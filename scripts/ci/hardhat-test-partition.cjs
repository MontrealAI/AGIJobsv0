'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const TITLE =
  'External manual staged authority handover roundtrips all 39 exact external envelopes on the disposable EVM and leaves the stack paused';
const FILE = 'test/v2/ExternalManualHandover.test.js';
const escaped = TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Both selectors run against the same unchanged default Hardhat discovery.
// Exact equality and its complement partition every possible full test title.
const PATTERNS = Object.freeze({
  core: `^(?!${escaped}(?![\\s\\S]))`,
  external: `^${escaped}(?![\\s\\S])`,
});
function validate(report, part) {
  assert(report && report.stats && Array.isArray(report.tests));
  for (const key of ['passes', 'failures', 'pending']) {
    assert(Array.isArray(report[key]));
    assert.equal(report.stats[key], report[key].length);
  }
  assert.equal(report.stats.tests, report.tests.length);
  assert.equal(
    report.tests.length,
    report.passes.length + report.failures.length + report.pending.length
  );
  assert.equal(report.failures.length, 0, `${part} partition has failures`);
  const selector = new RegExp(PATTERNS[part]);
  for (const test of report.tests) {
    assert.equal(typeof test.fullTitle, 'string');
    assert.equal(typeof test.file, 'string');
    assert(
      selector.test(test.fullTitle),
      `Test belongs to the other partition: ${test.fullTitle}`
    );
  }
  const identity = (test) => `${test.file}\0${test.fullTitle}`;
  assert.deepEqual(
    report.tests.map(identity).sort(),
    [...report.passes, ...report.pending].map(identity).sort()
  );
  if (part === 'external') {
    assert.equal(
      report.tests.length,
      1,
      'Exactly one complete external roundtrip is required'
    );
    assert.equal(report.passes.length, 1);
    assert.equal(report.pending.length, 0);
    assert(report.tests[0].file.replace(/\\/g, '/').endsWith('/' + FILE));
  } else assert(report.tests.length > 0, 'Core partition must not be empty');
}
function compare(core, external) {
  validate(core, 'core');
  validate(external, 'external');
  const combined = [...core.tests, ...external.tests];
  const names = new Set(core.tests.map((test) => test.fullTitle));
  assert(
    external.tests.every((test) => !names.has(test.fullTitle)),
    'Partitions overlap'
  );
  return {
    schema: 'jobs-hardhat-disjoint-coverage-v1',
    defaultDiscoveryUnchanged: true,
    exactComplementaryTitleSelectors: PATTERNS,
    core: {
      tests: core.tests.length,
      passed: core.passes.length,
      pending: core.pending.length,
    },
    external: { tests: 1, passed: 1, pending: 0 },
    total: {
      tests: combined.length,
      passed: core.passes.length + 1,
      pending: core.pending.length,
      failed: 0,
    },
    // Preserve existing pending cases visibly; no test is skipped by this partition.
    pendingTitles: core.pending.map((test) => test.fullTitle),
    observedCoverageSha256: crypto
      .createHash('sha256')
      .update(
        JSON.stringify(
          combined.map((test) => [test.file, test.fullTitle]).sort()
        )
      )
      .digest('hex'),
  };
}
if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'pattern') {
    assert(args.length === 1 && Object.hasOwn(PATTERNS, args[0]));
    process.stdout.write(PATTERNS[args[0]] + '\n');
  } else {
    assert(command === 'compare' && args.length === 2);
    console.log(
      JSON.stringify(
        compare(
          ...args.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
        ),
        null,
        2
      )
    );
  }
}
module.exports = { TITLE, FILE, PATTERNS, compare };
