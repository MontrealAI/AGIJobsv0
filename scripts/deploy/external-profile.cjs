'use strict';

// This is a runtime drift guard, NOT a bootstrap or a source-review oracle.
// Before loading this module, the trusted operator must independently qualify
// the complete source closure, Node executable, installed dependencies (a lockfile
// alone does not qualify node_modules), configuration resolution, and bootstrap.
// The manifest digest must come from that independent review. A checksum that
// the running checkout generates for itself is never evidence of approval.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { canonicalJson } = require('./external-envelope.cjs');
const {
  createExternalSession,
  validatePlan,
} = require('./external-session.cjs');
const { ExternalManualSigner } = require('./external-signer.cjs');

const PROFILE_SCHEMA = 'jobs-external-manual-v1';
const SOURCE_SCHEMA = 'jobs-reviewed-source-v1';
const MAX_RECORD_BYTES = 8 * 1024 * 1024;
// All source checks are synchronous, so one buffer can serve every file and
// every await-boundary revalidation without retaining whole source buffers.
const HASH_READ_BUFFER = Buffer.allocUnsafe(64 * 1024);
// This lower bound is deliberately explicit. It does not claim that checking
// these names proves dependency closure; review must cover dynamic resolution,
// optional modules, package entrypoints, environment and the entire bootstrap.
const REQUIRED_SOURCE_FILES = Object.freeze([
  'hardhat.config.js',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'scripts/v2/deployDefaults.ts',
  'scripts/v2/externalManual.ts',
  'scripts/deploy/archive-verification.cjs',
  'scripts/deploy/authority-audit.cjs',
  'scripts/deploy/authority-handover.cjs',
  'scripts/deploy/authority-runtime.cjs',
  'scripts/deploy/compile-network.cjs',
  'scripts/deploy/export-prebuilt.cjs',
  'scripts/deploy/external-command.cjs',
  'scripts/deploy/external-envelope.cjs',
  'scripts/deploy/external-profile.cjs',
  'scripts/deploy/external-session.cjs',
  'scripts/deploy/external-signer.cjs',
  'scripts/deploy/implementations.cjs',
  'scripts/deploy/prebuilt-implementations.cjs',
  'scripts/deploy/providerAgnosticDeploy.ts',
  'scripts/deploy/stage-protocol.cjs',
  'scripts/deploy/verified-artifact.cjs',
  'scripts/v2/lib/deployment-candidate.cjs',
  'scripts/v2/lib/oneclick-config.cjs',
  'scripts/v2/lib/reserved-output.cjs',
  'scripts/v2/lib/prebuilt/ImplementationModules.json',
  'scripts/verify-agialpha.ts',
  'shared/validationProtocol.ts',
  'scripts/constants.js',
  'scripts/constants.ts',
  'scripts/config/index.js',
  'scripts/generated/protocol-defaults.ts',
  'scripts/utils/parseDuration.js',
  'scripts/ci/check-solidity-build.cjs',
  'scripts/ci/solidity-policy.cjs',
  'scripts/release/check-contract-size.js',
  'config/implementation-modules.json',
  'config/solidity-compiler.json',
  'docs/deployment-addresses.mainnet.json',
]);
function need(value, message) {
  if (!value) throw new Error(`External profile: ${message}`);
}
function exact(value, fields) {
  need(
    value &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Reflect.ownKeys(value).length === fields.length &&
      Object.keys(value).sort().join('\0') === [...fields].sort().join('\0'),
    'missing or unknown fields'
  );
  for (const key of fields)
    need(
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'),
      'JSON data fields required'
    );
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const contained = (root, file) =>
  file === root || file.startsWith(root + path.sep);
function absolute(file) {
  need(
    typeof file === 'string' &&
      path.isAbsolute(file) &&
      path.resolve(file) === file &&
      !/[\u0000-\u001f\u007f]/.test(file),
    'exact absolute paths required'
  );
}
function identity(stat) {
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: String(stat.mode),
    uid: String(stat.uid),
    ...(stat.isFile() ? { nlink: String(stat.nlink) } : {}),
  };
}
function entry(file, kind, privateEntry = false) {
  absolute(file);
  const stat = fs.lstatSync(file, { bigint: true });
  need(
    !stat.isSymbolicLink() &&
      (kind === 'directory' ? stat.isDirectory() : stat.isFile()) &&
      fs.realpathSync(file) === file,
    'real non-symlink paths required'
  );
  if (privateEntry)
    need(
      stat.uid === BigInt(process.getuid()) && (stat.mode & 0o077n) === 0n,
      'private inputs and state must be owner-only'
    );
  if (kind === 'file')
    need(stat.nlink === 1n, 'hard-linked files are not allowed');
  return { file, kind, privateEntry, identity: identity(stat) };
}
function verifyEntry(pin) {
  need(
    canonicalJson(entry(pin.file, pin.kind, pin.privateEntry).identity) ===
      canonicalJson(pin.identity),
    'path identity changed'
  );
}
function parents(directory) {
  const pins = [];
  for (let current = directory; ; current = path.dirname(current)) {
    pins.push(entry(current, 'directory'));
    if (current === path.dirname(current)) return pins;
  }
}
function readPinnedFile(file, privateEntry, read) {
  const pin = entry(file, 'file', privateEntry);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    need(
      canonicalJson(identity(before)) === canonicalJson(pin.identity) &&
        before.size <= BigInt(MAX_RECORD_BYTES),
      'file changed or exceeds size bound'
    );
    const result = read(fd, Number(before.size));
    const after = fs.fstatSync(fd, { bigint: true });
    need(
      canonicalJson(identity(after)) === canonicalJson(pin.identity) &&
        before.size === after.size &&
        before.mtimeNs === after.mtimeNs &&
        before.ctimeNs === after.ctimeNs,
      'file changed during read'
    );
    verifyEntry(pin);
    return { ...pin, ...result };
  } finally {
    fs.closeSync(fd);
  }
}
function fileBytes(file, privateEntry = false) {
  // Initial private record parsing still binds the exact bytes, not reserialized
  // JSON. Source entries and later revalidation never use this allocating path.
  return readPinnedFile(file, privateEntry, (fd) => {
    const bytes = fs.readFileSync(fd);
    return { bytes, hash: hash(bytes) };
  });
}
function fileHash(file, privateEntry = false) {
  return readPinnedFile(file, privateEntry, (fd, expectedSize) => {
    const digest = createHash('sha256');
    let position = 0;
    for (;;) {
      const count = fs.readSync(
        fd,
        HASH_READ_BUFFER,
        0,
        HASH_READ_BUFFER.length,
        position
      );
      if (count === 0) break;
      position += count;
      need(position <= expectedSize, 'file changed during read');
      digest.update(HASH_READ_BUFFER.subarray(0, count));
    }
    need(position === expectedSize, 'file changed during read');
    return { hash: digest.digest('hex') };
  });
}
function verifyFile(pin) {
  const current = fileHash(pin.file, pin.privateEntry);
  need(
    canonicalJson(current.identity) === canonicalJson(pin.identity) &&
      current.hash === pin.hash,
    'reviewed file bytes or identity changed'
  );
}
// JSON.parse alone silently accepts duplicate fields. Reject them before using
// parsed data so operator review and runtime cannot disagree about a field.
function parseJson(bytes) {
  const text = bytes.toString('utf8');
  need(Buffer.from(text, 'utf8').equals(bytes), 'JSON must be valid UTF-8');
  let offset = 0;
  const ws = () => {
    while (/[\x20\t\r\n]/.test(text[offset] || '!')) offset++;
  };
  function string() {
    const start = offset++;
    while (offset < text.length) {
      if (text[offset] === '\\') {
        offset += 2;
        continue;
      }
      if (text[offset++] === '"') return JSON.parse(text.slice(start, offset));
    }
    throw new Error('invalid JSON');
  }
  function value(depth = 0) {
    need(depth <= 64, 'JSON nesting exceeds bound');
    ws();
    if (text[offset] === '"') {
      string();
      return;
    }
    if (text[offset] === '{') {
      offset++;
      ws();
      const keys = new Set();
      if (text[offset] === '}') {
        offset++;
        return;
      }
      for (;;) {
        ws();
        need(text[offset] === '"', 'invalid JSON');
        const key = string();
        need(!keys.has(key), 'duplicate JSON field');
        keys.add(key);
        ws();
        need(text[offset++] === ':', 'invalid JSON');
        value(depth + 1);
        ws();
        const separator = text[offset++];
        if (separator === '}') return;
        need(separator === ',', 'invalid JSON');
      }
    }
    if (text[offset] === '[') {
      offset++;
      ws();
      if (text[offset] === ']') {
        offset++;
        return;
      }
      for (;;) {
        value(depth + 1);
        ws();
        const separator = text[offset++];
        if (separator === ']') return;
        need(separator === ',', 'invalid JSON');
      }
    }
    const token =
      /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(
        text.slice(offset)
      );
    need(token, 'invalid JSON');
    offset += token[0].length;
  }
  try {
    value();
    ws();
    need(offset === text.length, 'invalid JSON');
    return JSON.parse(text);
  } catch {
    throw new Error('External profile: invalid or duplicate-field JSON');
  }
}
function privateFile(file, root) {
  absolute(file);
  need(
    !contained(root, file),
    'private inputs must stay outside the source root'
  );
  entry(path.dirname(file), 'directory', true);
  return fileBytes(file, true);
}
function privateDirectory(directory, root, missing = false) {
  absolute(directory);
  need(
    !contained(root, directory),
    'private state must stay outside the source root'
  );
  entry(path.dirname(directory), 'directory', true);
  try {
    return entry(directory, 'directory', true);
  } catch (error) {
    if (missing && error.code === 'ENOENT') return null;
    throw error;
  }
}
function safeRelative(file) {
  return (
    typeof file === 'string' &&
    file.length > 0 &&
    !file.startsWith('/') &&
    !/[\\:\u0000-\u001f\u007f]/.test(file) &&
    file.split('/').every((part) => part && part !== '.' && part !== '..') &&
    !file.split('/').includes('.git') &&
    path.posix.normalize(file) === file
  );
}
function requiredSourceFiles(root) {
  const required = new Set(REQUIRED_SOURCE_FILES);
  // Reject missing entries for newly added deployment modules and dynamically
  // selected repository configuration/source files, not merely today's list.
  function walk(relative, include) {
    const directory = path.join(root, relative);
    entry(directory, 'directory');
    for (const name of fs.readdirSync(directory)) {
      const child = `${relative}/${name}`,
        stat = fs.lstatSync(path.join(root, child));
      need(!stat.isSymbolicLink(), 'source closure contains a symlink');
      if (stat.isDirectory()) walk(child, include);
      else if (stat.isFile() && include(child)) required.add(child);
      else need(stat.isFile(), 'source closure contains a nonregular entry');
    }
  }
  walk('scripts/deploy', (file) => /\.(?:cjs|mjs|js|ts|json)$/.test(file));
  walk('scripts/config', (file) => /\.(?:cjs|mjs|js|ts|json)$/.test(file));
  walk('scripts/generated', (file) => /\.(?:cjs|mjs|js|ts|json)$/.test(file));
  walk('config', (file) => /\.json$/.test(file));
  walk('contracts', (file) => /\.sol$/.test(file));
  return [...required].sort();
}
function assertNoSigningEnvironment(env = process.env) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === null || String(value).trim() === '')
      continue;
    need(
      !/(?:^|_)(?:PRIVATE_?KEYS?|MNEMONIC|SEED_PHRASE|UNLOCKED(?:_ACCOUNTS?)?|ACCOUNTS|SIGNING_PROVIDER|SIGNER_PROVIDER|KEYSTORE)(?:_|$)/i.test(
        key
      ) && !['NODE_OPTIONS', 'NODE_PATH', 'HARDHAT_CONFIG'].includes(key),
      'key, mnemonic, account, signing-provider or runtime override configuration is forbidden'
    );
  }
  return true;
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function loadExternalProfile(profilePath, options) {
  exact(options, ['provider', 'root', 'configBytes', 'configPath']);
  const { provider, root, configBytes, configPath } = options;
  assertNoSigningEnvironment();
  absolute(root);
  entry(root, 'directory');
  need(
    root === path.resolve(__dirname, '../..'),
    'source root must be the executing reviewed checkout'
  );
  need(
    provider &&
      typeof provider === 'object' &&
      [
        'send',
        'getBlock',
        'getCode',
        'getTransactionCount',
        'getTransaction',
        'getTransactionReceipt',
      ].every((method) => typeof provider[method] === 'function'),
    'independently configured trusted read provider required'
  );
  need(
    Buffer.isBuffer(configBytes) || typeof configBytes === 'string',
    'exact configuration bytes required'
  );
  const profilePin = privateFile(profilePath, root),
    profile = parseJson(profilePin.bytes);
  exact(profile, [
    'profile',
    'sessionDirectory',
    'planFile',
    'reviewedPlanHash',
    'sourceManifestFile',
    'reviewedSourceManifestSha256',
  ]);
  need(
    profile.profile === PROFILE_SCHEMA &&
      /^0x[0-9a-f]{64}$/.test(profile.reviewedPlanHash) &&
      /^[0-9a-f]{64}$/.test(profile.reviewedSourceManifestSha256),
    'unknown profile or missing independent review digests'
  );
  const planPin = privateFile(profile.planFile, root),
    manifestPin = privateFile(profile.sourceManifestFile, root),
    configPin = privateFile(configPath, root);
  need(
    new Set([
      profilePath,
      profile.planFile,
      profile.sourceManifestFile,
      configPath,
    ]).size === 4,
    'review records and configuration require distinct files'
  );
  need(
    configPin.bytes.equals(Buffer.from(configBytes)),
    'configuration path differs from supplied bytes'
  );
  parseJson(configPin.bytes); // Reject duplicate keys even when their raw hash was reviewed.
  const plan = freeze(parseJson(planPin.bytes));
  try {
    validatePlan(plan, profile.reviewedPlanHash);
  } catch {
    // ethers diagnostics may quote arbitrary malformed private field values.
    throw new Error(
      'External profile: invalid reviewed plan or reviewed plan hash'
    );
  }
  need(
    plan.configHash === `0x${configPin.hash}`,
    'configuration digest differs from reviewed plan'
  );
  const manifest = freeze(parseJson(manifestPin.bytes));
  exact(manifest, ['schema', 'sourceCommit', 'sourceTree', 'files']);
  need(
    manifest.schema === SOURCE_SCHEMA &&
      manifest.sourceCommit === plan.sourceCommit &&
      manifest.sourceTree === plan.sourceTree &&
      manifestPin.hash === profile.reviewedSourceManifestSha256 &&
      manifestPin.hash === plan.sourceManifestHash,
    'source manifest differs from independently reviewed plan'
  );
  need(
    Array.isArray(manifest.files) &&
      manifest.files.length > 0 &&
      manifest.files.length <= 20000,
    'bounded source file manifest required'
  );
  const listed = new Set(),
    sourcePins = [];
  for (const file of manifest.files) {
    exact(file, ['path', 'sha256', 'mode']);
    need(
      safeRelative(file.path) &&
        !listed.has(file.path) &&
        /^[0-9a-f]{64}$/.test(file.sha256) &&
        ['100644', '100755'].includes(file.mode),
      'unsafe, duplicate or malformed source entry'
    );
    listed.add(file.path);
    const pin = fileHash(path.join(root, file.path));
    need(
      pin.hash === file.sha256 &&
        (BigInt(pin.identity.mode) & 0o7777n) ===
          (file.mode === '100755' ? 0o755n : 0o644n),
      'reviewed source hash or mode differs'
    );
    sourcePins.push(pin);
  }
  need(
    requiredSourceFiles(root).every((file) => listed.has(file)),
    'reviewed manifest is incomplete for required deployment sources'
  );
  const lockPin = privateDirectory(plan.lockDirectory, root);
  let sessionPin = privateDirectory(profile.sessionDirectory, root, true);
  need(
    !contained(profile.sessionDirectory, plan.lockDirectory) &&
      !contained(plan.lockDirectory, profile.sessionDirectory),
    'session and shared lock directories must be separate'
  );
  const directoryPins = [
    ...new Map(
      [
        root,
        path.dirname(profilePath),
        path.dirname(profile.planFile),
        path.dirname(profile.sourceManifestFile),
        path.dirname(configPath),
        path.dirname(profile.sessionDirectory),
        plan.lockDirectory,
        ...sourcePins.map((pin) => path.dirname(pin.file)),
      ]
        .flatMap((directory) => parents(directory))
        .map((pin) => [pin.file, pin])
    ).values(),
  ];
  const expectedPlan = canonicalJson(plan);
  function revalidateSource(candidate = plan) {
    assertNoSigningEnvironment();
    need(canonicalJson(candidate) === expectedPlan, 'reviewed plan changed');
    directoryPins.forEach(verifyEntry);
    verifyEntry(lockPin);
    for (const pin of [
      profilePin,
      planPin,
      manifestPin,
      configPin,
      ...sourcePins,
    ])
      verifyFile(pin);
    need(
      requiredSourceFiles(root).every((file) => listed.has(file)),
      'source closure changed or required source is unreviewed'
    );
    const currentSession = privateDirectory(
      profile.sessionDirectory,
      root,
      true
    );
    if (sessionPin) {
      need(currentSession, 'private session disappeared');
      verifyEntry(sessionPin);
    } else if (currentSession) sessionPin = currentSession;
    return true;
  }
  const session = createExternalSession({
    directory: profile.sessionDirectory,
    plan,
    expectedPlanHash: profile.reviewedPlanHash,
    revalidateSource,
    provider,
  });
  const signer = new ExternalManualSigner(provider, session);
  return {
    session,
    signer,
    plan,
    sessionDirectory: profile.sessionDirectory,
    revalidateSource,
    initialize: () => session.initialize(),
  };
}
module.exports = {
  loadExternalProfile,
  assertNoSigningEnvironment,
  REQUIRED_SOURCE_FILES,
  requiredSourceFiles,
  parseJson,
};
