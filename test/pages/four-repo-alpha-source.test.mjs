import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { assertPinnedAlphaCheckout } from '../../integrations/alpha-agent/pinned-alpha-checkout.cjs';

function checkout(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-alpha-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  git('init', '--quiet');
  git('config', 'user.name', 'Disposable source test');
  git('config', 'user.email', 'test@example.invalid');
  const write = (name, value) => {
    const filename = path.join(root, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, value);
  };
  write('.gitignore', 'node_modules/\nreports/\n');
  write(
    'examples/successor-alpha/computer.mjs',
    "import '../successor-workbench/engine.mjs';\n"
  );
  write(
    'examples/successor-workbench/engine.mjs',
    'export const inspected = true;\n'
  );
  write('examples/build-successor/model.mjs', 'export const model = true;\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'Disposable reviewed source');
  const commit = git('rev-parse', 'HEAD').trim();
  return { root, commit, git, write };
}

test('dirty shared native import is refused before any module executes', async (t) => {
  const { root, commit, git, write } = checkout(t);
  const marker = path.join(root, 'executed');
  write(
    'examples/successor-workbench/engine.mjs',
    `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(
      marker
    )}, 'ran');\n`
  );
  assert.doesNotThrow(() =>
    git(
      'diff',
      '--exit-code',
      'HEAD',
      '--',
      'alpha_factory_v1',
      'examples/successor-alpha',
      'docs/assets/successor/engine.mjs'
    )
  );
  await assert.rejects(async () => {
    assertPinnedAlphaCheckout(root, commit);
    await import(
      pathToFileURL(path.join(root, 'examples/successor-alpha/computer.mjs'))
        .href
    );
  }, /tracked source differs/);
  assert.equal(fs.existsSync(marker), false);
});

test('every tracked change, including staged shared dependencies and deletion, invalidates qualification', (t) => {
  const { root, commit, git, write } = checkout(t);
  write('examples/build-successor/model.mjs', 'export const model = false;\n');
  git('add', 'examples/build-successor/model.mjs');
  assert.throws(
    () => assertPinnedAlphaCheckout(root, commit),
    /tracked source differs/
  );
  git('reset', '--hard', 'HEAD');
  fs.unlinkSync(path.join(root, 'examples/build-successor/model.mjs'));
  assert.throws(
    () => assertPinnedAlphaCheckout(root, commit),
    /tracked source differs/
  );
});

test('unknown nonignored source is refused while normal ignored dependencies and evidence remain usable', (t) => {
  const { root, commit, write } = checkout(t);
  write(
    'node_modules/dependency/package.json',
    '{"name":"installed-dependency"}'
  );
  write('reports/evidence.json', '{"state":"fixture"}');
  write('notes.txt', 'Operator notes do not execute.');
  assert.equal(assertPinnedAlphaCheckout(root, commit), commit);
  write(
    'examples/successor-workbench/new-source.mjs',
    'export const shadow = true;'
  );
  assert.throws(
    () => assertPinnedAlphaCheckout(root, commit),
    /untracked source/
  );
});

test('embedded nonignored repositories cannot hide source behind an untracked directory entry', (t) => {
  const { root, commit, git, write } = checkout(t);
  write('node_modules/installed/engine.mjs', 'export const installed = true;');
  git('-C', 'node_modules/installed', 'init', '--quiet');
  assert.equal(assertPinnedAlphaCheckout(root, commit), commit);
  write('plugin/evil.mjs', 'export const unexpected = true;');
  git('-C', 'plugin', 'init', '--quiet');
  assert.equal(
    git('ls-files', '--others', '--exclude-standard', '-z'),
    'plugin/\0'
  );
  assert.throws(
    () => assertPinnedAlphaCheckout(root, commit),
    /untracked source/
  );
});

test('missing, abbreviated and stale checkout identities fail closed', (t) => {
  const { root, commit } = checkout(t);
  for (const pin of [undefined, '', commit.slice(0, 12), '0'.repeat(40)])
    assert.throws(
      () => assertPinnedAlphaCheckout(root, pin),
      /reviewed commit|explicit pin/
    );
  assert.throws(
    () => assertPinnedAlphaCheckout('relative/path', commit),
    /absolute reviewed path/
  );
});

test('index flags cannot hide a changed tracked import from the source gate', (t) => {
  const { root, commit, git, write } = checkout(t);
  const file = 'examples/successor-workbench/engine.mjs';
  for (const flag of ['--assume-unchanged', '--skip-worktree']) {
    git('update-index', flag, file);
    write(file, 'export const inspected = false;\n');
    assert.throws(
      () => assertPinnedAlphaCheckout(root, commit),
      /tracked source differs/
    );
    git('update-index', '--no-assume-unchanged', '--no-skip-worktree', file);
    git('reset', '--hard', 'HEAD');
  }
});

test('local replacement refs cannot substitute another tree under the reviewed commit', (t) => {
  const { root, commit, git, write } = checkout(t);
  write(
    'examples/successor-workbench/engine.mjs',
    'export const inspected = false;\n'
  );
  git('add', '.');
  git('commit', '--quiet', '-m', 'Unreviewed replacement');
  const replacement = git('rev-parse', 'HEAD').trim();
  git('reset', '--hard', commit);
  git('replace', commit, replacement);
  assert.equal(assertPinnedAlphaCheckout(root, commit), commit);
  write(
    'examples/successor-workbench/engine.mjs',
    'export const inspected = false;\n'
  );
  assert.throws(
    () => assertPinnedAlphaCheckout(root, commit),
    /tracked source differs/
  );
});

test('Git environment redirection cannot select a different worktree or object database', (t) => {
  const { root, commit } = checkout(t),
    other = checkout(t);
  const changes = {
    GIT_DIR: path.join(other.root, '.git'),
    GIT_WORK_TREE: other.root,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.worktree',
    GIT_CONFIG_VALUE_0: other.root,
  };
  const prior = Object.fromEntries(
    Object.keys(changes).map((key) => [key, process.env[key]])
  );
  try {
    Object.assign(process.env, changes);
    assert.equal(assertPinnedAlphaCheckout(root, commit), commit);
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('symlink file and directory substitutions cannot redirect native source reads', (t) => {
  const { root, commit, git } = checkout(t);
  const file = 'examples/successor-workbench/engine.mjs';
  const external = path.join(root, 'reports', 'engine.mjs');
  fs.mkdirSync(path.dirname(external), { recursive: true });
  fs.copyFileSync(path.join(root, file), external);
  git('update-index', '--assume-unchanged', file);
  fs.unlinkSync(path.join(root, file));
  fs.symlinkSync(external, path.join(root, file));
  assert.throws(() => assertPinnedAlphaCheckout(root, commit), /regular file/);
  fs.unlinkSync(path.join(root, file));
  git('update-index', '--no-assume-unchanged', file);
  git('reset', '--hard', 'HEAD');
  fs.renameSync(
    path.join(root, 'examples/successor-workbench'),
    path.join(root, 'reports', 'workbench')
  );
  fs.symlinkSync(
    path.join(root, 'reports', 'workbench'),
    path.join(root, 'examples/successor-workbench')
  );
  assert.throws(
    () => assertPinnedAlphaCheckout(root, commit),
    /real directory|tracked source differs/
  );
});
