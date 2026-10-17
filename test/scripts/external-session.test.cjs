'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { ethers } = require('ethers');
const {
  createExternalSession,
  digest,
  OPERATION_KEYS,
} = require('../../scripts/deploy/external-session.cjs');
const {
  ExternalManualSigner,
} = require('../../scripts/deploy/external-signer.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-external-unit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const locks = path.join(root, 'locks');
  fs.mkdirSync(locks, { mode: 0o700 });
  const wallet = new ethers.Wallet('0x' + '11'.repeat(32));
  const blockHash = ethers.id('initial'),
    governor = ethers.getAddress('0x' + '22'.repeat(20));
  const plan = {
    schema: 'jobs-external-plan-v1',
    campaignId: 'd73e3542-501f-4567-8bbb-88a515fd4bc9',
    chainId: 31337,
    creator: wallet.address,
    governor,
    sourceCommit: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40),
    compilerInputSha256: 'c'.repeat(64),
    sourceManifestHash: 'd'.repeat(64),
    configHash: ethers.id('config'),
    creationScopeHash: ethers.id('scope'),
    firstNonce: 0,
    creatorCodeHash: ethers.keccak256('0x'),
    initialBlock: { number: 1, hash: blockHash },
    confirmations: 1,
    expiresAt: '2099-01-01T00:00:00.000Z',
    fees: {
      gasLimit: '2000000',
      maxFeePerGas: '1000000000',
      maxPriorityFeePerGas: '1000000',
    },
    lockDirectory: locks,
  };
  const blocks = new Map([
      [1, { number: 1, hash: blockHash, transactions: [] }],
    ]),
    transactions = new Map(),
    receipts = new Map();
  let nonce = 0,
    validSource = true,
    clock = new Date('2026-10-16T16:00:00.000Z');
  const provider = {
    send: async () => '0x7a69',
    getCode: async () => '0x',
    getBlock: async (n) =>
      blocks.get(n === 'latest' ? Math.max(...blocks.keys()) : n),
    getTransactionCount: async () => nonce,
    getTransaction: async (hash) => transactions.get(hash),
    getTransactionReceipt: async (hash) => receipts.get(hash),
  };
  const options = {
    directory: path.join(root, 'session'),
    plan,
    expectedPlanHash: digest(plan),
    revalidateSource: () => validSource,
    provider,
    now: () => clock,
  };
  const session = createExternalSession(options);
  const mine = (raw) => {
    const tx = ethers.Transaction.from(raw);
    nonce++;
    const number = blocks.size + 1,
      hash = ethers.id(String(number));
    blocks.set(number, { number, hash, transactions: [tx.hash] });
    transactions.set(tx.hash, tx);
    const receipt = {
      hash: tx.hash,
      blockNumber: number,
      blockHash: hash,
      status: 1,
      contractAddress: tx.to
        ? null
        : ethers.getCreateAddress({ from: wallet.address, nonce: tx.nonce }),
    };
    receipts.set(tx.hash, receipt);
    return tx;
  };
  const prepare = async () =>
    session.prepare({
      key: 'create:Deployer',
      compilerInputSha256: plan.compilerInputSha256,
      transaction: {
        type: 2,
        chainId: '31337',
        nonce: 0,
        to: null,
        value: '0',
        data: '0x60006000',
        ...plan.fees,
        accessList: [],
      },
    });
  const review = (e) => ({
    planHash: e.context.planHash,
    unsignedHash: e.unsignedHash,
    policyHash: e.policyHash,
  });
  return {
    root,
    locks,
    wallet,
    plan,
    options,
    session,
    provider,
    prepare,
    review,
    mine,
    blocks,
    transactions,
    receipts,
    source: (value) => (validSource = value),
    clock: (value) => (clock = new Date(value)),
  };
}
test('closed scope is exactly 39 operations with no governor activation or generic call', () => {
  assert.equal(OPERATION_KEYS.length, 39);
  assert.equal(new Set(OPERATION_KEYS).size, 39);
  assert.equal(OPERATION_KEYS.at(-1), 'handover:Deployer');
});
test('manual roundtrip persists a one-shot capability and recovers its original acknowledgement', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const e = await f.prepare();
  assert.equal((await f.session.inspect()).operations[0].state, 'prepared');
  await assert.rejects(f.session.authorizeRelay('x'), /not imported/);
  await f.session.handoff(f.review(e));
  await assert.rejects(f.session.handoff(f.review(e)), /already exists/);
  const raw = await f.wallet.signTransaction(e.transaction),
    first = await f.session.importSigned(raw),
    second = await f.session.importSigned(raw);
  assert.deepEqual(first, second);
  assert.equal((await f.session.retrieve()).newSigningRequest, false);
  const relay = await f.session.authorizeRelay(first.relayAcknowledgement);
  assert.equal(relay.raw, raw);
  await assert.rejects(
    f.session.authorizeRelay(first.relayAcknowledgement),
    /already attempted/
  );
  await assert.rejects(f.session.observe(), /pending|identity|missing/);
  const tx = f.mine(raw);
  await f.session.observe();
  await f.session.requireObserved('create:Deployer', tx);
  await f.session.accept('create:Deployer', tx.hash);
  const resumed = createExternalSession(f.options);
  assert.equal((await resumed.inspect()).operations[0].state, 'accepted');
  assert.ok(!JSON.stringify(await resumed.inspect()).includes(raw));
});
test('mined unknown signature recovers exact original handoff without import or relay', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const e = await f.prepare();
  await f.session.handoff(f.review(e));
  const tx = f.mine(await f.wallet.signTransaction(e.transaction));
  const result = await f.session.observe();
  assert.equal(result.transactionHash, tx.hash);
});
test('wrong independent review, nonce, fee, source and caller operation reject', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  await assert.rejects(
    f.session.prepare({
      key: 'unpause',
      compilerInputSha256: f.plan.compilerInputSha256,
      transaction: {},
    }),
    /closed/
  );
  const e = await f.prepare();
  await assert.rejects(
    f.session.handoff({ ...f.review(e), policyHash: ethers.ZeroHash }),
    /review/
  );
  f.source(false);
  await assert.rejects(f.session.inspect(), /source/);
});
test('expiry is checked again after an asynchronous chain read', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const e = await f.prepare();
  const original = f.provider.getCode;
  f.provider.getCode = async () => {
    f.clock('2100-01-01T00:00:00.000Z');
    return original();
  };
  await assert.rejects(f.session.handoff(f.review(e)), /expired/);
  assert.equal((await f.session.inspect()).operations[0].state, 'prepared');
});
test('same actor cannot reserve a second repository/session path', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const other = createExternalSession({
    ...f.options,
    directory: path.join(f.root, 'another'),
  });
  await assert.rejects(other.initialize(), /EEXIST/);
});
test('owner file replacement during await is preserved and rejected before cleanup', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const e = await f.prepare();
  f.provider.getCode = async () => {
    const active = path.join(
      f.options.directory,
      'active-command',
      'owner.json'
    );
    const data = fs.readFileSync(active);
    fs.unlinkSync(active);
    fs.writeFileSync(active, data, { mode: 0o600 });
    return '0x';
  };
  await assert.rejects(f.session.handoff(f.review(e)), /identity changed/);
  assert.ok(
    fs.existsSync(
      path.join(f.options.directory, 'active-command', 'owner.json')
    )
  );
});
// Observe only active-owner read descriptors; never change their runtime behavior.
function watchOwnerDescriptors(t) {
  const open = fs.openSync,
    close = fs.closeSync;
  const active = new Map(),
    opened = [];
  fs.openSync = function (file, flags, ...args) {
    const fd = open.call(this, file, flags, ...args);
    if (
      typeof file === 'string' &&
      file.endsWith(path.join('active-command', 'owner.json')) &&
      typeof flags === 'number' &&
      (flags & fs.constants.O_WRONLY) === 0
    ) {
      const item = { fd, closed: false };
      active.set(fd, item);
      opened.push(item);
    }
    return fd;
  };
  fs.closeSync = function (fd) {
    const result = close.call(this, fd);
    const item = active.get(fd);
    if (item) {
      item.closed = true;
      active.delete(fd);
    }
    return result;
  };
  let restored = false;
  const restore = () => {
    if (!restored) {
      fs.openSync = open;
      fs.closeSync = close;
      restored = true;
    }
  };
  t.after(restore);
  return { active, opened, restore };
}
test('held owner descriptor detects identical unlink/recreate and closes without deleting replacement', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const e = await f.prepare();
  const watch = watchOwnerDescriptors(t);
  const owner = path.join(f.options.directory, 'active-command', 'owner.json');
  const head = fs.readFileSync(path.join(f.options.directory, 'head.json'));
  let held, replacement;
  f.provider.getCode = async () => {
    assert.equal(
      watch.active.size,
      1,
      'Original owner descriptor stays open across await'
    );
    held = [...watch.active.keys()][0];
    replacement = fs.readFileSync(owner);
    fs.unlinkSync(owner);
    fs.writeFileSync(owner, replacement, { mode: 0o600 });
    assert.equal(
      fs.fstatSync(held).nlink,
      0,
      'Unlinked original remains independently observable'
    );
    return '0x';
  };
  await assert.rejects(f.session.handoff(f.review(e)), /identity changed/);
  assert.deepEqual(fs.readFileSync(owner), replacement);
  assert.deepEqual(
    fs.readFileSync(path.join(f.options.directory, 'head.json')),
    head
  );
  assert.throws(() => fs.fstatSync(held), { code: 'EBADF' });
  assert.equal(watch.active.size, 0);
  assert(watch.opened.every((item) => item.closed));
});
test('held owner descriptor rejects rename and extra links while preserving foreign entries', async (t) => {
  for (const variant of ['rename', 'link']) {
    const f = fixture(t);
    await f.session.initialize();
    const e = await f.prepare();
    const watch = watchOwnerDescriptors(t);
    const owner = path.join(
      f.options.directory,
      'active-command',
      'owner.json'
    );
    const foreign = owner + '.foreign';
    let expected;
    f.provider.getCode = async () => {
      assert.equal(watch.active.size, 1);
      expected = fs.readFileSync(owner);
      if (variant === 'rename') {
        fs.renameSync(owner, foreign);
        fs.writeFileSync(owner, expected, { mode: 0o600 });
      } else fs.linkSync(owner, foreign);
      return '0x';
    };
    try {
      await assert.rejects(
        f.session.handoff(f.review(e)),
        /identity changed|hard-linked/
      );
      assert.deepEqual(fs.readFileSync(owner), expected);
      assert.deepEqual(fs.readFileSync(foreign), expected);
      assert.equal(watch.active.size, 0);
      assert(watch.opened.every((item) => item.closed));
    } finally {
      watch.restore();
    }
  }
});
test('active owner descriptors close after success, provider failure and source refusal', async (t) => {
  for (const variant of ['success', 'provider', 'source']) {
    const f = fixture(t);
    await f.session.initialize();
    const e = await f.prepare();
    const watch = watchOwnerDescriptors(t);
    const owner = path.join(
      f.options.directory,
      'active-command',
      'owner.json'
    );
    f.provider.getCode = async () => {
      assert.equal(watch.active.size, 1);
      if (variant === 'provider') throw new Error('synthetic provider failure');
      if (variant === 'source') f.source(false);
      return '0x';
    };
    try {
      if (variant === 'success') await f.session.handoff(f.review(e));
      else
        await assert.rejects(
          f.session.handoff(f.review(e)),
          /synthetic provider failure|source validation/
        );
      assert.equal(watch.active.size, 0);
      assert(watch.opened.every((item) => item.closed));
      assert.equal(fs.existsSync(owner), variant === 'source');
    } finally {
      watch.restore();
    }
  }
});
test('active owner descriptor compares exact contents and closes on same-inode mutation', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const e = await f.prepare();
  const watch = watchOwnerDescriptors(t);
  const owner = path.join(f.options.directory, 'active-command', 'owner.json');
  let replacement;
  f.provider.getCode = async () => {
    assert.equal(watch.active.size, 1);
    const before = fs.statSync(owner).ino;
    const value = JSON.parse(fs.readFileSync(owner, 'utf8'));
    value.token = 'foreign-owner';
    replacement = Buffer.from(JSON.stringify(value));
    fs.writeFileSync(owner, replacement);
    assert.equal(fs.statSync(owner).ino, before);
    return '0x';
  };
  await assert.rejects(f.session.handoff(f.review(e)), /bytes changed/);
  assert.deepEqual(fs.readFileSync(owner), replacement);
  assert.equal(watch.active.size, 0);
  assert(watch.opened.every((item) => item.closed));
});
test('original creation descriptor rejects substitution before the first path pin', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const e = await f.prepare();
  const watch = watchOwnerDescriptors(t);
  const owner = path.join(f.options.directory, 'active-command', 'owner.json');
  const foreign = owner + '.original';
  const sync = fs.fsyncSync;
  let replaced = false,
    expected;
  fs.fsyncSync = function (fd) {
    const result = sync.call(this, fd);
    if (!replaced && watch.active.has(fd)) {
      replaced = true;
      expected = fs.readFileSync(owner);
      fs.renameSync(owner, foreign);
      fs.writeFileSync(owner, expected, { mode: 0o600 });
    }
    return result;
  };
  try {
    await assert.rejects(f.session.handoff(f.review(e)), /identity changed/);
    assert.equal(replaced, true);
    assert.deepEqual(fs.readFileSync(owner), expected);
    assert.deepEqual(fs.readFileSync(foreign), expected);
    assert.equal(watch.active.size, 0);
    assert(watch.opened.every((item) => item.closed));
  } finally {
    fs.fsyncSync = sync;
  }
});
test('initial same-inode owner mutation is preserved and its creation descriptor closes', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const e = await f.prepare();
  const watch = watchOwnerDescriptors(t);
  const owner = path.join(f.options.directory, 'active-command', 'owner.json');
  const sync = fs.fsyncSync;
  let changed = false,
    expected;
  fs.fsyncSync = function (fd) {
    const result = sync.call(this, fd);
    if (!changed && watch.active.has(fd)) {
      changed = true;
      const value = JSON.parse(fs.readFileSync(owner, 'utf8'));
      value.token = 'foreign-owner-during-creation';
      expected = Buffer.from(JSON.stringify(value));
      fs.writeFileSync(owner, expected);
    }
    return result;
  };
  try {
    await assert.rejects(
      f.session.handoff(f.review(e)),
      /bytes changed during creation/
    );
    assert.equal(changed, true);
    assert.deepEqual(fs.readFileSync(owner), expected);
    assert.equal(watch.active.size, 0);
    assert(watch.opened.every((item) => item.closed));
  } finally {
    fs.fsyncSync = sync;
  }
});
test('journal truncation, symlink and canonical receipt drift cannot advance', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const e = await f.prepare();
  await f.session.handoff(f.review(e));
  const tx = f.mine(await f.wallet.signTransaction(e.transaction));
  await f.session.observe();
  f.blocks.set(2, {
    number: 2,
    hash: ethers.id('reorg'),
    transactions: [tx.hash],
  });
  await assert.rejects(
    f.session.accept('create:Deployer', tx.hash),
    /noncanonical/
  );
  fs.unlinkSync(path.join(f.options.directory, 'events', '000003.json'));
  await assert.rejects(f.session.inspect(), /journal\/head/);
});
test('address-only facade rejects every automatic wallet method', async (t) => {
  const f = fixture(t),
    signer = new ExternalManualSigner(f.provider, f.session);
  assert.equal(await signer.getAddress(), f.wallet.address);
  for (const method of [
    'sendTransaction',
    'signTransaction',
    'signMessage',
    'signTypedData',
    'authorize',
  ])
    await assert.rejects(signer[method]({}));
});
test('retained original command guard needs an exact stopped-executor acknowledgement', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const e = await f.prepare();
  const original = f.provider.getCode;
  f.provider.getCode = async () => {
    f.source(false);
    return original();
  };
  await assert.rejects(f.session.handoff(f.review(e)), /source/);
  f.source(true);
  f.provider.getCode = original;
  await assert.rejects(f.session.inspect(), /EEXIST/);
  const recovery = f.session.inspectRecovery();
  assert.throws(() => f.session.recoverCommand('yes'), /acknowledgement/);
  assert.equal(
    f.session.recoverCommand(recovery.acknowledgement).transactionsBroadcast,
    0
  );
  assert.equal((await f.session.inspect()).operations[0].state, 'prepared');
  await f.session.handoff(f.review(e));
});
test('interrupted durable append requires exact head repair after command recovery', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const headFile = path.join(f.options.directory, 'head.json');
  const before = fs.readFileSync(headFile);
  await f.prepare();
  fs.writeFileSync(headFile, before);
  assert.equal((await f.session.inspect()).headRepairRequired, true);
  await assert.rejects(f.session.handoff({}), /journal\/head/);
  const inspected = await f.session.inspect();
  await f.session.repairHead(
    `REPAIR_JOBS_HEAD:${f.options.expectedPlanHash}:${inspected.head}`
  );
  assert.equal((await f.session.inspect()).headRepairRequired, false);
});
test('command reloads its snapshot after exclusive acquisition', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const head = path.join(f.options.directory, 'head.json'),
    events = path.join(f.options.directory, 'events');
  const initialHead = fs.readFileSync(head);
  await f.prepare();
  const preparedHead = fs.readFileSync(head),
    preparedEvent = fs.readFileSync(path.join(events, '000001.json'));
  fs.unlinkSync(path.join(events, '000001.json'));
  fs.writeFileSync(head, initialHead);
  const mkdir = fs.mkdirSync;
  let injected = false;
  fs.mkdirSync = function (file, ...args) {
    if (
      !injected &&
      file === path.join(f.options.directory, 'active-command')
    ) {
      injected = true;
      fs.writeFileSync(path.join(events, '000001.json'), preparedEvent, {
        mode: 0o600,
      });
      fs.writeFileSync(head, preparedHead);
    }
    return mkdir.call(this, file, ...args);
  };
  try {
    assert.equal((await f.session.inspect()).operations.length, 1);
  } finally {
    fs.mkdirSync = mkdir;
  }
});
test('ownerless command guard requires exact stopped-executor recovery', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const active = path.join(f.options.directory, 'active-command');
  fs.mkdirSync(active, { mode: 0o700 });
  const inspected = f.session.inspectRecovery();
  assert.ok(fs.existsSync(active));
  assert.throws(() => f.session.recoverCommand('yes'), /acknowledgement/);
  assert.equal(
    f.session.recoverCommand(inspected.acknowledgement).transactionsBroadcast,
    0
  );
  assert.equal(fs.existsSync(active), false);
});
test('SHA-256 event/head format is explicit and cached rereads never trust a supplied hash', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  await f.prepare();
  const E = require('../../scripts/deploy/external-envelope.cjs');
  const crypto = require('node:crypto');
  const events = path.join(f.options.directory, 'events');
  let previous = null;
  for (const name of fs.readdirSync(events).sort()) {
    const event = JSON.parse(fs.readFileSync(path.join(events, name), 'utf8'));
    const { hash, ...payload } = event;
    const expected =
      '0x' +
      crypto
        .createHash('sha256')
        .update(E.canonicalJson(payload))
        .digest('hex');
    assert.equal(event.schema, 'jobs-external-event-sha256-v1');
    assert.equal(event.previousHash, previous);
    assert.equal(hash, expected);
    assert.notEqual(hash, digest(payload));
    previous = hash;
  }
  const head = JSON.parse(
    fs.readFileSync(path.join(f.options.directory, 'head.json'), 'utf8')
  );
  assert.equal(head.schema, 'jobs-external-head-sha256-v1');
  assert.equal(head.hash, previous);
  // Populate the read cache, then alter payload bytes while keeping its old hash.
  await f.session.inspect();
  const file = path.join(events, '000001.json');
  const event = JSON.parse(fs.readFileSync(file, 'utf8'));
  event.details.envelope.transaction.data = '0x60016000';
  fs.writeFileSync(file, JSON.stringify(event));
  await assert.rejects(f.session.inspect(), /hash-chain/);
  // A recomputed self-supplied event/head hash still cannot approve a changed
  // envelope whose unsigned serialization and exact policy no longer match.
  const { hash, ...payload } = event;
  event.hash =
    '0x' +
    crypto.createHash('sha256').update(E.canonicalJson(payload)).digest('hex');
  fs.writeFileSync(file, JSON.stringify(event));
  fs.writeFileSync(
    path.join(f.options.directory, 'head.json'),
    JSON.stringify({ ...head, hash: event.hash })
  );
  await assert.rejects(f.session.inspect(), /serialization/);
});
test('handoff and retrieval fully revalidate envelopes even after cached journal reads', async (t) => {
  const f = fixture(t);
  await f.session.initialize();
  const envelope = await f.prepare();
  await f.session.inspect();
  const E = require('../../scripts/deploy/external-envelope.cjs');
  const original = E.buildEnvelope;
  let calls = 0;
  E.buildEnvelope = (...args) => {
    calls++;
    return original(...args);
  };
  try {
    await f.session.handoff(f.review(envelope));
    assert.equal(calls, 1);
    calls = 0;
    await f.session.retrieve();
    assert.equal(calls, 1);
  } finally {
    E.buildEnvelope = original;
  }
});

