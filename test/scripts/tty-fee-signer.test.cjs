'use strict';

// Every provider and broadcast below is synthetic. The deterministic disposable
// test key signs only local fixtures; no network or real account is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspect } = require('node:util');
const { AbstractSigner, Transaction, Wallet } = require('ethers');
const {
  MAX_TRANSACTIONS,
  validateFeePolicy,
  createFeeBoundedSigner,
} = require('../../scripts/deploy/tty-fee-signer.cjs');

const DISPOSABLE_TEST_KEY = '0x' + '11'.repeat(32);
const disposableWallet = new Wallet(DISPOSABLE_TEST_KEY);
const CREATOR = disposableWallet.address;
const TARGET = '0x2222222222222222222222222222222222222222';
const SECRET_SENTINEL = 'SYNTHETIC_SECRET_DO_NOT_SERIALIZE';

function publicPolicy(overrides = {}) {
  return {
    creator: CREATOR,
    chainId: 1,
    firstNonce: 7,
    gasLimit: '50000',
    maxFeePerGas: '100',
    maxPriorityFeePerGas: '2',
    maxTotalCost: '195000000',
    maxTransactions: 39,
    ...overrides,
  };
}

function fixture({
  policy = {},
  sourceGuard,
  send,
  sign,
  estimate,
  address,
} = {}) {
  const state = {
    chainId: 1n,
    latest: 7,
    pending: 7,
    estimate: 42000n,
    changed: false,
    sent: [],
    signed: [],
    estimates: [],
    reads: [],
    guards: 0,
    secretReads: 0,
  };
  const provider = {
    async getNetwork() {
      state.reads.push('chain');
      return { chainId: state.chainId };
    },
    async getTransactionCount(who, tag) {
      assert.equal(who, CREATOR);
      state.reads.push(tag);
      return state[tag];
    },
    async estimateGas(tx) {
      state.reads.push('estimate');
      state.estimates.push(tx);
      return estimate ? estimate(tx, state) : state.estimate;
    },
    async broadcastTransaction(raw) {
      const parsed = Transaction.from(raw);
      const tx = {
        type: parsed.type,
        chainId: parsed.chainId,
        nonce: parsed.nonce,
        from: parsed.from,
        to: parsed.to,
        data: parsed.data,
        value: parsed.value,
        gasLimit: parsed.gasLimit,
        maxFeePerGas: parsed.maxFeePerGas,
        maxPriorityFeePerGas: parsed.maxPriorityFeePerGas,
        accessList: parsed.accessList,
      };
      state.sent.push(tx);
      if (send) return send(tx, state);
      state.latest += 1;
      state.pending += 1;
      return { nonce: tx.nonce, hash: parsed.hash };
    },
  };
  const wallet = {
    provider,
    get privateKey() {
      state.secretReads += 1;
      return SECRET_SENTINEL;
    },
    get signingKey() {
      state.secretReads += 1;
      return { privateKey: SECRET_SENTINEL };
    },
    async getAddress() {
      return address ? address(state) : CREATOR;
    },
    async signTransaction(tx) {
      state.reads.push('sign');
      state.signed.push(tx);
      return sign ? sign(tx, state) : disposableWallet.signTransaction(tx);
    },
    async sendTransaction() {
      throw new Error('Composite wallet submission must never be used.');
    },
  };
  const signer = createFeeBoundedSigner({
    wallet,
    policy: publicPolicy(policy),
    sourceGuard:
      sourceGuard ||
      (() => {
        state.guards += 1;
        if (state.changed) throw new Error(SECRET_SENTINEL);
      }),
  });
  const request = (overrides = {}) => ({
    to: TARGET,
    data: '0x1234',
    nonce: state.latest,
    ...overrides,
  });
  return { signer, state, provider, wallet, request };
}

async function expectHalted(f, request, code = 'ERR_TTY_FEE_REQUEST') {
  await assert.rejects(f.signer.sendTransaction(request), { code });
  assert.equal(f.signer.getBudgetState().halted, true);
  await assert.rejects(f.signer.sendTransaction(f.request()), {
    code: 'ERR_TTY_FEE_HALTED',
  });
  assert.equal(f.state.sent.length, 0);
}

