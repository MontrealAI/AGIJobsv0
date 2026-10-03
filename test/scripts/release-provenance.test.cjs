const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const verify = path.resolve(
  __dirname,
  '../../scripts/ci/ensure-tag-signature.js'
);
const check = path.resolve(__dirname, '../../scripts/ci/check-signers.js');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-provenance-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
  git('init');
  git('config', 'user.name', 'Provenance test');
  git('config', 'user.email', 'test@localhost');
  git('config', 'commit.gpgsign', 'false');
  git('commit', '--allow-empty', '-m', 'fixture');
  const key = path.join(dir, 'signing-key');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
  const signers = path.join(dir, 'allowed signers');
  fs.writeFileSync(
    signers,
    `test@localhost namespaces="git" ${fs.readFileSync(`${key}.pub`, 'utf8')}`
  );
  git('config', 'gpg.format', 'ssh');
  git('config', 'user.signingkey', key);
  const run = (tag, signerFile = signers) =>
    spawnSync(process.execPath, [verify, tag], {
      cwd: dir,
      env: { ...process.env, GIT_ALLOWED_SIGNERS: signerFile },
      encoding: 'utf8',
    });
  return { dir, git, signers, run };
}

test('accepts a trusted SSH-signed tag at the checked-out commit', (t) => {
  const { git, run } = fixture(t);
  git('tag', '-s', 'v1.2.3', '-m', 'release');
  const result = run('refs/tags/v1.2.3');
  assert.equal(result.status, 0, result.stderr);
});

test('rejects lightweight, unsigned, and missing tags', (t) => {
  const { git, run } = fixture(t);
  git('tag', 'v1.0.0');
  git('tag', '-a', 'v1.0.1', '-m', 'unsigned');
  for (const tag of ['v1.0.0', 'v1.0.1', 'v0.0.0'])
    assert.notEqual(run(tag).status, 0);
});

test('rejects a signed tag pointing at another checkout', (t) => {
  const { git, run } = fixture(t);
  git('tag', '-s', 'v1.2.3', '-m', 'release');
  git('commit', '--allow-empty', '-m', 'later commit');
  assert.match(
    run('v1.2.3').stderr,
    /does not point to the checked-out commit/
  );
});

test('rejects untrusted signers and missing registries', (t) => {
  const { dir, git, signers, run } = fixture(t);
  git('tag', '-s', 'v1.2.3', '-m', 'release');
  const other = path.join(dir, 'other-key');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', other]);
  fs.writeFileSync(
    signers,
    `other@localhost namespaces="git" ${fs.readFileSync(
      `${other}.pub`,
      'utf8'
    )}`
  );
  assert.notEqual(run('v1.2.3').status, 0);
  assert.notEqual(run('v1.2.3', path.join(dir, 'missing')).status, 0);
});

test('never interprets tag references as shell commands', (t) => {
  const { dir, git, run } = fixture(t);
  const tag = 'v1.2.3;touch${IFS}INJECTED';
  git('tag', '-s', tag, '-m', 'release');
  const result = run(tag);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(dir, 'INJECTED')), false);
});

test('rejects base64 text that is not an SSH public key', (t) => {
  const { dir, signers } = fixture(t);
  fs.writeFileSync(
    signers,
    'test@localhost namespaces="git" ssh-ed25519 dGVzdGtleQ==\n'
  );
  const result = spawnSync(process.execPath, [check, signers], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not a valid OpenSSH public key/);
});
