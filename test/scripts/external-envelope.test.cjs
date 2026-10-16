'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { ethers } = require('ethers');
const {
  canonicalJson,
  sha256Json,
  buildEnvelope,
  importSignedEnvelope,
  requireTransactionEnvelope,
} = require('../../scripts/deploy/external-envelope.cjs');

// Public deterministic test keys only. These wallets never have a provider.
const creator = new ethers.Wallet(`0x${'11'.repeat(32)}`);
const other = new ethers.Wallet(`0x${'22'.repeat(32)}`);
const target = '0x3000000000000000000000000000000000000003';
const clone = (value) => JSON.parse(JSON.stringify(value));
const context = () => ({
  schema: 'jobs-external-operation-v1',
  campaignId: '6fa459ea-ee8a-4ca4-894e-db77e160355e',
  sourceCommit: 'bd45f34de1c1e58986aafb4b0e5c48bc155839ca',
  sourceTree: 'a49fa5d32272555e62431363f1ffd36b84ea87be',
  compilerInputSha256: 'ab'.repeat(32),
  configHash: `0x${'01'.repeat(32)}`,
  planHash: `0x${'02'.repeat(32)}`,
  creationScopeHash: `0x${'03'.repeat(32)}`,
  operationIndex: 0,
  operationKey: 'create:Deployer',
  creator: creator.address,
  governor: other.address,
  preparedAt: '2026-10-16T12:00:00.000Z',
  expiresAt: '2026-10-16T13:00:00.000Z',
});
const transaction = () => ({
  type: 2,
  chainId: '31337',
  nonce: 0,
  to: null,
  value: '0',
  data: '0x6000600055',
  gasLimit: '1000000',
  maxFeePerGas: '2000000000',
  maxPriorityFeePerGas: '1000000000',
  accessList: [],
});
const envelope = (tx = transaction(), ctx = context()) =>
  buildEnvelope({ transaction: tx, context: ctx });
const rpcTransaction = (tx = transaction()) => ({
  ...tx,
  chainId: BigInt(tx.chainId),
  value: BigInt(tx.value),
  gasLimit: BigInt(tx.gasLimit),
  maxFeePerGas: BigInt(tx.maxFeePerGas),
  maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas),
  from: creator.address,
  hash: `0x${'04'.repeat(32)}`,
  blockHash: `0x${'05'.repeat(32)}`,
  blockNumber: 1,
  index: 0,
  gasPrice: 1500000000n,
  authorizationList: null,
  blobVersionedHashes: null,
  maxFeePerBlobGas: null,
});

function rejectedBuild(section, key, value) {
  const input = { transaction: transaction(), context: context() };
  input[section][key] = value;
  assert.throws(
    () => buildEnvelope(input),
    /External envelope:/,
    `${section}.${key}`
  );
}

test('canonical JSON sorts nested keys, preserves arrays and hashes exact UTF-8 bytes', () => {
  const value = { z: [3, { b: true, a: null }], a: { x: 'λ', y: 0.5 } };
  const expected = '{"a":{"x":"λ","y":0.5},"z":[3,{"a":null,"b":true}]}';
  assert.equal(canonicalJson(value), expected);
  assert.equal(
    sha256Json(value),
    createHash('sha256').update(expected, 'utf8').digest('hex')
  );
  assert.equal(canonicalJson({ 10: 10, 2: 2 }), '{"10":10,"2":2}');
  const repeated = { a: 1 };
  assert.equal(canonicalJson([repeated, repeated]), '[{"a":1},{"a":1}]');
  assert.equal(
    canonicalJson(JSON.parse('{"__proto__":{"x":1}}')),
    '{"__proto__":{"x":1}}'
  );
});

test('canonical JSON rejects coercion, omitted fields, getters, custom prototypes and cycles', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const cyclicArray = [];
  cyclicArray.push(cyclicArray);
  let called = false;
  const getter = Object.defineProperty({}, 'data', {
    enumerable: true,
    get() {
      called = true;
      return 1;
    },
  });
  const getterArray = [1];
  Object.defineProperty(getterArray, '0', {
    get() {
      called = true;
      return 1;
    },
  });
  const extraArray = [];
  extraArray.extra = 'hidden';
  const symbolic = { [Symbol('hidden')]: 1 };
  class CustomArray extends Array {}
  for (const value of [
    undefined,
    1n,
    () => {},
    Symbol('unsupported'),
    NaN,
    Infinity,
    -Infinity,
    -0,
    Number.MAX_SAFE_INTEGER + 1,
    { omitted: undefined },
    {
      toJSON() {
        called = true;
        return {};
      },
    },
    new Date(),
    Object.create({ inherited: true }),
    Object.defineProperty({}, 'hidden', { value: 1 }),
    symbolic,
    getter,
    getterArray,
    new Array(1),
    extraArray,
    new CustomArray(),
    cyclic,
    cyclicArray,
  ]) {
    assert.throws(() => canonicalJson(value), /External envelope:/);
    assert.throws(() => sha256Json(value), /External envelope:/);
  }
  assert.equal(called, false);
});