test('validates and freezes a complete public policy before secret input', () => {
  const policy = publicPolicy();
  const validated = validateFeePolicy(policy);
  assert.deepEqual(validated, policy);
  assert.ok(Object.isFrozen(validated));
  assert.equal(MAX_TRANSACTIONS, 39);
  policy.gasLimit = '1';
  assert.equal(validated.gasLimit, '50000');
});

test('refuses missing/unknown policy fields and noncanonical numeric policy values', () => {
  const invalid = [
    { chainId: '1' },
    { chainId: 0 },
    { chainId: Number.MAX_SAFE_INTEGER + 1 },
    { firstNonce: '7' },
    { firstNonce: -1 },
    { firstNonce: 1.5 },
    { firstNonce: Number.MAX_SAFE_INTEGER },
    { gasLimit: 50000 },
    { gasLimit: '050000' },
    { gasLimit: '0xC350' },
    { gasLimit: '-1' },
    { gasLimit: '0' },
    { gasLimit: '1.5' },
    { maxFeePerGas: '0' },
    { maxPriorityFeePerGas: '101' },
    { maxTotalCost: '4999999' },
    { maxTotalCost: '0' },
    { maxTotalCost: '194999999' },
    { gasLimit: (1n << 256n).toString() },
    { maxTransactions: 0 },
    { maxTransactions: 40 },
    { maxTransactions: '39' },
    { creator: 'creator.eth' },
    { extra: true },
  ];
  for (const overrides of invalid) {
    assert.throws(() => validateFeePolicy(publicPolicy(overrides)), {
      code: 'ERR_TTY_FEE_POLICY',
    });
  }
  for (const key of Object.keys(publicPolicy())) {
    const policy = publicPolicy();
    delete policy[key];
    assert.throws(() => validateFeePolicy(policy), {
      code: 'ERR_TTY_FEE_POLICY',
    });
  }
});

test('policy objects with getters and prototypes are not evaluated', () => {
  let getterCalls = 0;
  const policy = publicPolicy();
  Object.defineProperty(policy, 'gasLimit', {
    get() {
      getterCalls++;
      return '50000';
    },
  });
  assert.throws(() => validateFeePolicy(policy), {
    code: 'ERR_TTY_FEE_POLICY',
  });
  assert.equal(getterCalls, 0);
  assert.throws(() => validateFeePolicy(Object.create(publicPolicy())), {
    code: 'ERR_TTY_FEE_POLICY',
  });
});

test('subclasses AbstractSigner and fills exact type-2 fields without changing explicit nonce', async () => {
  const f = fixture();
  assert.ok(f.signer instanceof AbstractSigner);
  assert.equal(await f.signer.getAddress(), CREATOR);
  assert.equal(await f.signer.getNonce('latest'), 7);
  const response = await f.signer.sendTransaction(f.request());
  assert.equal(response.nonce, 7);
  assert.deepEqual(f.state.sent[0], {
    type: 2,
    chainId: 1n,
    nonce: 7,
    from: CREATOR,
    to: TARGET,
    data: '0x1234',
    value: 0n,
    gasLimit: 50000n,
    maxFeePerGas: 100n,
    maxPriorityFeePerGas: 2n,
    accessList: [],
  });
  assert.ok(Object.isFrozen(f.state.signed[0]));
  assert.equal(Object.hasOwn(f.state.estimates[0], 'gasLimit'), false);
  assert.deepEqual(f.signer.getBudgetState(), {
    reservedTransactions: 1,
    reservedCost: '5000000',
    halted: false,
    maxTransactions: 39,
    maxTotalCost: '195000000',
  });
  assert.equal(f.state.secretReads, 0);
});

test('accepts creation and explicitly matching gas, fee, chain and empty access-list fields', async () => {
  const f = fixture();
  const tx = f.request({
    to: null,
    from: CREATOR,
    value: 0,
    type: '2',
    chainId: 1n,
    gasLimit: '50000',
    maxFeePerGas: 100n,
    maxPriorityFeePerGas: 2,
    accessList: [],
  });
  await f.signer.sendTransaction(tx);
  assert.equal(f.state.sent[0].to, null);
  const f2 = fixture();
  const creation = f2.request();
  delete creation.to;
  await f2.signer.sendTransaction(creation);
  assert.equal(f2.state.sent[0].to, null);
});

