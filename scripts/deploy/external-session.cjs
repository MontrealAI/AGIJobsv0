'use strict';

// Authoritative private state on the operator's trusted machine. No method signs
// or broadcasts. A returned raw capability is only available from explicit relay
// authorization and must never be printed or included in a public report.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ethers } = require('ethers');
const E = require('./external-envelope.cjs');
const modules = require('../../config/implementation-modules.json');
const COMPONENTS = [
  'StakeManager',
  'JobRegistry',
  'ValidationModule',
  'ReputationEngine',
  'ArbitratorCommittee',
  'DisputeModule',
  'CertificateNFT',
  'TaxPolicy',
  'FeePool',
  'IdentityRegistry',
  'PlatformRegistry',
  'JobRouter',
  'PlatformIncentives',
  'SystemPause',
];
const OPERATION_KEYS = Object.freeze([
  'create:Deployer',
  'commit',
  ...COMPONENTS.flatMap((name) => [
    ...(modules[name] || []).flatMap((implementation) => [
      `create:${implementation}`,
      `handover:${implementation}`,
    ]),
    `component:${name}`,
  ]),
  'register',
  'finalize',
  'handover:Deployer',
]);
function need(value, message) {
  if (!value) throw Error(message);
}
function exact(value, keys) {
  need(
    value &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).sort().join() === [...keys].sort().join(),
    'Unexpected external session fields'
  );
}
const digest = (value) =>
  ethers.keccak256(ethers.toUtf8Bytes(E.canonicalJson(value)));
// Native SHA-256 keeps journal rereads bounded; Ethereum envelope/policy and
// reviewed plan hashes remain the exact keccak256 interface.
const eventDigest = (value) =>
  `0x${crypto
    .createHash('sha256')
    .update(E.canonicalJson(value))
    .digest('hex')}`;
