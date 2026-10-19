'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

// Check the whole tracked tree: the native inspector has transitive imports in
// successor-workbench and build-successor, outside its own directory.
function assertPinnedAlphaCheckout(root, expectedCommit) {
  assert(
    path.isAbsolute(root || ''),
    'Alpha source requires an absolute reviewed path'
  );
  assert(
    /^[0-9a-f]{40}$/.test(expectedCommit || ''),
    'Alpha source requires an exact reviewed commit'
  );
  root = fs.realpathSync(root);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
  );
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
  });
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '--no-replace-objects',
        '--no-pager',
        '-C',
        root,
        `--work-tree=${root}`,
        '-c',
        'core.fsmonitor=false',
        ...args,
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 16 * 1024 * 1024,
        env,
      }
    );
  const actualCommit = git('rev-parse', 'HEAD').trim();
  assert.equal(
    actualCommit,
    expectedCommit,
    'Alpha source revision differs from its explicit pin'
  );
  try {
    git(
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--exit-code',
      '--ignore-submodules=none',
      'HEAD',
      '--'
    );
  } catch {
    throw Error('Alpha tracked source differs from the reviewed commit');
  }
  // Git's working-tree diff can trust index flags and cached file metadata.
  // Compare actual bytes and modes to immutable object identities as well.
  const tree = git('ls-tree', '--full-tree', '-r', '-z', expectedCommit)
    .split('\0')
    .filter(Boolean);
  assert(tree.length > 0, 'Alpha reviewed source tree is empty');
  for (const entry of tree) {
    const separator = entry.indexOf('\t');
    const header = /^([0-7]{6}) blob ([0-9a-f]{40})$/.exec(
      entry.slice(0, separator)
    );
    const name = entry.slice(separator + 1),
      segments = name.split('/');
    assert(
      header && ['100644', '100755'].includes(header[1]),
      'Alpha source requires regular tracked files without symlinks or submodules'
    );
    assert(
      segments.every((part) => part && part !== '.' && part !== '..') &&
        !path.isAbsolute(name),
      'Alpha source path is invalid'
    );
    let parent = root;
    for (const segment of segments.slice(0, -1)) {
      parent = path.join(parent, segment);
      assert(
        fs.lstatSync(parent).isDirectory(),
        'Alpha source ancestor must be a real directory'
      );
    }
    const filename = path.join(root, name);
    assert(
      fs.lstatSync(filename).isFile(),
      'Alpha tracked source must be a regular file'
    );
    const fd = fs.openSync(
      filename,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
    try {
      const before = fs.fstatSync(fd);
      assert(
        before.isFile() && before.size <= 256 * 1024 * 1024,
        'Alpha source file exceeds the regular-file bound'
      );
      const bytes = fs.readFileSync(fd),
        after = fs.fstatSync(fd);
      assert(
        ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(
          (key) => before[key] === after[key]
        ) && bytes.length === before.size,
        'Alpha source changed while being inspected'
      );
      const blob = createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex');
      assert(
        blob === header[2] &&
          Boolean(before.mode & 0o111) === (header[1] === '100755'),
        'Alpha tracked source differs from reviewed bytes or mode'
      );
    } finally {
      fs.closeSync(fd);
    }
  }
  const sourceFiles = git('ls-files', '--others', '--exclude-standard', '-z')
    .split('\0')
    .filter(Boolean)
    .filter(
      (name) =>
        name.endsWith('/') ||
        /\.(?:[cm]?[jt]sx?|json|node|wasm|py|sh)$/i.test(name)
    );
  assert.equal(
    sourceFiles.length,
    0,
    'Alpha checkout contains nonignored untracked source'
  );
  return actualCommit;
}

module.exports = { assertPinnedAlphaCheckout };