test('rejects mismatched type, chain, creator, value, fees and gas without submission', async () => {
  const invalid = [
    { type: 0 },
    { type: 1 },
    { type: 3 },
    { type: 4 },
    { type: null },
    { chainId: 2 },
    { chainId: undefined },
    { from: TARGET },
    { from: null },
    { value: 1n },
    { value: -1 },
    { value: null },
    { gasLimit: '49999' },
    { gasLimit: '50001' },
    { maxFeePerGas: '99' },
    { maxFeePerGas: '101' },
    { maxPriorityFeePerGas: '1' },
    { maxPriorityFeePerGas: '3' },
    { accessList: [[TARGET, []]] },
    { accessList: {} },
    { accessList: null },
    { to: 'example.eth' },
    { to: Promise.resolve(TARGET) },
  ];
  for (const overrides of invalid) {
    const f = fixture();
    await expectHalted(f, f.request(overrides));
  }
});

test('refuses unknown fields, including gasPrice, delegation, blob and custom fields even if null', async () => {
  for (const field of [
    'gasPrice',
    'authorizationList',
    'blobs',
    'blobVersionedHashes',
    'maxFeePerBlobGas',
    'kzg',
    'customData',
    'enableCcipRead',
  ]) {
    const f = fixture();
    await expectHalted(f, f.request({ [field]: null }));
  }
  const f = fixture();
  const tx = f.request();
  tx[Symbol('secret')] = SECRET_SENTINEL;
  await expectHalted(f, tx);
  const f2 = fixture();
  const tx2 = f2.request();
  Object.defineProperty(tx2, 'hiddenUnknown', { value: SECRET_SENTINEL });
  await expectHalted(f2, tx2);
});

test('requires explicit safe nonce and nonempty even-byte calldata', async () => {
  for (const field of ['nonce', 'data']) {
    const f = fixture();
    const tx = f.request();
    delete tx[field];
    await expectHalted(f, tx);
  }
  for (const nonce of [
    undefined,
    null,
    -1,
    1.1,
    Number.MAX_SAFE_INTEGER + 1,
    Promise.resolve(7),
    {},
  ]) {
    const f = fixture();
    await expectHalted(f, f.request({ nonce }));
  }
  for (const data of [
    undefined,
    null,
    '0x',
    '0x1',
    '0xgg',
    '1234',
    Buffer.from('1234', 'hex'),
    Promise.resolve('0x1234'),
  ]) {
    const f = fixture();
    await expectHalted(f, f.request({ data }));
  }
});

test('rejects getter-based and inherited requests without evaluating getters', async () => {
  const f = fixture();
  let called = false;
  const tx = f.request();
  Object.defineProperty(tx, 'data', {
    get() {
      called = true;
      return '0x1234';
    },
  });
  await expectHalted(f, tx);
  assert.equal(called, false);
  const f2 = fixture();
  await expectHalted(f2, Object.create(f2.request()));
});

test('snapshots a caller request before awaits', async () => {
  const f = fixture();
  const tx = f.request();
  f.wallet.getAddress = async () => {
    tx.data = '0xabcd';
    tx.nonce = 99;
    return CREATOR;
  };
  await f.signer.sendTransaction(tx);
  assert.equal(f.state.sent[0].data, '0x1234');
  assert.equal(f.state.sent[0].nonce, 7);
});

test('rejects wallet creator mismatch', async () => {
  const f = fixture({ address: () => TARGET });
  await expectHalted(f, f.request(), 'ERR_TTY_FEE_CREATOR');
});

test('rejects mismatched chain initially and chain drift during estimation', async () => {
  const f = fixture();
  f.state.chainId = 2n;
  await expectHalted(f, f.request(), 'ERR_TTY_FEE_CHAIN');
  const f2 = fixture({
    estimate: (_tx, state) => {
      state.chainId = 2n;
      return 42000n;
    },
  });
  await expectHalted(f2, f2.request(), 'ERR_TTY_FEE_CHAIN');
});

