'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const DEPENDENCIES = ['hardhat', 'solc', 'ethers', '@openzeppelin/contracts', '@prb/math', '@ethereum-attestation-service/eas-contracts', '@ethereum-attestation-service/eas-sdk'];
const EXTRA_OUTPUTS = ['scripts/generated/protocol-defaults.ts'];
const protectedPath = (name) => name.endsWith('.sol') ||
  /(^|\/)hardhat\.config\.[cm]?[jt]s$/.test(name) ||
  /^(config|deployment-config|scripts\/v2|scripts\/config|scripts\/deploy)\//.test(name) ||
  /^scripts\/(generate-constants(?:-impl)?\.ts|constants\.ts|release\/audit-dependencies\.)/.test(name) ||
  ['foundry.toml', 'remappings.txt'].includes(name);
// Conservative generator closure: new helper files and import-resolution shadows
// in scripts are caught, while the separately reviewed policy may be installed.
const generatorInput = (name) => (name.startsWith('scripts/') && !name.startsWith('scripts/security/')) || name.startsWith('types/') ||
  ['package.json', 'package-lock.json', '.nvmrc', 'tsconfig.json'].includes(name) || /^tsconfig\.[^/]+\.json$/.test(name);
const relevant = (name) => protectedPath(name) || generatorInput(name);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sorted = (items) => [...items].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
function canonical(value) {
  const order = (v) => Array.isArray(v) ? v.map(order) : v && typeof v === 'object' ?
    Object.fromEntries(Object.keys(v).sort().map((k) => [k, order(v[k])])) : v;
  return Buffer.from(JSON.stringify(order(value)) + '\n');
}
function parseCanonical(bytes, label) {
  const parsed = JSON.parse(bytes.toString('utf8'));
  assert.deepEqual(canonical(parsed), bytes, label + ' must be canonical JSON (duplicate keys are rejected)');
  return parsed;
}
function keys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), label + ' must be an object');
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), label + ' schema mismatch');
}
function oid(value, label) { assert.match(value, /^[0-9a-f]{40}$/, label + ' must be a full Git SHA-1'); }
function safePath(value) {
  assert(typeof value === 'string' && value.length > 0 && !value.includes('\0') && !value.includes('\\') &&
    !value.startsWith('/') && !value.split('/').some((s) => !s || s === '.' || s === '..') &&
    !value.includes('\ufffd'), 'Invalid repository path');
  return value;
}
function git(root, args, binary = false, input) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  env.GIT_NO_REPLACE_OBJECTS = '1'; env.GIT_CONFIG_NOSYSTEM = '1'; env.GIT_CONFIG_GLOBAL = '/dev/null';
  return execFileSync('git', ['--no-replace-objects', '--literal-pathspecs', ...args], {
    cwd: root, env, input, encoding: binary ? undefined : 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  });
}
function names(value) { return value.split('\0').filter(Boolean); }
function history(root) {
  assert.equal(git(root, ['for-each-ref', '--format=%(refname)', 'refs/replace']).trim(), '', 'Git replace refs are not supported');
  const common = path.resolve(root, git(root, ['rev-parse', '--git-common-dir']).trim());
  const graft = path.join(common, 'info/grafts');
  assert(!fs.existsSync(graft) || fs.readFileSync(graft).length === 0, 'Git grafts are not supported');
}
function commit(root, ref) { const result = git(root, ['rev-parse', '--verify', ref + '^{commit}']).trim(); oid(result, 'commit'); return result; }
function treeId(root, ref) { return git(root, ['rev-parse', '--verify', ref + '^{tree}']).trim(); }
function parents(root, ref) { return git(root, ['show', '-s', '--format=%P', ref]).trim().split(/\s+/).filter(Boolean); }
function ancestor(root, older, newer) { git(root, ['merge-base', '--is-ancestor', older, newer]); }
function inventory(root, ref, predicate = () => true) {
  const result = [];
  for (const entry of names(git(root, ['ls-tree', '-r', '-z', ref]))) {
    const at = entry.indexOf('\t'); assert(at > 0, 'Malformed Git tree');
    const [mode, type, blob] = entry.slice(0, at).split(' '); const name = entry.slice(at + 1);
    if (predicate(name)) { safePath(name); result.push({ path: name, mode, type, blob }); }
  }
  return result.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
}
function validateInventory(items, predicate, label) {
  assert(Array.isArray(items), label + ' must be an array'); const seen = new Set();
  for (const entry of items) {
    keys(entry, ['path', 'mode', 'type', 'blob'], label); safePath(entry.path);
    assert(predicate(entry.path), 'Unexpected path in ' + label + ': ' + entry.path);
    assert(!seen.has(entry.path), 'Duplicate inventory path'); seen.add(entry.path);
    assert(['100644', '100755'].includes(entry.mode) && entry.type === 'blob', 'Only regular Git source files are supported'); oid(entry.blob, 'blob');
  }
  assert.deepEqual(items.map((e) => e.path), sorted(seen), label + ' must be sorted');
}
function blob(root, id) { oid(id, 'blob'); return git(root, ['cat-file', 'blob', id], true); }
function identity(root, entry, cache = new Map()) {
  if (!entry) return { state: 'absent' };
  if (!cache.has(entry.blob)) cache.set(entry.blob, blob(root, entry.blob));
  const bytes = cache.get(entry.blob);
  return { state: 'present', mode: entry.mode, type: entry.type, blob: entry.blob, sha256: sha256(bytes), byteLength: bytes.length };
}
function transitionSet(root, before, after) {
  const b = new Map(before.map((e) => [e.path, e])); const a = new Map(after.map((e) => [e.path, e])); const cache = new Map();
  return sorted(new Set([...b.keys(), ...a.keys()])).filter((p) => JSON.stringify(b.get(p)) !== JSON.stringify(a.get(p)))
    .map((p) => ({ path: p, before: identity(root, b.get(p), cache), after: identity(root, a.get(p), cache) }));
}
function selectedIdentities(lock) {
  return DEPENDENCIES.map((name) => {
    const value = lock.packages?.['node_modules/' + name]; assert(value, name + ' must remain installed');
    const result = { name };
    for (const field of ['version', 'resolved', 'integrity']) {
      assert(typeof value[field] === 'string' && value[field].length > 0, name + ' missing ' + field); result[field] = value[field];
    }
    return result;
  });
}
function lockAt(root, ref) { return JSON.parse(git(root, ['show', ref + ':package-lock.json'])); }
function makeRecord({ root, baseline, source, repository, pullRequest }) {
  oid(baseline, 'baseline'); oid(source, 'source'); history(root); assert.equal(commit(root, baseline), baseline); assert.equal(commit(root, source), source); ancestor(root, baseline, source);
  assert(typeof repository === 'string' && /^[^/\s]+\/[^/\s]+$/.test(repository)); assert(Number.isSafeInteger(pullRequest) && pullRequest > 0);
  const before = inventory(root, baseline, protectedPath); const after = inventory(root, source, protectedPath); const closure = inventory(root, source, generatorInput);
  validateInventory(before, protectedPath, 'baseline inventory'); validateInventory(after, protectedPath, 'source inventory'); validateInventory(closure, generatorInput, 'generator closure');
  const dependencies = selectedIdentities(lockAt(root, baseline)); assert.deepEqual(selectedIdentities(lockAt(root, source)), dependencies, 'Source dependency identities drifted from original baseline');
  const transitions = transitionSet(root, before, after);
  return { schemaVersion: 1, recordType: 'functional-unreleased-source-transition', state: 'UNRELEASED', releaseIdentity: null,
    scope: { repository, pullRequest }, dependencyBaseline: baseline, dependencyBaselineTree: treeId(root, baseline),
    sourceCheckpoint: source, sourceTree: treeId(root, source), sourceParents: parents(root, source),
    allowedEffectiveMergeBases: [baseline], protectedPredicateVersion: 1, generatorClosureVersion: 1,
    baselineInventory: before, sourceInventory: after, generatorClosure: closure,
    transitionCount: transitions.length, transitions,
    explicitAbsence: { before: transitions.filter((e) => e.before.state === 'absent').map((e) => e.path), after: transitions.filter((e) => e.after.state === 'absent').map((e) => e.path) },
    dependencyIdentities: dependencies, additionalGeneratedOutputs: EXTRA_OUTPUTS,
    trustLimit: 'Functional exact-source validation only; candidate-editable policy is not independent approval. No security-review, release or production approval is asserted.' };
}
function verifyRecord({ root, baseline, head, policy }) {
  assert(policy && Buffer.isBuffer(policy.bytes), 'Pinned policy bytes are required'); assert.match(policy.sha256, /^[0-9a-f]{64}$/);
  assert.equal(sha256(policy.bytes), policy.sha256, 'Source transition record digest mismatch');
  const r = parseCanonical(policy.bytes, 'Source transition record');
  keys(r, ['schemaVersion','recordType','state','releaseIdentity','scope','dependencyBaseline','dependencyBaselineTree','sourceCheckpoint','sourceTree','sourceParents','allowedEffectiveMergeBases','protectedPredicateVersion','generatorClosureVersion','baselineInventory','sourceInventory','generatorClosure','transitionCount','transitions','explicitAbsence','dependencyIdentities','additionalGeneratedOutputs','trustLimit'], 'Source transition record');
  assert.equal(r.schemaVersion, 1); assert.equal(r.recordType, 'functional-unreleased-source-transition'); assert.equal(r.state, 'UNRELEASED'); assert.equal(r.releaseIdentity, null);
  keys(r.scope, ['repository','pullRequest'], 'scope'); assert.equal(r.protectedPredicateVersion, 1); assert.equal(r.generatorClosureVersion, 1);
  oid(r.dependencyBaseline, 'dependency baseline'); oid(r.sourceCheckpoint, 'source checkpoint'); oid(r.sourceTree, 'source tree'); oid(r.dependencyBaselineTree, 'baseline tree');
  assert.deepEqual(r.allowedEffectiveMergeBases, [r.dependencyBaseline]); assert.equal(baseline, r.dependencyBaseline, 'Transition requires original effective merge base');
  assert.equal(commit(root, r.sourceCheckpoint), r.sourceCheckpoint); assert.equal(treeId(root, r.sourceCheckpoint), r.sourceTree, 'Source tree mismatch');
  assert.equal(treeId(root, r.dependencyBaseline), r.dependencyBaselineTree, 'Baseline tree mismatch'); assert.deepEqual(parents(root, r.sourceCheckpoint), r.sourceParents, 'Source parents mismatch');
  ancestor(root, r.dependencyBaseline, r.sourceCheckpoint); ancestor(root, r.sourceCheckpoint, head);
  validateInventory(r.baselineInventory, protectedPath, 'baseline inventory'); validateInventory(r.sourceInventory, protectedPath, 'source inventory'); validateInventory(r.generatorClosure, generatorInput, 'generator closure');
  assert.deepEqual(inventory(root, r.dependencyBaseline, protectedPath), r.baselineInventory, 'Baseline protected inventory mismatch');
  assert.deepEqual(inventory(root, r.sourceCheckpoint, protectedPath), r.sourceInventory, 'Source protected inventory mismatch');
  assert.deepEqual(inventory(root, r.sourceCheckpoint, generatorInput), r.generatorClosure, 'Source generator closure mismatch');
  const transitions = transitionSet(root, r.baselineInventory, r.sourceInventory);
  assert.equal(r.transitionCount, transitions.length, 'Transition count mismatch'); assert(r.transitionCount > 0, 'Empty transition is not an exception'); assert.deepEqual(r.transitions, transitions, 'Exact source transition set mismatch');
  assert.deepEqual(r.explicitAbsence, { before: transitions.filter((e) => e.before.state === 'absent').map((e) => e.path), after: transitions.filter((e) => e.after.state === 'absent').map((e) => e.path) }, 'Explicit absence set mismatch');
  assert.deepEqual(inventory(root, head, protectedPath), r.sourceInventory, 'Protected source differs from reviewed checkpoint');
  assert.deepEqual(inventory(root, head, generatorInput), r.generatorClosure, 'Generator input closure differs from reviewed checkpoint');
  assert.deepEqual(selectedIdentities(lockAt(root, r.dependencyBaseline)), r.dependencyIdentities, 'Original dependency record mismatch');
  assert.deepEqual(r.additionalGeneratedOutputs, EXTRA_OUTPUTS, 'Explicit generated products mismatch');
  return r;
}
function ensureParents(root, name) {
  let current = root; const pieces = safePath(name).split('/'); pieces.pop();
  for (const piece of pieces) { current = path.join(current, piece); assert(fs.lstatSync(current).isDirectory() && !fs.lstatSync(current).isSymbolicLink(), 'Source directory is not a real directory: ' + name); }
}
function fileEntry(root, name) {
  // Parent-directory checks are defense in depth, not an atomic directory-fd
  // walk. This functional snapshot assumes the workspace/parent directories
  // are not concurrently replaced by an adversarial writer.
  ensureParents(root, name);
  const file = path.join(root, name);
  assert(Number.isInteger(fs.constants.O_NOFOLLOW), 'O_NOFOLLOW support is required');
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    assert(before.isFile(), 'Source path must be regular: ' + name);
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    for (const field of ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) {
      assert.equal(after[field], before[field], 'Source file changed while reading: ' + name);
    }
    assert.equal(BigInt(bytes.length), after.size, 'Source file size changed while reading: ' + name);
    // A descriptor reads one object even if its directory entry is replaced.
    // Also reject a replacement visible at this final point-in-time check.
    const current = fs.lstatSync(file, { bigint: true });
    assert(current.isFile() && !current.isSymbolicLink() && current.dev === after.dev && current.ino === after.ino,
      'Source path was replaced while reading: ' + name);
    return { path: name, mode: after.mode & 0o111n ? '100755' : '100644', type: 'blob',
      blob: createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex') };
  } finally {
    fs.closeSync(descriptor);
  }
}
function indexInventory(root, predicate) {
  return names(git(root, ['ls-files', '--stage', '-z'])).map((entry) => {
    const at = entry.indexOf('\t'); const [mode, id, stage] = entry.slice(0, at).split(' '); const name = entry.slice(at + 1);
    if (!predicate(name)) return null; assert.equal(stage, '0', 'Unmerged source index'); return { path: name, mode, type: 'blob', blob: id };
  }).filter(Boolean).sort((a,b) => Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
}
function filesystemPaths(root, predicate) {
  const result = [];
  function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = prefix ? prefix + '/' + entry.name : entry.name;
      if (!prefix && ['.git','node_modules'].includes(entry.name)) continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), name);
      else if (predicate(name)) result.push(name);
    }
  }
  walk(root, ''); return sorted(result);
}
function checkWorkingSource(root, head, { allowGenerated = false, transition = false } = {}) {
  const predicate = transition ? relevant : protectedPath; const expected = inventory(root, head, predicate);
  assert.deepEqual(indexInventory(root, predicate), expected, 'Staged protected/generator source differs from HEAD');
  const found = filesystemPaths(root, predicate); assert.deepEqual(found, expected.map((e) => e.path), 'Unexpected or missing protected/generator repository file (including ignored files)');
  if (!allowGenerated) for (const entry of expected) assert.deepEqual(fileEntry(root, entry.path), entry, 'Working source differs from HEAD: ' + entry.path);
  else for (const entry of expected) if (!protectedPath(entry.path) && !EXTRA_OUTPUTS.includes(entry.path)) assert.deepEqual(fileEntry(root, entry.path), entry, 'Working generator input differs from HEAD: ' + entry.path);
}
function readContext(env) {
  if (!env.GITHUB_EVENT_PATH) return null;
  const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')); const pr = event.pull_request;
  assert(pr && event.repository?.full_name && Number.isSafeInteger(event.number ?? pr.number), 'PR event context is required');
  const context = { repository: event.repository.full_name, pullRequest: event.number ?? pr.number, head: pr.head.sha, base: pr.base.sha, merge: pr.merge_commit_sha ?? null };
  for (const key of ['head','base']) oid(context[key], 'Event ' + key); if (context.merge) oid(context.merge, 'Event merge');
  if (env.GITHUB_REPOSITORY) assert.equal(env.GITHUB_REPOSITORY, context.repository, 'Repository event mismatch');
  return context;
}
function defaultPolicy(context, directory) {
  if (!context) return null;
  const filename = path.join(directory, 'unreleased-source-policy.index.json'); if (!fs.existsSync(filename)) return null;
  const index = parseCanonical(fs.readFileSync(filename), 'Policy index'); keys(index, ['schemaVersion','records'], 'Policy index'); assert.equal(index.schemaVersion, 1); assert(Array.isArray(index.records));
  const matching = index.records.filter((entry) => entry.repository === context.repository && entry.pullRequest === context.pullRequest); assert(matching.length <= 1, 'Duplicate policy scope'); if (!matching.length) return null;
  const entry = matching[0]; keys(entry, ['repository','pullRequest','file','sha256'], 'Policy index entry'); assert.equal(entry.file, 'unreleased-source-policy.json', 'Fixed record filename required');
  return { bytes: fs.readFileSync(path.join(directory, entry.file)), sha256: entry.sha256 };
}
module.exports = { DEPENDENCIES, EXTRA_OUTPUTS, protectedPath, generatorInput, relevant, sha256, canonical, parseCanonical, keys, oid, safePath, git, names, history, commit, treeId, parents, ancestor, inventory, validateInventory, blob, identity, transitionSet, selectedIdentities, lockAt, makeRecord, verifyRecord, fileEntry, indexInventory, filesystemPaths, checkWorkingSource, readContext, defaultPolicy };
