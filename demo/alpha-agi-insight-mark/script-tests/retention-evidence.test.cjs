'use strict';
// Synthetic fixtures only: no Solidity compiler, network, dependency install, or real chain.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  stage,
  verify,
  validateDossiers,
  compilerInventory,
  inventory,
  read,
  sha,
  DOSSIERS,
  NAMES,
} = require('../scripts/retainEvidence.cjs');
const { collectLocalReceipts } = require('../scripts/utils/localReceipts.cjs');
const PREFIX = 'demo/alpha-agi-insight-mark';
const HASH = '0x' + '1'.repeat(64),
  BLOCK = '0x' + '2'.repeat(64);
const receipt = () => ({
  transactionHash: HASH,
  transactionIndex: '0x0',
  blockHash: BLOCK,
  blockNumber: '0x1',
  from: '0x' + '3'.repeat(40),
  to: null,
  cumulativeGasUsed: '0x5208',
  gasUsed: '0x5208',
  contractAddress: '0x' + '4'.repeat(40),
  logs: [],
  logsBloom: '0x' + '0'.repeat(512),
  status: '0x1',
  type: '0x2',
  effectiveGasPrice: '0x1',
});
const envelope = () => ({
  schemaVersion: 1,
  proofScope: 'fresh-local-hardhat-31337-only',
  chainId: 31337,
  lastBlock: 1,
  blocks: [{ number: '0x1', hash: BLOCK, transactions: [HASH] }],
  receipts: [receipt()],
});
function put(root, name, value) {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof value === 'string' ? value : JSON.stringify(value)
  );
}
function get(root, name) {
  return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
}
function manifest(root) {
  put(root, 'reports/insight-manifest.json', {
    files: DOSSIERS.map((name) => ({
      path: name,
      sha256: sha(fs.readFileSync(path.join(root, name))),
    })),
  });
}
function fixture(t) {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), 'insight-retention-test-')
  );
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, 'repo'),
    demo = path.join(repo, PREFIX),
    destination = path.join(temp, 'retained');
  fs.mkdirSync(demo, { recursive: true });
  const sources = {};
  for (const name of NAMES) {
    const source = `contracts/${name}.sol`;
    sources[source] = {
      content: `pragma solidity ^0.8.37; contract ${name} {}\n`,
    };
    put(demo, source, sources[source].content);
  }
  const dependency = '@openzeppelin/contracts/utils/Context.sol';
  sources[dependency] = {
    content: 'pragma solidity ^0.8.37; abstract contract Context {}\n',
  };
  put(repo, 'node_modules/' + dependency, sources[dependency].content);
  put(demo, 'hardhat.config.ts', 'export default { solidity: "0.8.37" };\n');
  put(demo, 'data/insight-scenarios.json', { scenarios: [] });
  put(repo, 'package-lock.json', {
    name: 'synthetic-only',
    lockfileVersion: 3,
    packages: {},
  });
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '--quiet');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Synthetic Fixture');
  git('add', PREFIX, 'package-lock.json');
  git('commit', '--quiet', '-m', 'Synthetic source fixture');
  const output = {
    sources: Object.fromEntries(
      Object.keys(sources).map((source, id) => [source, { id }])
    ),
    contracts: {},
  };
  for (const name of NAMES) {
    const sourceName = `contracts/${name}.sol`,
      abi = [
        {
          type: 'function',
          name: 'fixture',
          inputs: [],
          outputs: [],
          stateMutability: 'view',
        },
      ];
    output.contracts[sourceName] = {
      [name]: {
        abi,
        evm: {
          bytecode: { object: '60016000', linkReferences: {} },
          deployedBytecode: { object: '6000', linkReferences: {} },
        },
      },
    };
    put(demo, `artifacts/contracts/${name}.sol/${name}.json`, {
      _format: 'hh-sol-artifact-1',
      contractName: name,
      sourceName,
      abi,
      bytecode: '0x60016000',
      deployedBytecode: '0x6000',
      linkReferences: {},
      deployedLinkReferences: {},
    });
    put(demo, `artifacts/contracts/${name}.sol/${name}.dbg.json`, {
      _format: 'hh-sol-dbg-1',
      buildInfo: '../../build-info/abc123.json',
    });
  }
  put(demo, 'artifacts/build-info/abc123.json', {
    _format: 'hh-sol-build-info-1',
    solcVersion: '0.8.37',
    solcLongVersion: '0.8.37+commit.abcdef12',
    input: {
      language: 'Solidity',
      sources,
      settings: {
        evmVersion: 'cancun',
        viaIR: true,
        optimizer: { enabled: true, runs: 500 },
        outputSelection: {
          '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] },
        },
      },
    },
    output,
  });
  for (const name of DOSSIERS)
    if (!fs.existsSync(path.join(demo, name)))
      put(demo, name, name.endsWith('.json') ? {} : 'Synthetic dossier\n');
  put(demo, 'reports/insight-recap.json', {
    executionMode: 'local-rehearsal',
    network: { chainId: '31337' },
    scenarioSource: {
      path: 'data/insight-scenarios.json',
      sha256: sha(
        fs.readFileSync(path.join(demo, 'data/insight-scenarios.json'))
      ),
    },
    deploymentTxHash: HASH,
  });
  put(demo, 'reports/insight-local-receipts.json', envelope());
  manifest(demo);
  return { repo, demo, destination, git };
}
function mutate(root, name, fn) {
  const value = get(root, name);
  fn(value);
  put(root, name, value);
}
const buildPath = 'artifacts/build-info/abc123.json';
const artifactPath = `artifacts/contracts/${NAMES[0]}.sol/${NAMES[0]}.json`;