async function authorityFixture(t, external = true) {
  const f = fixture(t);
  const {
    createAuthorityHandover,
  } = require('../../scripts/deploy/authority-handover.cjs');
  const scope = {
    chainId: f.plan.chainId,
    creator: f.plan.creator,
    governance: f.plan.governor,
    campaign: {
      chainId: f.plan.chainId,
      blockNumber: 1,
      blockHash: f.plan.initialBlock.hash,
    },
    initialBlock: f.plan.initialBlock,
  };
  const plan = { ...f.plan, creationScopeHash: digest(scope) };
  const session = createExternalSession({
    ...f.options,
    plan,
    expectedPlanHash: digest(plan),
  });
  await session.initialize();
  const envelope = await session.prepare({
    key: 'create:Deployer',
    compilerInputSha256: plan.compilerInputSha256,
    transaction: {
      type: 2,
      chainId: '31337',
      nonce: 0,
      to: null,
      value: '0',
      data: '0x60006000',
      ...plan.fees,
      accessList: [],
    },
  });
  await session.handoff(f.review(envelope));
  const tx = f.mine(await f.wallet.signTransaction(envelope.transaction));
  await session.observe();
  const source = {
    source: 'contracts/v2/Deployer.sol:Deployer',
    compilerInputSha256: plan.compilerInputSha256,
    bytecode: envelope.transaction.data,
  };
  const op = {
    role: 'create:Deployer',
    name: 'Deployer',
    chainId: 31337,
    creator: plan.creator,
    value: '0',
    nonce: 0,
    to: null,
    address: ethers.getCreateAddress({ from: plan.creator, nonce: 0 }),
    dataHash: ethers.keccak256(source.bytecode),
    creationCodeHash: ethers.keccak256(source.bytecode),
    source: source.source,
    compilerInputSha256: source.compilerInputSha256,
    startBlock: 1,
    ...(external ? { externalEnvelope: envelope } : { hash: tx.hash }),
  };
  const operations = { 'create:Deployer': op };
  let checkpoints = 0,
    failCheckpoint = false,
    mutateCheckpoint = null;
  const authority = createAuthorityHandover({
    provider: f.provider,
    signer: external ? new ExternalManualSigner(f.provider, session) : {},
    runtime: {},
    chainId: 31337,
    creator: plan.creator,
    governance: plan.governor,
    token: plan.governor,
    readSource: () => source,
    operations,
    creationScope: scope,
    checkpoint: async () => {
      if (failCheckpoint) throw Error('synthetic durable write failure');
      checkpoints++;
      await Promise.resolve();
      if (mutateCheckpoint) mutateCheckpoint(operations);
    },
  });
  return {
    ...f,
    session,
    authority,
    op,
    sourceData: source,
    tx,
    count: () => checkpoints,
    mutateCheckpoint: (value) => (mutateCheckpoint = value),
    failCheckpoint: (value) => (failCheckpoint = value),
  };
}
test('external receipt deduplication preserves all live checks and direct journal behavior', async (t) => {
  const f = await authorityFixture(t);
  await f.authority.reconcile();
  assert.equal(f.count(), 1);
  let chainReads = 0;
  const send = f.provider.send;
  f.provider.send = async (...args) => {
    chainReads++;
    return send(...args);
  };
  await f.authority.reconcile();
  await f.authority.reconcile();
  assert.equal(f.count(), 1);
  assert(chainReads > 0);
  const canonical = JSON.parse(JSON.stringify(f.op.receipt));
  for (const [field, value] of Object.entries({
    hash: ethers.ZeroHash,
    blockNumber: 99,
    blockHash: ethers.ZeroHash,
    status: 0,
    contractAddress: f.plan.governor,
  })) {
    f.op.receipt[field] = value;
    const before = f.count();
    await f.authority.reconcile();
    assert.equal(f.count(), before + 1);
    assert.deepEqual(f.op.receipt, canonical);
  }
  for (const [field, value] of Object.entries({
    hash: ethers.ZeroHash,
    chainId: 1,
    source: 'wrong',
    compilerInputSha256: 'e'.repeat(64),
  })) {
    const before = f.count(),
      prior = f.op[field];
    f.op[field] = value;
    await assert.rejects(f.authority.reconcile());
    assert.equal(f.count(), before);
    f.op[field] = prior;
  }
  const receipt = f.receipts.get(f.tx.hash);
  const before = f.count();
  receipt.status = 0;
  await assert.rejects(f.authority.reconcile());
  receipt.status = 1;
  const block = f.blocks.get(2);
  const originalHash = block.hash;
  block.hash = ethers.ZeroHash;
  await assert.rejects(f.authority.reconcile());
  block.hash = originalHash;
  f.provider.send = async () => '0x1';
  await assert.rejects(f.authority.reconcile());
  f.provider.send = send;
  f.source(false);
  await assert.rejects(f.authority.reconcile());
  f.source(true);
  assert.equal(f.count(), before);
  const direct = await authorityFixture(t, false);
  await direct.authority.reconcile();
  await direct.authority.reconcile();
  assert.equal(direct.count(), 2);
});
test('external checkpoint failure cannot accept a receipt or authorize a retry', async (t) => {
  const f = await authorityFixture(t);
  f.failCheckpoint(true);
  await assert.rejects(f.authority.reconcile(), /durable write failure/);
  assert.equal(f.count(), 0);
  assert.equal((await f.session.inspect()).operations[0].state, 'observed');
  // Mutated in-process memory is not a successful durable write. Retrying
  // validation still requires checkpoint success; no new signature or relay.
  await assert.rejects(f.authority.reconcile(), /durable write failure/);
  assert.equal((await f.session.inspect()).operations[0].state, 'observed');
  f.failCheckpoint(false);
  await f.authority.reconcile();
  assert.equal(f.count(), 1);
  assert.equal((await f.session.inspect()).operations[0].state, 'accepted');
  await f.authority.reconcile();
  assert.equal(f.count(), 1);
});

test('external durable baseline cannot advance from mutation during checkpoint await', async (t) => {
  const f = await authorityFixture(t);
  f.mutateCheckpoint((operations) => {
    operations['create:Deployer'].receipt.status = 0;
  });
  await assert.rejects(
    f.authority.reconcile(),
    /changed during durable checkpoint/
  );
  assert.equal((await f.session.inspect()).operations[0].state, 'observed');
  f.mutateCheckpoint(null);
  await f.authority.reconcile();
  assert.equal(f.count(), 2);
  assert.equal((await f.session.inspect()).operations[0].state, 'accepted');
});