const validatedPreparedEvents = new Set();
function requireCanonicalEnvelope(envelope) {
  need(
    same(
      E.buildEnvelope({
        transaction: envelope.transaction,
        context: envelope.context,
      }),
      envelope
    ),
    'Envelope serialization changed'
  );
}
const copy = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => E.canonicalJson(a) === E.canonicalJson(b);
const exists = (file) => {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
function syncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function statIdentity(file, kind, privateEntry = true) {
  const s = fs.lstatSync(file, { bigint: true });
  need(
    !s.isSymbolicLink() &&
      (kind === 'directory' ? s.isDirectory() : s.isFile()) &&
      fs.realpathSync(file) === path.resolve(file),
    'External state requires real non-symlink paths'
  );
  if (kind === 'file')
    need(s.nlink === 1n, 'External state cannot be hard-linked');
  if (privateEntry)
    need(
      s.uid === BigInt(process.getuid()) && (s.mode & 0o077n) === 0n,
      'External state must be owner-only'
    );
  return {
    dev: String(s.dev),
    ino: String(s.ino),
    mode: String(s.mode),
    uid: String(s.uid),
    kind,
  };
}
function read(file) {
  statIdentity(file, 'file');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const s = fs.fstatSync(fd);
    need(s.size <= 8 * 1024 * 1024, 'Oversized private record');
    try {
      return JSON.parse(fs.readFileSync(fd, 'utf8'));
    } catch {
      throw Error(
        'Malformed private external record; preserve it for reconciliation'
      );
    }
  } finally {
    fs.closeSync(fd);
  }
}
function writeNew(file, value) {
  const fd = fs.openSync(
    file,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_NOFOLLOW,
    0o600
  );
  try {
    fs.writeFileSync(fd, E.canonicalJson(value) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  syncDirectory(path.dirname(file));
}
const hashBuffer = Buffer.alloc(64 * 1024);
function fileHash(file) {
  const hash = crypto.createHash('sha256'),
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    let count;
    while ((count = fs.readSync(fd, hashBuffer, 0, hashBuffer.length, null)))
      hash.update(hashBuffer.subarray(0, count));
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}
// Keep the active-command inode allocated for the command's entire lifetime.
// Path metadata alone cannot distinguish unlink/recreate if an inode is reused.
function createOwnerFile(file, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  const expectedHash = crypto.createHash('sha256').update(bytes).digest('hex');
  const fd = fs.openSync(
    file,
    fs.constants.O_RDWR |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_NOFOLLOW,
    0o600
  );
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    syncDirectory(path.dirname(file));
    return { fd, expectedHash };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}
function checkOpenOwner(p, fd) {
  const before = fs.fstatSync(fd, { bigint: true });
  const descriptorIdentity = (s) => ({
    dev: String(s.dev),
    ino: String(s.ino),
    mode: String(s.mode),
    uid: String(s.uid),
    kind: 'file',
  });
  need(
    before.isFile() &&
      before.nlink === 1n &&
      same(descriptorIdentity(before), p.identity),
    'External active-command owner identity changed'
  );
  unchanged(p);
  const hash = crypto.createHash('sha256');
  let position = 0,
    count;
  while (
    (count = fs.readSync(fd, hashBuffer, 0, hashBuffer.length, position))
  ) {
    position += count;
    need(
      BigInt(position) <= before.size,
      'External active-command owner bytes changed'
    );
    hash.update(hashBuffer.subarray(0, count));
  }
  const after = fs.fstatSync(fd, { bigint: true });
  need(
    after.nlink === 1n &&
      same(descriptorIdentity(after), p.identity) &&
      after.size === before.size &&
      after.mtimeNs === before.mtimeNs &&
      after.ctimeNs === before.ctimeNs &&
      BigInt(position) === before.size &&
      hash.digest('hex') === p.hash,
    'External active-command owner bytes or identity changed'
  );
  unchanged(p);
}
function pin(file, kind, privateEntry = true) {
  return {
    file,
    privateEntry,
    identity: statIdentity(file, kind, privateEntry),
    ...(kind === 'file' ? { hash: fileHash(file) } : {}),
  };
}
function unchanged(p) {
  need(
    same(statIdentity(p.file, p.identity.kind, p.privateEntry), p.identity),
    'External state path identity changed'
  );
  if (p.hash) need(fileHash(p.file) === p.hash, 'External state bytes changed');
}
function parents(directory) {
  const result = [];
  for (let p = path.resolve(directory); ; p = path.dirname(p)) {
    result.push(pin(p, 'directory', false));
    if (p === path.dirname(p)) return result;
  }
}
function validatePlan(plan, expectedHash) {
  exact(plan, [
    'schema',
    'campaignId',
    'chainId',
    'creator',
    'governor',
    'sourceCommit',
    'sourceTree',
    'compilerInputSha256',
    'sourceManifestHash',
    'configHash',
    'creationScopeHash',
    'firstNonce',
    'creatorCodeHash',
    'initialBlock',
    'confirmations',
    'expiresAt',
    'fees',
    'lockDirectory',
  ]);
  need(
    plan.schema === 'jobs-external-plan-v1' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        plan.campaignId
      ) &&
      Number.isSafeInteger(plan.chainId) &&
      plan.chainId > 0 &&
      Number.isSafeInteger(plan.firstNonce) &&
      plan.firstNonce >= 0 &&
      Number.isSafeInteger(plan.confirmations) &&
      plan.confirmations >= 1 &&
      plan.confirmations <= 128 &&
      ethers.getAddress(plan.creator) === plan.creator &&
      ethers.getAddress(plan.governor) === plan.governor &&
      plan.creator !== plan.governor &&
      plan.creator !== ethers.ZeroAddress &&
      plan.governor !== ethers.ZeroAddress &&
      /^[0-9a-f]{40}$/.test(plan.sourceCommit) &&
      /^[0-9a-f]{40}$/.test(plan.sourceTree) &&
      /^[0-9a-f]{64}$/.test(plan.compilerInputSha256) &&
      /^[0-9a-f]{64}$/.test(plan.sourceManifestHash) &&
      ethers.isHexString(plan.configHash, 32) &&
      ethers.isHexString(plan.creationScopeHash, 32) &&
      plan.creatorCodeHash === ethers.keccak256('0x') &&
      new Date(plan.expiresAt).toISOString() === plan.expiresAt &&
      path.isAbsolute(plan.lockDirectory) &&
      fs.realpathSync(plan.lockDirectory) === plan.lockDirectory,
    'Invalid reviewed external plan; initial profile requires an empty-code creator'
  );
  exact(plan.initialBlock, ['number', 'hash']);
  need(
    Number.isSafeInteger(plan.initialBlock.number) &&
      plan.initialBlock.number >= 0 &&
      ethers.isHexString(plan.initialBlock.hash, 32),
    'Invalid initial block'
  );
  exact(plan.fees, ['gasLimit', 'maxFeePerGas', 'maxPriorityFeePerGas']);
  for (const value of Object.values(plan.fees))
    need(
      typeof value === 'string' && /^[1-9][0-9]*$/.test(value),
      'Explicit positive fee/gas limits required'
    );
  need(
    BigInt(plan.fees.maxPriorityFeePerGas) <= BigInt(plan.fees.maxFeePerGas) &&
      BigInt(plan.fees.gasLimit) <= 16777216n,
    'Invalid reviewed fee/gas bounds'
  );
  need(
    ethers.isHexString(expectedHash, 32) && digest(plan) === expectedHash,
    'Reviewed external plan hash mismatch'
  );
}
class ExternalWait extends Error {
  constructor(index, state) {
    super(
      `External operation ${index} is ${state}; inspect the private session and continue manually`
    );
    this.code = 'AWAITING_EXTERNAL_SIGNATURE';
    this.index = index;
    this.state = state;
  }
}
function loadState(directory, plan, expectedHash, allowHeadLag = false) {
  need(
    same(read(path.join(directory, 'plan.json')), plan),
    'Private plan differs from reviewed inputs'
  );
  const meta = read(path.join(directory, 'session.json'));
  exact(meta, [
    'schema',
    'planHash',
    'creatorLock',
    'sessionIdentity',
    'lockOwnerIdentity',
  ]);
  need(
    meta.schema === 'jobs-external-session-v1' &&
      meta.planHash === expectedHash &&
      same(meta.sessionIdentity, statIdentity(directory, 'directory')),
    'External session identity mismatch'
  );
  const lock = meta.creatorLock;
  exact(lock, [
    'schema',
    'chainId',
    'creator',
    'journalPath',
    'token',
    'path',
    'directoryIdentity',
    'parentIdentities',
  ]);
  need(
    lock.schema === 'creator-nonce-lock-v1' &&
      lock.chainId === plan.chainId &&
      lock.creator === plan.creator &&
      lock.journalPath === directory &&
      /^[0-9a-f-]{36}$/.test(lock.token) &&
      lock.path ===
        path.join(
          plan.lockDirectory,
          `${plan.chainId}-${plan.creator.toLowerCase()}`
        ) &&
      same(statIdentity(lock.path, 'directory'), lock.directoryIdentity) &&
      same(
        statIdentity(path.join(lock.path, 'owner.json'), 'file'),
        meta.lockOwnerIdentity
      ) &&
      same(read(path.join(lock.path, 'owner.json')), lock),
    'External creator lease differs; never break or replace it'
  );
  for (const p of lock.parentIdentities) unchanged(p);
  const names = fs.readdirSync(path.join(directory, 'events')).sort();
  need(
    names.length > 0 && names.length <= 240,
    'Missing or excessive external journal'
  );
  const operations = [];
  let previous = null,
    penultimate = null;
  for (const [index, name] of names.entries()) {
    need(
      name === `${String(index).padStart(6, '0')}.json`,
      'External journal is torn or reordered'
    );
    const event = read(path.join(directory, 'events', name));
    exact(event, [
      'schema',
      'sequence',
      'previousHash',
      'planHash',
      'action',
      'index',
      'details',
      'hash',
    ]);
    const { hash, ...payload } = event;
    need(
      event.schema === 'jobs-external-event-sha256-v1' &&
        event.sequence === index &&
        event.previousHash === previous &&
        event.planHash === expectedHash &&
        hash === eventDigest(payload),
      'External journal hash-chain mismatch'
    );
    if (index === 0) {
      need(
        event.action === 'created' && event.index === null,
        'Missing original session event'
      );
      exact(event.details, []);
    } else {
      const i = event.index;
      need(
        Number.isSafeInteger(i) &&
          i >= 0 &&
          i < OPERATION_KEYS.length &&
          operations.slice(0, i).every((op) => op.state === 'accepted') &&
          operations.length <= i + 1,
        'External operations must form a contiguous accepted prefix'
      );
      const op = operations[i];
      if (event.action === 'prepared') {
        need(!op && operations.length === i, 'Repeated operation preparation');
        exact(event.details, ['envelope']);
        const envelope = event.details.envelope;
        if (!validatedPreparedEvents.has(event.hash)) {
          requireCanonicalEnvelope(envelope);
          if (validatedPreparedEvents.size >= 256)
            validatedPreparedEvents.clear();
          validatedPreparedEvents.add(event.hash);
        }
        need(
          envelope.context.operationIndex === i &&
            envelope.context.operationKey === OPERATION_KEYS[i] &&
            envelope.context.planHash === expectedHash &&
            envelope.transaction.nonce === plan.firstNonce + i &&
            envelope.context.campaignId === plan.campaignId &&
            envelope.context.sourceCommit === plan.sourceCommit &&
            envelope.context.sourceTree === plan.sourceTree &&
            envelope.context.compilerInputSha256 === plan.compilerInputSha256 &&
            envelope.context.configHash === plan.configHash &&
            envelope.context.creationScopeHash === plan.creationScopeHash &&
            envelope.context.creator === plan.creator &&
            envelope.context.governor === plan.governor &&
            envelope.context.expiresAt === plan.expiresAt &&
            envelope.transaction.chainId === String(plan.chainId) &&
            Object.entries(plan.fees).every(
              ([key, value]) => envelope.transaction[key] === value
            ),
          'Envelope is outside the closed operation scope'
        );
        operations.push({ state: 'prepared', envelope });
      } else {
        need(op, 'Transition without a prepared operation');
        if (event.action === 'signing-requested') {
          exact(event.details, []);
          need(op.state === 'prepared', 'Duplicate signing request');
          op.state = event.action;
        } else if (event.action === 'signed') {
          exact(event.details, ['transactionHash', 'rawHash']);
          need(
            op.state === 'signing-requested',
            'Invalid signature transition'
          );
          need(
            ethers.isHexString(event.details.transactionHash, 32) &&
              ethers.isHexString(event.details.rawHash, 32),
            'Invalid signed identity'
          );
          Object.assign(op, event.details, { state: 'signed' });
        } else if (event.action === 'relay-attempted') {
          exact(event.details, ['transactionHash']);
          need(
            op.state === 'signed' &&
              op.transactionHash === event.details.transactionHash,
            'Duplicate or mismatched relay'
          );
          op.state = event.action;
        } else if (event.action === 'observed') {
          exact(event.details, ['transactionHash', 'receipt']);
          need(
            ['signing-requested', 'signed', 'relay-attempted'].includes(
              op.state
            ) &&
              (!op.transactionHash ||
                op.transactionHash === event.details.transactionHash),
            'Invalid observation transition'
          );
          Object.assign(op, event.details, { state: 'observed' });
        } else if (event.action === 'accepted') {
          exact(event.details, ['transactionHash']);
          need(
            op.state === 'observed' &&
              op.transactionHash === event.details.transactionHash,
            'Invalid acceptance transition'
          );
          op.state = event.action;
        } else throw Error('Unknown external journal transition');
      }
    }
    penultimate = previous;
    previous = hash;
  }
  const head = read(path.join(directory, 'head.json'));
  exact(head, ['schema', 'sequence', 'hash', 'planHash']);
  const headMatches =
    head.schema === 'jobs-external-head-sha256-v1' &&
    head.sequence === names.length - 1 &&
    head.hash === previous &&
    head.planHash === expectedHash;
  const headLag =
    head.schema === 'jobs-external-head-sha256-v1' &&
    head.sequence === names.length - 2 &&
    head.hash === penultimate &&
    head.planHash === expectedHash;
  need(
    headMatches || (allowHeadLag && headLag),
    'External journal/head mismatch; explicitly reconcile the interrupted append'
  );
  // Capabilities are separate from public event details, but are still pinned and
  // checked. An interrupted import/relay marker cannot authorize a second attempt.
  return {
    directory,
    meta,
    operations,
    sequence: names.length,
    previous,
    names,
    headLag: !headMatches,
  };
}
function pinState(state) {
  const base = state.directory;
  const dirs = [
    base,
    path.join(base, 'events'),
    path.join(base, 'signed'),
    path.join(base, 'attempts'),
    state.meta.creatorLock.path,
  ];
  const files = [
    path.join(base, 'plan.json'),
    path.join(base, 'session.json'),
    path.join(base, 'head.json'),
    path.join(state.meta.creatorLock.path, 'owner.json'),
    ...state.names.map((n) => path.join(base, 'events', n)),
  ];
  const memberships = ['events', 'signed', 'attempts'].map((n) => ({
    path: path.join(base, n),
    names: fs.readdirSync(path.join(base, n)).sort(),
  }));
  for (const m of memberships.slice(1))
    for (const n of m.names) files.push(path.join(m.path, n));
  return {
    pins: [
      ...parents(base),
      ...parents(path.dirname(state.meta.creatorLock.path)),
      ...dirs.map((d) => pin(d, 'directory')),
      ...files.map((f) => pin(f, 'file')),
    ],
    memberships,
  };
}
function checkPins(guard) {
  guard.pins.forEach(unchanged);
  for (const m of guard.memberships)
    need(
      same(fs.readdirSync(m.path).sort(), m.names),
      'External journal/capability membership changed'
    );
}
function createExternalSession({
  directory,
  plan,
  expectedPlanHash,
  revalidateSource,
  provider,
  now = () => new Date(),
}) {
  need(
    path.isAbsolute(directory) &&
      fs.realpathSync(path.dirname(directory)) === path.dirname(directory),
    'Explicit real private session parent required'
  );
  plan = copy(plan);
  validatePlan(plan, expectedPlanHash);
  need(
    typeof revalidateSource === 'function' && revalidateSource(plan) === true,
    'Synchronous trusted source validation is required'
  );
  let busy = false;
  function source() {
    validatePlan(plan, expectedPlanHash);
    need(revalidateSource(plan) === true, 'External source validation failed');
  }
  async function command(action, allowHeadLag = false) {
    need(!busy, 'An external session command is already active');
    busy = true;
    let active, activePin, ownerPin, ownerFd, ancestorPins, state, guard;
    try {
      state = loadState(directory, plan, expectedPlanHash, allowHeadLag);
      source();
      active = path.join(directory, 'active-command');
      fs.mkdirSync(active, { mode: 0o700 });
      activePin = pin(active, 'directory');
      ancestorPins = parents(directory);
      // The pre-lock read cannot be trusted after another process completes.
      // Bind the owner and all guards to a fresh snapshot under exclusivity.
      state = loadState(directory, plan, expectedPlanHash, allowHeadLag);
      source();
      const heldOwner = createOwnerFile(path.join(active, 'owner.json'), {
        token: crypto.randomUUID(),
        planHash: expectedPlanHash,
        head: state.previous,
        pid: process.pid,
        directoryIdentity: activePin.identity,
        parentIdentities: ancestorPins,
      });
      ownerFd = heldOwner.fd;
      const createdOwnerPin = pin(path.join(active, 'owner.json'), 'file');
      need(
        createdOwnerPin.hash === heldOwner.expectedHash,
        'External active-command owner bytes changed during creation'
      );
      checkOpenOwner(createdOwnerPin, ownerFd);
      // Cleanup may use only the original descriptor and intended bytes.
      ownerPin = createdOwnerPin;
      syncDirectory(directory);
      guard = pinState(state);
      const check = () => {
        source();
        ancestorPins.forEach(unchanged);
        unchanged(activePin);
        checkOpenOwner(ownerPin, ownerFd);
        checkPins(guard);
      };
      const awaited = async (promise) => {
        const value = await promise;
        check();
        return value;
      };
      const refresh = () => {
        state = loadState(directory, plan, expectedPlanHash);
        guard = pinState(state);
      };
      const updateHead = () => {
        const target = path.join(directory, 'head.json');
        const temp = path.join(directory, `head-${crypto.randomUUID()}.tmp`);
        writeNew(temp, {
          schema: 'jobs-external-head-sha256-v1',
          sequence: state.sequence,
          hash: state.previous,
          planHash: expectedPlanHash,
        });
        fs.renameSync(temp, target);
        syncDirectory(directory);
      };
      const append = (action, index, details) => {
        check();
        const payload = {
          schema: 'jobs-external-event-sha256-v1',
          sequence: state.sequence,
          previousHash: state.previous,
          planHash: expectedPlanHash,
          action,
          index,
          details,
        };
        writeNew(
          path.join(
            directory,
            'events',
            `${String(state.sequence).padStart(6, '0')}.json`
          ),
          { ...payload, hash: eventDigest(payload) }
        );
        // The event is durable before the head; interruption requires explicit repair.
        state = { ...state, previous: eventDigest(payload) };
        updateHead();
        refresh();
      };
      const capability = (folder, index, value) => {
        check();
        writeNew(path.join(directory, folder, `${index}.json`), value);
        refresh();
      };
      const repairHead = () => {
        check();
        need(state.headLag, 'No recoverable head lag');
        state = { ...state, sequence: state.sequence - 1 };
        updateHead();
        refresh();
      };
      return await action({
        state: () => state,
        check,
        awaited,
        append,
        capability,
        repairHead,
      });
    } finally {
      busy = false;
      // Never clean up a substituted parent/owner/inode, even on an exception.
      try {
        if (ownerPin) {
          source();
          ancestorPins.forEach(unchanged);
          unchanged(activePin);
          checkOpenOwner(ownerPin, ownerFd);
          if (guard) checkPins(guard);
          fs.unlinkSync(ownerPin.file);
          ancestorPins.forEach(unchanged);
          unchanged(activePin);
          fs.rmdirSync(active);
          syncDirectory(directory);
        }
      } finally {
        if (ownerFd !== undefined) fs.closeSync(ownerFd);
      }
    }
  }
  function recoverySnapshot() {
    need(!busy, 'Cannot recover a command active in this process');
    source();
    const state = loadState(directory, plan, expectedPlanHash, true);
    const active = path.join(directory, 'active-command'),
      activePin = pin(active, 'directory');
    const membership = fs.readdirSync(active).sort();
    need(
      same(membership, []) || same(membership, ['owner.json']),
      'Unexpected retained command contents; preserve for review'
    );
    const ownerPin = membership.length
      ? pin(path.join(active, 'owner.json'), 'file')
      : null;
    const owner = ownerPin
      ? read(ownerPin.file)
      : {
          token: null,
          planHash: expectedPlanHash,
          head: state.previous,
          pid: null,
          directoryIdentity: activePin.identity,
          parentIdentities: parents(directory),
        };
    exact(owner, [
      'token',
      'planHash',
      'head',
      'pid',
      'directoryIdentity',
      'parentIdentities',
    ]);
    need(
      owner.planHash === expectedPlanHash &&
        same(owner.directoryIdentity, activePin.identity) &&
        (ownerPin ? /^[0-9a-f-]{36}$/.test(owner.token) : owner.token === null),
      'Retained command owner identity mismatch'
    );
    owner.parentIdentities.forEach(unchanged);
    const guard = pinState(state);
    return {
      state,
      active,
      activePin,
      ownerPin,
      guard,
      owner,
      membership,
      acknowledgement: `STOPPED_JOBS_COMMAND:${expectedPlanHash}:${digest({
        owner,
        ownerIdentity: ownerPin?.identity || null,
        membership,
        head: state.previous,
      })}`,
    };
  }
  const current = (c) => {
    const ops = c.state().operations;
    const index = ops.findIndex((op) => op.state !== 'accepted');
    need(index >= 0, 'No unresolved external operation');
    return { op: ops[index], index };
  };
  const unexpired = (envelope) =>
    need(
      now().getTime() <
        Date.parse(envelope?.context.expiresAt || plan.expiresAt),
      'External signing/relay policy expired; preserve capabilities for reconciliation'
    );
  async function verifyChain(
    c,
    expectedNonce,
    requireNonce = true,
    checkPrefix = true
  ) {
    need(
      Number(BigInt(await c.awaited(provider.send('eth_chainId', [])))) ===
        plan.chainId,
      'External chain mismatch'
    );
    need(
      (await c.awaited(provider.getBlock(plan.initialBlock.number)))?.hash ===
        plan.initialBlock.hash,
      'External initial block is no longer canonical'
    );
    need(
      ethers.keccak256(await c.awaited(provider.getCode(plan.creator))) ===
        plan.creatorCodeHash,
      'Creation wallet code changed'
    );
    if (checkPrefix)
      for (const op of c
        .state()
        .operations.filter((op) => ['observed', 'accepted'].includes(op.state)))
        await verifyReceipt(c, op.envelope, op.transactionHash, op.receipt);
    if (requireNonce) {
      const latest = await c.awaited(
        provider.getTransactionCount(plan.creator, 'latest')
      );
      const pending = await c.awaited(
        provider.getTransactionCount(plan.creator, 'pending')
      );
      need(
        latest === expectedNonce && pending === latest,
        'External creator nonce/pending state differs; reconcile before continuing'
      );
    }
  }
  async function verifyReceipt(c, envelope, hash, saved) {
    const transaction = await c.awaited(provider.getTransaction(hash));
    E.requireTransactionEnvelope(envelope, transaction);
    need(transaction.hash === hash, 'External transaction hash mismatch');
    const receipt = await c.awaited(provider.getTransactionReceipt(hash));
    need(
      receipt &&
        receipt.status === 1 &&
        receipt.hash === hash &&
        receipt.blockNumber > plan.initialBlock.number &&
        (await c.awaited(provider.getBlock(receipt.blockNumber)))?.hash ===
          receipt.blockHash,
      'External receipt is pending, failed or noncanonical'
    );
    const latest = await c.awaited(provider.getBlock('latest'));
    need(
      latest.number - receipt.blockNumber + 1 >= plan.confirmations,
      'External receipt needs reviewed confirmations'
    );
    if (envelope.transaction.to === null)
      need(
        ethers.getAddress(receipt.contractAddress) ===
          ethers.getCreateAddress({
            from: plan.creator,
            nonce: envelope.transaction.nonce,
          }),
        'External CREATE address mismatch'
      );
    const result = {
      hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: 1,
      contractAddress: receipt.contractAddress || null,
    };
    if (saved) need(same(result, saved), 'External canonical receipt changed');
    return result;
  }
  function view(state) {
    return {
      schema: 'jobs-external-status-v1',
      planHash: expectedPlanHash,
      head: state.previous,
      operations: state.operations.map((op, index) => ({
        index,
        key: OPERATION_KEYS[index],
        state: op.state,
        unsignedHash: op.envelope.unsignedHash,
        policyHash: op.envelope.policyHash,
        ...(op.transactionHash ? { transactionHash: op.transactionHash } : {}),
      })),
      productionApproved: false,
      activationReady: false,
    };
  }
  return {
    plan: Object.freeze(copy(plan)),
    planHash: expectedPlanHash,
    async initialize() {
      source();
      need(
        !exists(directory),
        'External session already exists; use its original state'
      );
      fs.mkdirSync(directory, { mode: 0o700 });
      syncDirectory(path.dirname(directory));
      for (const name of ['events', 'signed', 'attempts'])
        fs.mkdirSync(path.join(directory, name), { mode: 0o700 });
      const lockPath = path.join(
        plan.lockDirectory,
        `${plan.chainId}-${plan.creator.toLowerCase()}`
      );
      fs.mkdirSync(lockPath, { mode: 0o700 });
      syncDirectory(plan.lockDirectory);
      const lock = {
        schema: 'creator-nonce-lock-v1',
        chainId: plan.chainId,
        creator: plan.creator,
        journalPath: directory,
        token: crypto.randomUUID(),
        path: lockPath,
        directoryIdentity: statIdentity(lockPath, 'directory'),
        parentIdentities: parents(plan.lockDirectory),
      };
      writeNew(path.join(lockPath, 'owner.json'), lock);
      writeNew(path.join(directory, 'plan.json'), plan);
      writeNew(path.join(directory, 'session.json'), {
        schema: 'jobs-external-session-v1',
        planHash: expectedPlanHash,
        creatorLock: lock,
        sessionIdentity: statIdentity(directory, 'directory'),
        lockOwnerIdentity: statIdentity(
          path.join(lockPath, 'owner.json'),
          'file'
        ),
      });
      const payload = {
        schema: 'jobs-external-event-sha256-v1',
        sequence: 0,
        previousHash: null,
        planHash: expectedPlanHash,
        action: 'created',
        index: null,
        details: {},
      };
      writeNew(path.join(directory, 'events', '000000.json'), {
        ...payload,
        hash: eventDigest(payload),
      });
      writeNew(path.join(directory, 'head.json'), {
        schema: 'jobs-external-head-sha256-v1',
        sequence: 0,
        hash: eventDigest(payload),
        planHash: expectedPlanHash,
      });
      return command(async (c) => {
        unexpired();
        await verifyChain(c, plan.firstNonce);
        return view(c.state());
      });
    },
    inspectRecovery() {
      const r = recoverySnapshot();
      return {
        acknowledgement: r.acknowledgement,
        priorProcessId: r.owner.pid,
        head: r.state.previous,
        notice:
          'Explicitly stop the prior trusted executor before acknowledging. This clears only its retained command guard; actor lease, signed capabilities and journal remain.',
      };
    },
    recoverCommand(acknowledgement) {
      const r = recoverySnapshot();
      need(
        acknowledgement === r.acknowledgement,
        'Exact stopped-executor recovery acknowledgement required'
      );
      const mutex = path.join(directory, 'recovering-command');
      fs.mkdirSync(mutex, { mode: 0o700 });
      const mutexPin = pin(mutex, 'directory');
      const parentPins = parents(directory);
      try {
        source();
        parentPins.forEach(unchanged);
        checkPins(r.guard);
        unchanged(r.activePin);
        if (r.ownerPin) unchanged(r.ownerPin);
        need(
          same(fs.readdirSync(r.active).sort(), r.membership),
          'Retained command membership changed'
        );
        unchanged(mutexPin);
        if (r.ownerPin) fs.unlinkSync(r.ownerPin.file);
        parentPins.forEach(unchanged);
        unchanged(r.activePin);
        fs.rmdirSync(r.active);
        syncDirectory(directory);
        return {
          recoveredCommandGuard: true,
          transactionsBroadcast: 0,
          headRepairRequired: r.state.headLag,
        };
      } finally {
        parentPins.forEach(unchanged);
        unchanged(mutexPin);
        fs.rmdirSync(mutex);
        syncDirectory(directory);
      }
    },
    inspect: () =>
      command(
        async (c) => ({
          ...view(c.state()),
          headRepairRequired: c.state().headLag,
        }),
        true
      ),
    repairHead: (acknowledgement) =>
      command(async (c) => {
        need(
          acknowledgement ===
            `REPAIR_JOBS_HEAD:${expectedPlanHash}:${c.state().previous}`,
          'Exact interrupted-head repair acknowledgement required'
        );
        c.repairHead();
        return view(c.state());
      }, true),
    async prepare({ key, transaction, compilerInputSha256 }) {
      return command(async (c) => {
        const index = c.state().operations.length;
        need(
          index < OPERATION_KEYS.length &&
            key === OPERATION_KEYS[index] &&
            c.state().operations.every((op) => op.state === 'accepted'),
          `External operation is outside the closed 39-operation prefix (index ${index}, expected ${
            OPERATION_KEYS[index]
          }, received ${key}, previous ${
            c.state().operations.at(-1)?.state || 'none'
          })`
        );
        need(
          compilerInputSha256 === plan.compilerInputSha256,
          'External compiler input mismatch'
        );
        unexpired();
        await verifyChain(c, plan.firstNonce + index);
        const context = {
          schema: 'jobs-external-operation-v1',
          campaignId: plan.campaignId,
          sourceCommit: plan.sourceCommit,
          sourceTree: plan.sourceTree,
          compilerInputSha256,
          configHash: plan.configHash,
          planHash: expectedPlanHash,
          creationScopeHash: plan.creationScopeHash,
          operationIndex: index,
          operationKey: key,
          creator: plan.creator,
          governor: plan.governor,
          preparedAt: now().toISOString(),
          expiresAt: plan.expiresAt,
        };
        need(
          transaction.nonce === plan.firstNonce + index &&
            Number(transaction.chainId) === plan.chainId,
          'External assigned transaction identity differs'
        );
        const envelope = E.buildEnvelope({ transaction, context });
        need(
          Object.entries(plan.fees).every(
            ([key, value]) => envelope.transaction[key] === value
          ),
          'External fee/gas envelope differs from reviewed plan'
        );
        c.append('prepared', index, { envelope });
        return copy(envelope);
      });
    },
    async handoff(review) {
      return command(async (c) => {
        const { op, index } = current(c);
        exact(review, ['planHash', 'unsignedHash', 'policyHash']);
        need(
          review.planHash === expectedPlanHash &&
            review.unsignedHash === op.envelope.unsignedHash &&
            review.policyHash === op.envelope.policyHash,
          'Independent exact operation review required'
        );
        need(
          op.state === 'prepared',
          'Signing request already exists; retrieve it without signing again'
        );
        unexpired(op.envelope);
        await verifyChain(c, op.envelope.transaction.nonce);
        unexpired(op.envelope);
        // Never let the read-only event cache stand in for full validation at a
        // signing capability boundary, including after asynchronous reads.
        requireCanonicalEnvelope(op.envelope);
        c.append('signing-requested', index, {});
        return {
          schema: 'jobs-external-handoff-v1',
          envelope: copy(op.envelope),
          newSigningRequest: true,
          broadcastByCoordinator: false,
        };
      });
    },
    async retrieve() {
      return command(async (c) => {
        const { op } = current(c);
        need(op.state !== 'prepared', 'No original signing request');
        requireCanonicalEnvelope(op.envelope);
        return {
          schema: 'jobs-external-handoff-v1',
          envelope: copy(op.envelope),
          newSigningRequest: false,
          status: op.state,
          ...(op.transactionHash
            ? { transactionHash: op.transactionHash }
            : {}),
        };
      });
    },
    async importSigned(raw) {
      return command(async (c) => {
        const { op, index } = current(c);
        need(
          ['signing-requested', 'signed'].includes(op.state),
          'No importable original signing request'
        );
        const checked = E.importSignedEnvelope(op.envelope, raw);
        const rawHash = ethers.keccak256(raw);
        const file = path.join(directory, 'signed', `${index}.json`);
        if (exists(file)) {
          const saved = read(file);
          exact(saved, ['raw']);
          need(
            saved.raw === raw,
            'Existing signed capability differs; never replace it'
          );
        } else {
          need(
            op.state === 'signing-requested',
            'Signed capability is missing'
          );
          c.capability('signed', index, { raw });
        }
        if (op.state === 'signing-requested')
          c.append('signed', index, { transactionHash: checked.hash, rawHash });
        else
          need(
            op.transactionHash === checked.hash && op.rawHash === rawHash,
            'Signed acknowledgement identity differs'
          );
        return {
          index,
          transactionHash: checked.hash,
          relayAcknowledgement: `RELAY_JOBS:${expectedPlanHash}:${index}:${checked.hash}`,
          expired: now().getTime() >= Date.parse(plan.expiresAt),
        };
      });
    },
    async authorizeRelay(acknowledgement) {
      return command(async (c) => {
        const { op, index } = current(c);
        need(
          op.state === 'signed' &&
            !exists(path.join(directory, 'attempts', `${index}.json`)),
          'Relay already attempted or capability not imported'
        );
        need(
          acknowledgement ===
            `RELAY_JOBS:${expectedPlanHash}:${index}:${op.transactionHash}`,
          'Exact manual relay acknowledgement required'
        );
        unexpired(op.envelope);
        await verifyChain(c, op.envelope.transaction.nonce);
        const saved = read(path.join(directory, 'signed', `${index}.json`));
        exact(saved, ['raw']);
        const checked = E.importSignedEnvelope(op.envelope, saved.raw);
        need(
          checked.hash === op.transactionHash &&
            ethers.keccak256(saved.raw) === op.rawHash,
          'Signed capability identity changed'
        );
        unexpired(op.envelope);
        c.capability('attempts', index, { transactionHash: checked.hash });
        c.append('relay-attempted', index, { transactionHash: checked.hash });
        c.check();
        unexpired(op.envelope);
        return {
          raw: saved.raw,
          transactionHash: checked.hash,
          oneAuthorizedAttempt: true,
        };
      });
    },
    async observe() {
      return command(async (c) => {
        const { op, index } = current(c);
        need(
          [
            'signing-requested',
            'signed',
            'relay-attempted',
            'observed',
          ].includes(op.state),
          'No handed-off operation to observe'
        );
        await verifyChain(c, op.envelope.transaction.nonce, false);
        let hash = op.transactionHash;
        if (!hash) {
          const head = await c.awaited(provider.getBlock('latest'));
          need(
            head.number - plan.initialBlock.number <= 2048,
            'External hashless recovery exceeds bounded canonical scan'
          );
          for (
            let number = plan.initialBlock.number + 1;
            number <= head.number;
            number++
          ) {
            const block = await c.awaited(provider.getBlock(number));
            for (const txHash of block.transactions) {
              const tx = await c.awaited(provider.getTransaction(txHash));
              if (
                tx?.from.toLowerCase() === plan.creator.toLowerCase() &&
                tx.nonce === op.envelope.transaction.nonce
              ) {
                E.requireTransactionEnvelope(op.envelope, tx);
                need(
                  !hash || hash === tx.hash,
                  'Ambiguous external nonce history'
                );
                hash = tx.hash;
              }
            }
            need(
              (await c.awaited(provider.getBlock(number)))?.hash === block.hash,
              'External recovery block changed'
            );
          }
          need(
            (await c.awaited(provider.getBlock(head.number)))?.hash ===
              head.hash,
            'External recovery head changed'
          );
        }
        need(
          hash,
          'No canonical external transaction; preserve request/capability and do not retry'
        );
        const receipt = await verifyReceipt(c, op.envelope, hash, op.receipt);
        if (op.state !== 'observed')
          c.append('observed', index, { transactionHash: hash, receipt });
        return {
          transactionHash: hash,
          receipt,
          broadcastByCoordinator: false,
        };
      });
    },
    async requireObserved(key, transaction) {
      return command(async (c) => {
        const index = OPERATION_KEYS.indexOf(key),
          op = c.state().operations[index];
        need(op, 'Missing external envelope');
        E.requireTransactionEnvelope(op.envelope, transaction);
        if (!['observed', 'accepted'].includes(op.state))
          throw new ExternalWait(index, op.state);
        need(
          transaction.hash === op.transactionHash,
          'Observed external transaction differs'
        );
        await verifyChain(c, op.envelope.transaction.nonce, false, false);
        await verifyReceipt(c, op.envelope, op.transactionHash, op.receipt);
        return copy(op);
      });
    },
    async accept(key, hash) {
      return command(async (c) => {
        const index = OPERATION_KEYS.indexOf(key),
          op = c.state().operations[index];
        need(
          op &&
            ['observed', 'accepted'].includes(op.state) &&
            op.transactionHash === hash,
          'External observation required before writer acceptance'
        );
        await verifyChain(c, op.envelope.transaction.nonce, false, false);
        await verifyReceipt(c, op.envelope, op.transactionHash, op.receipt);
        if (op.state !== 'accepted')
          c.append('accepted', index, { transactionHash: hash });
        return view(c.state());
      });
    },
    async operation(key) {
      return command(async (c) =>
        copy(c.state().operations[OPERATION_KEYS.indexOf(key)] || null)
      );
    },
  };
}
module.exports = {
  createExternalSession,
  ExternalWait,
  OPERATION_KEYS,
  validatePlan,
  digest,
};
