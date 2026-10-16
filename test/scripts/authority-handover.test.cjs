'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ethers } = require('ethers');
const {
  validateAuthorityRoles,
  readRecoveryEvidence,
  acquireDeploymentLock,
} = require('../../scripts/deploy/authority-handover.cjs');
const {
  createAuthoritySourceReader,
  pinnedReader,
} = require('../../scripts/deploy/authority-runtime.cjs');
const policy = require('../../config/solidity-compiler.json');
const creator = '0x1000000000000000000000000000000000000001';
const governor = '0x2000000000000000000000000000000000000002';
const treasury = '0x3000000000000000000000000000000000000003';
const config = () => ({
  governance: governor,
  authority: {
    stakeManagerTreasury: treasury,
    feePoolTreasury: treasury,
    feePoolGovernance: governor,
  },
});

test('requires distinct explicit governor and every separate treasury role', () => {
  assert.deepEqual(
    validateAuthorityRoles(config(), creator),
    config().authority
  );
  for (const mutate of [
    (c) => {
      delete c.governance;
    },
    (c) => {
      c.governance = creator;
    },
    (c) => {
      c.governance = ethers.ZeroAddress;
    },
    (c) => {
      delete c.authority;
    },
    (c) => {
      delete c.authority.feePoolTreasury;
    },
    (c) => {
      c.authority.extra = treasury;
    },
    ...Object.keys(config().authority).flatMap((field) => [
      (c) => {
        c.authority[field] = creator;
      },
      (c) => {
        c.authority[field] = ethers.ZeroAddress;
      },
    ]),
  ]) {
    const c = config();
    mutate(c);
    assert.throws(() => validateAuthorityRoles(c, creator));
  }
});