test('synthetic stage roundtrip binds 19 dossiers, 3 contracts, dependency and raw receipts', (t) => {
  const f = fixture(t),
    result = stage(f.repo, f.destination);
  assert.equal(DOSSIERS.length, 19);
  assert.equal(result.compiler.contracts.length, 3);
  assert.equal(result.compiler.sources.length, 4);
  assert.equal(result.checkoutSha, f.git('rev-parse', 'HEAD'));
  assert.equal(result.exactHeadTree, true);
  assert.equal(
    result.configSha256,
    sha(fs.readFileSync(path.join(f.demo, 'hardhat.config.ts')))
  );
  assert.equal(
    result.lockfileSha256,
    sha(fs.readFileSync(path.join(f.repo, 'package-lock.json')))
  );
  assert.equal(result.files.length, 27);
  assert.deepEqual(verify(f.destination), result);
  assert.deepEqual(
    get(f.destination, 'reports/insight-local-receipts.json'),
    envelope()
  );
});
for (const [label, change, pattern] of [
  ['missing manifest path', (m) => m.files.pop(), /allowlist/],
  ['duplicate manifest path', (m) => m.files.push(m.files[0]), /allowlist/],
  [
    'manifest hash mismatch',
    (m) => {
      m.files[0].sha256 = '0'.repeat(64);
    },
    /hash mismatch/,
  ],
  [
    'manifest traversal path',
    (m) => {
      m.files[0].path = '../escape';
    },
    /allowlist/,
  ],
])
  test(label, (t) => {
    const f = fixture(t);
    mutate(f.demo, 'reports/insight-manifest.json', change);
    assert.throws(() => stage(f.repo, f.destination), pattern);
    assert.equal(fs.existsSync(f.destination), false);
  });
