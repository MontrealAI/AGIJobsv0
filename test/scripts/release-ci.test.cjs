const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const {
  checkRuns,
  readRuns,
  requiredWorkflows,
} = require('../../scripts/release/check-release-ci.js');
const sha = 'a'.repeat(40);
const run = (changes = {}) => ({
  id: 1,
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  path: '.github/workflows/ci.yml',
  run_number: 1,
  run_attempt: 1,
  status: 'completed',
  conclusion: 'success',
  ...changes,
});

test('accepts successful CI only for the exact release commit', () => {
  assert.deepEqual(checkRuns([run()], sha, ['ci.yml']), []);
  assert.match(
    checkRuns([run({ head_sha: 'b'.repeat(40) })], sha, ['ci.yml'])[0],
    /no main-branch CI evidence/
  );
});

for (const changes of [
  { event: 'pull_request' },
  { event: 'pull_request_target' },
  { head_branch: 'unreviewed' },
  { path: '.github/workflows/fake.yml' },
]) {
  test(`rejects unrelated CI evidence ${JSON.stringify(changes)}`, () => {
    assert.equal(checkRuns([run(changes)], sha, ['ci.yml']).length, 1);
  });
}

for (const conclusion of [
  'failure',
  'cancelled',
  'skipped',
  'neutral',
  'timed_out',
]) {
  test(`refuses a newer ${conclusion} run even when an older run passed`, () => {
    assert.match(
      checkRuns([run(), run({ run_number: 2, conclusion })], sha, [
        'ci.yml',
      ])[0],
      new RegExp(conclusion)
    );
  });
}

test('pending reruns supersede successful earlier attempts', () => {
  const current = run({
    run_attempt: 2,
    status: 'in_progress',
    conclusion: null,
  });
  assert.match(checkRuns([run(), current], sha, ['ci.yml'])[0], /in_progress/);
});

test('requires every configured workflow', () => {
  assert.equal(checkRuns([run()], sha).length, requiredWorkflows.length - 1);
  for (const file of requiredWorkflows)
    assert.ok(
      fs.existsSync(path.resolve(__dirname, '../../.github/workflows', file))
    );
});

test('reads all pages and sends tokens only to the fixed GitHub endpoint', async () => {
  const urls = [];
  const runs = await readRuns({
    repository: 'owner/repo',
    sha,
    token: 'test-only',
    fetchImpl: async (url, options) => {
      urls.push(url);
      assert.equal(new URL(url).origin, 'https://api.github.com');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer test-only');
      return {
        ok: true,
        json: async () => ({
          workflow_runs:
            urls.length === 1
              ? Array.from({ length: 100 }, () => run())
              : [run({ id: 101 })],
        }),
      };
    },
  });
  assert.equal(urls.length, 2);
  assert.equal(runs.length, 101);
});

test('fails closed on API errors or malformed responses', async () => {
  for (const response of [
    { ok: false, status: 403 },
    { ok: true, json: async () => ({}) },
  ]) {
    await assert.rejects(
      readRuns({
        repository: 'owner/repo',
        sha,
        token: 'test-only',
        fetchImpl: async () => response,
      }),
      /Cannot read|Malformed/
    );
  }
});

test('rejects malformed repository identifiers before sending credentials', async () => {
  await assert.rejects(
    readRuns({
      repository: 'owner/repo/../other',
      sha,
      token: 'test-only',
      fetchImpl: () => assert.fail('must not fetch'),
    }),
    /valid/
  );
});

const workflow = yaml.load(
  fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/release.yml'),
    'utf8'
  )
);

test('publishing depends on contract verification and all image scans', () => {
  assert.ok(workflow.jobs['docker-publish'].needs.includes('verify-contracts'));
  assert.ok(workflow.jobs['npm-publish'].needs.includes('docker-publish'));
  for (const job of ['verify-contracts', 'docker-publish', 'npm-publish'])
    assert.ok(workflow.jobs['github-release'].needs.includes(job));
  const steps = workflow.jobs['docker-publish'].steps;
  const build = steps.find((step) => step.id === 'build');
  assert.doesNotMatch(build.with.tags, /:latest|outputs.version/);
  const scan = steps.find((step) => step.name.startsWith('Scan candidate'));
  assert.match(scan.run, /linux\/amd64 linux\/arm64/);
  assert.match(scan.run, /--exit-code 1/);
  assert.equal(scan['continue-on-error'], undefined);
});

test('release stays a draft until scanned images are promoted; prereleases do not move latest', () => {
  const steps = workflow.jobs['github-release'].steps;
  const draft = steps.findIndex((step) => step.with?.draft === true);
  const promotion = steps.findIndex(
    (step) => step.name === 'Promote verified release images'
  );
  const publication = steps.findIndex(
    (step) => step.name === 'Publish the verified release'
  );
  assert.ok(draft >= 0 && draft < promotion && promotion < publication);
  assert.match(steps[promotion].run, /"\$VERSION" != \*-\*/);
  assert.match(steps[publication].run, /--draft=false/);
  assert.equal(
    workflow.jobs['github-release'].permissions.attestations,
    'write'
  );
});

test('release checksums work from the download directory', (t) => {
  const os = require('node:os');
  const { execFileSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifacts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const entry of [
    'reports/abis/head',
    'reports/sbom',
    'reports/release',
    'typechain-types',
    'deployment-config',
  ]) {
    fs.mkdirSync(path.join(dir, 'release-prep', entry), { recursive: true });
  }
  const step = workflow.jobs['github-release'].steps.find(
    (s) => s.id === 'bundle'
  );
  const script = step.run.replaceAll(
    '${{ needs.prepare.outputs.version }}',
    '1.2.3'
  );
  execFileSync('bash', ['-c', script], {
    cwd: dir,
    env: { ...process.env, GITHUB_OUTPUT: path.join(dir, 'outputs') },
  });
  const output = execFileSync(
    'sha256sum',
    ['--check', 'agi-jobs-v1.2.3-artifacts.tar.gz.sha256'],
    { cwd: path.join(dir, 'dist'), encoding: 'utf8' }
  );
  assert.match(output, /OK/);
});