test('rejects pending nonce disagreement and journaled nonce mismatch', async () => {
  const f = fixture();
  f.state.pending = 8;
  await expectHalted(f, f.request(), 'ERR_TTY_FEE_NONCE');
  const f2 = fixture();
  await expectHalted(f2, f2.request({ nonce: 6 }), 'ERR_TTY_FEE_NONCE');
});

test('rejects post-review nonce changes even when latest and pending agree', async () => {
  const f = fixture();
  f.state.latest = 8;
  f.state.pending = 8;
  await expectHalted(f, f.request(), 'ERR_TTY_FEE_NONCE');
  assert.equal(f.state.reads.length, 0);
});

test('permits a reviewed zero first nonce and a reduced remaining invocation scope', async () => {
  const f = fixture({
    policy: { firstNonce: 0, maxTransactions: 1, maxTotalCost: '5000000' },
  });
  f.state.latest = 0;
  f.state.pending = 0;
  await f.signer.sendTransaction(f.request());
  assert.equal(f.state.sent[0].nonce, 0);
});

test('rechecks nonce after gas estimation and never replaces the journaled nonce', async () => {
  const f = fixture({
    estimate: (_tx, state) => {
      state.latest = 8;
      state.pending = 8;
      return 42000n;
    },
  });
  await expectHalted(f, f.request(), 'ERR_TTY_FEE_NONCE');
  assert.deepEqual(f.state.reads, [
    'chain',
    'latest',
    'pending',
    'estimate',
    'chain',
    'latest',
    'pending',
  ]);
});

test('sequential sends require observed mined nonces and enforce monotonic local nonce', async () => {
  const f = fixture();
  await f.signer.sendTransaction(f.request());
  await f.signer.sendTransaction(f.request());
  assert.deepEqual(
    f.state.sent.map((tx) => tx.nonce),
    [7, 8]
  );
  f.state.latest = 7;
  f.state.pending = 7;
  await assert.rejects(f.signer.sendTransaction(f.request()), {
    code: 'ERR_TTY_FEE_NONCE',
  });
  assert.equal(f.state.sent.length, 2);
});

test('gas estimate must be positive and at most the configured cap', async () => {
  for (const estimate of [0n, 50001n]) {
    const f = fixture();
    f.state.estimate = estimate;
    await expectHalted(f, f.request(), 'ERR_TTY_FEE_GAS');
  }
  const f = fixture();
  f.state.estimate = 50000n;
  await f.signer.sendTransaction(f.request());
  assert.equal(f.state.sent[0].gasLimit, 50000n);
});

test('reserves worst-case gas cost rather than the smaller estimate', async () => {
  const f = fixture({
    policy: { maxTransactions: 1, maxTotalCost: '5000000' },
  });
  f.state.estimate = 1n;
  await f.signer.sendTransaction(f.request());
  assert.equal(f.signer.getBudgetState().reservedCost, '5000000');
  await assert.rejects(f.signer.sendTransaction(f.request()), {
    code: 'ERR_TTY_FEE_BUDGET',
  });
  assert.equal(f.state.sent.length, 1);
  assert.equal(f.signer.getBudgetState().reservedCost, '5000000');
});

test('enforces the caller transaction count cap', async () => {
  const f = fixture({ policy: { maxTransactions: 1 } });
  await f.signer.sendTransaction(f.request());
  await assert.rejects(f.signer.sendTransaction(f.request()), {
    code: 'ERR_TTY_FEE_BUDGET',
  });
  assert.equal(f.state.sent.length, 1);
});

test('permits exactly 39 bounded transactions and refuses a fortieth', async () => {
  const f = fixture();
  for (let i = 0; i < 39; i++) await f.signer.sendTransaction(f.request());
  assert.equal(f.signer.getBudgetState().reservedCost, '195000000');
  await assert.rejects(f.signer.sendTransaction(f.request()), {
    code: 'ERR_TTY_FEE_BUDGET',
  });
  assert.equal(f.state.sent.length, 39);
});

test('guards before the first read and sanitizes source errors', async () => {
  const f = fixture({
    sourceGuard: () => {
      throw new Error(SECRET_SENTINEL);
    },
  });
  let error;
  try {
    await f.signer.sendTransaction(f.request());
  } catch (caught) {
    error = caught;
  }
  assert.equal(error.code, 'ERR_TTY_FEE_SOURCE');
  assert.equal(inspect(error).includes(SECRET_SENTINEL), false);
  assert.equal(f.state.reads.length, 0);
  assert.equal(f.state.sent.length, 0);
});

