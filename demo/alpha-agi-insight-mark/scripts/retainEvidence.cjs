'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const PREFIX = 'demo/alpha-agi-insight-mark/';
const NAMES = [
  'InsightAccessToken',
  'AlphaInsightNovaSeed',
  'AlphaInsightExchange',
];
const DOSSIERS = [
  'insight-recap.json',
  'insight-report.md',
  'insight-report.html',
  'insight-control-matrix.json',
  'insight-control-map.mmd',
  'insight-superintelligence.mmd',
  'insight-lifecycle.mmd',
  'insight-telemetry.log',
  'insight-governance.mmd',
  'insight-owner-brief.md',
  'insight-safety-checklist.md',
  'insight-market-matrix.csv',
  'insight-constellation.mmd',
  'insight-agency-orbit.mmd',
  'insight-ledger.json',
  'insight-owner-supremacy.json',
  'insight-owner-lattice.mmd',
  'insight-local-receipts.json',
]
  .map((x) => 'reports/' + x)
  .concat('data/insight-scenarios.json');
const MAX_FILE = 32 * 1024 * 1024,
  MAX_TOTAL = 96 * 1024 * 1024;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message) => {
  throw Error(message);
};
const equal = (a, b, message) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(message);
};
function safeName(name) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.includes('\\') ||
    path.posix.isAbsolute(name) ||
    name.split('/').some((x) => !x || x === '.' || x === '..')
  )
    fail('Unsafe evidence path');
  return name;
}
function read(root, name, limit = MAX_FILE) {
  safeName(name);
  let current = root;
  if (fs.lstatSync(current).isSymbolicLink()) fail('Symlink root');
  for (const component of name.split('/')) {
    current = path.join(current, component);
    if (fs.lstatSync(current).isSymbolicLink()) fail('Symlink evidence');
  }
  const stat = fs.lstatSync(current);
  if (!stat.isFile() || stat.size > limit)
    fail('Evidence file type/size bound');
  return fs.readFileSync(current);
}
const json = (root, name, limit) => JSON.parse(read(root, name, limit));
function inventory(root) {
  const files = [];
  let bytes = 0;
  function visit(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) fail('Symlink in stage');
      if (entry.isDirectory()) visit(path.join(dir, entry.name), name + '/');
      else {
        const content = read(root, name);
        bytes += content.length;
        if (files.length >= 40 || bytes > MAX_TOTAL)
          fail('Evidence inventory bound');
        files.push({ path: name, sha256: sha(content), bytes: content.length });
      }
    }
  }
  visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
