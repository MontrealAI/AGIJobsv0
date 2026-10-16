'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { ethers } = require('ethers');
const { digest } = require('../../scripts/deploy/external-session.cjs');
const {
  REQUIRED_SOURCE_FILES,
  assertNoSigningEnvironment,
  parseJson,
} = require('../../scripts/deploy/external-profile.cjs');
const {
  runCommand,
  readCommandRequest,
  COMMANDS,
} = require('../../scripts/deploy/external-command.cjs');
const SOURCE = path.resolve(__dirname, '../..');
// Test fixtures use their own fixed node_modules link, never an ambient lookup path.
const inheritedNodePath = process.env.NODE_PATH;
delete process.env.NODE_PATH;
test.after(() => {
  if (inheritedNodePath !== undefined)
    process.env.NODE_PATH = inheritedNodePath;
});
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
function write(file, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    file,
    Buffer.isBuffer(value) || typeof value === 'string' ? value : json(value),
    { mode }
  );
}
// Only new disposable source fixtures receive their manifest-declared mode.
// Private inputs continue through write() with 0600. O_EXCL/O_NOFOLLOW prevents
// this test helper from changing an existing file or following a replacement.
function createSourceFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(
    file,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_NOFOLLOW,
    0o600
  );
  try {
    fs.writeFileSync(fd, value);
    fs.fchmodSync(fd, 0o644);
  } finally {
    fs.closeSync(fd);
  }
}
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-profile-unit-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'source'),
    privateRoot = path.join(base, 'private');
  fs.mkdirSync(root, { mode: 0o700 });
  fs.mkdirSync(privateRoot, { mode: 0o700 });
  fs.mkdirSync(path.join(root, 'contracts'), { mode: 0o700 });
  fs.symlinkSync(
    path.join(SOURCE, 'node_modules'),
    path.join(root, 'node_modules'),
    'dir'
  );
  const executable = new Set([
    'scripts/deploy/external-profile.cjs',
    'scripts/deploy/external-command.cjs',
    'scripts/deploy/external-envelope.cjs',
    'scripts/deploy/external-session.cjs',
    'scripts/deploy/external-signer.cjs',
    'config/implementation-modules.json',
  ]);
  for (const file of REQUIRED_SOURCE_FILES)
    createSourceFile(
      path.join(root, file),
      executable.has(file)
        ? fs.readFileSync(path.join(SOURCE, file))
        : file.endsWith('.json')
        ? '{}\n'
        : '// independently reviewed fixture\n'
    );
  const api = require(path.join(root, 'scripts/deploy/external-profile.cjs'));
  const configPath = path.join(privateRoot, 'configuration.json'),
    configBytes = json({ governance: 'reviewed' });
  write(configPath, configBytes);
  const locks = path.join(privateRoot, 'locks');
  fs.mkdirSync(locks, { mode: 0o700 });
  const manifest = {
    schema: 'jobs-reviewed-source-v1',
    sourceCommit: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40),
    files: api.requiredSourceFiles(root).map((file) => ({
      path: file,
      sha256: sha(fs.readFileSync(path.join(root, file))),
      mode: '100644',
    })),
  };
  const plan = {
    schema: 'jobs-external-plan-v1',
    campaignId: 'd73e3542-501f-4567-8bbb-88a515fd4bc9',
    chainId: 31337,
    creator: ethers.getAddress('0x' + '11'.repeat(20)),
    governor: ethers.getAddress('0x' + '22'.repeat(20)),
    sourceCommit: manifest.sourceCommit,
    sourceTree: manifest.sourceTree,
    compilerInputSha256: 'c'.repeat(64),
    sourceManifestHash: sha(json(manifest)),
    configHash: '0x' + sha(configBytes),
    creationScopeHash: ethers.id('scope'),
    firstNonce: 0,
    creatorCodeHash: ethers.keccak256('0x'),
    initialBlock: { number: 1, hash: ethers.id('initial') },
    confirmations: 1,
    expiresAt: '2099-01-01T00:00:00.000Z',
    fees: {
      gasLimit: '2000000',
      maxFeePerGas: '1000000000',
      maxPriorityFeePerGas: '1000000',
    },
    lockDirectory: locks,
  };
  const profilePath = path.join(privateRoot, 'profile.json');
  const profile = {
    profile: 'jobs-external-manual-v1',
    sessionDirectory: path.join(privateRoot, 'session'),
    planFile: path.join(privateRoot, 'plan.json'),
    reviewedPlanHash: digest(plan),
    sourceManifestFile: path.join(privateRoot, 'source.json'),
    reviewedSourceManifestSha256: plan.sourceManifestHash,
  };
  let providerCalls = 0;
  const provider = Object.fromEntries(
    [
      'send',
      'getBlock',
      'getCode',
      'getTransactionCount',
      'getTransaction',
      'getTransactionReceipt',
    ].map((method) => [
      method,
      () => {
        providerCalls++;
        throw new Error('Provider activity forbidden in profile tests');
      },
    ])
  );
  const options = { provider, root, configBytes, configPath };
  function save() {
    write(profilePath, profile);
    write(profile.planFile, plan);
    write(profile.sourceManifestFile, manifest);
  }
  function pinReview() {
    plan.sourceManifestHash = profile.reviewedSourceManifestSha256 = sha(
      json(manifest)
    );
    profile.reviewedPlanHash = digest(plan);
    save();
  }
  save();
  return {
    base,
    root,
    privateRoot,
    api,
    provider,
    providerCalls: () => providerCalls,
    configPath,
    configBytes,
    plan,
    manifest,
    profile,
    profilePath,
    options,
    save,
    pinReview,
    load: () => api.loadExternalProfile(profilePath, options),
  };
}
function commandFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-command-unit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let index = 0;
  return { root, output: () => path.join(root, `${index++}.json`) };
}

