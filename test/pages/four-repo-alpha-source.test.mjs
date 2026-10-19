import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { loadPinnedAlphaComputer } from '../../integrations/alpha-agent/four-repo-computer-lifecycle.cjs';
import {
  assertPinnedAlphaCheckout,
  verifyPinnedAlphaCheckout,
  boundedSourceBlob,
  preparePinnedAlphaComputer,
} from '../../integrations/alpha-agent/pinned-alpha-checkout.cjs';

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

test('the lifecycle imports the verified physical root when its configured symlink is retargeted before import', async (t) => {
  const reviewed = checkout(t),
    replacement = checkout(t),
    aliases = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-alpha-alias-'));
  t.after(() => fs.rmSync(aliases, { recursive: true, force: true }));
  const configured = path.join(aliases, 'configured'),
    computerName = 'examples/successor-alpha/computer.mjs';
  for (const source of [reviewed, replacement]) {
    source.write(
      computerName,
      "export { inspected } from '../successor-workbench/engine.mjs';\n"
    );
  }
  reviewed.git('add', '.');
  reviewed.git('commit', '--quiet', '-m', 'Reviewed native export');
  const commit = reviewed.git('rev-parse', 'HEAD').trim();
  replacement.write(
    'examples/successor-workbench/engine.mjs',
    'export const inspected = false;\n'
  );
  fs.symlinkSync(reviewed.root, configured);
  const verified = verifyPinnedAlphaCheckout(configured, commit);
  assert.deepEqual(verified, { root: fs.realpathSync(reviewed.root), commit });
  assert.equal(Object.isFrozen(verified), true);

  const originalRealpath = fs.realpathSync;
  let retargeted = false,
    loaded;
  try {
    fs.realpathSync = (filename, ...args) => {
      const resolved = originalRealpath(filename, ...args);
      if (filename === configured && !retargeted) {
        fs.unlinkSync(configured);
        fs.symlinkSync(replacement.root, configured);
        retargeted = true;
      }
      return resolved;
    };
    loaded = await loadPinnedAlphaComputer(configured, commit);
    assert.equal(retargeted, true);
    assert.equal(fs.realpathSync(configured), replacement.root);
    assert.equal(loaded.root, reviewed.root);
    assert.equal(loaded.commit, commit);
    assert.equal(loaded.computer.inspected, true);
    // Restoring the alias makes an end-only source check pass, so that check
    // cannot substitute for importing through the verified physical root.
    fs.unlinkSync(configured);
    fs.symlinkSync(reviewed.root, configured);
    assert.equal(assertPinnedAlphaCheckout(configured, commit), commit);
    assert.equal(assertPinnedAlphaCheckout(loaded.root, commit), commit);
  } finally {
    loaded?.dispose();
    fs.realpathSync = originalRealpath;
  }
});

for (const relative of [
  'examples/successor-alpha/computer.mjs',
  'examples/successor-workbench/engine.mjs',
]) {
  test(
    'captured module bytes survive a temporary before-load change to ' +
      relative,
    async (t) => {
      const source = checkout(t);
      source.write(
        'examples/successor-alpha/computer.mjs',
        "export { inspected } from '../successor-workbench/engine.mjs';\n"
      );
      source.write(
        'examples/successor-workbench/engine.mjs',
        'export const inspected = 1;\n'
      );
      source.git('add', '.');
      source.git('commit', '--quiet', '-m', 'Reviewed native values');
      const commit = source.git('rev-parse', 'HEAD').trim();
      const snapshot = preparePinnedAlphaComputer(source.root, commit);
      const original = fs.readFileSync(path.join(source.root, relative));
      let changed = false;
      const observer = registerHooks({
        load(url, context, nextLoad) {
          if (
            url.startsWith('fqr-alpha-memory-') &&
            url.endsWith('/' + relative)
          ) {
            changed = true;
            fs.writeFileSync(
              path.join(source.root, relative),
              'export const inspected = 9;\n'
            );
            try {
              return nextLoad(url, context);
            } finally {
              fs.writeFileSync(path.join(source.root, relative), original);
            }
          }
          return nextLoad(url, context);
        },
      });
      try {
        const actual = await snapshot.load();
        assert(changed);
        assert.equal(actual.inspected, 1);
        assert.equal(assertPinnedAlphaCheckout(source.root, commit), commit);
      } finally {
        observer.deregister();
        snapshot.dispose();
      }
    }
  );
}