test('missing dossier file', (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.demo, DOSSIERS[0]));
  assert.throws(() => stage(f.repo, f.destination), /ENOENT/);
});
test('dossier symlink rejected', (t) => {
  const f = fixture(t),
    target = path.join(f.demo, DOSSIERS[1]);
  fs.unlinkSync(target);
  fs.symlinkSync(path.join(f.demo, DOSSIERS[2]), target);
  assert.throws(() => stage(f.repo, f.destination), /Symlink/);
});
test('symlinked ancestor rejected', (t) => {
  const f = fixture(t);
  fs.renameSync(
    path.join(f.demo, 'reports'),
    path.join(f.demo, 'real-reports')
  );
  fs.symlinkSync('real-reports', path.join(f.demo, 'reports'));
  assert.throws(() => validateDossiers(f.demo), /Symlink/);
});
test('unsafe read paths rejected', (t) => {
  const f = fixture(t);
  for (const name of [
    '../escape',
    '/absolute',
    'reports/../escape',
    'reports//file',
    'reports/./file',
    'reports\\file',
  ])
    assert.throws(() => read(f.demo, name), /Unsafe/);
});
test('oversized evidence rejected before reading content', (t) => {
  const f = fixture(t);
  fs.truncateSync(path.join(f.demo, DOSSIERS[1]), 32 * 1024 * 1024 + 1);
  assert.throws(() => stage(f.repo, f.destination), /size bound/);
});
test('oversized manifest rejected', (t) => {
  const f = fixture(t);
  fs.truncateSync(path.join(f.demo, 'reports/insight-manifest.json'), 65537);
  assert.throws(() => validateDossiers(f.demo), /size bound/);
});
test('inventory file-count bound', (t) => {
  const f = fixture(t),
    root = path.join(f.repo, 'many');
  for (let n = 0; n < 41; n++) put(root, String(n), '');
  assert.throws(() => inventory(root), /inventory bound/);
});
for (const source of [
  `${PREFIX}/contracts/${NAMES[0]}.sol`,
  'node_modules/@openzeppelin/contracts/utils/Context.sol',
])
  test('source binding rejects mutation: ' + source, (t) => {
    const f = fixture(t);
    fs.appendFileSync(path.join(f.repo, source), '// changed');
    assert.throws(
      () => stage(f.repo, f.destination),
      /source differs|Tracked execution inputs/
    );
  });
test('matching artifact source cannot hide uncommitted source', (t) => {
  const f = fixture(t),
    source = `contracts/${NAMES[0]}.sol`;
  fs.appendFileSync(path.join(f.demo, source), '// changed');
  mutate(f.demo, buildPath, (b) => {
    b.input.sources[source].content += '// changed';
  });
  assert.throws(
    () => stage(f.repo, f.destination),
    /Uncommitted compiler source|Tracked execution inputs/
  );
});
for (const input of [`${PREFIX}/hardhat.config.ts`, 'package-lock.json'])
  test('execution input binding: ' + input, (t) => {
    const f = fixture(t);
    fs.appendFileSync(path.join(f.repo, input), '\n');
    assert.throws(
      () => stage(f.repo, f.destination),
      /Uncommitted execution input|Tracked execution inputs/
    );
  });
for (const [label, target, fn, pattern] of [
  [
    'ABI mismatch',
    artifactPath,
    (a) => {
      a.abi = [];
    },
    /ABI mismatch/,
  ],
  [
    'bytecode mismatch',
    artifactPath,
    (a) => {
      a.bytecode = '0x6002';
    },
    /bytecode mismatch/,
  ],
  [
    'deployed bytecode mismatch',
    artifactPath,
    (a) => {
      a.deployedBytecode = '0x6002';
    },
    /bytecode mismatch/,
  ],
  [
    'output source mismatch',
    buildPath,
    (b) => {
      delete b.output.sources[`contracts/${NAMES[0]}.sol`];
    },
    /source inventory mismatch/,
  ],
  [
    'missing build output',
    buildPath,
    (b) => {
      delete b.output.contracts[`contracts/${NAMES[0]}.sol`];
    },
    /identity mismatch/,
  ],
  [
    'wrong compiler version',
    buildPath,
    (b) => {
      b.solcVersion = '0.8.36';
    },
    /Unexpected compiler/,
  ],
  [
    'wrong optimizer settings',
    buildPath,
    (b) => {
      b.input.settings.optimizer.runs = 200;
    },
    /settings/,
  ],
  [
    'wrong EVM settings',
    buildPath,
    (b) => {
      b.input.settings.evmVersion = 'paris';
    },
    /settings/,
  ],
  [
    'viaIR disabled',
    buildPath,
    (b) => {
      b.input.settings.viaIR = false;
    },
    /settings/,
  ],
  [
    'unknown compiler settings',
    buildPath,
    (b) => {
      b.input.settings.remappings = [];
    },
    /settings/,
  ],
  [
    'linked library settings',
    buildPath,
    (b) => {
      b.input.settings.libraries = { 'a.sol': {} };
    },
    /settings/,
  ],
  [
    'debug traversal',
    artifactPath.replace('.json', '.dbg.json'),
    (d) => {
      d.buildInfo = '../../../../secret.json';
    },
    /Unsafe build-info/,
  ],
])
  test(label, (t) => {
    const f = fixture(t);
    mutate(f.demo, target, fn);
    assert.throws(() => compilerInventory(f.demo), pattern);
  });
