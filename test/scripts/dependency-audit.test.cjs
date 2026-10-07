const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
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
