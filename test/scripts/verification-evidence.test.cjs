'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
  archiveVerification,
} = require('../../scripts/deploy/archive-verification.cjs');
const {
  runHardhatVerify,
} = require('../../scripts/release/run-etherscan-verification.js');
const policy = require('../../config/solidity-compiler.json');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-verification-'));
  const build = {
    solcVersion: policy.version,
    solcLongVersion: policy.longVersion,
    input: {
      language: 'Solidity',
      sources: {
        'Unrelated.sol': { content: '// Retain original compiler input' },
      },
      settings: {
        viaIR: true,
        optimizer: { enabled: true, runs: 200 },
        evmVersion: 'cancun',
      },
    },
    output: { sources: {}, contracts: {}, errors: [] },
  };
  for (const name of [
    'JobRegistry',
    'StakeManager',
    'ValidationModule',
    'Deployer',
  ]) {
    const source = `contracts/v2/${name}.sol`;
    const content = `contract ${name} {}`;
    const sourceFile = path.join(root, source);
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, content);
    build.input.sources[source] = { content };
    build.output.sources[source] = {
      ast: {
        nodes: [
          {
            nodeType: 'ContractDefinition',
            name,
            contractKind: 'contract',
            abstract: false,
          },
        ],
      },
    };
    build.output.contracts[source] = {
      [name]: {
        abi: [],
        evm: {
          bytecode: { object: '6000' },
          deployedBytecode: { object: '6000' },
        },
      },
    };
    const artifact = path.join(root, 'artifacts', source, `${name}.json`);
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(
      artifact,
      JSON.stringify({
        contractName: name,
        sourceName: source,
        abi: [],
        bytecode: '0x6000',
        deployedBytecode: '0x6000',
      })
    );
    fs.writeFileSync(
      artifact.replace('.json', '.dbg.json'),
      JSON.stringify({ buildInfo: '../../../build-info/original.json' })
    );
  }
  const buildFile = path.join(root, 'artifacts/build-info/original.json');
  fs.mkdirSync(path.dirname(buildFile), { recursive: true });
  fs.writeFileSync(buildFile, JSON.stringify(build));
  return { root, build, buildFile, out: path.join(root, 'verification') };
}

test('verification archive preserves the full original input, compiler output and every artifact', () => {
  const f = fixture();
  try {
    const result = archiveVerification(f.out, f.root);
    const indexBytes = fs.readFileSync(path.join(f.out, 'index.json'));
    assert.equal(
      createHash('sha256').update(indexBytes).digest('hex'),
      result.indexSha256
    );
    const index = JSON.parse(indexBytes);
    assert.equal(index.contracts.length, 4);
    assert.equal(new Set(index.contracts.map((c) => c.standardInput)).size, 1);
    const contract = index.contracts[0];
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(f.out, contract.standardInput))),
      f.build.input
    );
    assert.deepEqual(
      fs.readFileSync(path.join(f.out, contract.buildInfo)),
      fs.readFileSync(f.buildFile)
    );
    for (const [file, hash] of Object.entries(index.files))
      assert.equal(
        createHash('sha256')
          .update(fs.readFileSync(path.join(f.out, file)))
          .digest('hex'),
        hash
      );
    assert.throws(() => archiveVerification(f.out, f.root), /EEXIST/);
    assert.deepEqual(
      fs.readFileSync(path.join(f.out, 'index.json')),
      indexBytes
    );
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('verification archive refuses a stale or historical build before reserving output', () => {
  const f = fixture();
  try {
    fs.writeFileSync(
      path.join(f.root, 'contracts/v2/Deployer.sol'),
      '// changed'
    );
    assert.throws(() => archiveVerification(f.out, f.root), /stale/);
    assert.equal(fs.existsSync(f.out), false);
    fs.writeFileSync(
      path.join(f.root, 'contracts/v2/Deployer.sol'),
      f.build.input.sources['contracts/v2/Deployer.sol'].content
    );
    f.build.solcVersion = '0.8.25';
    fs.writeFileSync(f.buildFile, JSON.stringify(f.build));
    assert.throws(
      () => archiveVerification(f.out, f.root),
      /Production artifacts/
    );
    assert.equal(fs.existsSync(f.out), false);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('verification process failures cannot become successful explorer evidence', () => {
  const options = { network: 'mainnet', address: '0x' + '1'.repeat(40) };
  for (const result of [
    { status: null },
    { status: null, signal: 'SIGTERM' },
    { status: 0, error: Error('spawn failed') },
    { status: 1, stdout: 'already verified, but another target failed' },
  ])
    assert.notEqual(runHardhatVerify(options, () => result).status, 0);
  assert.deepEqual(
    runHardhatVerify(options, () => ({ status: 0 })),
    { status: 0, alreadyVerified: false }
  );
});

test('verification passes libraries as the actual Hardhat module-file interface and cleans it up', () => {
  const libraries = { 'contracts/L.sol:L': '0x' + '1'.repeat(40) };
  let libraryFile;
  runHardhatVerify(
    { network: 'mainnet', address: '0x' + '2'.repeat(40), libraries },
    (cmd, args) => {
      assert.equal(cmd, 'npx');
      assert.equal(args.includes('--no-compile'), false);
      libraryFile = args[args.indexOf('--libraries') + 1];
      assert.deepEqual(require(libraryFile), libraries);
      return { status: 0 };
    }
  );
  assert.equal(fs.existsSync(libraryFile), false);
});