test('loads only reviewed source, configuration and address-only signer without provider activity', (t) => {
  const f = fixture(t),
    result = f.load();
  assert.equal(result.sessionDirectory, f.profile.sessionDirectory);
  assert.equal(result.signer.provider, f.provider);
  assert.equal(result.signer.externalManual, true);
  assert.equal(result.revalidateSource(), true);
  assert.equal(typeof result.initialize, 'function');
  assert.equal(f.providerCalls(), 0);
  assert.equal(Object.isFrozen(result.plan.fees), true);
  for (const entry of f.manifest.files)
    assert.equal(
      fs.statSync(path.join(f.root, entry.path)).mode & 0o777,
      0o644
    );
  for (const file of [
    f.configPath,
    f.profilePath,
    f.profile.planFile,
    f.profile.sourceManifestFile,
  ])
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const original = path.join(f.root, f.manifest.files[0].path),
    bytes = fs.readFileSync(original),
    link = path.join(f.root, 'replacement-link');
  assert.throws(() => createSourceFile(original, 'replacement'), {
    code: 'EEXIST',
  });
  fs.symlinkSync(original, link);
  assert.throws(() => createSourceFile(link, 'replacement'), {
    code: 'EEXIST',
  });
  assert.deepEqual(fs.readFileSync(original), bytes);
  assert.equal(fs.statSync(original).mode & 0o777, 0o644);
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
  if (!process.env.JOBS_TEST_SOURCE_FIXTURE_CHILD) {
    // Exercise this exact fixture in fresh processes under both ordinary and
    // hosted-private umasks. No production source/private mode is relaxed.
    for (const mask of [0o022, 0o077]) {
      const child = spawnSync(
        process.execPath,
        [
          '--max-old-space-size=256',
          '-e',
          `process.umask(${mask});require(${JSON.stringify(__filename)})`,
        ],
        {
          env: { ...process.env, JOBS_TEST_SOURCE_FIXTURE_CHILD: '1' },
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        }
      );
      assert.equal(child.error, undefined);
      assert.equal(child.signal, null);
      assert.equal(
        child.status,
        0,
        `source fixture subprocess failed for umask ${mask.toString(8)}`
      );
    }
  }
});
test('profile, source manifest and raw configuration have exact independently pinned identities', (t) => {
  const f = fixture(t);
  f.profile.rpc = 'https://untrusted.invalid';
  f.save();
  assert.throws(f.load, /fields/);
  delete f.profile.rpc;
  f.profile.reviewedPlanHash = ethers.ZeroHash;
  f.save();
  assert.throws(f.load, /plan hash/);
  f.pinReview();
  f.profile.reviewedSourceManifestSha256 = 'e'.repeat(64);
  f.save();
  assert.throws(f.load, /manifest/);
  f.pinReview();
  f.manifest.sourceCommit = 'd'.repeat(40);
  f.pinReview();
  assert.throws(f.load, /manifest/);
  f.manifest.sourceCommit = f.plan.sourceCommit;
  f.pinReview();
  f.manifest.sourceTree = 'e'.repeat(40);
  f.pinReview();
  assert.throws(f.load, /manifest/);
  f.manifest.sourceTree = f.plan.sourceTree;
  f.pinReview();
  f.options.configBytes = Buffer.from('{}');
  assert.throws(f.load, /configuration path/);
  f.options.configBytes = f.configBytes;
  f.plan.configHash = ethers.ZeroHash;
  f.pinReview();
  assert.throws(f.load, /configuration digest/);
  assert.equal(f.providerCalls(), 0);
});
test('manifest rejects missing minimum deployment/runtime/helper/config/source entries', (t) => {
  const f = fixture(t),
    original = [...f.manifest.files];
  for (const missing of [
    'scripts/deploy/external-command.cjs',
    'scripts/deploy/stage-protocol.cjs',
    'scripts/v2/deployDefaults.ts',
    'scripts/v2/externalManual.ts',
    'scripts/config/index.js',
    'scripts/ci/solidity-policy.cjs',
    'hardhat.config.js',
    'package-lock.json',
  ]) {
    f.manifest.files = original.filter((file) => file.path !== missing);
    f.pinReview();
    assert.throws(f.load, /incomplete/);
  }
  f.manifest.files = original;
  createSourceFile(path.join(f.root, 'contracts/New.sol'), 'contract New {}\n');
  f.pinReview();
  assert.throws(f.load, /incomplete/);
});
test('manifest rejects unsafe/duplicate names, unknown fields, hashes and modes', (t) => {
  const f = fixture(t),
    original = f.manifest.files[0];
  for (const name of [
    '../outside',
    '/absolute',
    'scripts/../helper',
    'scripts//helper',
    'scripts\\helper',
    '.git/config',
    'C:/module',
  ]) {
    f.manifest.files[0] = { ...original, path: name };
    f.pinReview();
    assert.throws(f.load, /unsafe/);
  }
  f.manifest.files[0] = { ...original, mode: '120000' };
  f.pinReview();
  assert.throws(f.load, /unsafe/);
  f.manifest.files[0] = { ...original, sha256: 'd'.repeat(64) };
  f.pinReview();
  assert.throws(f.load, /hash or mode/);
  f.manifest.files[0] = { ...original, mode: '100755' };
  f.pinReview();
  assert.throws(f.load, /hash or mode/);
  f.manifest.files[0] = { ...original, optional: true };
  f.pinReview();
  assert.throws(f.load, /fields/);
  f.manifest.files[0] = original;
  f.manifest.files.push(original);
  f.pinReview();
  assert.throws(f.load, /duplicate/);
});
test('all private records, configuration, session and lock directories stay outside checkout and owner-only', (t) => {
  const f = fixture(t);
  for (const file of [
    f.profilePath,
    f.profile.planFile,
    f.profile.sourceManifestFile,
    f.configPath,
  ]) {
    fs.chmodSync(file, 0o644);
    assert.throws(f.load, /owner-only/);
    fs.chmodSync(file, 0o600);
  }
  fs.chmodSync(f.privateRoot, 0o755);
  assert.throws(f.load, /owner-only/);
  fs.chmodSync(f.privateRoot, 0o700);
  fs.chmodSync(f.plan.lockDirectory, 0o755);
  assert.throws(f.load, /owner-only/);
  fs.chmodSync(f.plan.lockDirectory, 0o700);
  f.profile.sessionDirectory = path.join(f.root, 'session');
  f.save();
  assert.throws(f.load, /outside/);
});
test('symlink, hardlink and nonexact paths cannot substitute reviewed inputs', (t) => {
  const f = fixture(t),
    alias = path.join(f.privateRoot, 'profile-alias.json');
  fs.symlinkSync(f.profilePath, alias);
  assert.throws(
    () => f.api.loadExternalProfile(alias, f.options),
    /non-symlink/
  );
  fs.unlinkSync(alias);
  fs.linkSync(f.profilePath, alias);
  assert.throws(f.load, /hard-linked/);
  fs.unlinkSync(alias);
  assert.throws(
    () =>
      f.api.loadExternalProfile(f.privateRoot + '/./profile.json', f.options),
    /exact absolute/
  );
  assert.throws(
    () =>
      f.api.loadExternalProfile(f.profilePath, { ...f.options, root: SOURCE }),
    /executing reviewed checkout/
  );
  const sourceFile = path.join(f.root, f.manifest.files[0].path),
    saved = sourceFile + '.original';
  fs.renameSync(sourceFile, saved);
  fs.symlinkSync(saved, sourceFile);
  assert.throws(f.load, /non-symlink/);
});
test('revalidation synchronously detects byte, mode, same-content inode and directory substitution', (t) => {
  const f = fixture(t),
    result = f.load(),
    file = path.join(f.root, 'scripts/v2/deployDefaults.ts'),
    bytes = fs.readFileSync(file);
  fs.writeFileSync(file, '// drift');
  assert.throws(result.revalidateSource, /bytes or identity/);
  fs.writeFileSync(file, bytes);
  assert.equal(result.revalidateSource(), true);
  fs.chmodSync(file, 0o755);
  assert.throws(result.revalidateSource, /identity/);
  fs.chmodSync(file, 0o644);
  assert.equal(result.revalidateSource(), true);
  fs.renameSync(file, file + '.saved');
  fs.writeFileSync(file, bytes, { mode: 0o644 });
  assert.throws(result.revalidateSource, /identity/);
});
test('initial source hashing and repeated validation reuse one bounded read buffer', (t) => {
  const f = fixture(t),
    relative = 'contracts/Large.sol',
    file = path.join(f.root, relative),
    bytes = Buffer.alloc(2 * 1024 * 1024 + 19, 0x6d);
  createSourceFile(file, bytes);
  f.manifest.files.push({ path: relative, sha256: sha(bytes), mode: '100644' });
  f.pinReview();
  const open = fs.openSync,
    read = fs.readSync,
    readFile = fs.readFileSync,
    descriptors = new Map(),
    buffers = new Set(),
    largeReads = [];
  let revalidating = false,
    wholePrivateReads = 0;
  t.mock.method(fs, 'openSync', (...args) => {
    const fd = open(...args);
    descriptors.set(fd, args[0]);
    return fd;
  });
  t.mock.method(fs, 'readFileSync', (...args) => {
    const target =
      typeof args[0] === 'number' ? descriptors.get(args[0]) : args[0];
    assert.equal(
      revalidating,
      false,
      'revalidation must not allocate whole-file buffers'
    );
    assert.equal(
      String(target).startsWith(f.root + path.sep),
      false,
      'initial source pins must not retain whole-file buffers'
    );
    wholePrivateReads++;
    return readFile(...args);
  });
  t.mock.method(fs, 'readSync', (fd, buffer, offset, length, position) => {
    const source = String(descriptors.get(fd)).startsWith(f.root + path.sep);
    if (source || revalidating) {
      buffers.add(buffer);
      assert.equal(buffer.byteLength, 64 * 1024);
      assert.equal(offset, 0);
      assert.equal(length, 64 * 1024);
      assert.equal(Number.isSafeInteger(position), true);
    }
    const count = read(fd, buffer, offset, length, position);
    if (descriptors.get(fd) === file) largeReads.push({ position, count });
    return count;
  });
  const result = f.load();
  assert.equal(
    wholePrivateReads,
    4,
    'profile, plan, manifest and configuration retain exact initial bytes'
  );
  revalidating = true;
  assert.equal(result.revalidateSource(), true);
  assert.equal(result.revalidateSource(), true);
  assert.equal(
    buffers.size,
    1,
    'all source files and validations must reuse the same buffer'
  );
  // Initial source read, constructor validation and two explicit validations.
  assert.equal(largeReads.filter(({ position }) => position === 0).length, 4);
  assert.equal(largeReads.filter(({ count }) => count === 0).length, 4);
  assert.equal(largeReads.filter(({ count }) => count === 19).length, 4);
  assert.equal(f.providerCalls(), 0);
});
test('streamed validation hashes exact bytes across short reads and rejects early EOF', (t) => {
  const f = fixture(t),
    result = f.load(),
    read = fs.readSync;
  let calls = 0;
  const mocked = t.mock.method(
    fs,
    'readSync',
    (fd, buffer, offset, length, position) => {
      calls++;
      return read(fd, buffer, offset, Math.min(length, 97), position);
    }
  );
  assert.equal(result.revalidateSource(), true);
  assert.ok(calls > f.manifest.files.length * 2);
  mocked.mock.mockImplementation(() => 0);
  assert.throws(result.revalidateSource, /file changed during read/);
});
test('streamed validation still rejects mid-read byte, size and metadata changes', (t) => {
  const f = fixture(t),
    file = path.join(f.root, 'scripts/v2/deployDefaults.ts'),
    bytes = fs.readFileSync(file),
    result = f.load(),
    read = fs.readSync,
    target = fs.statSync(file);
  let mutate;
  t.mock.method(fs, 'readSync', (fd, buffer, offset, length, position) => {
    const count = read(fd, buffer, offset, length, position),
      stat = fs.fstatSync(fd);
    if (
      count > 0 &&
      stat.dev === target.dev &&
      stat.ino === target.ino &&
      mutate
    ) {
      const change = mutate;
      mutate = null;
      change();
    }
    return count;
  });
  for (const change of [
    () => fs.writeFileSync(file, Buffer.alloc(bytes.length, 0x78)),
    () => fs.appendFileSync(file, 'growth'),
    () => fs.truncateSync(file, bytes.length - 1),
    () => fs.chmodSync(file, 0o755),
    // Identical content and restored mtime must still retain the ctime check.
    () => {
      const before = fs.statSync(file);
      fs.writeFileSync(file, bytes);
      fs.utimesSync(file, before.atime, before.mtime);
    },
  ]) {
    mutate = change;
    assert.throws(result.revalidateSource, /file changed during read/);
    assert.equal(mutate, null);
    fs.writeFileSync(file, bytes);
    fs.chmodSync(file, 0o644);
    assert.equal(result.revalidateSource(), true);
  }
});
test('streamed validation retains descriptor/path identity and hardlink checks', (t) => {
  const f = fixture(t),
    file = path.join(f.root, 'scripts/v2/deployDefaults.ts'),
    bytes = fs.readFileSync(file),
    result = f.load(),
    read = fs.readSync,
    target = fs.statSync(file);
  let replaced = false;
  t.mock.method(fs, 'readSync', (fd, buffer, offset, length, position) => {
    const count = read(fd, buffer, offset, length, position),
      stat = fs.fstatSync(fd);
    if (
      count > 0 &&
      stat.dev === target.dev &&
      stat.ino === target.ino &&
      !replaced
    ) {
      replaced = true;
      fs.renameSync(file, file + '.original');
      createSourceFile(file, bytes);
    }
    return count;
  });
  assert.throws(
    result.revalidateSource,
    /file changed during read|path identity changed/
  );
  assert.equal(replaced, true);
  fs.unlinkSync(file);
  fs.renameSync(file + '.original', file);
  assert.equal(result.revalidateSource(), true);
  fs.linkSync(file, file + '.link');
  assert.throws(result.revalidateSource, /hard-linked/);
});
test('configuration/profile/plan/manifest remain pinned after await boundaries', async (t) => {
  const f = fixture(t),
    result = f.load();
  for (const file of [
    f.configPath,
    f.profilePath,
    f.profile.planFile,
    f.profile.sourceManifestFile,
  ]) {
    const bytes = fs.readFileSync(file);
    await Promise.resolve();
    fs.appendFileSync(file, ' ');
    assert.throws(result.revalidateSource, /bytes or identity/);
    fs.writeFileSync(file, bytes);
    assert.equal(result.revalidateSource(), true);
  }
  createSourceFile(
    path.join(f.root, 'scripts/deploy/unreviewed.cjs'),
    'module.exports = {};\n'
  );
  assert.throws(result.revalidateSource, /closure changed/);
  assert.equal(f.providerCalls(), 0);
});
test('private-key, mnemonic, configured accounts and executable override environment cannot select external signer', (t) => {
  for (const name of [
    'MAINNET_PRIVATE_KEY',
    'SEPOLIA_PRIVATE_KEY',
    'TESTNET_PRIVATE_KEY',
    'OP_SEPOLIA_PRIVATE_KEY',
    'PRIVATE_KEY',
    'MNEMONIC',
    'WALLET_SEED_PHRASE',
    'HARDHAT_ACCOUNTS',
    'UNLOCKED_ACCOUNTS',
    'SIGNING_PROVIDER',
    'NODE_OPTIONS',
    'NODE_PATH',
    'HARDHAT_CONFIG',
  ]) {
    assert.throws(
      () => assertNoSigningEnvironment({ [name]: 'configured' }),
      /forbidden/
    );
    assert.equal(assertNoSigningEnvironment({ [name]: ' ' }), true);
  }
  assert.equal(
    assertNoSigningEnvironment({
      MAINNET_RPC_URL: 'configured independently',
      ACCOUNT_INDEX: '0',
    }),
    true
  );
  const f = fixture(t),
    result = f.load(),
    old = process.env.MAINNET_PRIVATE_KEY;
  try {
    process.env.MAINNET_PRIVATE_KEY = 'not-a-key';
    assert.throws(f.load, /forbidden/);
    assert.throws(result.revalidateSource, /forbidden/);
  } finally {
    if (old === undefined) delete process.env.MAINNET_PRIVATE_KEY;
    else process.env.MAINNET_PRIVATE_KEY = old;
  }
  assert.equal(f.providerCalls(), 0);
});
test('strict JSON rejects duplicate keys, malformed UTF-8 and trailing content', () => {
  for (const bytes of [
    Buffer.from('{"profile":"one","profile":"two"}'),
    Buffer.from('{"files":[{"path":"a","path":"b"}]}'),
    Buffer.from('{"a":1} trailing'),
    Buffer.from([0x22, 0xff, 0x22]),
  ])
    assert.throws(() => parseJson(bytes), /JSON|UTF-8/);
  assert.deepEqual(
    parseJson(Buffer.from(' {"a":[1,true,null,"a\\"b"],"b":{}}\n')),
    { a: [1, true, null, 'a"b'], b: {} }
  );
});
test('fixed native commands persist private results and return only sanitized metadata', async (t) => {
  const f = commandFixture(t),
    calls = [];
  const review = {
    planHash: ethers.id('plan'),
    unsignedHash: ethers.id('unsigned'),
    policyHash: ethers.id('policy'),
  };
  const session = Object.fromEntries(
    [
      'inspect',
      'handoff',
      'retrieve',
      'observe',
      'repairHead',
      'inspectRecovery',
      'recoverCommand',
    ].map((method) => [
      method,
      async (value) => {
        calls.push([method, value]);
        return { result: method, secretShouldNotReturn: 'private marker' };
      },
    ])
  );
  const requests = [
    ['inspect', {}],
    ['handoff', { review }],
    ['retrieve', {}],
    ['observe', {}],
    ['repair-head', { acknowledgement: 'REPAIR' }],
    ['recover-command', {}],
    ['recover-command', { acknowledgement: 'STOPPED' }],
  ];
  for (const [command, extra] of requests) {
    const output = f.output(),
      result = await runCommand({ session, command, output, ...extra });
    assert.deepEqual(result, {
      schema: 'jobs-external-command-result-v1',
      command,
      outputWritten: true,
      broadcastByCoordinator: false,
    });
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    assert.equal(
      fs.readFileSync(output, 'utf8').includes('private marker'),
      true
    );
    assert.equal(JSON.stringify(result).includes('private marker'), false);
  }
  assert.deepEqual(
    calls.map(([method]) => method),
    [
      'inspect',
      'handoff',
      'retrieve',
      'observe',
      'repairHead',
      'inspectRecovery',
      'recoverCommand',
    ]
  );
  assert.equal(COMMANDS.includes('prepare'), false);
  assert.equal(COMMANDS.includes('relay'), false);
});
test('signature import is exact private raw-file input; authorize-relay raw is only in private output', async (t) => {
  const f = commandFixture(t),
    raw = '0x02' + 'ab'.repeat(100),
    signedFile = path.join(f.root, 'signed.json');
  write(signedFile, { raw });
  let imported;
  const session = {
    importSigned: async (value) => {
      imported = value;
      return { transactionHash: ethers.id('tx') };
    },
    authorizeRelay: async (acknowledgement) => {
      assert.equal(acknowledgement, 'RELAY_REVIEWED');
      return {
        raw,
        transactionHash: ethers.id('tx'),
        oneAuthorizedAttempt: true,
      };
    },
  };
  await runCommand({
    session,
    command: 'import-signed',
    signedFile,
    output: f.output(),
  });
  assert.equal(imported, raw);
  const output = f.output(),
    result = await runCommand({
      session,
      command: 'authorize-relay',
      acknowledgement: 'RELAY_REVIEWED',
      output,
    });
  assert.equal(JSON.parse(fs.readFileSync(output)).raw, raw);
  assert.equal(JSON.stringify(result).includes(raw), false);
  write(signedFile, { raw, data: '0x1234' });
  await assert.rejects(
    runCommand({
      session,
      command: 'import-signed',
      signedFile,
      output: f.output(),
    }),
    /exactly one/
  );
});
test('no generic RPC/module/transaction override or existing/public/symlink output can reach session', async (t) => {
  const f = commandFixture(t);
  let calls = 0;
  const session = {
    inspect: async () => {
      calls++;
      return {};
    },
  };
  await assert.rejects(
    runCommand({ session, command: 'prepare', output: f.output() }),
    /unsupported command/
  );
  for (const extra of [
    { rpc: 'https://invalid' },
    { module: '/tmp/invalid' },
    { data: '0x12' },
    { nonce: 4 },
    { review: {} },
  ])
    await assert.rejects(
      runCommand({ session, command: 'inspect', output: f.output(), ...extra }),
      /unsupported command arguments/
    );
  const existing = f.output();
  write(existing, 'retain');
  await assert.rejects(
    runCommand({ session, command: 'inspect', output: existing })
  );
  assert.equal(fs.readFileSync(existing, 'utf8'), 'retain');
  const alias = f.output();
  fs.symlinkSync(existing, alias);
  await assert.rejects(
    runCommand({ session, command: 'inspect', output: alias })
  );
  fs.chmodSync(f.root, 0o755);
  await assert.rejects(
    runCommand({ session, command: 'inspect', output: f.output() }),
    /owner-only/
  );
  fs.chmodSync(f.root, 0o700);
  assert.equal(calls, 0);
});
test('output substitution and source errors preserve reservations and never leak capability errors', async (t) => {
  const f = commandFixture(t),
    output = f.output(),
    raw = '0x02' + 'ff'.repeat(100);
  const session = {
    authorizeRelay: async () => {
      fs.renameSync(output, output + '.held');
      write(output, 'substitution');
      return {
        raw,
        transactionHash: ethers.id('tx'),
        oneAuthorizedAttempt: true,
      };
    },
  };
  await assert.rejects(
    runCommand({
      session,
      command: 'authorize-relay',
      acknowledgement: 'APPROVED',
      output,
    }),
    /identity changed/
  );
  assert.equal(fs.readFileSync(output + '.held', 'utf8'), '');
  assert.equal(fs.readFileSync(output, 'utf8'), 'substitution');
  const failed = f.output();
  await assert.rejects(
    runCommand({
      session: {
        inspect: async () => {
          throw new Error(raw);
        },
      },
      command: 'inspect',
      output: failed,
    }),
    (error) => !error.message.includes(raw) && !error.stack.includes(raw)
  );
  assert.equal(fs.readFileSync(failed, 'utf8'), '');
});
test('direct executable rejects arbitrary launcher arguments without provider or command execution', () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(SOURCE, 'scripts/deploy/external-command.cjs'),
      '--rpc',
      'https://do-not-contact.invalid',
      '--module',
      '/tmp/untrusted',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /trusted runtime driver/);
  assert.equal(result.stderr.includes('https://do-not-contact.invalid'), false);
});
test('duplicate deployment configuration fields reject even with matching reviewed raw digest', (t) => {
  for (const raw of [
    '{"governance":"a","governance":"b"}',
    '{"econ":{"jobStakeBps":1000,"jobStakeBps":9000}}',
  ]) {
    const f = fixture(t);
    f.options.configBytes = Buffer.from(raw);
    write(f.configPath, f.options.configBytes);
    f.plan.configHash = '0x' + sha(f.options.configBytes);
    f.pinReview();
    assert.throws(f.load, /duplicate|JSON/);
    assert.equal(f.providerCalls(), 0);
  }
});

