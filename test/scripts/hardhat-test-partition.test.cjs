'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const {
  TITLE,
  FILE,
  PATTERNS,
  compare,
} = require('../../scripts/ci/hardhat-test-partition.cjs');
const root = path.resolve(__dirname, '../..');
function report(titles, pending = []) {
  const tests = titles.map((fullTitle) => ({
    fullTitle,
    file: root + '/' + FILE,
  }));
  const skipped = tests.filter((t) => pending.includes(t.fullTitle));
  const passes = tests.filter((t) => !pending.includes(t.fullTitle));
  return {
    stats: {
      tests: tests.length,
      passes: passes.length,
      failures: 0,
      pending: skipped.length,
    },
    tests,
    passes,
    failures: [],
    pending: skipped,
  };
}
test('exact complementary selectors retain similarly named tests without overlap or omission', () => {
  const titles = [
    TITLE,
    '',
    'Other test',
    TITLE + ' later',
    'prefix ' + TITLE,
    TITLE.replace('39', '38'),
    TITLE + '\nmore',
    TITLE + '\n',
    TITLE.slice(0, -1),
  ];
  for (const title of titles) {
    const core = new RegExp(PATTERNS.core).test(title),
      external = new RegExp(PATTERNS.external).test(title);
    assert.equal(Number(core) + Number(external), 1, title);
    assert.equal(external, title === TITLE);
  }
});
test('the exact isolated title still binds the sole unskipped real EVM test', () => {
  const source = ts.createSourceFile(
    FILE,
    fs.readFileSync(path.join(root, FILE), 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const suites = [],
    cases = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      assert(
        !['describe.skip', 'it.skip', 'describe.only', 'it.only'].includes(
          callee
        )
      );
      if (callee === 'describe' || callee === 'it') {
        assert(ts.isStringLiteral(node.arguments[0]));
        (callee === 'describe' ? suites : cases).push(node.arguments[0].text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(suites.length, 1);
  assert.equal(cases.length, 1);
  assert.equal(suites[0] + ' ' + cases[0], TITLE);
});
test('coverage comparison reports exact union totals and preserves existing pending cases visibly', () => {
  const out = compare(
    report(
      ['ordinary', TITLE + ' similar', 'legacy pending'],
      ['legacy pending']
    ),
    report([TITLE])
  );
  assert.deepEqual(out.total, { tests: 4, passed: 3, pending: 1, failed: 0 });
  assert.deepEqual(out.pendingTitles, ['legacy pending']);
  assert.equal(out.observedCoverageSha256.length, 64);
});
test('comparison rejects overlap, missing external case, skipped external case and inconsistent totals', () => {
  assert.throws(() => compare(report([TITLE]), report([TITLE])));
  assert.throws(() => compare(report(['ordinary']), report([])));
  assert.throws(() => compare(report(['ordinary']), report([TITLE], [TITLE])));
  const wrong = report(['ordinary']);
  wrong.stats.tests++;
  assert.throws(() => compare(wrong, report([TITLE])));
  const wrongMembers = report(['ordinary']);
  wrongMembers.passes[0] = {
    fullTitle: 'not executed',
    file: root + '/' + FILE,
  };
  assert.throws(() => compare(wrongMembers, report([TITLE])));
});
test('CI runs both exact selectors with unchanged discovery and bounded timeout then compares reports', () => {
  const yaml = require('yaml');
  for (const [filename, job] of [
    ['.github/workflows/ci.yml', 'tests'],
    ['.github/workflows/contracts.yml', 'compile-and-test'],
  ]) {
    const workflow = yaml.parse(
      fs.readFileSync(path.join(root, filename), 'utf8')
    );
    const steps = workflow.jobs[job].steps;
    const partition = steps.filter((step) =>
      /Hardhat (core|external manual) tests/.test(step.name || '')
    );
    assert.equal(partition.length, 2);
    for (const [index, kind] of ['core', 'external'].entries()) {
      const step = partition[index];
      assert.equal(step.env.HARDHAT_TEST_TIMEOUT_MS, '900000');
      assert(step.run.includes(`pattern ${kind})`));
      assert(step.run.includes('npm test -- --grep'));
      assert(!step.run.includes('--test-files') && !step.run.includes(FILE));
      assert(!step['continue-on-error'] && !step.if);
    }
    const comparison = steps.find(
      (step) => step.name === 'Compare complete Hardhat partition coverage'
    );
    assert(
      comparison &&
        comparison.run.includes('hardhat-test-partition.cjs compare')
    );
    assert(!comparison['continue-on-error'] && !comparison.if);
  }
  const dedicated = fs.readFileSync(
    path.join(root, '.github/workflows/jobs-external-manual-qualification.yml'),
    'utf8'
  );
  assert(dedicated.includes('run-hosted-qualification.cjs --run'));
});

test('installed Mocha selectors and JSON reports exactly preserve unfiltered discovery coverage', async (t) => {
  const Mocha = require('mocha');
  const os = require('node:os');
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'jobs-partition-reporter-')
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  async function execute(part) {
    const output = path.join(directory, part + '.json');
    const mocha = new Mocha({
      reporter: 'json',
      reporterOptions: { output },
      ...(part === 'all' ? {} : { grep: new RegExp(PATTERNS[part]) }),
    });
    const core = Mocha.Suite.create(mocha.suite, 'ordinary');
    const external = Mocha.Suite.create(
      mocha.suite,
      'External manual staged authority handover'
    );
    for (const [suite, title, action] of [
      [core, 'passes', () => {}],
      [core, 'legacy pending', undefined],
      [external, TITLE.slice(external.title.length + 1), () => {}],
    ]) {
      const item = new Mocha.Test(title, action);
      item.file = path.join(root, FILE);
      suite.addTest(item);
    }
    assert.equal(await new Promise((resolve) => mocha.run(resolve)), 0);
    return JSON.parse(fs.readFileSync(output, 'utf8'));
  }
  const original = await execute('all'),
    core = await execute('core'),
    external = await execute('external');
  const out = compare(core, external);
  assert.equal(out.total.tests, original.stats.tests);
  assert.equal(out.total.passed, original.stats.passes);
  assert.equal(out.total.pending, original.stats.pending);
  assert.deepEqual(
    [...core.tests, ...external.tests].map((t) => t.fullTitle).sort(),
    original.tests.map((t) => t.fullTitle).sort()
  );
});