test('guards after an awaited wallet address, network and estimate read', async () => {
  for (const boundary of ['address', 'network', 'estimate', 'pending']) {
    const f = fixture();
    if (boundary === 'address')
      f.wallet.getAddress = async () => {
        f.state.changed = true;
        return CREATOR;
      };
    if (boundary === 'network')
      f.provider.getNetwork = async () => {
        f.state.changed = true;
        return { chainId: 1n };
      };
    if (boundary === 'estimate')
      f.provider.estimateGas = async () => {
        f.state.changed = true;
        return 42000n;
      };
    if (boundary === 'pending') {
      f.provider.getTransactionCount = async (_address, tag) => {
        if (tag === 'pending') f.state.changed = true;
        return 7;
      };
    }
    await expectHalted(f, f.request(), 'ERR_TTY_FEE_SOURCE');
  }
});

test('a false or asynchronous source guard cannot authorize signing', async () => {
  for (const sourceGuard of [
    () => false,
    async () => true,
    async () => {
      throw new Error(SECRET_SENTINEL);
    },
  ]) {
    const f = fixture({ sourceGuard });
    await expectHalted(f, f.request(), 'ERR_TTY_FEE_SOURCE');
  }
});

test('guards after awaited signing and never broadcasts if source changed while signing', async () => {
  const f = fixture({
    sign: async (tx, state) => {
      const raw = await disposableWallet.signTransaction(tx);
      state.changed = true;
      return raw;
    },
  });
  await expectHalted(f, f.request(), 'ERR_TTY_FEE_SOURCE');
  assert.equal(f.state.signed.length, 1);
  assert.equal(f.signer.getBudgetState().reservedCost, '0');
});

test('rechecks chain and latest/pending nonce after signing before any broadcast', async () => {
  for (const drift of ['chain', 'nonce', 'pending']) {
    const f = fixture({
      sign: async (tx, state) => {
        const raw = await disposableWallet.signTransaction(tx);
        if (drift === 'chain') state.chainId = 2n;
        if (drift === 'nonce') state.latest = state.pending = 8;
        if (drift === 'pending') state.pending = 8;
        return raw;
      },
    });
    await expectHalted(
      f,
      f.request(),
      drift === 'chain' ? 'ERR_TTY_FEE_CHAIN' : 'ERR_TTY_FEE_NONCE'
    );
    assert.equal(f.state.signed.length, 1);
    assert.equal(f.signer.getBudgetState().reservedTransactions, 0);
  }
});

test('source guard runs after the final awaited nonce read immediately before broadcast', async () => {
  const f = fixture();
  let pendingReads = 0;
  f.provider.getTransactionCount = async (_address, tag) => {
    if (tag === 'pending' && ++pendingReads === 3) f.state.changed = true;
    return 7;
  };
  await expectHalted(f, f.request(), 'ERR_TTY_FEE_SOURCE');
  assert.equal(f.state.signed.length, 1);
  assert.equal(f.signer.getBudgetState().reservedCost, '0');
});

test('signing is surrounded by read-only checks and broadcast happens exactly once', async () => {
  const f = fixture();
  await f.signer.sendTransaction(f.request());
  assert.deepEqual(f.state.reads, [
    'chain',
    'latest',
    'pending',
    'estimate',
    'chain',
    'latest',
    'pending',
    'sign',
    'chain',
    'latest',
    'pending',
  ]);
  assert.equal(f.state.signed.length, 1);
  assert.equal(f.state.sent.length, 1);
});

test('rejects a signed payload whose unsigned fields differ from the exact request', async () => {
  const alterations = [
    { nonce: 8 },
    { chainId: 2n },
    { to: null },
    { data: '0xabcd' },
    { value: 1n },
    { gasLimit: 50001n },
    { maxFeePerGas: 101n },
    { maxPriorityFeePerGas: 3n },
    { accessList: [{ address: TARGET, storageKeys: [] }] },
    {
      type: 1,
      gasPrice: 100n,
      maxFeePerGas: undefined,
      maxPriorityFeePerGas: undefined,
    },
  ];
  for (const alteration of alterations) {
    const f = fixture({
      sign: (tx) => disposableWallet.signTransaction({ ...tx, ...alteration }),
    });
    await expectHalted(f, f.request(), 'ERR_TTY_FEE_SIGNED');
    assert.equal(f.signer.getBudgetState().reservedCost, '0');
  }
});

