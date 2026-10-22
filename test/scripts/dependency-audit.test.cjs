const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');
const {
  assessAudit,
  auditCommand,
  auditProjects,
} = require('../../scripts/release/audit-dependencies.cjs');

const response = (counts = {}, status = 0) => ({
  stdout: JSON.stringify({
    metadata: {
      vulnerabilities: { low: 1, moderate: 2, high: 0, critical: 0, ...counts },
    },
  }),
  stderr: '',
  status,
});

test('accepts production audit evidence below the release severity threshold', () => {
  assert.deepEqual(assessAudit(response()), {
    low: 1,
    moderate: 2,
    high: 0,
    critical: 0,
  });
});

test('rejects high and critical findings even if the audit process exits successfully', () => {
  for (const severity of ['high', 'critical'])
    for (const status of [0, 1])
      assert.throws(
        () => assessAudit(response({ [severity]: 1 }, status)),
        /findings/
      );
});

test('registry failures, timeouts, missing counts and inconsistent exits cannot pass', () => {
  for (const result of [
    { stdout: 'not json', status: 0 },
    { stdout: '{}', status: 0 },
    { stdout: JSON.stringify({ error: 'service unavailable' }), status: 1 },
    response({ high: -1 }),
    response({ critical: '0' }),
    response({ high: 0.5 }),
    response({}, 1),
    response({}, 2),
    { ...response(), error: 'timeout' },
  ])
    assert.throws(() => assessAudit(result));
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lockfiles = [
    'package-lock.json',
    'nested/package-lock.json',
    'workspace/pnpm-lock.yaml',
  ];
  for (const lockfile of lockfiles) {
    const dir = path.join(root, path.dirname(lockfile));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(root, lockfile), '{}');
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        packageManager: lockfile.endsWith('.yaml')
          ? 'pnpm@10.5.2'
          : 'npm@10.8.2',
      })
    );
  }
  return { root, lockfiles, output: path.join(root, 'evidence') };
}