test('builds deterministic exact unsigned bytes and independently derived policy hash', () => {
  const built = envelope();
  const expected = ethers.Transaction.from(transaction());
  assert.equal(built.schema, 'jobs-external-envelope-v1');
  assert.equal(built.unsignedHex, expected.unsignedSerialized);
  assert.equal(built.unsignedHash, ethers.keccak256(built.unsignedHex));
  const { policyHash, ...policy } = built;
  assert.equal(
    policyHash,
    ethers.keccak256(ethers.toUtf8Bytes(canonicalJson(policy)))
  );
  assert.deepEqual(built, envelope());
  assert.equal(built.context.creator, creator.address);
  assert.deepEqual(Object.keys(built).sort(), [
    'context',
    'policyHash',
    'schema',
    'transaction',
    'unsignedHash',
    'unsignedHex',
  ]);
});

test('copies and deeply freezes the prepared policy without freezing caller inputs', () => {
  const tx = transaction();
  const ctx = context();
  const built = envelope(tx, ctx);
  tx.accessList.push({ address: target, storageKeys: [] });
  tx.nonce = 3;
  ctx.operationKey = 'modified';
  assert.deepEqual(built.transaction.accessList, []);
  assert.equal(built.transaction.nonce, 0);
  assert.equal(built.context.operationKey, 'create:Deployer');
  for (const object of [
    built,
    built.context,
    built.transaction,
    built.transaction.accessList,
  ])
    assert.equal(Object.isFrozen(object), true);
  assert.throws(() => {
    built.context.creator = target;
  }, TypeError);
  assert.throws(() => {
    built.transaction.nonce = 4;
  }, TypeError);
  assert.throws(() => {
    built.transaction.accessList.push(target);
  }, TypeError);
});

test('canonicalizes address and byte casing before binding policy', () => {
  const ctx = context();
  ctx.creator = ctx.creator.toLowerCase();
  ctx.governor = ctx.governor.toLowerCase();
  ctx.sourceCommit = ctx.sourceCommit.toUpperCase();
  ctx.compilerInputSha256 = ctx.compilerInputSha256.toUpperCase();
  ctx.campaignId = ctx.campaignId.toUpperCase();
  const tx = transaction();
  tx.data = '0xABCD';
  tx.to = other.address.toLowerCase();
  const built = envelope(tx, ctx);
  assert.equal(built.context.creator, creator.address);
  assert.equal(built.context.sourceCommit, context().sourceCommit);
  assert.equal(built.context.campaignId, context().campaignId);
  assert.equal(built.transaction.data, '0xabcd');
  assert.equal(built.transaction.to, other.address);
});

test('requires every exact field and rejects every unknown field or alternate schema', () => {
  for (const section of ['transaction', 'context']) {
    for (const key of Object.keys(
      section === 'transaction' ? transaction() : context()
    )) {
      const input = { transaction: transaction(), context: context() };
      delete input[section][key];
      assert.throws(() => buildEnvelope(input), /missing or unknown/);
    }
    rejectedBuild(section, 'unexpected', true);
  }
  for (const key of ['provider', 'signer', 'authorizationList', 'raw'])
    assert.throws(
      () =>
        buildEnvelope({
          transaction: transaction(),
          context: context(),
          [key]: null,
        }),
      /unknown/
    );
  for (const value of [null, {}, [], Object.create(context())])
    assert.throws(() =>
      buildEnvelope({ transaction: transaction(), context: value })
    );
  for (const schema of [
    '',
    'jobs-external-operation-v0',
    'jobs-external-operation-v2',
    1,
  ])
    rejectedBuild('context', 'schema', schema);
  for (const field of [
    'authorizationList',
    'authorizations',
    'blobVersionedHashes',
    'maxFeePerBlobGas',
    'gasPrice',
    'from',
    'signature',
  ])
    rejectedBuild('transaction', field, []);
});