// Hooks schedule deterministic mutations while exercising real local files.
// They never open a provider, sign, relay, or modify permission configuration.
function requestFixture(t, bytes = '{"command":"inspect"}') {
  const f = commandFixture(t),
    file = f.output();
  write(file, bytes);
  return { ...f, file };
}
function watchRequest(file, hooks = {}) {
  const original = Object.fromEntries(
    ['openSync', 'closeSync', 'fstatSync', 'readSync'].map((key) => [
      key,
      fs[key],
    ])
  );
  let fd,
    opens = 0,
    closes = 0,
    stats = 0;
  fs.openSync = function (name, flags, ...rest) {
    const result = original.openSync.call(this, name, flags, ...rest);
    if (
      name === file &&
      typeof flags === 'number' &&
      (flags & 3) === fs.constants.O_RDONLY
    ) {
      fd = result;
      opens++;
      hooks.open?.(result, flags);
    }
    return result;
  };
  fs.closeSync = function (value) {
    const result = original.closeSync.call(this, value);
    if (value === fd) closes++;
    return result;
  };
  fs.fstatSync = function (value, ...rest) {
    const result = original.fstatSync.call(this, value, ...rest);
    return value === fd ? hooks.stat?.(result, ++stats) ?? result : result;
  };
  fs.readSync = function (value, ...rest) {
    if (value === fd && hooks.read)
      return hooks.read(original.readSync.bind(this), value, ...rest);
    return original.readSync.call(this, value, ...rest);
  };
  return {
    closed() {
      assert.equal(opens, 1);
      assert.equal(closes, 1);
      assert.throws(() => original.fstatSync(fd), { code: 'EBADF' });
    },
    restore() {
      Object.assign(fs, original);
    },
  };
}
test('private request reader accepts bounded strict JSON and rejects invalid encodings or duplicate keys', (t) => {
  const f = requestFixture(t);
  assert.deepEqual(readCommandRequest(f.file), { command: 'inspect' });
  for (const bytes of [
    '{"command":1,"command":2}',
    '{} trailing',
    Buffer.from([0xff]),
  ]) {
    fs.writeFileSync(f.file, bytes);
    const watch = watchRequest(f.file);
    try {
      assert.throws(() => readCommandRequest(f.file));
      watch.closed();
    } finally {
      watch.restore();
    }
  }
});
test('private request reader refuses nonexact, source-tree and symlink paths', (t) => {
  const f = requestFixture(t),
    link = f.output();
  fs.symlinkSync(f.file, link);
  for (const file of [
    link,
    './relative.json',
    f.root + '/./0.json',
    f.root + '/bad\nname',
    path.join(SOURCE, 'package.json'),
  ])
    assert.throws(() => readCommandRequest(file));
  assert.deepEqual(readCommandRequest(f.file), { command: 'inspect' });
});
test('private request reader rejects directories and FIFO input without blocking', (t) => {
  const f = requestFixture(t),
    directory = path.join(f.root, 'directory'),
    fifo = path.join(f.root, 'fifo');
  fs.mkdirSync(directory, { mode: 0o700 });
  const watch = watchRequest(directory);
  try {
    assert.throws(() => readCommandRequest(directory), /regular file/);
    watch.closed();
  } finally {
    watch.restore();
  }
  const made = spawnSync('mkfifo', ['-m', '600', fifo], { timeout: 2000 });
  assert.equal(made.status, 0, 'local POSIX FIFO fixture must be created');
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      `const {readCommandRequest}=require(${JSON.stringify(
        path.join(SOURCE, 'scripts/deploy/external-command.cjs')
      )});try {readCommandRequest(process.argv[1]);process.exitCode=2;}catch(e){if(!/regular file/.test(e.message))process.exitCode=3;}`,
      fifo,
    ],
    { timeout: 2000 }
  );
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0);
});
test('private request reader rejects empty, oversized, public, wrong-owner and linked descriptors', (t) => {
  for (const variant of ['empty', 'oversized', 'mode', 'uid', 'link']) {
    const f = requestFixture(
      t,
      variant === 'empty'
        ? ''
        : variant === 'oversized'
        ? ' '.repeat(65537)
        : '{}'
    );
    const watch = watchRequest(f.file, {
      stat(stat) {
        if (variant === 'mode') stat.mode |= 0o040n;
        if (variant === 'uid') stat.uid += 1n;
        if (variant === 'link') stat.nlink = 2n;
        return stat;
      },
    });
    try {
      assert.throws(() => readCommandRequest(f.file), /regular file/);
      watch.closed();
    } finally {
      watch.restore();
    }
    assert(fs.existsSync(f.file));
  }
});
test('private request reader rejects post-read descriptor metadata and byte-length drift', (t) => {
  for (const field of ['mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) {
    const f = requestFixture(t);
    const watch = watchRequest(f.file, {
      stat(stat, count) {
        if (count === 2) stat[field] += 1n;
        return stat;
      },
    });
    try {
      assert.throws(() => readCommandRequest(f.file), /changed during reading/);
      watch.closed();
    } finally {
      watch.restore();
    }
  }
});
test('private request reader refuses parent replacement even with the same input inode', (t) => {
  const f = requestFixture(t),
    old = f.root + '.original';
  t.after(() => fs.rmSync(old, { recursive: true, force: true }));
  let replaced = false,
    originalCtime;
  const watch = watchRequest(f.file, {
    stat(stat, count) {
      // File rename updates ctime on some platforms; mask only that timestamp
      // to independently exercise the real replaced-parent identity guard.
      if (count === 1) originalCtime = stat.ctimeNs;
      else stat.ctimeNs = originalCtime;
      return stat;
    },
    read(read, fd, ...args) {
      const count = read(fd, ...args);
      if (!replaced) {
        replaced = true;
        fs.renameSync(f.root, old);
        fs.mkdirSync(f.root, { mode: 0o700 });
        fs.renameSync(path.join(old, path.basename(f.file)), f.file);
      }
      return count;
    },
  });
  try {
    assert.throws(() => readCommandRequest(f.file), /identity changed/);
    watch.closed();
  } finally {
    watch.restore();
  }
  assert.equal(replaced, true);
  assert(fs.existsSync(f.file));
});
test('private request reader preserves identical replacement inputs and closes the original descriptor', (t) => {
  const f = requestFixture(t),
    bytes = fs.readFileSync(f.file);
  let replaced = false;
  const watch = watchRequest(f.file, {
    read(read, fd, ...args) {
      const count = read(fd, ...args);
      if (!replaced) {
        replaced = true;
        fs.unlinkSync(f.file);
        write(f.file, bytes);
      }
      return count;
    },
  });
  try {
    assert.throws(() => readCommandRequest(f.file), /changed during reading/);
    watch.closed();
  } finally {
    watch.restore();
  }
  assert.deepEqual(fs.readFileSync(f.file), bytes);
});
test('private request reader closes descriptors on stat/read errors and short input but handles partial reads', (t) => {
  for (const variant of ['stat', 'read', 'eof', 'partial']) {
    const f = requestFixture(t);
    const watch = watchRequest(f.file, {
      stat(stat) {
        if (variant === 'stat') throw new Error('synthetic stat failure');
        return stat;
      },
      read(read, fd, buffer, offset, length, position) {
        if (variant === 'read') throw new Error('synthetic read failure');
        if (variant === 'eof') return 0;
        return read(fd, buffer, offset, Math.min(length, 2), position);
      },
    });
    try {
      if (variant === 'partial')
        assert.deepEqual(readCommandRequest(f.file), { command: 'inspect' });
      else
        assert.throws(
          () => readCommandRequest(f.file),
          /synthetic|pinned size/
        );
      watch.closed();
    } finally {
      watch.restore();
    }
    assert(fs.existsSync(f.file));
  }
});
