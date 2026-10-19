'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { registerHooks } = require('node:module');
const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const MAX_MODULE_BYTES = 8 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
const MAX_SNAPSHOT_MODULES = 256;

function boundedSourceBlob(fd, maxBytes = MAX_SOURCE_BYTES, capture = false) {
  assert(
    Number.isSafeInteger(maxBytes) &&
      maxBytes > 0 &&
      maxBytes <= MAX_SOURCE_BYTES,
    'Alpha source byte bound is invalid'
  );
  const before = fs.fstatSync(fd);
  assert(
    before.isFile() && before.size <= maxBytes,
    'Alpha source file exceeds the regular-file bound'
  );
  const blob = createHash('sha1').update(`blob ${before.size}\0`);
  const readLimit = capture
    ? Math.min(maxBytes + 1, before.size + 1)
    : maxBytes + 1;
  const chunk = Buffer.alloc(Math.min(64 * 1024, readLimit));
  const chunks = [];
  let used = 0;
  while (used < readLimit) {
    const count = fs.readSync(
      fd,
      chunk,
      0,
      Math.min(chunk.length, readLimit - used),
      null
    );
    if (count === 0) break;
    used += count;
    blob.update(chunk.subarray(0, count));
    if (capture) chunks.push(Buffer.from(chunk.subarray(0, count)));
  }
  const after = fs.fstatSync(fd);
  assert(
    used <= maxBytes &&
      used === before.size &&
      ['dev', 'ino', 'mode', 'size', 'mtimeMs', 'ctimeMs'].every(
        (key) => before[key] === after[key]
      ),
    'Alpha source grew or changed during bounded source read'
  );
  return {
    blob: blob.digest('hex'),
    stat: before,
    ...(capture ? { bytes: Buffer.concat(chunks, used) } : {}),
  };
}

// Check the whole tracked tree: the native inspector has transitive imports in
// successor-workbench and build-successor, outside its own directory.
function inspectPinnedAlphaCheckout(
  root,
  expectedCommit,
  captureModules = false
) {
  const modules = new Map();
  let capturedBytes = 0;
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
      const capture =
        captureModules &&
        name.endsWith('.mjs') &&
        (/^examples\/(?:successor-alpha|successor-workbench|build-successor)\//.test(
          name
        ) ||
          name.startsWith('docs/assets/successor/'));
      if (capture)
        assert(
          capturedBytes < MAX_SNAPSHOT_BYTES &&
            modules.size < MAX_SNAPSHOT_MODULES,
          'Alpha module snapshot exceeds its total bound'
        );
      const result = boundedSourceBlob(
        fd,
        capture
          ? Math.min(MAX_MODULE_BYTES, MAX_SNAPSHOT_BYTES - capturedBytes)
          : MAX_SOURCE_BYTES,
        capture
      );
      const { blob, stat: before } = result;
      assert(
        blob === header[2] &&
          Boolean(before.mode & 0o111) === (header[1] === '100755'),
        'Alpha tracked source differs from reviewed bytes or mode'
      );
      if (capture) {
        const source = new TextDecoder('utf-8', {
          fatal: true,
          ignoreBOM: true,
        }).decode(result.bytes);
        capturedBytes += result.bytes.length;
        modules.set(name, source);
      }
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
  // Consumers must retain this verified physical path. Reusing the configured
  // alias after this check would permit a root symlink to select other code.
  return { source: Object.freeze({ root, commit: actualCommit }), modules };
}

function verifyPinnedAlphaCheckout(root, expectedCommit) {
  return inspectPinnedAlphaCheckout(root, expectedCommit).source;
}

// Keep verified source strings private. Node resolves every edge of this pure
// module graph inside the snapshot, never reopening the mutable checkout.
function preparePinnedAlphaComputer(root, expectedCommit) {
  const inspected = inspectPinnedAlphaCheckout(root, expectedCommit, true);
  const entry = 'examples/successor-alpha/computer.mjs';
  assert(inspected.modules.has(entry), 'Alpha native computer entry is absent');
  const prefix = `fqr-alpha-memory-${randomUUID()}:///`;
  const moduleURL = (name) =>
    prefix + name.split('/').map(encodeURIComponent).join('/');
  const sources = new Map(
    [...inspected.modules].map(([name, source]) => [moduleURL(name), source])
  );
  const sourceHash = createHash('sha256')
    .update(inspected.modules.get(entry), 'utf8')
    .digest('hex');
  inspected.modules.clear();
  let disposed = false;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        context.parentURL?.startsWith('fqr-alpha-memory-') &&
        !context.parentURL.startsWith(prefix)
      )
        return nextResolve(specifier, context);
      if (context.parentURL?.startsWith(prefix)) {
        assert(
          specifier.startsWith('./') || specifier.startsWith('../'),
          'Alpha snapshot only admits captured relative imports'
        );
        const target = new URL(specifier, context.parentURL);
        assert(
          !target.search && !target.hash && sources.has(target.href),
          'Alpha snapshot import is outside captured source'
        );
        return { url: target.href, shortCircuit: true };
      }
      if (specifier.startsWith(prefix)) {
        assert(
          !disposed && sources.has(specifier),
          'Alpha snapshot entry is unavailable'
        );
        return { url: specifier, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (!url.startsWith(prefix)) return nextLoad(url, context);
      assert(
        !disposed && sources.has(url),
        'Alpha snapshot module is unavailable'
      );
      return { format: 'module', source: sources.get(url), shortCircuit: true };
    },
  });
  const dispose = () => {
    if (!disposed) {
      disposed = true;
      hooks.deregister();
      sources.clear();
    }
  };
  return Object.freeze({
    ...inspected.source,
    sourceHash,
    async load() {
      assert(!disposed, 'Alpha snapshot is disposed');
      try {
        return await import(moduleURL(entry));
      } catch (error) {
        dispose();
        throw error;
      }
    },
    dispose,
  });
}

function assertPinnedAlphaCheckout(root, expectedCommit) {
  return verifyPinnedAlphaCheckout(root, expectedCommit).commit;
}

module.exports = {
  assertPinnedAlphaCheckout,
  verifyPinnedAlphaCheckout,
  preparePinnedAlphaComputer,
  boundedSourceBlob,
};
