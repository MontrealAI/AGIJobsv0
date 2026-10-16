'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { verifyEventCheckout } = require('../check-dependency-preservation.cjs');
const p = require('../source-preservation-lib.cjs');
function contextFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-runtime-context-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'fixture'); git('config', 'user.name', 'Runtime context fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'commit.gpgsign', 'false');
  const writeCommit = (content, message) => { fs.writeFileSync(path.join(root, 'source.txt'), content); git('add', 'source.txt'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  const base = writeCommit('baseline\n', 'baseline');
  const oldHead = writeCommit('earlier head\n', 'earlier head');
  const oldTree = git('rev-parse', 'HEAD^{tree}');
  const payloadMerge = git('commit-tree', oldTree, '-p', base, '-p', oldHead, '-m', 'older payload merge');
  const head = writeCommit('current head\n', 'current head');
  const tree = git('rev-parse', 'HEAD^{tree}');
  const merge = (parents = [base, head], mergeTree = tree, message = 'runtime merge') => git('commit-tree', mergeTree, ...parents.flatMap(parent => ['-p', parent]), '-m', message);
  const runtime = merge();
  const context = { repository: 'Example/Jobs', pullRequest: 3976, base, head, merge: payloadMerge };
  const check = (overrides = {}) => verifyEventCheckout({ root, checkoutHead: head, baseTip: base, context, env: { GITHUB_SHA: runtime }, ...overrides });
  return { root, git, base, oldHead, oldTree, head, tree, runtime, payloadMerge, context, check, merge };
}
test('stale payload merge cannot reject a proven runtime merge with exact head/base/tree', t => {
  const f = contextFixture(t); const result = f.check();
  assert.equal(result.head, f.head); assert.equal(result.checkoutHead, f.head);
  assert.equal(result.runtimeMerge.commit, f.runtime); assert.deepEqual(result.runtimeMerge.parents, [f.base, f.head]);
  assert.equal(result.runtimeMerge.tree, f.tree); assert.equal(result.payloadMergeMatchesRuntime, false);
});
test('runtime merge checkout is proved independently of stale payload metadata', t => {
  const f = contextFixture(t); const result = f.check({ checkoutHead: f.runtime });
  assert.equal(result.checkoutHead, f.runtime); assert.equal(result.head, f.head);
});
test('null payload merge cannot bypass or prevent exact runtime proof', t => {
  const f = contextFixture(t); assert.equal(f.check({ context: { ...f.context, merge: null } }).runtimeMerge.commit, f.runtime);
});
test('explicit head runtime SHA remains accepted without a synthetic merge claim', t => {
  const f = contextFixture(t); assert.equal(f.check({ env: { GITHUB_SHA: f.head } }).runtimeMerge, null);
});
test('local head-only diagnostic reports that no runtime SHA was supplied', t => {
  const f = contextFixture(t); assert.equal(f.check({ env: {} }).runtimeSha, null);
});
test('payload merge identity never substitutes for a missing runtime object', t => {
  const f = contextFixture(t); assert.throws(() => f.check({ env: { GITHUB_SHA: 'a'.repeat(40) }, context: { ...f.context, merge: 'a'.repeat(40) } }));
});
test('malformed runtime SHA fails before Git resolution', t => {
  const f = contextFixture(t); assert.throws(() => f.check({ env: { GITHUB_SHA: '--help' } }), /full Git SHA-1/);
});
test('one-parent commit with the same head tree is not a synthetic merge', t => {
  const f = contextFixture(t); assert.throws(() => f.check({ env: { GITHUB_SHA: f.merge([f.head]) } }), /ordered parents/);
});
test('wrong event base parent is rejected even with matching tree and payload SHA', t => {
  const f = contextFixture(t); const bad = f.merge([f.oldHead, f.head]);
  assert.throws(() => f.check({ env: { GITHUB_SHA: bad }, context: { ...f.context, merge: bad } }), /ordered parents/);
});
test('wrong event head parent is rejected even with matching tree', t => {
  const f = contextFixture(t); assert.throws(() => f.check({ env: { GITHUB_SHA: f.merge([f.base, f.oldHead]) } }), /ordered parents/);
});
test('an extra merge parent is rejected rather than hidden behind includes checks', t => {
  const f = contextFixture(t); assert.throws(() => f.check({ env: { GITHUB_SHA: f.merge([f.base, f.head, f.oldHead]) } }), /ordered parents/);
});
test('reversed merge parent order is rejected', t => {
  const f = contextFixture(t); assert.throws(() => f.check({ env: { GITHUB_SHA: f.merge([f.head, f.base]) } }), /ordered parents/);
});
test('runtime merge with exact parents but different source tree is rejected', t => {
  const f = contextFixture(t); const bad = f.merge([f.base, f.head], f.oldTree);
  assert.throws(() => f.check({ env: { GITHUB_SHA: bad }, context: { ...f.context, merge: bad } }), /Runtime merge tree differs/);
});
test('matching payload merge does not authorize an unproven runtime SHA', t => {
  const f = contextFixture(t); assert.throws(() => f.check({ env: { GITHUB_SHA: f.payloadMerge } }), /ordered parents/);
});
test('checkout cannot select a different equivalent merge than the runtime SHA', t => {
  const f = contextFixture(t); const other = f.merge([f.base, f.head], f.tree, 'different equivalent merge');
  assert.throws(() => f.check({ checkoutHead: other, context: { ...f.context, merge: other } }), /neither event head nor proven runtime merge/);
});
test('merge checkout requires runtime proof even when payload metadata matches', t => {
  const f = contextFixture(t); assert.throws(() => f.check({ checkoutHead: f.runtime, env: {}, context: { ...f.context, merge: f.runtime } }), /Runtime GITHUB_SHA proof/);
});
test('annotated tag object cannot stand in for a runtime commit object', t => {
  const f = contextFixture(t); f.git('tag', '-a', 'runtime-tag', '-m', 'not a commit', f.head); const tag = f.git('rev-parse', 'runtime-tag');
  assert.throws(() => f.check({ env: { GITHUB_SHA: tag } }), /must name a commit/);
});
function fileFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-descriptor-file-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'contracts')); const name = 'contracts/Example.sol'; const file = path.join(root, name);
  fs.writeFileSync(file, 'reviewed bytes\n'); return { root, name, file };
}
function overrideFs(changes, run) {
  const original = Object.fromEntries(Object.keys(changes).map(key => [key, fs[key]]));
  try { for (const [key, factory] of Object.entries(changes)) fs[key] = factory(original[key]); return run(); }
  finally { for (const [key, value] of Object.entries(original)) fs[key] = value; }
}
test('source bytes are read from one no-follow descriptor and closed exactly once', t => {
  const f = fileFixture(t); let opened; let closed = 0; let reads = 0;
  const result = overrideFs({
    openSync: original => (filename, flags) => { assert.equal(filename, f.file); assert(flags & fs.constants.O_NOFOLLOW); assert(flags & fs.constants.O_NONBLOCK); opened = original(filename, flags); return opened; },
    readFileSync: original => descriptor => { assert.equal(descriptor, opened); assert.equal(typeof descriptor, 'number'); reads++; return original(descriptor); },
    closeSync: original => descriptor => { assert.equal(descriptor, opened); closed++; return original(descriptor); },
  }, () => p.fileEntry(f.root, f.name));
  assert.equal(reads, 1); assert.equal(closed, 1); assert.equal(result.type, 'blob');
  assert.throws(() => fs.fstatSync(opened), { code: 'EBADF' });
});
test('final-component symlinks are never followed', t => {
  const f = fileFixture(t); const target = path.join(f.root, 'target.txt'); fs.writeFileSync(target, 'unreviewed target'); fs.unlinkSync(f.file); fs.symlinkSync(target, f.file);
  let read = false;
  overrideFs({ readFileSync: original => (...args) => { read = true; return original(...args); } }, () => assert.throws(() => p.fileEntry(f.root, f.name), { code: 'ELOOP' }));
  assert.equal(read, false); assert.equal(fs.readFileSync(target, 'utf8'), 'unreviewed target');
});
test('a symlink swap immediately before open is rejected by O_NOFOLLOW', t => {
  const f = fileFixture(t); const target = path.join(f.root, 'target.txt'); fs.writeFileSync(target, 'unreviewed target');
  overrideFs({ openSync: original => (filename, flags) => { fs.unlinkSync(f.file); fs.symlinkSync(target, f.file); return original(filename, flags); } }, () => assert.throws(() => p.fileEntry(f.root, f.name), { code: 'ELOOP' }));
});
test('in-place source change during descriptor read fails and closes the descriptor', t => {
  const f = fileFixture(t); let descriptor; let closed = false;
  overrideFs({
    readFileSync: original => fd => { descriptor = fd; fs.appendFileSync(f.file, 'concurrent change'); return original(fd); },
    closeSync: original => fd => { if (fd === descriptor) closed = true; return original(fd); },
  }, () => assert.throws(() => p.fileEntry(f.root, f.name), /changed while reading/));
  assert.equal(closed, true); assert.throws(() => fs.fstatSync(descriptor), { code: 'EBADF' });
});
test('directory-entry replacement after open cannot redirect descriptor contents', t => {
  const f = fileFixture(t); let readBytes;
  overrideFs({ readFileSync: original => fd => { fs.renameSync(f.file, f.file + '.old'); fs.writeFileSync(f.file, 'replacement bytes\n'); const bytes = original(fd); readBytes = bytes.toString(); return bytes; } }, () => assert.throws(() => p.fileEntry(f.root, f.name), /changed while reading|replaced while reading/));
  assert.equal(readBytes, 'reviewed bytes\n'); assert.equal(fs.readFileSync(f.file, 'utf8'), 'replacement bytes\n');
});
test('descriptor closes on read failure', t => {
  const f = fileFixture(t); let descriptor; let closed = false;
  overrideFs({ openSync: original => (...args) => (descriptor = original(...args)), readFileSync: () => () => { throw Error('injected read failure'); }, closeSync: original => fd => { if (fd === descriptor) closed = true; return original(fd); } }, () => assert.throws(() => p.fileEntry(f.root, f.name), /injected read failure/));
  assert.equal(closed, true); assert.throws(() => fs.fstatSync(descriptor), { code: 'EBADF' });
});
test('opened non-regular file is rejected without reading and its descriptor closes', t => {
  const f = fileFixture(t); fs.unlinkSync(f.file); fs.mkdirSync(f.file); let descriptor; let closed = false; let read = false;
  overrideFs({ openSync: original => (...args) => (descriptor = original(...args)), readFileSync: original => (...args) => { read = true; return original(...args); }, closeSync: original => fd => { if (fd === descriptor) closed = true; return original(fd); } }, () => assert.throws(() => p.fileEntry(f.root, f.name), /must be regular/));
  assert.equal(read, false); assert.equal(closed, true);
});
test('existing symlink parent directory fails the non-atomic parent precheck', t => {
  const f = fileFixture(t); fs.renameSync(path.join(f.root, 'contracts'), path.join(f.root, 'actual')); fs.symlinkSync('actual', path.join(f.root, 'contracts'));
  assert.throws(() => p.fileEntry(f.root, f.name), /real directory/);
});