test('stale stage destination cannot be reused', (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.destination);
  put(f.destination, 'stale.txt', 'old');
  assert.throws(() => stage(f.repo, f.destination), /must not exist/);
  assert.equal(
    fs.readFileSync(path.join(f.destination, 'stale.txt'), 'utf8'),
    'old'
  );
});
test('stage extra files rejected', (t) => {
  const f = fixture(t);
  stage(f.repo, f.destination);
  put(f.destination, 'stale.txt', 'old');
  assert.throws(() => verify(f.destination), /Stage allowlist/);
});
test('stage provenance size mismatch rejected', (t) => {
  const f = fixture(t);
  stage(f.repo, f.destination);
  mutate(f.destination, 'retention-manifest.json', (m) => {
    m.files[0].bytes++;
  });
  assert.throws(() => verify(f.destination), /checksum\/size/);
});
for (const [label, fn, pattern] of [
  [
    'nonlocal receipt chain',
    (e) => {
      e.chainId = 1;
    },
    /Invalid local evidence/,
  ],
  [
    'nonlocal proof scope',
    (e) => {
      e.proofScope = 'mainnet';
    },
    /Invalid local evidence/,
  ],
  [
    'unknown envelope field',
    (e) => {
      e.provider = 'secret';
    },
    /envelope allowlist/,
  ],
  [
    'failed raw receipt',
    (e) => {
      e.receipts[0].status = '0x0';
    },
    /Invalid\/duplicate/,
  ],
  [
    'duplicate raw receipt',
    (e) => {
      e.receipts.push(e.receipts[0]);
    },
    /membership mismatch/,
  ],
  [
    'missing dossier transaction receipt',
    (e) => {
      e.receipts[0].transactionHash = '0x' + '9'.repeat(64);
      e.blocks[0].transactions[0] = e.receipts[0].transactionHash;
    },
    /missing receipt/,
  ],
  [
    'out-of-range receipt block',
    (e) => {
      e.receipts[0].blockNumber = '0x2';
    },
    /Invalid\/duplicate/,
  ],
  [
    'nonallowlisted receipt field',
    (e) => {
      e.receipts[0].provider = 'secret';
    },
    /Invalid\/duplicate/,
  ],
])
  test(label, (t) => {
    const f = fixture(t);
    mutate(f.demo, 'reports/insight-local-receipts.json', fn);
    manifest(f.demo);
    assert.throws(() => validateDossiers(f.demo), pattern);
  });