test('rejects another creator signature even when every unsigned field matches', async () => {
  const differentDisposableWallet = new Wallet('0x' + '22'.repeat(32));
  const f = fixture({
    sign: (tx) => {
      const unsignedTx = { ...tx };
      delete unsignedTx.from;
      return differentDisposableWallet.signTransaction(unsignedTx);
    },
  });
  await expectHalted(f, f.request(), 'ERR_TTY_FEE_SIGNED');
  assert.equal(f.signer.getBudgetState().reservedCost, '0');
});

test('unsigned or malformed returned bytes cannot reach broadcast and errors are sanitized', async () => {
  for (const sign of [
    () => SECRET_SENTINEL,
    () => Buffer.from(SECRET_SENTINEL),
    (tx) => {
      const unsignedTx = { ...tx };
      delete unsignedTx.from;
      return Transaction.from(unsignedTx).unsignedSerialized;
    },
  ]) {
    const f = fixture({ sign });
    let error;
    try {
      await f.signer.sendTransaction(f.request());
    } catch (caught) {
      error = caught;
    }
    assert.equal(error.code, 'ERR_TTY_FEE_SIGNED');
    assert.equal(inspect(error).includes(SECRET_SENTINEL), false);
    assert.equal(f.state.sent.length, 0);
    assert.equal(f.signer.getBudgetState().reservedTransactions, 0);
    assert.equal(f.signer.getBudgetState().halted, true);
  }
});

test('wallet signing errors are sanitized, latch permanently, and reserve no broadcast exposure', async () => {
  const f = fixture({
    sign: () => {
      throw new Error(SECRET_SENTINEL);
    },
  });
  await expectHalted(f, f.request(), 'ERR_TTY_FEE_PREFLIGHT');
  assert.equal(f.signer.getBudgetState().reservedCost, '0');
});

test('source drift during submission halts and retains the entire reservation', async () => {
  const f = fixture({
    send: (_tx, state) => {
      state.changed = true;
      return { hash: 'synthetic' };
    },
  });
  await assert.rejects(f.signer.sendTransaction(f.request()), {
    code: 'ERR_TTY_FEE_SOURCE',
  });
  assert.equal(f.state.sent.length, 1);
  assert.equal(f.signer.getBudgetState().reservedCost, '5000000');
  await assert.rejects(f.signer.sendTransaction(f.request()), {
    code: 'ERR_TTY_FEE_HALTED',
  });
  assert.equal(f.state.sent.length, 1);
});

test('an ambiguous submission permanently latches, retains budget and redacts upstream errors', async () => {
  const f = fixture({
    send: () => {
      const error = new Error(SECRET_SENTINEL);
      error.transaction = SECRET_SENTINEL;
      error.cause = { privateKey: SECRET_SENTINEL };
      throw error;
    },
  });
  let error;
  try {
    await f.signer.sendTransaction(f.request());
  } catch (caught) {
    error = caught;
  }
  assert.equal(error.code, 'ERR_TTY_FEE_SUBMISSION');
  assert.equal(inspect(error).includes(SECRET_SENTINEL), false);
  assert.equal(JSON.stringify(error).includes(SECRET_SENTINEL), false);
  assert.deepEqual(Object.keys(error), ['code']);
  assert.equal(f.signer.getBudgetState().reservedTransactions, 1);
  assert.equal(f.signer.getBudgetState().reservedCost, '5000000');
  await assert.rejects(f.signer.sendTransaction(f.request()), {
    code: 'ERR_TTY_FEE_HALTED',
  });
  assert.equal(f.state.sent.length, 1);
});