test('audits every lockfile, retains failed evidence and binds results to dependency inputs', async (t) => {
  const options = fixture(t);
  const calls = [];
  const results = await auditProjects({
    ...options,
    run: async (command, cwd) => {
      calls.push({ command, cwd });
      return cwd.endsWith('/nested') ? response({ high: 1 }, 1) : response();
    },
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(
    results.map((entry) => entry.status),
    ['passed', 'failed', 'passed']
  );
  assert.match(results[1].error, /1 high/);
  for (const entry of results) {
    assert.match(entry.lockfileSha256, /^[a-f0-9]{64}$/);
    assert.match(entry.manifestSha256, /^[a-f0-9]{64}$/);
    assert.ok(fs.existsSync(path.join(options.output, entry.stdout)));
    assert.ok(fs.existsSync(path.join(options.output, entry.stderr)));
  }
  assert.deepEqual(
    calls.find((call) => call.cwd.endsWith('/workspace')).command,
    ['corepack', 'pnpm', 'audit', '--prod', '--json', '--audit-level', 'high']
  );
  assert.ok(
    calls
      .find((call) => call.cwd === options.root)
      .command.includes('--package-lock-only')
  );
});

test('rejects missing root inventory, unpinned pnpm and dependency changes during audit', async (t) => {
  const options = fixture(t);
  await assert.rejects(
    auditProjects({ ...options, lockfiles: ['nested/package-lock.json'] }),
    /root package-lock/
  );
  fs.writeFileSync(path.join(options.root, 'workspace/package.json'), '{}');
  assert.throws(
    () => auditCommand('workspace/pnpm-lock.yaml', options.root),
    /exact pnpm/
  );
  const results = await auditProjects({
    ...options,
    lockfiles: ['package-lock.json'],
    run: async () => {
      fs.writeFileSync(
        path.join(options.root, 'package-lock.json'),
        '{"changed":true}'
      );
      return response();
    },
  });
  assert.equal(results[0].status, 'failed');
  assert.match(results[0].error, /changed during/);
});

test('production publication requires the audit and retains failures without weakening the gate', () => {
  const workflow = yaml.load(
    fs.readFileSync(
      path.resolve(__dirname, '../../.github/workflows/release.yml'),
      'utf8'
    )
  );
  const steps = workflow.jobs.prepare.steps;
  const audit = steps.findIndex((step) => step.id === 'dependency-audit');
  const manifest = steps.findIndex(
    (step) => step.name === 'Generate release manifest'
  );
  assert.ok(audit >= 0 && audit < manifest);
  assert.equal(steps[audit].run, 'node scripts/release/audit-dependencies.cjs');
  assert.equal(steps[audit]['continue-on-error'], undefined);
  assert.equal(steps[audit].if, undefined);
  const upload = steps.find(
    (step) => step.with?.name === 'release-dependency-audit-${{ github.sha }}'
  );
  assert.match(upload.if, /always\(\)/);
  assert.equal(upload.with['if-no-files-found'], 'error');
});

test('CULTURE dependency inputs select the existing strict all-lock qualification', () => {
  const workflow = yaml.load(
    fs.readFileSync(
      path.resolve(__dirname, '../../.github/workflows/dependency-repair.yml'),
      'utf8'
    )
  );
  const selectedPaths = workflow.on.pull_request.paths;
  for (const name of [
    'demo/CULTURE-v0/indexers/culture-graph-indexer/package.json',
    'demo/CULTURE-v0/indexers/culture-graph-indexer/package-lock.json',
    'demo/CULTURE-v0/pnpm-lock.yaml',
  ]) {
    assert.equal(selectedPaths.filter((item) => item === name).length, 1);
  }
  const job = workflow.jobs.compatibility;
  assert.ok(job.strategy.matrix.surface.includes('production-audit'));
  const checkout = job.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(checkout.with.ref, '${{ github.event.pull_request.head.sha }}');
  const audit = job.steps.find((step) => step.env?.SURFACE);
  assert.match(
    audit.run,
    /run_check all-locks npm run release:audit-dependencies/
  );
  assert.equal(audit['continue-on-error'], undefined);
  assert.equal(job['continue-on-error'], undefined);
});

test('qualification evidence stays outside source and preserves failed logs and logical artifact paths', (t) => {
  const workflow = yaml.load(fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/dependency-repair.yml'), 'utf8'));
  const job = workflow.jobs.compatibility;
  const run = job.steps.find((step) => step.env?.SURFACE).run;
  const stage = job.steps.find((step) => step.name === 'Stage retained dependency evidence outside authenticated source');
  const upload = job.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(stage.if, 'always()');
  assert.equal(upload.if, 'always()');
  assert.equal(upload.with.path, '${{ runner.temp }}/dependency-repair-${{ matrix.surface }}/');
  assert.match(run, /run_check source-preservation node scripts\/security\/check-dependency-preservation\.cjs source/);
  assert.match(run, /run_check generated-preservation node scripts\/security\/check-dependency-preservation\.cjs generated/);
  assert.match(run, /run_check audit-workflow node --test test\/scripts\/dependency-audit\.test\.cjs/);
  assert.match(run, /exit "\$failed"/);
  assert.equal(job['continue-on-error'], undefined);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-evidence-owned-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const root = path.join(folder, 'checkout'), runnerTemp = path.join(folder, 'runner');
  fs.mkdirSync(root); fs.mkdirSync(runnerTemp);
  const retained = ['reports/release/dependency-audit/summary.json', 'reports/sbom/owned.json', 'cypress/screenshots/owned.txt'];
  for (const name of retained) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), 'owned retained ' + name);
  }
  const sourceIndex = run.indexOf('run_check source-preservation');
  assert.ok(sourceIndex > 0);
  const harness = run.slice(0, sourceIndex);
  execFileSync('bash', ['-c', harness + '\n' +
    'run_check owned-pass "$OWNED_NODE" -e \'process.stdout.write("owned pass")\'\n' +
    'pass_code=$?\n' +
    'run_check owned-fail "$OWNED_NODE" -e \'process.stderr.write("owned failure");process.exit(7)\'\n' +
    'failure_code=$?\n' +
    'test "$pass_code" -eq 0 && test "$failure_code" -eq 7 && test "$failed" -eq 1\n'], {
    cwd: root, env: { ...process.env, RUNNER_TEMP: runnerTemp, SURFACE: 'contracts', OWNED_NODE: process.execPath },
  });
  const artifactRoot = path.join(runnerTemp, 'dependency-repair-contracts');
  const evidence = path.join(artifactRoot, 'reports/dependency-repair-contracts');
  assert.equal(fs.readFileSync(path.join(evidence, 'owned-pass.log'), 'utf8'), 'owned pass');
  assert.equal(fs.readFileSync(path.join(evidence, 'owned-fail.log'), 'utf8'), 'owned failure');
  assert.equal(fs.readFileSync(path.join(evidence, 'exits.txt'), 'utf8'), 'owned-pass 0\nowned-fail 7\n');
  assert.equal(fs.existsSync(path.join(root, 'reports/dependency-repair-contracts')), false);
  execFileSync('bash', ['-c', stage.run], { cwd: root, env: { ...process.env, RUNNER_TEMP: runnerTemp, SURFACE: 'contracts' } });
  for (const name of retained)
    assert.deepEqual(fs.readFileSync(path.join(artifactRoot, name)), fs.readFileSync(path.join(root, name)));
});

test('audit readers consume exact scratch JSON while retaining severity and malformed-evidence refusal', (t) => {
  const workflow = yaml.load(fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/dependency-repair.yml'), 'utf8'));
  const run = workflow.jobs.compatibility.steps.find((step) => step.env?.SURFACE).run;
  const readers = [...run.matchAll(/node -e '([^']+)' "\$evidence\/audit-(production|full)\.json"/g)];
  assert.equal(readers.length, 2);
  assert.match(run, /--omit=dev --json --audit-level=high/);
  assert.match(run, /--include=dev --include=optional --include=peer --json --audit-level=high/);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-reader-owned-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const input = path.join(folder, 'audit.json');
  for (const [, script] of readers) {
    fs.writeFileSync(input, JSON.stringify({ metadata: { vulnerabilities: { high: 0, critical: 0 } } }));
    assert.match(execFileSync(process.execPath, ['-e', script, input], { encoding: 'utf8' }), /"high":0/);
    for (const invalid of ['{', '{}', '{"error":"owned registry failure"}']) {
      fs.writeFileSync(input, invalid);
      assert.throws(() => execFileSync(process.execPath, ['-e', script, input], { stdio: 'pipe' }));
    }
  }
});