test('nonlocal recap rejected', (t) => {
  const f = fixture(t);
  mutate(f.demo, 'reports/insight-recap.json', (r) => {
    r.executionMode = 'mainnet';
  });
  manifest(f.demo);
  assert.throws(() => validateDossiers(f.demo), /Only local/);
});
function provider(overrides = {}) {
  const calls = [];
  return {
    calls,
    async send(method, params) {
      calls.push([method, params]);
      if (Object.hasOwn(overrides, method))
        return typeof overrides[method] === 'function'
          ? overrides[method](params)
          : overrides[method];
      const defaults = {
        eth_chainId: '0x7a69',
        eth_blockNumber: '0x1',
        eth_getBlockByNumber: {
          number: '0x1',
          hash: BLOCK,
          transactions: [HASH],
        },
        eth_getTransactionReceipt: receipt(),
      };
      assert.ok(Object.hasOwn(defaults, method), 'Unexpected RPC: ' + method);
      return defaults[method];
    },
  };
}
test('receipt capture preserves raw receipt and bounded RPC sequence', async () => {
  const p = provider(),
    result = await collectLocalReceipts(p, 'local-rehearsal');
  assert.deepEqual(result, envelope());
  assert.deepEqual(p.calls, [
    ['eth_chainId', undefined],
    ['eth_blockNumber', undefined],
    ['eth_getBlockByNumber', ['0x1', false]],
    ['eth_getTransactionReceipt', [HASH]],
  ]);
});
test('receipt capture skips nonlocal modes without touching provider', async () => {
  const p = provider();
  assert.equal(await collectLocalReceipts(p, 'live'), null);
  assert.deepEqual(p.calls, []);
});
for (const [label, overrides, pattern] of [
  ['wrong chain', { eth_chainId: '0x1' }, /chain 31337/],
  ['empty chain', { eth_blockNumber: '0x0' }, /block bound/],
  ['excessive blocks', { eth_blockNumber: '0x1001' }, /block bound/],
  ['missing block', { eth_getBlockByNumber: null }, /Missing local block/],
  [
    'invalid transaction array',
    { eth_getBlockByNumber: { hash: BLOCK, transactions: {} } },
    /Missing local block/,
  ],
  [
    'missing receipt',
    { eth_getTransactionReceipt: null },
    /Invalid local receipt/,
  ],
  [
    'receipt transaction mismatch',
    { eth_getTransactionReceipt: { ...receipt(), transactionHash: BLOCK } },
    /Invalid local receipt/,
  ],
  [
    'receipt block hash mismatch',
    { eth_getTransactionReceipt: { ...receipt(), blockHash: HASH } },
    /Invalid local receipt/,
  ],
  [
    'receipt block number mismatch',
    { eth_getTransactionReceipt: { ...receipt(), blockNumber: '0x2' } },
    /Invalid local receipt/,
  ],
  [
    'failed receipt',
    { eth_getTransactionReceipt: { ...receipt(), status: '0x0' } },
    /Invalid local receipt/,
  ],
  [
    'receipt count limit',
    {
      eth_getBlockByNumber: {
        hash: BLOCK,
        transactions: Array(4097).fill(HASH),
      },
    },
    /count bound/,
  ],
])
  test('capture rejects ' + label, async () => {
    await assert.rejects(
      collectLocalReceipts(provider(overrides), 'local-rehearsal'),
      pattern
    );
  });
function log() {
  return {
    address: '0x' + '5'.repeat(40),
    topics: [HASH],
    data: '0x1234',
    blockNumber: '0x1',
    transactionHash: HASH,
    transactionIndex: '0x0',
    blockHash: BLOCK,
    logIndex: '0x0',
    removed: false,
  };
}
test('raw receipt event log roundtrip', (t) => {
  const f = fixture(t);
  mutate(f.demo, 'reports/insight-local-receipts.json', (e) => {
    e.receipts[0].logs = [log()];
  });
  manifest(f.demo);
  stage(f.repo, f.destination);
  assert.deepEqual(
    get(f.destination, 'reports/insight-local-receipts.json').receipts[0].logs,
    [log()]
  );
});
for (const [label, fn] of [
  [
    'transaction binding',
    (l) => {
      l.transactionHash = BLOCK;
    },
  ],
  [
    'block hash binding',
    (l) => {
      l.blockHash = HASH;
    },
  ],
  [
    'address encoding',
    (l) => {
      l.address = '0x1234';
    },
  ],
  [
    'topic encoding',
    (l) => {
      l.topics = ['0x12'];
    },
  ],
  [
    'data encoding',
    (l) => {
      l.data = '0x123';
    },
  ],
  [
    'field allowlist',
    (l) => {
      l.credentials = 'synthetic';
    },
  ],
])
  test('receipt log rejects ' + label, (t) => {
    const f = fixture(t),
      item = log();
    fn(item);
    mutate(f.demo, 'reports/insight-local-receipts.json', (e) => {
      e.receipts[0].logs = [item];
    });
    manifest(f.demo);
    assert.throws(() => validateDossiers(f.demo), /Invalid receipt log/);
  });