test('recovers last complete journal checkpoint after an interrupted report/append, but not corrupt complete records', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authority-journal-'));
  try {
    const file = path.join(dir, 'progress.jsonl');
    fs.writeFileSync(file, '{"step":1}\n{"step":2}\n{"incomplete":');
    assert.deepEqual(readRecoveryEvidence(file), { step: 2 });
    fs.writeFileSync(file, '{"step":1}\ninvalid\n');
    assert.throws(() => readRecoveryEvidence(file));
    fs.writeFileSync(file, '{"incomplete":');
    assert.throws(() => readRecoveryEvidence(file), /No complete/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('requires explicit shared lock root and never auto-breaks an existing lease', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authority-lock-'));
  try {
    assert.throws(
      () => acquireDeploymentLock(undefined, { chainId: 1, creator }),
      /explicit shared/
    );
    const lock = acquireDeploymentLock(dir, { chainId: 1, creator });
    assert.equal(path.basename(lock.path), `1-${creator.toLowerCase()}`);
    assert.throws(() => acquireDeploymentLock(dir, { chainId: 1, creator }));
    lock.release();
    acquireDeploymentLock(dir, { chainId: 1, creator }).release();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function sourceFixture(mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'authority-source-'));
  const source = 'contracts/v2/Deployer.sol';
  const text = 'contract Deployer {}\n';
  const compiled = {
    abi: [],
    evm: {
      bytecode: { object: '6000', linkReferences: {} },
      deployedBytecode: {
        object: '6001',
        linkReferences: {},
        immutableReferences: {},
      },
    },
  };
  const artifact = {
    contractName: 'Deployer',
    sourceName: source,
    abi: [],
    bytecode: '0x6000',
    deployedBytecode: '0x6001',
    linkReferences: {},
    deployedLinkReferences: {},
  };
  const build = {
    solcVersion: policy.version,
    solcLongVersion: policy.longVersion,
    input: {
      settings: {
        viaIR: true,
        optimizer: { enabled: true, runs: 200 },
        evmVersion: 'cancun',
      },
      sources: { [source]: { content: text } },
    },
    output: {
      contracts: { [source]: { Deployer: compiled } },
      sources: { [source]: { ast: { nodes: [] } } },
      errors: [],
    },
  };
  mutate({ artifact, build, compiled });
  fs.mkdirSync(path.join(root, 'contracts/v2'), { recursive: true });
  fs.writeFileSync(path.join(root, source), text);
  const dir = path.join(root, 'artifacts', source);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, 'artifacts/build-info'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'artifacts/build-info/build.json'),
    JSON.stringify(build)
  );
  fs.writeFileSync(path.join(dir, 'Deployer.json'), JSON.stringify(artifact));
  fs.writeFileSync(
    path.join(dir, 'Deployer.dbg.json'),
    JSON.stringify({ buildInfo: '../../../build-info/build.json' })
  );
  return { root, source };
}

test('binds exact native compiler, source, ABI, code and immutable/library evidence', () => {
  for (const [mutate, error] of [
    [() => {}, null],
    [
      ({ artifact }) => {
        artifact.sourceName = 'wrong.sol';
      },
      /identity/,
    ],
    [
      ({ build }) => {
        build.solcLongVersion += '.Emscripten.clang';
      },
      /Production artifacts/,
    ],
    [
      ({ artifact }) => {
        artifact.bytecode = '0x6002';
      },
      /compiler output/,
    ],
    [
      ({ artifact }) => {
        artifact.abi = ['bad'];
      },
      /compiler output/,
    ],
    [
      ({ artifact }) => {
        artifact.linkReferences = { lib: {} };
      },
      /linked-library/,
    ],
    [
      ({ compiled }) => {
        compiled.evm.deployedBytecode.immutableReferences = {
          1: [{ start: 0, length: 32 }],
        };
      },
      /Missing reviewed immutable/,
    ],
  ]) {
    const { root } = sourceFixture(mutate);
    try {
      const read = () =>
        createAuthoritySourceReader(root)('Deployer', governor, {
          token: treasury,
        });
      if (error) assert.throws(read, error);
      else assert.equal(read().runtime, '0x6001');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  const { root, source } = sourceFixture();
  try {
    const read = createAuthoritySourceReader(root);
    read('Deployer', governor);
    fs.appendFileSync(path.join(root, source), '// stale\n');
    assert.throws(() => read('Deployer', governor), /source is stale/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('public-chain readback insists on EIP-1898 canonical block hash and refuses a changed chain', async () => {
  const block = { number: 5, hash: ethers.id('canonical'), timestamp: 123 };
  const calls = [];
  const provider = {
    getBlock: async () => block,
    send: async (method, args) => {
      calls.push([method, args]);
      return method === 'eth_chainId' ? '0x1' : '0x6000';
    },
  };
  const read = await pinnedReader(provider, 1);
  await read.code(governor);
  assert.deepEqual(calls.at(-1)[1][1], {
    blockHash: block.hash,
    requireCanonical: true,
  });
  await read.finish();
  provider.send = async () => '0x2';
  await assert.rejects(read.finish(), /chain mismatch/);
});

test('actual unpause entrypoint refuses missing, foreign or incomplete evidence before selecting any signer, including dry runs', async () => {
  const vm = require('node:vm');
  const ts = require('typescript');
  const file = path.resolve(__dirname, '../../scripts/v2/systemPauseAction.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  for (const dryRun of [false, true])
    for (const kind of ['missing', 'foreign', 'incomplete']) {
      let signerReads = 0,
        auditReads = 0;
      const errors = [];
      const fixtureProcess = {
        argv: [
          'node',
          file,
          '--action',
          'unpause',
          ...(dryRun ? ['--dry-run'] : []),
        ],
        env:
          kind === 'missing'
            ? {}
            : { DEPLOYMENT_AUTHORITY_EVIDENCE: 'evidence.json' },
      };
      const evidence = {
        creationRecords: {
          SystemPause: { address: kind === 'foreign' ? creator : governor },
        },
      };
      const pause = new Proxy(
        {},
        {
          get: (_target, name) =>
            name === 'then'
              ? undefined
              : async () => (name === 'governance' ? governor : treasury),
        }
      );
      const fakeEthers = {
        ...ethers,
        provider: {},
        getContractAt: async (name) =>
          name === 'SystemPause' ? pause : { paused: async () => true },
        getSigners: async () => {
          signerReads += 1;
          throw new Error('Signer must not be selected');
        },
      };
      const importModule = (name) => {
        if (name === 'hardhat')
          return { ethers: fakeEthers, network: { name: 'mainnet' } };
        if (name === '../config')
          return {
            loadTokenConfig: () => ({
              config: { modules: { systemPause: governor } },
            }),
          };
        if (name === 'node:fs')
          return { readFileSync: () => JSON.stringify(evidence) };
        if (name === '../deploy/authority-audit.cjs')
          return {
            requireActivationReady: async () => {
              auditReads += 1;
              throw new Error(
                'Activation blocked: incomplete authority evidence'
              );
            },
          };
        return require(name);
      };
      vm.runInNewContext(
        code,
        {
          exports: {},
          require: importModule,
          process: fixtureProcess,
          console: {
            error: (...args) => errors.push(args.map(String).join(' ')),
            log() {},
          },
        },
        { filename: file }
      );
      await new Promise(setImmediate);
      assert.equal(fixtureProcess.exitCode, 1, `${kind}/${dryRun}`);
      assert.equal(signerReads, 0);
      assert.equal(auditReads, kind === 'incomplete' ? 1 : 0);
      assert.match(
        errors.join(),
        /requires DEPLOYMENT_AUTHORITY_EVIDENCE|different SystemPause|Activation blocked/
      );
    }
});
