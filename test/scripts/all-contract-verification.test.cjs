'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const ethers = require('ethers');
const {
  inspectSources,
} = require('../../scripts/verification/source-inventory.cjs');
const {
  archiveVerification,
} = require('../../scripts/deploy/archive-verification.cjs');
const E = require('../../scripts/verification/evidence.cjs');
const {
  reconcile,
  journalTransactions,
} = require('../../scripts/verification/reconcile.cjs');
const {
  qualify,
  assertQualifiedActivation,
  REQUIRED_MODULES,
} = require('../../scripts/verification/qualification.cjs');
const {
  parseArgs,
  loadManifest,
} = require('../../scripts/verification/verify-release.cjs');
const policy = require('../../config/solidity-compiler.json');
const address = (n) => '0x' + n.toString(16).padStart(40, '0'),
  hash = (n) => '0x' + n.toString(16).padStart(64, '0');
function buildFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'all-contract-verification-')
  );
  const build = {
    solcVersion: policy.version,
    solcLongVersion: policy.longVersion,
    input: {
      language: 'Solidity',
      settings: {
        viaIR: true,
        optimizer: { enabled: true, runs: 200 },
        evmVersion: 'cancun',
      },
      sources: {},
    },
    output: { contracts: {}, sources: {}, errors: [] },
  };
  let next = 1;
  function add(
    name,
    {
      source = `contracts/v2/${name}.sol`,
      kind = 'contract',
      abstract = false,
      abi = [],
      links = {},
    } = {}
  ) {
    const id = next++,
      content = `// fixture ${id}\n${kind} ${name} {}`;
    build.input.sources[source] = { content };
    build.output.sources[source] = {
      ast: {
        nodes: [
          {
            nodeType: 'ContractDefinition',
            name,
            contractKind: kind,
            abstract,
          },
        ],
      },
    };
    const bytecode = Object.keys(links).length
      ? '__$' + 'a'.repeat(34) + '$__'
      : `60${id.toString(16).padStart(2, '0')}`;
    const c = {
      abi,
      evm: {
        bytecode: { object: bytecode, linkReferences: links },
        deployedBytecode: {
          object: `60${id.toString(16).padStart(2, '0')}`,
          linkReferences: {},
          immutableReferences: {},
        },
      },
    };
    build.output.contracts[source] = { [name]: c };
    const dir = path.join(root, 'artifacts', source);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.dirname(path.join(root, source)), { recursive: true });
    fs.writeFileSync(path.join(root, source), content);
    fs.writeFileSync(
      path.join(dir, `${name}.json`),
      JSON.stringify({
        contractName: name,
        sourceName: source,
        abi,
        bytecode: '0x' + bytecode,
        deployedBytecode: '0x' + c.evm.deployedBytecode.object,
      })
    );
    fs.writeFileSync(
      path.join(dir, `${name}.dbg.json`),
      JSON.stringify({
        buildInfo: path.relative(
          dir,
          path.join(root, 'artifacts/build-info/fixture.json')
        ),
      })
    );
    return { name, source, fq: `${source}:${name}`, compiled: c };
  }
  const core = [
    'JobRegistry',
    'StakeManager',
    'ValidationModule',
    'Deployer',
  ].map((name) => add(name));
  const optional = add('AuditModule');
  function save() {
    fs.mkdirSync(path.join(root, 'artifacts/build-info'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'artifacts/build-info/fixture.json'),
      JSON.stringify(build)
    );
  }
  save();
  return {
    root,
    build,
    add,
    save,
    optional,
    core,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
// Test-only deterministic representations of the two supported RPC trace formats.
function traceResponse(raw, transaction, receipt, options) {
  const trace = structuredClone(raw);
  function complete(frame, from, input) {
    frame.from ||= from;
    frame.input ??= input || '0x';
    frame.gas ??= '0x100000';
    frame.gasUsed ??= '0x100';
    frame.output ??= '0x';
    for (const child of frame.calls || []) complete(child, frame.to, '0x');
  }
  complete(trace, transaction.from, transaction.data);
  if (options?.tracer) return trace;
  return require('./trace-fixtures.cjs').opcodeFixture(trace);
}
function protocolFixture() {
  const contracts = new Map(),
    txs = new Map(),
    receipts = new Map(),
    code = new Map(),
    states = new Map();
  const gov = address(700),
    sender = address(800),
    pauseAddress = address(100);
  const getters = (names) =>
    names.map((name) => ({
      type: 'function',
      name,
      inputs: [],
      outputs: [{ type: name === 'paused' ? 'bool' : 'address' }],
      stateMutability: 'view',
    }));
  let index = 0;
  function add(
    name,
    { at, abi = [], ctor = [], runtime, immutables = {} } = {}
  ) {
    const n = ++index,
      addr = at || address(100 + n),
      fq = `contracts/v2/${name}.sol:${name}`;
    if (ctor.length)
      abi = [
        { type: 'constructor', inputs: ctor, stateMutability: 'nonpayable' },
        ...abi,
      ];
    const input = {
      language: 'Solidity',
      sources: {
        [`contracts/v2/${name}.sol`]: { content: `contract ${name} {}` },
      },
      settings: {
        viaIR: true,
        optimizer: { enabled: true, runs: 200 },
        evmVersion: 'cancun',
      },
    };
    const artifact = {
      fullyQualified: fq,
      contract: name,
      source: `contracts/v2/${name}.sol`,
      artifact: {
        abi,
        bytecode: `0x61${n.toString(16).padStart(4, '0')}`,
        deployedBytecode: runtime || `0x60${n.toString(16).padStart(2, '0')}`,
      },
      build: { solcLongVersion: policy.longVersion },
      compiled: {
        evm: {
          bytecode: { linkReferences: {} },
          deployedBytecode: {
            linkReferences: {},
            immutableReferences: immutables,
          },
        },
      },
      input,
      artifactSha256: hash(n),
      buildSha256: hash(n + 20),
      standardInputSha256: hash(n + 40),
    };
    contracts.set(fq, artifact);
    const args = ctor.length
      ? ethers.AbiCoder.defaultAbiCoder().encode(
          ctor.map((i) => i.type),
          [42]
        )
      : '0x';
    const tx = {
      hash: hash(n),
      from: sender,
      to: null,
      nonce: n,
      chainId: 1n,
      data: artifact.artifact.bytecode + args.slice(2),
    };
    txs.set(tx.hash, tx);
    receipts.set(tx.hash, {
      hash: tx.hash,
      contractAddress: addr,
      blockNumber: n,
      blockHash: hash(1000 + n),
      status: 1,
      logs: [],
    });
    code.set(E.lower(addr), artifact.artifact.deployedBytecode);
    states.set(E.lower(addr), { owner: pauseAddress, paused: true });
    return { artifact, tx, address: addr, fq, args };
  }
  const pause = add('SystemPause', {
    at: pauseAddress,
    abi: getters(['owner', 'governance', ...REQUIRED_MODULES]),
  });
  const modules = REQUIRED_MODULES.map((name) => {
    const record = add(name[0].toUpperCase() + name.slice(1), {
      abi: getters(['owner', 'paused']),
    });
    states.get(E.lower(pauseAddress))[name] = record.address;
    return record;
  });
  Object.assign(states.get(E.lower(pauseAddress)), {
    owner: gov,
    governance: gov,
  });
  let head = 30;
  const provider = {
    async getNetwork() {
      return { chainId: 1n };
    },
    async getBlockNumber() {
      return head;
    },
    async getBlock(number) {
      return {
        number,
        hash: hash(1000 + Number(number)),
        transactions: [...receipts]
          .filter(([, r]) => r.blockNumber === Number(number))
          .map(([h]) => h),
      };
    },
    async getTransaction(h) {
      return txs.get(h) || null;
    },
    async getTransactionReceipt(h) {
      return receipts.get(h) || null;
    },
    async getCode(a) {
      return code.get(E.lower(a)) || '0x';
    },
    async call({ to, data }) {
      const contract = [...contracts.values()].find((a) => {
        try {
          return new ethers.Interface(a.artifact.abi).parseTransaction({
            data,
          });
        } catch {
          return false;
        }
      });
      assert(contract, 'Unknown getter');
      const iface = new ethers.Interface(contract.artifact.abi),
        fn = iface.parseTransaction({ data }).name;
      const value = states.get(E.lower(to))[fn];
      return iface.encodeFunctionResult(`${fn}()`, [value]);
    },
    async send(method, [hash, options]) {
      assert.equal(method, 'debug_traceTransaction');
      const tx = txs.get(hash),
        r = receipts.get(hash);
      return traceResponse(
        {
          type: tx.to ? 'CALL' : 'CREATE',
          to: tx.to || r.contractAddress,
          input: tx.data,
          output: code.get(E.lower(r.contractAddress)) || '0x',
        },
        tx,
        r,
        options
      );
    },
  };
  const archive = { indexSha256: hash(900), contracts };
  const manifest = {
    schema: 'agijobsv0/verification-manifest/1',
    chainId: '1',
    releaseId: 'release-test-123',
    archiveSha256: archive.indexSha256,
    minConfirmations: 2,
    maxQualificationAgeBlocks: 20,
    scanFromBlock: 1,
    senders: [sender],
    coordinators: [],
    transactions: [...txs.values()].map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      nonce: tx.nonce,
      chainId: '1',
      input: tx.data,
    })),
    activation: {
      systemPause: pauseAddress,
      governance: gov,
      operation: 'unpauseAll',
    },
    reused: [],
  };
  const metadata = (entry, artifact) => ({
    SourceCode: JSON.stringify(artifact.input),
    ABI: '[]',
    CompilerVersion: 'v' + policy.longVersion,
    ContractName: artifact.contract,
    ConstructorArguments: entry?.constructorArguments?.slice(2) || '',
    OptimizationUsed: '1',
    Runs: '200',
    EVMVersion: 'cancun',
  });
  const explorer = {
    async read(_chain, a) {
      const r = receipts.values();
      let receipt;
      for (const x of r)
        if (E.lower(x.contractAddress) === E.lower(a)) receipt = x;
      const tx = txs.get(receipt.hash);
      const entry =
        require('../../scripts/verification/reconcile.cjs').matchCreation(
          tx.data,
          archive
        );
      return metadata(entry, contracts.get(entry.fullyQualified));
    },
    async submit() {
      throw Error('Must not submit in read-only tests');
    },
  };
  const run = () => reconcile({ provider, archive, manifest, explorer });
  return {
    contracts,
    txs,
    receipts,
    code,
    states,
    provider,
    archive,
    manifest,
    explorer,
    metadata,
    run,
    add,
    pause,
    modules,
    sender,
    gov,
    setHead: (n) => {
      head = n;
    },
  };
}
test('source-driven completeness detects missing optional output despite all four core artifacts', () => {
  const f = buildFixture();
  try {
    assert.equal(inspectSources(f.root).contracts.length, 5);
    fs.unlinkSync(
      path.join(f.root, 'artifacts', f.optional.source, 'AuditModule.json')
    );
    assert.throws(
      () => inspectSources(f.root),
      /Incomplete development artifact.*AuditModule/
    );
  } finally {
    f.cleanup();
  }
});
test('new or stale source fails inventory independently of existing artifacts', () => {
  const f = buildFixture();
  try {
    fs.writeFileSync(
      path.join(f.root, 'contracts/v2/New.sol'),
      'contract New {}'
    );
    assert.throws(
      () => inspectSources(f.root),
      /Missing\/stale compiler source output/
    );
  } finally {
    f.cleanup();
  }
});
test('external library artifacts are recursively required; inline libraries need no addresses', () => {
  const f = buildFixture();
  try {
    f.add('Inline', { kind: 'library' });
    const lib = f.add('Linked', { kind: 'library' });
    f.add('Consumer', {
      links: { [lib.source]: { Linked: [{ start: 0, length: 20 }] } },
    });
    f.save();
    const inventory = inspectSources(f.root);
    assert.equal(
      inventory.contracts.find((c) => c.contract === 'Linked').classification,
      'externally-linked-library'
    );
    assert.equal(
      inventory.contracts.find((c) => c.contract === 'Inline').classification,
      'inline-library'
    );
    fs.unlinkSync(path.join(f.root, 'artifacts', lib.source, 'Linked.json'));
    assert.throws(
      () => inspectSources(f.root),
      /Incomplete development artifact.*Linked/
    );
  } finally {
    f.cleanup();
  }
});
test('archive is immutable, exhaustive, hash-bound and rejects diagnostic compiler normalization', () => {
  const f = buildFixture();
  try {
    const out = path.join(f.root, 'archive'),
      r = archiveVerification(out, f.root);
    assert.equal(E.readArchive(out, r.indexSha256).contracts.size, 5);
    assert.throws(() => archiveVerification(out, f.root), /EEXIST/);
    const index = JSON.parse(fs.readFileSync(path.join(out, 'index.json')));
    fs.chmodSync(path.join(out, index.contracts[0].artifact), 0o600);
    fs.appendFileSync(path.join(out, index.contracts[0].artifact), ' ');
    assert.throws(() => E.readArchive(out, r.indexSha256), /hash mismatch/);
    f.build.diagnostic = true;
    f.build.compilerProvenance = {
      diagnostic: true,
      actualVersion: policy.longVersion + '.Emscripten.clang',
    };
    f.save();
    assert.throws(
      () => archiveVerification(path.join(f.root, 'diagnostic'), f.root),
      /Production artifacts/
    );
    f.build.solcLongVersion = policy.longVersion + '.Emscripten.clang';
    f.save();
    assert.equal(
      inspectSources(f.root, { diagnostic: true }).canonicalCompilerQualified,
      false
    );
  } finally {
    f.cleanup();
  }
});
test('all actual creations qualify and exact already-verified source succeeds idempotently', async () => {
  const f = protocolFixture(),
    report = await f.run();
  assert.deepEqual(report.blockers, []);
  const receipt = await qualify({ ...f, report });
  await assertQualifiedActivation({ ...f, receipt, target: f.pause.address });
  const repeat = await f.run();
  assert.deepEqual(report.creations, repeat.creations);
});
test('explorer timeout, skipped, constructor and similar-source mismatch never qualify', async () => {
  for (const mode of [
    'timeout',
    'skipped',
    'constructor',
    'source',
    'compiler',
  ]) {
    const f = protocolFixture(),
      read = f.explorer.read;
    f.explorer.read = async (...args) => {
      if (mode === 'timeout')
        throw Object.assign(Error('https://secret:key@rpc.example/API_TOKEN'), {
          code: 'ETIMEDOUT',
        });
      const m = await read(...args);
      if (mode === 'skipped') m.SourceCode = '';
      if (mode === 'constructor') m.ConstructorArguments = 'ff';
      if (mode === 'source')
        m.SourceCode = m.SourceCode.replace(
          'contract SystemPause {}',
          'contract SystemPause { }'
        );
      if (mode === 'compiler') m.CompilerVersion = 'v0.8.25';
      return m;
    };
    const report = await f.run();
    assert(report.blockers.length, mode);
    await assert.rejects(
      () => qualify({ ...f, report }),
      /Incomplete verification/
    );
    assert(!JSON.stringify(report).includes('API_TOKEN'));
  }
});
test('submitted success or already-verified messages do not replace exact source matching', async () => {
  const f = protocolFixture(),
    entry = {
      fullyQualified: f.pause.fq,
      address: f.pause.address,
      constructorArguments: '0x',
    };
  const artifact = f.pause.artifact;
  const good = f.metadata(entry, artifact);
  assert.equal(E.compareExplorer(entry, artifact, good).status, 'verified');
  assert.throws(
    () =>
      E.compareExplorer(entry, artifact, {
        ...good,
        ConstructorArguments: 'ff',
      }),
    /constructor/
  );
  const client = {
    read: async () => ({ SourceCode: '' }),
    submit: async () => ({ status: 'submitted-unconfirmed', accepted: true }),
  };
  assert.equal(
    (await E.verifyExplorer(client, 1, entry, artifact, { submit: true }))
      .status,
    'submitted-unconfirmed'
  );
});
test('interruption after receipt recovers orphan and duplicate same-name instances from blocks, without signer/deploy', async () => {
  const f = protocolFixture();
  const orphan = f.add('AuditModule');
  const first = await f.run();
  assert(first.creations.some((c) => c.address === orphan.address));
  const duplicate = { ...orphan.tx, hash: hash(90), nonce: 90 };
  f.txs.set(duplicate.hash, duplicate);
  f.receipts.set(duplicate.hash, {
    hash: duplicate.hash,
    contractAddress: address(990),
    blockNumber: 20,
    blockHash: hash(1020),
    status: 1,
    logs: [],
  });
  f.code.set(address(990), orphan.artifact.artifact.deployedBytecode);
  f.states.set(address(990), {});
  const second = await f.run();
  assert.equal(
    second.creations.filter((c) => c.fullyQualified === orphan.fq).length,
    2
  );
  assert.equal(
    second.transactions.find((t) => t.hash === orphan.tx.hash).status,
    'canonical-success'
  );
  assert.deepEqual(second.blockers, []);
});
test('pending, missing/dropped, reverted, replaced and reorged receipts are explicit and fail closed when unresolved', async () => {
  for (const mode of ['pending', 'missing', 'revert', 'reorg']) {
    const f = protocolFixture(),
      key = f.pause.tx.hash;
    if (mode === 'pending') f.receipts.delete(key);
    if (mode === 'missing') {
      f.receipts.delete(key);
      f.txs.delete(key);
    }
    if (mode === 'revert') f.receipts.get(key).status = 0;
    if (mode === 'reorg') f.receipts.get(key).blockHash = hash(555);
    const r = await f.run();
    assert.equal(
      r.transactions.find((t) => t.hash === key).status,
      {
        pending: 'pending',
        missing: 'unresolved',
        revert: 'canonical-revert',
        reorg: 'unresolved',
      }[mode]
    );
    if (mode !== 'revert') assert(r.blockers.length);
    await assert.rejects(() => qualify({ ...f, report: r }));
  }
  const f = protocolFixture(),
    original = f.pause.tx;
  f.receipts.delete(original.hash);
  const tx = { ...original, hash: hash(99) };
  f.txs.set(tx.hash, tx);
  f.receipts.set(tx.hash, {
    hash: tx.hash,
    contractAddress: f.pause.address,
    blockNumber: 20,
    blockHash: hash(1020),
    status: 1,
    logs: [],
  });
  f.manifest.transactions.push({ hash: tx.hash });
  f.manifest.replacements = [
    { originalHash: original.hash, replacementHash: tx.hash },
  ];
  const r = await f.run();
  assert.equal(
    r.transactions.find((t) => t.hash === original.hash).status,
    'replaced'
  );
  assert.deepEqual(r.blockers, []);
});
test('wrong chain, journal sender/nonce/input, and insufficient finality refuse qualification', async () => {
  const f = protocolFixture();
  f.provider.getNetwork = async () => ({ chainId: 2n });
  await assert.rejects(f.run, /Wrong chain/);
  for (const key of ['from', 'nonce', 'input']) {
    const x = protocolFixture();
    x.manifest.transactions[0][key] =
      key === 'from' ? address(999) : key === 'nonce' ? 999 : '0x00';
    assert((await x.run()).blockers.length);
  }
  const x = protocolFixture();
  x.manifest.minConfirmations = 100;
  assert((await x.run()).blockers.length);
});
test('immutable and library substitutions are exact and require canonical creation trace evidence', () => {
  const f = protocolFixture(),
    a = f.pause.artifact;
  a.artifact.deployedBytecode = '0x600000';
  a.compiled.evm.deployedBytecode.immutableReferences = {
    7: [{ start: 1, length: 2 }],
  };
  const entry = { address: f.pause.address, libraries: {} };
  assert.throws(() => E.exactRuntime(entry, a, '0x601234'), /trace output/);
  assert.equal(
    E.exactRuntime(entry, a, '0x601234', '0x601234').immutableSubstitutions[
      '7'
    ],
    '0x1234'
  );
  assert.throws(
    () => E.exactRuntime(entry, a, '0x611234', '0x611234'),
    /Runtime bytecode mismatch/
  );
  assert.throws(
    () =>
      E.linkedCode(
        '0x' + '0'.repeat(40),
        { 'L.sol': { L: [{ start: 0, length: 20 }] } },
        {}
      ),
    /Missing linked library/
  );
});
test('tampering receipt, archive binding, runtime, state, address, operation, or adding new orphan rejects activation', async () => {
  for (const mode of [
    'digest',
    'manifest',
    'runtime',
    'state',
    'target',
    'operation',
    'orphan',
    'stale',
  ]) {
    const f = protocolFixture(),
      report = await f.run(),
      receipt = await qualify({ ...f, report });
    let target = f.pause.address,
      operation = 'unpauseAll';
    if (mode === 'digest') receipt.payload.releaseId = 'wrong';
    if (mode === 'manifest') f.manifest.archiveSha256 = hash(777);
    if (mode === 'runtime') f.code.set(E.lower(f.pause.address), '0x6000');
    if (mode === 'state')
      f.states.get(E.lower(f.modules[0].address)).paused = false;
    if (mode === 'target') target = address(333);
    if (mode === 'operation') operation = 'pauseAll';
    if (mode === 'orphan') f.add('AuditModule');
    if (mode === 'stale') f.setHead(100);
    await assert.rejects(
      () => assertQualifiedActivation({ ...f, receipt, target, operation }),
      undefined,
      mode
    );
  }
});
test('journal snapshots retain all hashes and duplicate-name creation attempts', () => {
  const r = journalTransactions([
    {
      transactions: [{ name: 'L', hash: hash(1) }],
      creationAttempts: [{ address: address(1) }],
    },
    {
      transactions: [{ name: 'L', hash: hash(2) }],
      creationAttempts: [{ address: address(2) }],
    },
  ]);
  assert.equal(r.transactions.length, 2);
  assert.equal(r.creationAttempts.length, 2);
});
test('read-only CLI defaults and public-safe diagnostics contain no credential URLs or API keys', () => {
  assert.equal(
    parseArgs(['--manifest', 'm', '--archive', 'a', '--output', 'o']).submit,
    false
  );
  assert.throws(() => parseArgs(['--execute']), /Unknown/);
  const error = Object.assign(
    Error('https://user:secret@rpc/v3/API_SECRET?apiKey=key'),
    { code: 'TIMEOUT' }
  );
  assert.deepEqual(E.safeError(error), {
    code: 'TIMEOUT',
    message:
      'Verification could not be completed. Inspect the provider privately and retry with the retained inputs.',
  });
});
module.exports = { buildFixture, protocolFixture };
test('coordinator receipt without contractAddress reconciles events, current mapping, commitment and internal CREATE trace', async () => {
  const f = protocolFixture(),
    coordinator = f.add('Deployer', { at: address(950) }),
    iface = new ethers.Interface(
      require('../../scripts/verification/reconcile.cjs').COORDINATOR_ABI
    ),
    componentId = ethers.id('SystemPause'),
    initcode = f.pause.tx.data;
  const tx = f.pause.tx;
  tx.to = coordinator.address;
  tx.data = iface.encodeFunctionData('deployComponent', [
    componentId,
    initcode,
    true,
  ]);
  f.manifest.transactions[0].input = tx.data;
  f.manifest.coordinators = [coordinator.address];
  const event = iface.encodeEventLog(iface.getEvent('ComponentDeployed'), [
      componentId,
      f.pause.address,
      ethers.keccak256(initcode),
    ]),
    r = f.receipts.get(tx.hash);
  Object.assign(r, {
    contractAddress: null,
    blockNumber: 20,
    blockHash: hash(1020),
    logs: [{ address: coordinator.address, ...event }],
  });
  const read = f.explorer.read;
  f.explorer.read = async (chain, address) =>
    address === f.pause.address
      ? f.metadata({ constructorArguments: '0x' }, f.pause.artifact)
      : read(chain, address);
  const call = f.provider.call,
    send = f.provider.send;
  f.provider.call = async (request) => {
    if (request.to !== coordinator.address) return call(request);
    const name = iface.parseTransaction({ data: request.data }).name;
    return iface.encodeFunctionResult(name, [
      name === 'components' ? f.pause.address : ethers.keccak256(initcode),
    ]);
  };
  f.provider.send = async (method, args) =>
    args[0] === tx.hash
      ? traceResponse(
          {
            type: 'CALL',
            to: coordinator.address,
            calls: [
              {
                type: 'CREATE',
                to: f.pause.address,
                input: initcode,
                output: f.pause.artifact.artifact.deployedBytecode,
              },
            ],
          },
          f.txs.get(args[0]),
          f.receipts.get(args[0]),
          args[1]
        )
      : send(method, args);
  const report = await f.run();
  assert.deepEqual(report.blockers, []);
  assert.equal(
    report.creations.find((c) => c.address === f.pause.address).kind,
    'coordinator'
  );
  r.logs = [];
  const recovered = await f.run();
  assert(
    recovered.creations.some(
      (c) => c.address === f.pause.address && c.kind === 'internal-trace'
    )
  );
  f.provider.send = async () => {
    throw Object.assign(
      Error('trace unavailable at https://api-key.example/SECRET'),
      { code: 'UNSUPPORTED_OPERATION' }
    );
  };
  const blocked = await f.run();
  assert(blocked.blockers.length);
  assert(!JSON.stringify(blocked).includes('SECRET'));
});
test('constructor-created child addresses are retained even without an application event', async () => {
  const f = protocolFixture(),
    child = f.add('NestedOptional'),
    childTx = child.tx;
  f.txs.delete(childTx.hash);
  f.receipts.delete(childTx.hash);
  f.manifest.transactions[0].fullyQualified = f.pause.fq;
  f.manifest.transactions[0].constructorArguments = '0x';
  const originalSend = f.provider.send;
  f.provider.send = async (method, args) => {
    const trace = await originalSend(method, [
      args[0],
      { tracer: 'callTracer' },
    ]);
    if (args[0] === f.pause.tx.hash)
      trace.calls = [
        {
          type: 'CREATE',
          to: child.address,
          input: childTx.data,
          output: child.artifact.artifact.deployedBytecode,
        },
      ];
    return traceResponse(
      trace,
      f.txs.get(args[0]),
      f.receipts.get(args[0]),
      args[1]
    );
  };
  const read = f.explorer.read;
  f.explorer.read = async (chain, address) =>
    address === child.address
      ? f.metadata({ constructorArguments: '0x' }, child.artifact)
      : read(chain, address);
  const report = await f.run();
  assert.deepEqual(report.blockers, []);
  assert(
    report.creations.some(
      (c) =>
        c.address === child.address &&
        c.transactionHash === f.pause.tx.hash &&
        c.kind === 'internal-trace'
    )
  );
});
test('manifest input binds every retained journal transaction and refuses altered journal bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-binding-'));
  try {
    const j = path.join(root, 'journal.jsonl'),
      m = path.join(root, 'manifest.json');
    fs.writeFileSync(
      j,
      JSON.stringify({
        chainId: '1',
        transactions: [
          { hash: hash(1), from: address(1), nonce: 3, input: '0x1234' },
        ],
      }) + '\n'
    );
    const manifest = {
      chainId: '1',
      journals: [
        { file: 'journal.jsonl', sha256: E.sha256(fs.readFileSync(j)) },
      ],
      transactions: [],
    };
    fs.writeFileSync(m, JSON.stringify(manifest));
    assert.throws(() => loadManifest(m), /omitted journal/);
    manifest.transactions = [
      { hash: hash(1), from: address(1), nonce: 3, input: '0x1234' },
    ];
    fs.writeFileSync(m, JSON.stringify(manifest));
    assert.equal(loadManifest(m).transactions.length, 1);
    fs.appendFileSync(j, '\n');
    assert.throws(() => loadManifest(m), /Journal hash mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('linked source/address dependency must itself be exactly verified; altered link/immutable evidence is rejected', async () => {
  const f = protocolFixture();
  const library = f.add('ExternalLibrary');
  const consumer = f.add('LibraryConsumer');
  const librarySource = library.fq.split(':')[0];
  consumer.artifact.artifact.bytecode = '0x73__$' + 'a'.repeat(34) + '$__60aa';
  consumer.artifact.compiled.evm.bytecode.linkReferences = {
    [librarySource]: { ExternalLibrary: [{ start: 1, length: 20 }] },
  };
  consumer.tx.data = '0x73' + library.address.slice(2) + '60aa';
  f.manifest.libraries = { [library.fq]: library.address };
  const read = f.explorer.read;
  f.explorer.read = async (chain, address) =>
    address === consumer.address
      ? {
          ...f.metadata({ constructorArguments: '0x' }, consumer.artifact),
          SourceCode: JSON.stringify(
            E.explorerInput(
              { libraries: f.manifest.libraries },
              consumer.artifact
            )
          ),
        }
      : read(chain, address);
  const report = await f.run();
  assert.deepEqual(report.blockers, []);
  assert.equal(
    report.creations.find((c) => c.address === consumer.address).libraries[
      library.fq
    ],
    library.address
  );
  const receipt = await qualify({ ...f, report });
  for (const field of ['librariesSha256', 'immutableSha256']) {
    const altered = structuredClone(receipt);
    altered.payload.report.creations[0][field] = hash(876);
    altered.payload.payloadSha256 = undefined;
    delete altered.payload.payloadSha256;
    altered.payloadSha256 = E.digest(altered.payload);
    await assert.rejects(() =>
      assertQualifiedActivation({
        ...f,
        receipt: altered,
        target: f.pause.address,
      })
    );
  }
  f.explorer.read = async (chain, address) =>
    address === library.address
      ? { SourceCode: '' }
      : address === consumer.address
      ? {
          ...f.metadata({ constructorArguments: '0x' }, consumer.artifact),
          SourceCode: JSON.stringify(
            E.explorerInput(
              { libraries: f.manifest.libraries },
              consumer.artifact
            )
          ),
        }
      : read(chain, address);
  const blocked = await f.run();
  assert(
    blocked.blockers.some((message) => message.includes('linked library'))
  );
});

test('unreviewed attached optional dependencies block activation; reviewed reuse never becomes a new creation', async () => {
  const f = protocolFixture();
  const optional = address(4000);
  f.code.set(optional, '0x600a');
  f.modules[0].artifact.artifact.abi.push({
    type: 'function',
    name: 'auditModule',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  });
  f.states.get(E.lower(f.modules[0].address)).auditModule = optional;
  const report = await f.run();
  await assert.rejects(
    () => qualify({ ...f, report }),
    /Unreviewed attached dependency/
  );
  f.manifest.reused = [
    {
      address: optional,
      role: 'external audit module',
      reviewed: true,
      reviewEvidenceSha256: 'a'.repeat(64),
      runtimeDigest: E.digest('0x600a'),
    },
  ];
  const reviewed = await f.run();
  assert(!reviewed.creations.some((c) => c.address === optional));
  assert.equal(reviewed.reused[0].status, 'reviewed');
  await qualify({ ...f, report: reviewed });
});

test('optional factory calls are swept and traced even when not a coordinator or journalled deployment', async () => {
  const f = protocolFixture();
  const child = f.add('FactoryOptional');
  const creationInput = child.tx.data;
  child.tx.to = address(7654);
  child.tx.data = '0x12345678';
  f.receipts.get(child.tx.hash).contractAddress = null;
  const send = f.provider.send;
  f.provider.send = async (method, args) =>
    args[0] === child.tx.hash
      ? traceResponse(
          {
            type: 'CALL',
            to: child.tx.to,
            calls: [
              {
                type: 'CREATE',
                to: child.address,
                input: creationInput,
                output: child.artifact.artifact.deployedBytecode,
              },
            ],
          },
          f.txs.get(args[0]),
          f.receipts.get(args[0]),
          args[1]
        )
      : send(method, args);
  const read = f.explorer.read;
  f.explorer.read = async (chain, address) =>
    address === child.address
      ? f.metadata({ constructorArguments: '0x' }, child.artifact)
      : read(chain, address);
  const report = await f.run();
  assert.deepEqual(report.blockers, []);
  assert(
    report.creations.some(
      (c) => c.address === child.address && c.kind === 'internal-trace'
    )
  );
});

test('malformed or child-truncated factory traces cannot qualify or pass the activation guard', async () => {
  for (const malformed of [
    'empty',
    'structLogs',
    'unknown',
    'child-truncated',
    'false-revert',
    'depth-jump',
    'parent-result',
    'missing-stack',
  ]) {
    const f = protocolFixture();
    const baseline = await f.run();
    const receipt = await qualify({ ...f, report: baseline });
    const child = f.add('TracedFactoryOptional');
    const input = child.tx.data;
    child.tx.to = address(9911);
    child.tx.data = '0x12345678';
    f.receipts.get(child.tx.hash).contractAddress = null;
    f.code.set(child.tx.to, '0x6000');
    const original = f.provider.send;
    f.provider.send = async (method, args) => {
      if (args[0] !== child.tx.hash) return original(method, args);
      const trace = traceResponse(
        {
          type: 'CALL',
          to: child.tx.to,
          calls: [
            {
              type: 'CREATE',
              to: child.address,
              input,
              output: child.artifact.artifact.deployedBytecode,
            },
          ],
        },
        child.tx,
        f.receipts.get(child.tx.hash),
        args[1]
      );
      if (!args[1]?.tracer) {
        if (malformed === 'depth-jump')
          trace.structLogs.find((l) => l.depth === 2).depth = 9;
        if (malformed === 'parent-result') {
          const end = trace.structLogs.findIndex(
            (l) => l.depth === 2 && l.op === 'RETURN'
          );
          trace.structLogs[end + 1].stack = ['0'];
        }
        if (malformed === 'missing-stack') delete trace.structLogs[0].stack;
        return trace;
      }
      if (malformed === 'false-revert') {
        trace.calls[0].error = 'execution reverted';
        return trace;
      }
      if (['depth-jump', 'parent-result', 'missing-stack'].includes(malformed))
        return trace;
      if (malformed === 'empty') return {};
      if (malformed === 'structLogs') return { structLogs: [] };
      if (malformed === 'unknown') return { ...trace, type: 'UNKNOWN' };
      delete trace.calls;
      return trace;
    };
    const report = await f.run();
    assert(report.blockers.length, malformed);
    await assert.rejects(() => qualify({ ...f, report }), undefined, malformed);
    await assert.rejects(
      () =>
        assertQualifiedActivation({ ...f, receipt, target: f.pause.address }),
      undefined,
      malformed
    );
  }
});

test('overloaded optional getter snapshots encode the exact zero-argument signature', async () => {
  const f = protocolFixture(),
    optional = f.add('GovernorOptional', {
      abi: [
        {
          type: 'function',
          name: 'quorumNumerator',
          inputs: [],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
        },
        {
          type: 'function',
          name: 'quorumNumerator',
          inputs: [{ type: 'uint256', name: 'timepoint' }],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
        },
      ],
    });
  f.states.get(E.lower(optional.address)).quorumNumerator = 4n;
  const report = await f.run();
  const receipt = await qualify({ ...f, report });
  assert(
    receipt.payload.state.some(
      (s) => s.function === 'quorumNumerator()' && s.value === '4'
    )
  );
  await assertQualifiedActivation({ ...f, receipt, target: f.pause.address });
});

test('contradictory actual compiler provenance cannot pass admission or archive creation', () => {
  const f = buildFixture();
  try {
    f.build.compilerProvenance = { actualVersion: '0.8.36+commit.fake' };
    f.save();
    assert.throws(() => inspectSources(f.root), /Production artifacts/);
    assert.throws(
      () =>
        archiveVerification(path.join(f.root, 'invalid-provenance'), f.root),
      /Production artifacts/
    );
  } finally {
    f.cleanup();
  }
});