for (const [label, fn, pattern] of [
  [
    'unknown build field',
    (b) => {
      b.secret = 'synthetic';
    },
    /allowlist|Unexpected|field/i,
  ],
  [
    'unknown input field',
    (b) => {
      b.input.secret = 'synthetic';
    },
    /allowlist|Unexpected|field/i,
  ],
])
  test(label, (t) => {
    const f = fixture(t);
    mutate(f.demo, buildPath, fn);
    assert.throws(() => compilerInventory(f.demo), pattern);
  });
test('ledger transaction hash crossreference', (t) => {
  const f = fixture(t);
  put(f.demo, 'reports/insight-ledger.json', {
    entries: [{ hash: '0x' + '9'.repeat(64) }],
  });
  manifest(f.demo);
  assert.throws(() => validateDossiers(f.demo), /missing receipt/);
});
test('owner supremacy transaction hash crossreference', (t) => {
  const f = fixture(t);
  put(f.demo, 'reports/insight-owner-supremacy.json', {
    actionTxHashes: ['0x' + '9'.repeat(64)],
  });
  manifest(f.demo);
  assert.throws(() => validateDossiers(f.demo), /missing receipt/);
});
for (const [label, fn, pattern] of [
  [
    'invalid from address',
    (r) => {
      r.from = '0x1';
    },
    /address/,
  ],
  [
    'invalid gas quantity',
    (r) => {
      r.gasUsed = 'secret';
    },
    /quantity/,
  ],
  [
    'invalid log bloom',
    (r) => {
      r.logsBloom = '0x00';
    },
    /bloom/,
  ],
  [
    'too many logs',
    (r) => {
      r.logs = Array(4097).fill(log());
    },
    /log count/,
  ],
  [
    'removed log',
    (r) => {
      r.logs = [{ ...log(), removed: true }];
    },
    /quantity\/state/,
  ],
  [
    'too many log topics',
    (r) => {
      r.logs = [{ ...log(), topics: Array(5).fill(HASH) }];
    },
    /quantity\/state/,
  ],
])
  test(label, (t) => {
    const f = fixture(t);
    mutate(f.demo, 'reports/insight-local-receipts.json', (e) =>
      fn(e.receipts[0])
    );
    manifest(f.demo);
    assert.throws(() => validateDossiers(f.demo), pattern);
  });
for (const [label, fn] of [
  [
    'unexpected manifest field',
    (m) => {
      m.credentials = 'synthetic';
    },
  ],
  [
    'unexpected manifest entry field',
    (m) => {
      m.files[0].credentials = 'synthetic';
    },
  ],
])
  test(label, (t) => {
    const f = fixture(t);
    mutate(f.demo, 'reports/insight-manifest.json', fn);
    assert.throws(() => validateDossiers(f.demo), /invalid dossier manifest/);
  });
for (const [label, fn] of [
  [
    'inconsistent exact-head claim',
    (p) => {
      p.exactHeadTree = false;
    },
  ],
  [
    'invalid config digest',
    (p) => {
      p.configSha256 = 'invalid';
    },
  ],
  [
    'invalid lockfile digest',
    (p) => {
      p.lockfileSha256 = 'invalid';
    },
  ],
])
  test(label, (t) => {
    const f = fixture(t);
    stage(f.repo, f.destination);
    mutate(f.destination, 'retention-manifest.json', fn);
    assert.throws(() => verify(f.destination));
  });