test('rejects malformed context identities, roles, operation bounds and expiry ranges', () => {
  for (const campaignId of [
    '',
    'not-a-uuid',
    '0'.repeat(32),
    '00000000-0000-0000-0000-000000000000',
  ])
    rejectedBuild('context', 'campaignId', campaignId);
  for (const field of ['sourceCommit', 'sourceTree', 'compilerInputSha256']) {
    for (const value of [
      '',
      '0x' + context()[field],
      context()[field].slice(1),
      context()[field] + '0',
      'g'.repeat(context()[field].length),
    ])
      rejectedBuild('context', field, value);
  }
  for (const field of ['configHash', 'planHash', 'creationScopeHash']) {
    for (const value of [
      '',
      context()[field].slice(2),
      context()[field].slice(0, -2),
      context()[field] + '00',
      `0x${'zz'.repeat(32)}`,
    ])
      rejectedBuild('context', field, value);
  }
  for (const field of ['creator', 'governor']) {
    for (const value of [
      ethers.ZeroAddress,
      'user.eth',
      '',
      null,
      '0x1234',
      '0x' + 'gg'.repeat(20),
    ])
      rejectedBuild('context', field, value);
  }
  rejectedBuild('context', 'governor', creator.address.toLowerCase());
  rejectedBuild('context', 'creator', other.address);
  for (const value of [-1, -0, 39, 0.5, '0', Number.MAX_SAFE_INTEGER + 1, null])
    rejectedBuild('context', 'operationIndex', value);
  for (const value of ['', ' ', ' operation', 'operation ', 'op\nkey', null, 1])
    rejectedBuild('context', 'operationKey', value);
  for (const field of ['preparedAt', 'expiresAt']) {
    for (const value of [
      '',
      0,
      null,
      '2026-10-16',
      '2026-10-16T12:00:00Z',
      '2026-10-16T12:00:00.000+00:00',
      '2026-02-30T12:00:00.000Z',
      '2026-10-16T25:00:00.000Z',
    ])
      rejectedBuild('context', field, value);
  }
  rejectedBuild('context', 'expiresAt', context().preparedAt);
  rejectedBuild('context', 'expiresAt', '2026-10-16T11:59:59.999Z');
  rejectedBuild('context', 'preparedAt', '2026-10-16T13:00:00.000Z');
  assert.equal(
    envelope(transaction(), { ...context(), operationIndex: 38 }).context
      .operationIndex,
    38
  );
});