test('a path-based control observes a changed export even when bytes are restored before the final check', async (t) => {
  const source = checkout(t);
  const name = 'examples/successor-alpha/computer.mjs';
  source.write(name, 'export const inspected = 1;\n');
  source.git('add', '.');
  source.git('commit', '--quiet', '-m', 'Reviewed direct value');
  const commit = source.git('rev-parse', 'HEAD').trim(),
    file = path.join(source.root, name),
    original = fs.readFileSync(file);
  assert.equal(assertPinnedAlphaCheckout(source.root, commit), commit);
  const target = pathToFileURL(file).href;
  const observer = registerHooks({
    load(url, context, nextLoad) {
      if (url === target) {
        fs.writeFileSync(file, 'export const inspected = 9;\n');
        try {
          return nextLoad(url, context);
        } finally {
          fs.writeFileSync(file, original);
        }
      }
      return nextLoad(url, context);
    },
  });
  try {
    assert.equal((await import(target)).inspected, 9);
    assert.equal(assertPinnedAlphaCheckout(source.root, commit), commit);
  } finally {
    observer.deregister();
  }
});

test('snapshot capture stops at the initial size plus one after an append', (t) => {
  const { root } = checkout(t),
    file = path.join(root, 'examples/successor-alpha/computer.mjs');
  const before = fs.statSync(file).size,
    fd = fs.openSync(file, fs.constants.O_RDONLY),
    original = fs.readSync;
  let total = 0,
    appended = false;
  try {
    fs.readSync = (selected, buffer, offset, length, position) => {
      if (selected === fd && !appended) {
        appended = true;
        fs.appendFileSync(file, ' '.repeat(256));
      }
      const count = original(selected, buffer, offset, length, position);
      if (selected === fd) total += count;
      return count;
    };
    assert.throws(
      () => boundedSourceBlob(fd, 8 * 1024 * 1024, true),
      /grew or changed/
    );
    assert.equal(total, before + 1);
  } finally {
    fs.readSync = original;
    fs.closeSync(fd);
  }
});

for (const specifier of [
  'node:fs',
  'file:///fixture-unavailable.mjs',
  'https://example.invalid/module.mjs',
  'fixture-package',
  '../build-successor/model.mjs?changed=1',
  '../build-successor/model.mjs#changed',
]) {
  test(
    'captured graph refuses an import outside its fixed module map: ' +
      specifier,
    async (t) => {
      const source = checkout(t);
      source.write(
        'examples/successor-alpha/computer.mjs',
        `import ${JSON.stringify(specifier)}; export const inspected = 1;\n`
      );
      source.git('add', '.');
      source.git('commit', '--quiet', '-m', 'Unsupported source edge');
      const snapshot = preparePinnedAlphaComputer(
        source.root,
        source.git('rev-parse', 'HEAD').trim()
      );
      try {
        await assert.rejects(
          snapshot.load(),
          /captured relative imports|outside captured source/
        );
        await assert.rejects(snapshot.load(), /disposed/);
      } finally {
        snapshot.dispose();
      }
    }
  );
}

test('lazy inspector imports use the captured graph until explicit disposal', async (t) => {
  const source = checkout(t);
  source.write(
    'examples/successor-alpha/computer.mjs',
    "export const inspect = async () => (await import('../successor-workbench/engine.mjs')).inspected; export const later = () => import('../build-successor/model.mjs');\n"
  );
  source.write(
    'examples/successor-workbench/engine.mjs',
    'export const inspected = 1;\n'
  );
  source.git('add', '.');
  source.git('commit', '--quiet', '-m', 'Reviewed lazy inspector');
  const snapshot = preparePinnedAlphaComputer(
    source.root,
    source.git('rev-parse', 'HEAD').trim()
  );
  try {
    const module = await snapshot.load();
    source.write(
      'examples/successor-workbench/engine.mjs',
      'export const inspected = 9;\n'
    );
    assert.equal(await module.inspect(), 1);
    snapshot.dispose();
    await assert.rejects(snapshot.load(), /disposed/);
    await assert.rejects(module.later(), /scheme|protocol|unsupported/i);
  } finally {
    snapshot.dispose();
  }
});