for (const [label, key, value] of [
  ['log block number binding', 'blockNumber', '0x2'],
  ['log transaction index binding', 'transactionIndex', '0x1'],
])
  test(label, (t) => {
    const f = fixture(t);
    mutate(f.demo, 'reports/insight-local-receipts.json', (e) => {
      e.receipts[0].logs = [{ ...log(), [key]: value }];
    });
    manifest(f.demo);
    assert.throws(() => validateDossiers(f.demo), /position mismatch/);
  });
test('malformed dossier transaction hash', (t) => {
  const f = fixture(t);
  mutate(f.demo, 'reports/insight-recap.json', (r) => {
    r.deploymentTxHash = 'malformed';
  });
  manifest(f.demo);
  assert.throws(() => validateDossiers(f.demo), /missing receipt/);
});
for (const [label, fn] of [
  [
    'missing receipt transaction index',
    (e) => {
      delete e.receipts[0].transactionIndex;
    },
  ],
  [
    'sole transaction index 255',
    (e) => {
      e.receipts[0].transactionIndex = '0xff';
    },
  ],
  [
    'duplicate transaction position',
    (e) => {
      const hash = '0x' + '6'.repeat(64);
      e.blocks[0].transactions.push(hash);
      e.receipts.push({ ...receipt(), transactionHash: hash });
    },
  ],
  [
    'conflicting hash at same height',
    (e) => {
      const hash = '0x' + '6'.repeat(64);
      e.blocks[0].transactions.push(hash);
      e.receipts.push({
        ...receipt(),
        transactionHash: hash,
        transactionIndex: '0x1',
        blockHash: HASH,
      });
    },
  ],
  [
    'receipt order differs from block',
    (e) => {
      const hash = '0x' + '6'.repeat(64);
      e.blocks[0].transactions.push(hash);
      e.receipts.unshift({
        ...receipt(),
        transactionHash: hash,
        transactionIndex: '0x1',
      });
    },
  ],
  [
    'unrepresented block transaction',
    (e) => {
      e.blocks[0].transactions.push('0x' + '6'.repeat(64));
    },
  ],
  [
    'missing block inventory',
    (e) => {
      delete e.blocks;
    },
  ],
  [
    'nonconsecutive block number',
    (e) => {
      e.blocks[0].number = '0x2';
    },
  ],
  [
    'duplicate block transaction hash',
    (e) => {
      e.blocks[0].transactions.push(HASH);
    },
  ],
  [
    'oversized block transaction inventory',
    (e) => {
      e.blocks[0].transactions = Array(4097).fill(HASH);
    },
  ],
  [
    'unexpected block field',
    (e) => {
      e.blocks[0].provider = 'must not survive';
    },
  ],
  [
    'missing log block number',
    (e) => {
      e.receipts[0].logs = [log()];
      delete e.receipts[0].logs[0].blockNumber;
    },
  ],
  [
    'missing log transaction index',
    (e) => {
      e.receipts[0].logs = [log()];
      delete e.receipts[0].logs[0].transactionIndex;
    },
  ],
  [
    'missing log index',
    (e) => {
      e.receipts[0].logs = [log()];
      delete e.receipts[0].logs[0].logIndex;
    },
  ],
  [
    'duplicate log position',
    (e) => {
      e.receipts[0].logs = [log(), log()];
    },
  ],
  [
    'gapped log position',
    (e) => {
      e.receipts[0].logs = [{ ...log(), logIndex: '0x1' }];
    },
  ],
])
  test('block membership rejects ' + label, (t) => {
    const f = fixture(t);
    mutate(f.demo, 'reports/insight-local-receipts.json', fn);
    manifest(f.demo);
    assert.throws(() => stage(f.repo, f.destination));
  });