test('rejects malformed transaction numbers, unsafe nonce, value, data, type and access list', () => {
  for (const field of [
    'chainId',
    'gasLimit',
    'maxFeePerGas',
    'maxPriorityFeePerGas',
  ]) {
    for (const value of [
      '0',
      '-1',
      '01',
      '1.5',
      '1e9',
      '0x01',
      ' 1',
      '1 ',
      '',
      1,
      1n,
      null,
      undefined,
      (1n << 256n).toString(),
    ])
      rejectedBuild('transaction', field, value);
  }
  for (const value of [
    -1,
    -0,
    0.5,
    '0',
    0n,
    null,
    undefined,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    rejectedBuild('transaction', 'nonce', value);
  for (const value of ['1', '00', '-0', '0x0', 0, 0n, null])
    rejectedBuild('transaction', 'value', value);
  for (const value of [null, '0', '0x0', '0xzz', '6000', new Uint8Array(1), 0])
    rejectedBuild('transaction', 'data', value);
  for (const value of [undefined, '', 'user.eth', '0x1234', 0])
    rejectedBuild('transaction', 'to', value);
  for (const value of [0, 1, 3, 4, '2', '0x2', null, undefined])
    rejectedBuild('transaction', 'type', value);
  for (const value of [
    null,
    undefined,
    {},
    '',
    [{ address: target, storageKeys: [] }],
  ])
    rejectedBuild('transaction', 'accessList', value);
  rejectedBuild('transaction', 'maxPriorityFeePerGas', '2000000001');
  assert.equal(
    envelope({ ...transaction(), nonce: Number.MAX_SAFE_INTEGER }).transaction
      .nonce,
    Number.MAX_SAFE_INTEGER
  );
  assert.equal(
    envelope({ ...transaction(), data: '0x' }).transaction.data,
    '0x'
  );
});

test('roundtrips offline signatures for CREATE and call with any explicit distinct creator', async () => {
  for (const [wallet, tx, ctx] of [
    [creator, transaction(), context()],
    [
      creator,
      { ...transaction(), nonce: 17, to: target, data: '0xaabbccdd' },
      context(),
    ],
    [
      other,
      { ...transaction(), chainId: '1' },
      { ...context(), creator: other.address, governor: target },
    ],
  ]) {
    const built = envelope(tx, ctx);
    const raw = await wallet.signTransaction(tx);
    const imported = importSignedEnvelope(built, raw);
    assert.deepEqual(imported, {
      hash: ethers.keccak256(raw),
      raw,
      from: wallet.address,
    });
    assert.deepEqual(Object.keys(imported).sort(), ['from', 'hash', 'raw']);
    assert.equal(Object.isFrozen(imported), true);
    assert.equal(
      requireTransactionEnvelope(clone(built), ethers.Transaction.from(raw)),
      true
    );
  }
});

test('binds all context, unsigned bytes and policy fields on import and observation', async () => {
  const built = envelope();
  const raw = await creator.signTransaction(transaction());
  const mutations = [
    ['schema', 'jobs-external-envelope-v0'],
    ['unsignedHex', built.unsignedHex + '00'],
    ['unsignedHash', ethers.ZeroHash],
    ['policyHash', ethers.ZeroHash],
  ];
  for (const [field, value] of mutations) {
    const changed = clone(built);
    changed[field] = value;
    assert.throws(() => importSignedEnvelope(changed, raw));
    assert.throws(() => requireTransactionEnvelope(changed, rpcTransaction()));
  }
  for (const field of Object.keys(built)) {
    const changed = clone(built);
    delete changed[field];
    assert.throws(() => importSignedEnvelope(changed, raw));
  }
  const changed = clone(built);
  changed.extra = true;
  assert.throws(() => importSignedEnvelope(changed, raw));
  for (const [field, value] of Object.entries({
    schema: 'jobs-external-operation-v2',
    campaignId: '6fa459ea-ee8a-4ca4-894e-db77e160355f',
    sourceCommit: '11'.repeat(20),
    sourceTree: '22'.repeat(20),
    compilerInputSha256: '33'.repeat(32),
    configHash: `0x${'44'.repeat(32)}`,
    planHash: `0x${'55'.repeat(32)}`,
    creationScopeHash: `0x${'66'.repeat(32)}`,
    operationIndex: 1,
    operationKey: 'create:Other',
    creator: target,
    governor: target,
    preparedAt: '2026-10-16T12:00:01.000Z',
    expiresAt: '2026-10-16T13:00:01.000Z',
  })) {
    const altered = clone(built);
    altered.context[field] = value;
    assert.throws(
      () => importSignedEnvelope(altered, raw),
      /External envelope:/,
      field
    );
    assert.throws(
      () => requireTransactionEnvelope(altered, rpcTransaction()),
      /External envelope:/,
      field
    );
  }
});

test('rejects signed substitutions of every payload field and the recovered sender', async () => {
  const built = envelope();
  for (const [field, value] of Object.entries({
    chainId: '1',
    nonce: 1,
    to: target,
    value: '1',
    data: '0x6001600055',
    gasLimit: '1000001',
    maxFeePerGas: '2000000001',
    maxPriorityFeePerGas: '1000000001',
    accessList: [{ address: target, storageKeys: [ethers.ZeroHash] }],
  })) {
    const raw = await creator.signTransaction({
      ...transaction(),
      [field]: value,
    });
    assert.throws(
      () => importSignedEnvelope(built, raw),
      /External envelope:/,
      field
    );
  }
  assert.throws(() => importSignedEnvelope(built, ''), /canonical/);
  const wrongSender = await other.signTransaction(transaction());
  assert.throws(() => importSignedEnvelope(built, wrongSender), /sender/);
  for (const type of [0, 1]) {
    const tx = { ...transaction(), type, gasPrice: '2000000000' };
    delete tx.maxFeePerGas;
    delete tx.maxPriorityFeePerGas;
    if (type === 0) delete tx.accessList;
    const raw = await creator.signTransaction(tx);
    assert.throws(() => importSignedEnvelope(built, raw), /type/);
  }
  const type3 = await creator.signTransaction({
    ...transaction(),
    type: 3,
    to: target,
    maxFeePerBlobGas: '1',
    blobVersionedHashes: [`0x01${'00'.repeat(31)}`],
  });
  assert.throws(() => importSignedEnvelope(built, type3), /type/);
  const type4 = await creator.signTransaction({
    ...transaction(),
    type: 4,
    to: target,
    authorizationList: [],
  });
  assert.throws(() => importSignedEnvelope(built, type4), /type/);
});

test('rejects malformed, unsigned, noncanonical and invalid signature encodings without leaking raw', async () => {
  const built = envelope();
  const raw = await creator.signTransaction(transaction());
  const fields = ethers.decodeRlp(`0x${raw.slice(4)}`);
  const encoded = (changes) => {
    const changed = [...fields];
    for (const [index, value] of Object.entries(changes))
      changed[Number(index)] = value;
    return `0x02${ethers.encodeRlp(changed).slice(2)}`;
  };
  const highS =
    0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n -
    BigInt(fields[11]);
  const highSHex = `0x${highS.toString(16).padStart(64, '0')}`;
  for (const bad of [
    undefined,
    null,
    {},
    new Uint8Array(),
    '',
    '0x',
    '0x0',
    '0xzz',
    raw.toUpperCase(),
    raw.slice(0, -2),
    raw + '00',
    built.unsignedHex,
    encoded({ 0: '0x007a69' }),
    encoded({ 1: '0x00' }),
    encoded({ 9: '0x02' }),
    encoded({ 10: '0x' }),
    encoded({ 11: '0x' }),
    encoded({ 11: highSHex }),
  ]) {
    assert.throws(
      () => importSignedEnvelope(built, bad),
      (error) => {
        assert.match(error.message, /External envelope:/);
        if (typeof bad === 'string' && bad.length > 80) {
          assert.equal(error.message.includes(bad), false);
          assert.equal(error.message.includes(bad.slice(-80)), false);
        }
        assert.equal(error.cause, undefined);
        return true;
      }
    );
  }
});

test('requires the full observed RPC payload and sender, including exact gas and fee caps', () => {
  const built = envelope();
  assert.equal(requireTransactionEnvelope(built, rpcTransaction()), true);
  const forbiddenProvider = new Proxy(
    {},
    {
      get() {
        throw new Error('Provider access is forbidden in pure envelope checks');
      },
    }
  );
  const response = new ethers.TransactionResponse(
    rpcTransaction(),
    forbiddenProvider
  );
  assert.equal(requireTransactionEnvelope(built, response), true);
  assert.equal(
    requireTransactionEnvelope(built, {
      ...transaction(),
      from: creator.address,
    }),
    true
  );
  for (const [field, value] of Object.entries({
    type: 1,
    chainId: 1n,
    nonce: 1,
    to: target,
    value: 1n,
    data: '0x6001',
    gasLimit: 1000001n,
    maxFeePerGas: 2000000001n,
    maxPriorityFeePerGas: 1000000001n,
    accessList: [{ address: target, storageKeys: [] }],
    from: other.address,
  })) {
    const changed = { ...rpcTransaction(), [field]: value };
    assert.throws(
      () => requireTransactionEnvelope(built, changed),
      /External envelope:/,
      field
    );
  }
  for (const field of [...Object.keys(transaction()), 'from']) {
    const changed = rpcTransaction();
    delete changed[field];
    changed.dataHash = ethers.keccak256(transaction().data);
    assert.throws(
      () => requireTransactionEnvelope(built, changed),
      /External envelope:/,
      field
    );
  }
  for (const field of [
    'authorizationList',
    'authorizations',
    'blobs',
    'blobVersionedHashes',
    'maxFeePerBlobGas',
  ])
    assert.throws(
      () =>
        requireTransactionEnvelope(built, { ...rpcTransaction(), [field]: [] }),
      /forbidden/
    );
  for (const value of [
    Number.MAX_SAFE_INTEGER + 1,
    -1n,
    undefined,
    null,
    '0x7a69',
  ])
    assert.throws(() =>
      requireTransactionEnvelope(built, { ...rpcTransaction(), chainId: value })
    );
  assert.throws(() => requireTransactionEnvelope(built, null));
  assert.throws(() =>
    requireTransactionEnvelope(built, { ...rpcTransaction(), accessList: null })
  );
});

test('does not treat a fresh policy checksum as independent owner review or wall-clock expiry', async () => {
  const tx = transaction();
  const ctx = context();
  ctx.preparedAt = '2000-01-01T00:00:00.000Z';
  ctx.expiresAt = '2000-01-01T01:00:00.000Z';
  const built = envelope(tx, ctx);
  // Expiry/current source and operation authorization belong to the session. The
  // pure parser must still be able to identify and retain an expired capability.
  const raw = await creator.signTransaction(tx);
  assert.equal(importSignedEnvelope(built, raw).hash, ethers.keccak256(raw));
});