test('another snapshot hook cannot admit an absolute import from a captured parent', async (t) => {
  const first = checkout(t),
    second = checkout(t);
  first.write(
    'examples/successor-alpha/computer.mjs',
    'export const inspect = url => import(url);\n'
  );
  second.write(
    'examples/successor-alpha/computer.mjs',
    'export const ownURL = import.meta.url;\n'
  );
  for (const source of [first, second]) {
    source.git('add', '.');
    source.git('commit', '--quiet', '-m', 'Separate reviewed snapshot');
  }
  const a = preparePinnedAlphaComputer(
    first.root,
    first.git('rev-parse', 'HEAD').trim()
  );
  const b = preparePinnedAlphaComputer(
    second.root,
    second.git('rev-parse', 'HEAD').trim()
  );
  try {
    const moduleB = await b.load(),
      moduleA = await a.load();
    await assert.rejects(
      moduleA.inspect(moduleB.ownURL),
      /captured relative imports/
    );
  } finally {
    b.dispose();
    a.dispose();
  }
});

test('source hashing stops at maxBytes+1 after an injected append without whole-file allocation', (t) => {
  const { root } = checkout(t),
    file = path.join(root, 'examples/successor-workbench/engine.mjs');
  fs.writeFileSync(file, '12345678');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const originalRead = fs.readSync,
    originalReadFile = fs.readFileSync;
  let injected = false,
    totalRead = 0,
    requested = 0;
  try {
    fs.readFileSync = (selected, ...args) => {
      assert.notEqual(
        typeof selected,
        'number',
        'Unbounded descriptor read is forbidden'
      );
      return originalReadFile(selected, ...args);
    };
    fs.readSync = (selected, buffer, offset, length, position) => {
      if (selected === fd) {
        if (!injected) {
          fs.appendFileSync(file, 'x'.repeat(32));
          injected = true;
        }
        requested += length;
        const count = originalRead(selected, buffer, offset, length, position);
        totalRead += count;
        return count;
      }
      return originalRead(selected, buffer, offset, length, position);
    };
    assert.throws(
      () => boundedSourceBlob(fd, 16),
      /grew or changed during bounded source read/
    );
    assert.equal(injected, true);
    assert.equal(totalRead, 17);
    assert.equal(requested, 17);
  } finally {
    fs.readSync = originalRead;
    fs.readFileSync = originalReadFile;
    fs.closeSync(fd);
  }
});

test('the actual source gate rejects small under-limit growth after its initial stat and closes the private descriptor', (t) => {
  const { root, commit } = checkout(t),
    file = path.join(root, 'examples/successor-workbench/engine.mjs');
  const identity = fs.statSync(file),
    originalStat = fs.fstatSync,
    originalReadFile = fs.readFileSync,
    originalClose = fs.closeSync;
  let injected = false,
    targetFd,
    closed = false;
  try {
    fs.fstatSync = (fd, ...args) => {
      const stat = originalStat(fd, ...args);
      if (!injected && stat.dev === identity.dev && stat.ino === identity.ino) {
        targetFd = fd;
        fs.appendFileSync(file, '/*append*/');
        injected = true;
      }
      return stat;
    };
    fs.readFileSync = (selected, ...args) => {
      assert.notEqual(
        typeof selected,
        'number',
        'Unbounded descriptor read is forbidden'
      );
      return originalReadFile(selected, ...args);
    };
    fs.closeSync = (fd) => {
      if (fd === targetFd) closed = true;
      return originalClose(fd);
    };
    assert.throws(
      () => assertPinnedAlphaCheckout(root, commit),
      /grew or changed during bounded source read/
    );
    assert.equal(injected, true);
    assert.equal(closed, true);
  } finally {
    fs.fstatSync = originalStat;
    fs.readFileSync = originalReadFile;
    fs.closeSync = originalClose;
  }
});

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
