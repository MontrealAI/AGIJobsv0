'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const ROOT = path.resolve(__dirname, '../..');
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') =>
  createHash(algorithm).update(bytes).digest(encoding);
// npm packs regular files under package/. Reject duplicate paths and links;
// compare archive bytes with the separately reviewable source, without installing.
function archiveFiles(bytes) {
  const tar = gunzipSync(bytes);
  const files = {};
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, size) =>
      header
        .subarray(start, start + size)
        .toString('utf8')
        .split('\0')[0];
    const name = field(0, 100);
    const sizeField = field(124, 12).trim();
    assert.match(sizeField, /^[0-7]+$/);
    const size = parseInt(sizeField, 8);
    assert.equal(field(345, 155), '', 'Unexpected archive path prefix');
    assert(
      ['', '0'].includes(field(156, 1)),
      'Only regular archive files are permitted'
    );
    assert(
      name.startsWith('package/') &&
        !name.split('/').some((p) => p === '..' || p === ''),
      name
    );
    const relative = name.slice('package/'.length);
    assert(!Object.hasOwn(files, relative), 'Duplicate archive path');
    assert(offset + 512 + size <= tar.length, 'Truncated archive');
    files[relative] = hash(tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert(
    tar.subarray(offset).every((byte) => byte === 0),
    'Unexpected archive trailer'
  );
  return files;
}
function verify(root = ROOT, installed = true) {
  const dir = path.join(root, 'vendor/braces');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, 'provenance.json'))
  );
  assert.equal(manifest.upstream.version, '3.0.3');
  assert.equal(
    manifest.upstream.integrity,
    'sha512-yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA=='
  );
  assert.equal(
    'sha512-' +
      hash(
        fs.readFileSync(path.join(dir, 'upstream-3.0.3.tgz')),
        'sha512',
        'base64'
      ),
    manifest.upstream.integrity
  );
  for (const kind of ['upstream', 'patched']) {
    const files = manifest[kind].files;
    const actual = fs
      .readdirSync(path.join(dir, kind), { recursive: true })
      .filter((p) => fs.statSync(path.join(dir, kind, p)).isFile())
      .sort();
    assert.deepEqual(
      actual,
      Object.keys(files).sort(),
      `${kind}: unexpected or missing file`
    );
    for (const [file, expected] of Object.entries(files))
      assert.equal(
        hash(fs.readFileSync(path.join(dir, kind, file))),
        expected,
        `${kind}/${file}`
      );
    const archive =
      kind === 'upstream' ? 'upstream-3.0.3.tgz' : 'braces-3.0.4-agi.1.tgz';
    assert.deepEqual(
      archiveFiles(fs.readFileSync(path.join(dir, archive))),
      files,
      `${kind}: archive/source mismatch`
    );
  }
  assert.equal(
    manifest.upstreamTests.sourceCommit,
    manifest.upstream.sourceCommit
  );
  assert.deepEqual(
    fs.readdirSync(path.join(dir, 'upstream-tests')).sort(),
    Object.keys(manifest.upstreamTests.files).sort()
  );
  for (const [file, expected] of Object.entries(manifest.upstreamTests.files)) {
    assert.equal(
      hash(fs.readFileSync(path.join(dir, 'upstream-tests', file))),
      expected,
      `upstream-tests/${file}`
    );
  }
  const lock = JSON.parse(
    fs.readFileSync(path.join(root, 'package-lock.json'))
  );
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  const archive = 'vendor/braces/braces-3.0.4-agi.1.tgz';
  const integrity =
    'sha512-' +
    hash(fs.readFileSync(path.join(root, archive)), 'sha512', 'base64');
  assert.equal(integrity, manifest.patched.integrity);
  assert.equal(pkg.devDependencies.braces, 'file:' + archive);
  assert.equal(pkg.overrides.braces, '$braces');
  const entries = Object.entries(lock.packages).filter(([p]) =>
    /(?:^|\/)node_modules\/braces$/.test(p)
  );
  assert(entries.length > 0, 'No installed Braces resolution');
  for (const [p, entry] of entries) {
    assert.equal(entry.version, '3.0.4-agi.1', p);
    assert.equal(entry.resolved, 'file:' + archive, p);
    assert.equal(entry.integrity, integrity, p);
    if (installed)
      for (const [file, expected] of Object.entries(manifest.patched.files)) {
        assert.equal(
          hash(fs.readFileSync(path.join(root, p, file))),
          expected,
          `${p}/${file}`
        );
      }
  }
  return {
    upstream: manifest.upstream.version,
    maintainedPatch: '3.0.4-agi.1',
    advisory: manifest.advisory,
    resolutions: entries.map(([p]) => p),
    installedBytesVerified: installed,
    integrity,
  };
}
module.exports = { verify };
if (require.main === module) {
  try {
    console.log(
      JSON.stringify(verify(ROOT, !process.argv.includes('--source')), null, 2)
    );
  } catch (error) {
    console.error('BRACES_PATCH_INVALID:', error.message);
    process.exitCode = 1;
  }
}