for (const [label, overrides] of [
  [
    'index 255 for sole transaction',
    { eth_getTransactionReceipt: { ...receipt(), transactionIndex: '0xff' } },
  ],
  [
    'missing transaction index',
    {
      eth_getTransactionReceipt: { ...receipt(), transactionIndex: undefined },
    },
  ],
  [
    'missing block number',
    { eth_getBlockByNumber: { hash: BLOCK, transactions: [HASH] } },
  ],
  [
    'wrong block number',
    {
      eth_getBlockByNumber: {
        number: '0x2',
        hash: BLOCK,
        transactions: [HASH],
      },
    },
  ],
  [
    'duplicate transaction membership',
    {
      eth_getBlockByNumber: {
        number: '0x1',
        hash: BLOCK,
        transactions: [HASH, HASH],
      },
    },
  ],
])
  test('capture rejects ' + label, async () => {
    await assert.rejects(
      collectLocalReceipts(provider(overrides), 'local-rehearsal')
    );
  });
test('multiple transactions and logs across blocks with an empty block roundtrip', async (t) => {
  const f = fixture(t),
    h2 = '0x' + '6'.repeat(64),
    h3 = '0x' + '7'.repeat(64),
    b2 = '0x' + '8'.repeat(64),
    b3 = '0x' + '9'.repeat(64);
  const blocks = [
    { number: '0x1', hash: BLOCK, transactions: [HASH, h2] },
    { number: '0x2', hash: b2, transactions: [] },
    { number: '0x3', hash: b3, transactions: [h3] },
  ];
  const receipts = [
    { ...receipt(), logs: [log()] },
    {
      ...receipt(),
      transactionHash: h2,
      transactionIndex: '0x1',
      logs: [
        {
          ...log(),
          transactionHash: h2,
          transactionIndex: '0x1',
          logIndex: '0x1',
        },
      ],
    },
    {
      ...receipt(),
      transactionHash: h3,
      blockHash: b3,
      blockNumber: '0x3',
      logs: [
        { ...log(), transactionHash: h3, blockHash: b3, blockNumber: '0x3' },
      ],
    },
  ];
  const p = provider({
    eth_blockNumber: '0x3',
    eth_getBlockByNumber: ([number]) => blocks[Number(BigInt(number)) - 1],
    eth_getTransactionReceipt: ([hash]) =>
      receipts.find((r) => r.transactionHash === hash),
  });
  const e = await collectLocalReceipts(p, 'local-rehearsal');
  assert.deepEqual(e.blocks, blocks);
  assert.deepEqual(e.receipts, receipts);
  put(f.demo, 'reports/insight-local-receipts.json', e);
  manifest(f.demo);
  stage(f.repo, f.destination);
  verify(f.destination);
  // A log index is global to its block, not reset for each transaction.
  mutate(f.demo, 'reports/insight-local-receipts.json', (e) => {
    e.receipts[1].logs[0].logIndex = '0x0';
  });
  manifest(f.demo);
  assert.throws(() => validateDossiers(f.demo), /ordering mismatch/);
});
for (const [label, fn] of [
  [
    'missing mandatory receipt position',
    (e) => {
      delete e.receipts[0].transactionIndex;
    },
  ],
  [
    'conflicting receipt block hash',
    (e) => {
      e.receipts[0].blockHash = HASH;
    },
  ],
  [
    'duplicate mined log position',
    (e) => {
      e.receipts[0].logs = [log(), log()];
    },
  ],
])
  test('standalone verifier rejects rehashed ' + label, (t) => {
    const f = fixture(t);
    stage(f.repo, f.destination);
    mutate(f.destination, 'reports/insight-local-receipts.json', fn);
    manifest(f.destination);
    mutate(f.destination, 'retention-manifest.json', (m) => {
      m.files = inventory(f.destination).filter(
        (x) => x.path !== 'retention-manifest.json'
      );
    });
    assert.throws(() => verify(f.destination), /receipt|position|ordering/i);
  });