function validateDossiers(root) {
  const manifest = json(root, 'reports/insight-manifest.json', 65536);
  if (
    !Array.isArray(manifest.files) ||
    Object.keys(manifest).some((k) => !['generatedAt', 'files'].includes(k)) ||
    manifest.files.some(
      (e) => !e || Object.keys(e).some((k) => !['path', 'sha256'].includes(k))
    )
  )
    fail('Missing/invalid dossier manifest');
  equal(
    manifest.files.map((x) => x.path).sort(),
    [...DOSSIERS].sort(),
    'Dossier allowlist mismatch'
  );
  for (const entry of manifest.files)
    if (sha(read(root, entry.path)) !== entry.sha256)
      fail('Dossier hash mismatch: ' + entry.path);
  const recap = json(root, 'reports/insight-recap.json');
  if (
    recap.executionMode !== 'local-rehearsal' ||
    recap.network?.chainId !== '31337'
  )
    fail('Only local rehearsal can be retained');
  if (
    recap.scenarioSource?.path !== 'data/insight-scenarios.json' ||
    recap.scenarioSource.sha256 !==
      sha(read(root, 'data/insight-scenarios.json'))
  )
    fail('Scenario source mismatch');
  const evidence = json(root, 'reports/insight-local-receipts.json');
  equal(
    Object.keys(evidence).sort(),
    [
      'schemaVersion',
      'proofScope',
      'chainId',
      'lastBlock',
      'blocks',
      'receipts',
    ].sort(),
    'Receipt envelope allowlist'
  );
  if (
    evidence.schemaVersion !== 1 ||
    evidence.proofScope !== 'fresh-local-hardhat-31337-only' ||
    evidence.chainId !== 31337 ||
    !Number.isInteger(evidence.lastBlock) ||
    evidence.lastBlock < 1 ||
    evidence.lastBlock > 4096 ||
    !Array.isArray(evidence.receipts) ||
    evidence.receipts.length < 1 ||
    evidence.receipts.length > 4096
  )
    fail('Invalid local evidence');
  const hashes = new Set();
  const receiptKeys = [
    'transactionHash',
    'transactionIndex',
    'blockHash',
    'blockNumber',
    'from',
    'to',
    'cumulativeGasUsed',
    'gasUsed',
    'contractAddress',
    'logs',
    'logsBloom',
    'status',
    'type',
    'effectiveGasPrice',
    'blobGasUsed',
    'blobGasPrice',
  ];
  const hex = (x, n) =>
    typeof x === 'string' && new RegExp('^0x[0-9a-fA-F]{' + n + '}$').test(x);
  if (
    !Array.isArray(evidence.blocks) ||
    evidence.blocks.length !== evidence.lastBlock
  )
    fail('Invalid block inventory');
  const expected = [],
    blockHashes = new Set(),
    transactionHashes = new Set();
  for (const [offset, block] of evidence.blocks.entries()) {
    if (
      !block ||
      Object.keys(block).sort().join(',') !== 'hash,number,transactions' ||
      !/^0x[0-9a-f]+$/i.test(block.number) ||
      BigInt(block.number) !== BigInt(offset + 1) ||
      !hex(block.hash, 64) ||
      blockHashes.has(block.hash) ||
      !Array.isArray(block.transactions) ||
      expected.length + block.transactions.length > 4096
    )
      fail('Invalid block inventory');
    blockHashes.add(block.hash);
    for (const [index, hash] of block.transactions.entries()) {
      if (!hex(hash, 64) || transactionHashes.has(hash))
        fail('Invalid block transaction inventory');
      transactionHashes.add(hash);
      expected.push({ block, index, hash });
    }
  }
  if (expected.length !== evidence.receipts.length)
    fail('Receipt/block membership mismatch');
  const nextLogIndex = new Map();
  for (const [position, receipt] of evidence.receipts.entries()) {
    if (
      Object.keys(receipt).some((k) => !receiptKeys.includes(k)) ||
      !hex(receipt.transactionHash, 64) ||
      !hex(receipt.blockHash, 64) ||
      receipt.status !== '0x1' ||
      !/^0x[0-9a-f]+$/i.test(receipt.blockNumber) ||
      !/^0x[0-9a-f]+$/i.test(receipt.transactionIndex) ||
      BigInt(receipt.blockNumber) < 1n ||
      BigInt(receipt.blockNumber) > BigInt(evidence.lastBlock) ||
      hashes.has(receipt.transactionHash) ||
      !Array.isArray(receipt.logs)
    )
      fail('Invalid/duplicate receipt');
    const member = expected[position];
    if (
      receipt.transactionHash !== member.hash ||
      receipt.blockHash !== member.block.hash ||
      BigInt(receipt.blockNumber) !== BigInt(member.block.number) ||
      BigInt(receipt.transactionIndex) !== BigInt(member.index)
    )
      fail('Receipt/block position mismatch');
    for (const key of ['from', 'to', 'contractAddress']) {
      if (
        receipt[key] !== undefined &&
        receipt[key] !== null &&
        !hex(receipt[key], 40)
      )
        fail('Invalid receipt address');
    }
    for (const key of [
      'transactionIndex',
      'cumulativeGasUsed',
      'gasUsed',
      'type',
      'effectiveGasPrice',
      'blobGasUsed',
      'blobGasPrice',
    ]) {
      if (receipt[key] !== undefined && !/^0x[0-9a-f]+$/i.test(receipt[key]))
        fail('Invalid receipt quantity');
    }
    if (receipt.logsBloom !== undefined && !hex(receipt.logsBloom, 512))
      fail('Invalid receipt bloom');
    if (receipt.logs.length > 4096) fail('Receipt log count bound');
    for (const log of receipt.logs) {
      if (
        ['blockNumber', 'transactionIndex', 'logIndex'].some(
          (k) => !/^0x[0-9a-f]+$/i.test(log[k])
        ) ||
        (log.removed !== undefined && log.removed !== false) ||
        log.topics?.length > 4
      )
        fail('Invalid log quantity/state');
      for (const key of ['blockNumber', 'transactionIndex']) {
        if (
          log[key] !== undefined &&
          (receipt[key] === undefined ||
            BigInt(log[key]) !== BigInt(receipt[key]))
        )
          fail('Receipt log position mismatch');
      }
      if (
        Object.keys(log).some(
          (k) =>
            ![
              'address',
              'topics',
              'data',
              'blockNumber',
              'transactionHash',
              'transactionIndex',
              'blockHash',
              'logIndex',
              'removed',
            ].includes(k)
        ) ||
        !hex(log.address, 40) ||
        !Array.isArray(log.topics) ||
        log.topics.some((t) => !hex(t, 64)) ||
        !/^0x(?:[0-9a-f]{2})*$/i.test(log.data) ||
        log.transactionHash !== receipt.transactionHash ||
        log.blockHash !== receipt.blockHash
      )
        fail('Invalid receipt log');
      const nextIndex = nextLogIndex.get(receipt.blockHash) || 0n;
      if (BigInt(log.logIndex) !== nextIndex)
        fail('Receipt log ordering mismatch');
      nextLogIndex.set(receipt.blockHash, nextIndex + 1n);
    }
    hashes.add(receipt.transactionHash);
  }
  function findHashes(value, key = '') {
    if (Array.isArray(value)) return value.forEach((v) => findHashes(v, key));
    if (value && typeof value === 'object')
      return Object.entries(value).forEach(([k, v]) => findHashes(v, k));
    if (
      /^(?:.*TxHash(?:es)?|transactionHash|hash)$/.test(key) &&
      value !== null &&
      value !== undefined &&
      (!hex(value, 64) || !hashes.has(value))
    )
      fail('Dossier transaction missing receipt');
  }
  for (const file of [
    'insight-recap.json',
    'insight-ledger.json',
    'insight-owner-supremacy.json',
  ])
    findHashes(json(root, 'reports/' + file));
  return manifest;
}
function compilerInventory(root) {
  const builds = new Map(),
    contracts = [],
    sources = new Map(),
    compilers = new Map();
  for (const name of NAMES) {
    const base = `artifacts/contracts/${name}.sol/${name}`;
    const artifact = json(root, base + '.json');
    const debug = json(root, base + '.dbg.json', 65536);
    if (
      debug._format !== 'hh-sol-dbg-1' ||
      !/^\.\.\/\.\.\/build-info\/[a-f0-9]+\.json$/.test(debug.buildInfo)
    )
      fail('Unsafe build-info reference');
    const buildPath =
      'artifacts/build-info/' + path.posix.basename(debug.buildInfo);
    const build = builds.get(buildPath) || json(root, buildPath);
    builds.set(buildPath, build);
    if (
      build._format !== 'hh-sol-build-info-1' ||
      build.solcVersion !== '0.8.37' ||
      !/^0\.8\.37\+commit\.[a-f0-9]+(?:\..*)?$/.test(build.solcLongVersion) ||
      build.input?.language !== 'Solidity'
    )
      fail('Unexpected compiler');
    if (
      Object.keys(build).some(
        (k) =>
          ![
            '_format',
            'id',
            'solcVersion',
            'solcLongVersion',
            'input',
            'output',
          ].includes(k)
      ) ||
      Object.keys(build.input).some(
        (k) => !['language', 'sources', 'settings'].includes(k)
      )
    )
      fail('Unexpected build-info fields');
    const settings = build.input.settings;
    if (
      !settings ||
      settings.evmVersion !== 'cancun' ||
      settings.viaIR !== true ||
      settings.optimizer?.enabled !== true ||
      settings.optimizer.runs !== 500 ||
      Object.keys(settings).some(
        (k) =>
          ![
            'evmVersion',
            'viaIR',
            'optimizer',
            'outputSelection',
            'metadata',
            'libraries',
          ].includes(k)
      ) ||
      (settings.libraries && Object.keys(settings.libraries).length)
    )
      fail('Unexpected compiler settings');
    compilers.set(buildPath, {
      path: buildPath,
      version: build.solcVersion,
      longVersion: build.solcLongVersion,
      settings,
    });
    if (!build.input.sources || Object.keys(build.input.sources).length > 128)
      fail('Source inventory bound');
    equal(
      Object.keys(build.output.sources || {}).sort(),
      Object.keys(build.input.sources).sort(),
      'Compiler source inventory mismatch'
    );
    for (const [source, input] of Object.entries(build.input.sources)) {
      safeName(source);
      if (
        !(
          /^contracts\/(InsightAccessToken|AlphaInsightNovaSeed|AlphaInsightExchange)\.sol$/.test(
            source
          ) || /^@openzeppelin\/contracts\/[A-Za-z0-9_./-]+\.sol$/.test(source)
        )
      )
        fail('Source not allowlisted');
      if (Object.keys(input).length !== 1 || typeof input.content !== 'string')
        fail('Embedded source content required');
      const digest = sha(input.content);
      if (sources.has(source) && sources.get(source) !== digest)
        fail('Conflicting source content');
      sources.set(source, digest);
    }
    const sourceName = `contracts/${name}.sol`;
    const output = build.output.contracts?.[sourceName]?.[name];
    if (
      artifact._format !== 'hh-sol-artifact-1' ||
      artifact.contractName !== name ||
      artifact.sourceName !== sourceName ||
      !output ||
      !sources.has(sourceName)
    )
      fail('Artifact identity mismatch');
    equal(artifact.abi, output.abi, 'Artifact ABI mismatch');
    for (const [field, section] of [
      ['bytecode', 'bytecode'],
      ['deployedBytecode', 'deployedBytecode'],
    ]) {
      if (
        !/^0x(?:[0-9a-f]{2})+$/i.test(artifact[field]) ||
        artifact[field] !== '0x' + output.evm?.[section]?.object
      )
        fail('Artifact bytecode mismatch');
    }
    equal(
      artifact.linkReferences,
      output.evm.bytecode.linkReferences,
      'Link references mismatch'
    );
    equal(
      artifact.deployedLinkReferences,
      output.evm.deployedBytecode.linkReferences,
      'Deployed links mismatch'
    );
    contracts.push({
      name,
      sourceName,
      buildInfo: buildPath,
      abiSha256: sha(JSON.stringify(artifact.abi)),
      bytecodeSha256: sha(artifact.bytecode),
      deployedBytecodeSha256: sha(artifact.deployedBytecode),
    });
  }
  return {
    builds: [...builds.keys()].sort(),
    compilers: [...compilers.values()].sort((a, b) =>
      a.path.localeCompare(b.path)
    ),
    contracts,
    sources: [...sources].sort().map(([path, sha256]) => ({ path, sha256 })),
  };
}
function verify(root) {
  const provenance = json(root, 'retention-manifest.json', 65536);
  if (
    provenance.schemaVersion !== 1 ||
    provenance.proofScope !== 'fresh-local-hardhat-31337-only'
  )
    fail('Invalid proof scope');
  for (const key of ['checkoutSha', 'checkoutTree', 'headSha', 'headTree'])
    if (!/^[a-f0-9]{40}$/.test(provenance[key] || ''))
      fail('Invalid git provenance');
  if (
    provenance.exactHeadTree !==
    (provenance.checkoutTree === provenance.headTree)
  )
    fail('Tree qualification mismatch');
  for (const key of ['configSha256', 'lockfileSha256'])
    if (!/^[a-f0-9]{64}$/.test(provenance[key] || ''))
      fail('Invalid input hash');
  validateDossiers(root);
  const compiler = compilerInventory(root);
  equal(provenance.compiler, compiler, 'Compiler provenance mismatch');
  const expected = [
    ...DOSSIERS,
    'reports/insight-manifest.json',
    ...NAMES.flatMap((n) => [
      `artifacts/contracts/${n}.sol/${n}.json`,
      `artifacts/contracts/${n}.sol/${n}.dbg.json`,
    ]),
    ...compiler.builds,
    'retention-manifest.json',
  ];
  const actual = inventory(root);
  equal(
    actual.map((x) => x.path).sort(),
    expected.sort(),
    'Stage allowlist mismatch'
  );
  equal(
    actual.filter((x) => x.path !== 'retention-manifest.json'),
    provenance.files,
    'Stage checksum/size mismatch'
  );
  return provenance;
}
function stage(repo, destination, headSha) {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: MAX_FILE,
    }).trim();
  const demo = path.join(repo, PREFIX);
  // Never reuse a prior stage; old records cannot leak into a new archive.
  if (fs.existsSync(destination)) fail('Stage destination must not exist');
  validateDossiers(demo);
  const compiler = compilerInventory(demo);
  const checkoutSha = git('rev-parse', 'HEAD'),
    checkoutTree = git('rev-parse', 'HEAD^{tree}');
  headSha = headSha || checkoutSha;
  if (!/^[a-f0-9]{40}$/.test(headSha)) fail('Invalid head SHA');
  const headTree = git('rev-parse', headSha + '^{tree}');
  if (
    git(
      'status',
      '--porcelain',
      '--untracked-files=no',
      '--',
      PREFIX,
      'package.json',
      'package-lock.json',
      '.github/workflows/demo-alpha-agi-insight-mark.yml'
    )
  )
    fail('Tracked execution inputs must match checkout');
  // Bind authored inputs to actual checkout, dependencies to installed lockfile contents.
  for (const source of compiler.sources) {
    const relative = source.path.startsWith('contracts/')
      ? PREFIX + source.path
      : 'node_modules/' + source.path;
    const content = read(repo, relative);
    if (sha(content) !== source.sha256)
      fail('Compiler source differs from checkout/dependency: ' + source.path);
    if (source.path.startsWith('contracts/')) {
      const committed = execFileSync(
        'git',
        ['show', checkoutSha + ':' + relative],
        { cwd: repo, maxBuffer: MAX_FILE }
      );
      if (sha(committed) !== source.sha256) fail('Uncommitted compiler source');
    }
  }
  for (const relative of [
    PREFIX + 'hardhat.config.ts',
    PREFIX + 'data/insight-scenarios.json',
    'package-lock.json',
  ]) {
    const committed = execFileSync(
      'git',
      ['show', checkoutSha + ':' + relative],
      { cwd: repo, maxBuffer: MAX_FILE }
    );
    if (sha(read(repo, relative)) !== sha(committed))
      fail('Uncommitted execution input');
  }
  fs.mkdirSync(destination, { recursive: true });
  const names = [
    ...DOSSIERS,
    'reports/insight-manifest.json',
    ...NAMES.flatMap((n) => [
      `artifacts/contracts/${n}.sol/${n}.json`,
      `artifacts/contracts/${n}.sol/${n}.dbg.json`,
    ]),
    ...compiler.builds,
  ];
  for (const name of names) {
    const content = read(demo, name);
    fs.mkdirSync(path.dirname(path.join(destination, name)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(destination, name), content, { flag: 'wx' });
  }
  const provenance = {
    schemaVersion: 1,
    proofScope: 'fresh-local-hardhat-31337-only',
    checkoutSha,
    checkoutTree,
    headSha,
    headTree,
    exactHeadTree: checkoutTree === headTree,
    compiler,
    configSha256: sha(read(repo, PREFIX + 'hardhat.config.ts')),
    lockfileSha256: sha(read(repo, 'package-lock.json')),
    files: inventory(destination),
  };
  fs.writeFileSync(
    path.join(destination, 'retention-manifest.json'),
    JSON.stringify(provenance, null, 2),
    { flag: 'wx' }
  );
  verify(destination);
  return provenance;
}
module.exports = {
  stage,
  verify,
  validateDossiers,
  compilerInventory,
  inventory,
  read,
  sha,
  DOSSIERS,
  NAMES,
};
if (require.main === module) {
  const [command, target] = process.argv.slice(2);
  if (command === 'verify' && target) verify(path.resolve(target));
  else if (command === 'stage' && target)
    stage(process.cwd(), path.resolve(target), process.env.INSIGHT_CI_HEAD_SHA);
  else fail('Usage: retainEvidence.cjs stage|verify DIRECTORY');
  console.log('Bounded local Insight evidence verified.');
}