test('read failures also latch and redact arbitrary provider details', async () => {
  const f = fixture();
  f.provider.getNetwork = async () => {
    throw new Error(SECRET_SENTINEL);
  };
  await expectHalted(f, f.request(), 'ERR_TTY_FEE_PREFLIGHT');
  assert.equal(f.signer.getBudgetState().reservedCost, '0');
});

test('concurrent attempts halt the in-flight preflight before any submission', async () => {
  const f = fixture();
  let resolveAddress;
  f.wallet.getAddress = () =>
    new Promise((resolve) => {
      resolveAddress = resolve;
    });
  const first = f.signer.sendTransaction(f.request());
  const firstRejected = assert.rejects(first, { code: 'ERR_TTY_FEE_HALTED' });
  await assert.rejects(f.signer.sendTransaction(f.request()), {
    code: 'ERR_TTY_FEE_CONCURRENT',
  });
  resolveAddress(CREATOR);
  await firstRejected;
  assert.equal(f.state.sent.length, 0);
});

test('a concurrent call during submission cannot send again or refund the in-flight reservation', async () => {
  let completeSubmission;
  const f = fixture({
    send: () =>
      new Promise((resolve) => {
        completeSubmission = resolve;
      }),
  });
  const first = f.signer.sendTransaction(f.request());
  const firstRejected = assert.rejects(first, { code: 'ERR_TTY_FEE_HALTED' });
  // Only yield microtasks; there are no timers, RPCs, or external state changes.
  while (!completeSubmission) await Promise.resolve();
  await assert.rejects(f.signer.sendTransaction(f.request()), {
    code: 'ERR_TTY_FEE_CONCURRENT',
  });
  completeSubmission({ hash: 'synthetic-already-submitted' });
  await firstRejected;
  assert.equal(f.state.sent.length, 1);
  assert.equal(f.signer.getBudgetState().reservedCost, '5000000');
  await assert.rejects(f.signer.sendTransaction(f.request()), {
    code: 'ERR_TTY_FEE_HALTED',
  });
  assert.equal(f.state.sent.length, 1);
});

test('wrapper serialization and inspection never access or reveal wallet secrets', async () => {
  const f = fixture();
  const serialized = JSON.stringify(f.signer);
  const inspected = inspect(f.signer, { depth: null, showHidden: true });
  assert.equal(serialized.includes(SECRET_SENTINEL), false);
  assert.equal(inspected.includes(SECRET_SENTINEL), false);
  assert.equal(serialized.includes(DISPOSABLE_TEST_KEY), false);
  assert.equal(inspected.includes(DISPOSABLE_TEST_KEY), false);
  assert.equal(f.state.secretReads, 0);
  assert.deepEqual(Object.keys(f.signer), ['provider']);
  assert.equal(f.signer.wallet, undefined);
  assert.equal(f.signer.privateKey, undefined);
  assert.equal(f.signer.signingKey, undefined);
  assert.ok(Object.isFrozen(f.signer));
  assert.ok(Object.isFrozen(f.signer.getBudgetState()));
});

test('direct signing, authorization and reconnect paths are unavailable and halt the signer', async () => {
  for (const method of [
    'signTransaction',
    'signMessage',
    'signTypedData',
    'authorize',
  ]) {
    const f = fixture();
    await assert.rejects(f.signer[method]({}), { code: 'ERR_TTY_FEE_METHOD' });
    await assert.rejects(f.signer.sendTransaction(f.request()), {
      code: 'ERR_TTY_FEE_HALTED',
    });
    assert.equal(f.state.sent.length, 0);
  }
  const f = fixture();
  assert.throws(() => f.signer.connect(f.provider), {
    code: 'ERR_TTY_FEE_METHOD',
  });
  await assert.rejects(f.signer.sendTransaction(f.request()), {
    code: 'ERR_TTY_FEE_HALTED',
  });
});

test('missing source guard and disconnected wallets fail closed', () => {
  const f = fixture();
  assert.throws(
    () => createFeeBoundedSigner({ wallet: f.wallet, policy: publicPolicy() }),
    { code: 'ERR_TTY_FEE_SETUP' }
  );
  assert.throws(
    () =>
      createFeeBoundedSigner({
        wallet: {},
        policy: publicPolicy(),
        sourceGuard() {},
      }),
    { code: 'ERR_TTY_FEE_SETUP' }
  );
});
