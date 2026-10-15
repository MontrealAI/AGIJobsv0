'use strict';
// Compile the exact entrypoint sources with the installed ts-node/TypeScript
// CommonJS runtime. Script execution has only inert Hardhat, provider and fs
// interfaces: no real contracts, network, writes, bootstrap or package installs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { wrap } = require('node:module');
const ts = require('typescript');
const { create } = require('ts-node');

const root = path.resolve(__dirname, '../..');
const demo = path.join(root, 'demo/cosmic-omni-sovereign-symphony');
const scripts = path.join(demo, 'scripts');
const configPath = path.join(demo, 'config/multinational-governance.json');
const deploymentPath = path.join(demo, 'logs/deployment-latest.json');
const entrypoints = [
  'deploy-governance',
  'seed-governance',
  'simulate-governance',
  'export-ledger',
];
const compiler = create({
  cwd: root,
  project: path.join(root, 'tsconfig.json'),
  transpileOnly: true,
});
const compiled = new Map();
const fileFor = (name) => path.join(scripts, `${name}.ts`);
const zeroAddress = '0x' + '0'.repeat(40);
const zeroHash = '0x' + '0'.repeat(64);
const signerAddress = '0x' + '1'.repeat(40);
const contractAddress = '0x' + '2'.repeat(40);
const now = 1700000000000;
const networkJSON = { _type: 'network', name: 'localhost', chainId: '31337' };
// ethers v6 Network.toJSON serializes its bigint chainId to a string.
const network = {
  name: 'localhost',
  chainId: 31337n,
  toJSON: () => networkJSON,
};

function compile(name) {
  assert.ok(entrypoints.includes(name), `Unexpected entrypoint ${name}`);
  if (!compiled.has(name)) {
    const file = fileFor(name);
    compiled.set(name, compiler.compile(fs.readFileSync(file, 'utf8'), file));
  }
  return compiled.get(name);
}

async function execute(
  name,
  { argv = [], env = {}, files = {}, ethers = {} } = {}
) {
  const file = fileFor(name);
  const reads = [];
  const writes = [];
  const directories = [];
  const errors = [];
  const logs = [];
  const processStub = {
    argv: [process.execPath, file, ...argv],
    env: { ...env },
  };
  const allowed = {
    fs: {
      existsSync: (target) => {
        reads.push(['exists', target]);
        return Object.hasOwn(files, target);
      },
      readFileSync: (target, encoding) => {
        reads.push(['read', target, encoding]);
        assert.ok(
          Object.hasOwn(files, target),
          `Unexpected file read ${target}`
        );
        assert.equal(encoding, 'utf-8');
        return files[target];
      },
      mkdirSync: (target, options) =>
        directories.push([target, { ...options }]),
      writeFileSync: (target, content) => writes.push([target, content]),
    },
    path,
    hardhat: { ethers },
  };
  const context = vm.createContext({
    module: { exports: {} },
    require: (name) => {
      assert.ok(Object.hasOwn(allowed, name), `Unexpected module ${name}`);
      return allowed[name];
    },
    __filename: file,
    __dirname: path.dirname(file),
    process: processStub,
    console: {
      log: (...args) => logs.push(args),
      error: (...args) => errors.push(args),
    },
    Date: class extends Date {
      constructor(...args) {
        super(...(args.length ? args : [now]));
      }
      static now() {
        return now;
      }
    },
  });
  // Node's real CommonJS wrapper binds __filename and __dirname. Do not rewrite
  // or append to the script source, extract main(), or execute imported files.
  new vm.Script(
    `const loadScript = ${wrap(compile(name))}
loadScript(module.exports, require, module, __filename, __dirname);`,
    { filename: file }
  ).runInContext(context, { timeout: 1000 });
  // Every async stub settles immediately; drain the entrypoint's microtasks,
  // including its top-level rejection handler, before inspecting the result.
  await new Promise(setImmediate);
  return { process: processStub, reads, writes, directories, errors, logs };
}

function assertSuccess(result) {
  assert.equal(result.process.exitCode, undefined);
  assert.deepEqual(result.errors, []);
}

function assertFailure(result, prefix, error) {
  assert.equal(result.process.exitCode, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0][0], prefix);
  if (error instanceof Error) assert.equal(result.errors[0][1], error);
  else assert.match(result.errors[0][1].message, error);
  assert.deepEqual(result.writes, []);
  assert.deepEqual(result.directories, []);
}

test('the exact launcher preflight accepts all four CommonJS governance scripts', () => {
  const launcher = fs.readFileSync(path.join(demo, 'bin/execution.sh'), 'utf8');
  const preflight = launcher.match(/node - "\$ROOT" <<'JS'\n([\s\S]*?)\nJS/);
  assert.ok(preflight, 'Runtime preflight must remain in the launcher');
  const files = entrypoints.map(fileFor);
  const read = [];
  const allowed = {
    fs: {
      readFileSync: (file, encoding) => {
        assert.ok(files.includes(file), `Unexpected preflight file ${file}`);
        read.push(file);
        return fs.readFileSync(file, encoding);
      },
    },
    path,
    vm,
    [path.join(root, 'node_modules/typescript')]: ts,
  };
  new vm.Script(preflight[1]).runInNewContext({
    process: { argv: [process.execPath, '-', root] },
    require: (name) => {
      assert.ok(Object.hasOwn(allowed, name), `Unexpected module ${name}`);
      return allowed[name];
    },
  });
  assert.deepEqual(read, files);
});

test('all four exact scripts parse under ts-node and the Node CommonJS wrapper', () => {
  assert.equal(compiler.config.options.module, ts.ModuleKind.CommonJS);
  for (const name of entrypoints) {
    assert.doesNotThrow(
      () => new vm.Script(wrap(compile(name)), { filename: fileFor(name) })
    );
  }
});

function deploymentStubs(failureAt) {
  const calls = [];
  const failure = new Error('inert deployment failure');
  const step = async (name, args, value) => {
    calls.push([name, ...args]);
    if (failureAt === name) throw failure;
    return value;
  };
  const contract = {
    waitForDeployment: () => step('waitForDeployment', []),
    getAddress: () => step('getAddress', [], contractAddress),
  };
  const factory = { deploy: (...args) => step('deploy', args, contract) };
  return {
    calls,
    failure,
    ethers: {
      ZeroAddress: zeroAddress,
      ZeroHash: zeroHash,
      getSigners: () =>
        step(
          'getSigners',
          [],
          [
            {
              address: signerAddress,
              provider: { getNetwork: () => step('getNetwork', [], network) },
            },
          ]
        ),
      getContractFactory: (...args) =>
        step('getContractFactory', args, factory),
    },
  };
}

test('deployment forwards the checked-in inputs unchanged and serializes its output', async () => {
  const configText = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configText);
  const stub = deploymentStubs();
  const result = await execute('deploy-governance', {
    files: { [configPath]: configText },
    ethers: stub.ethers,
  });
  assertSuccess(result);
  assert.deepEqual(stub.calls, [
    ['getSigners'],
    ['getContractFactory', 'GlobalGovernanceCouncil'],
    ['deploy', config.owner, config.pauserRole],
    ['waitForDeployment'],
    ['getAddress'],
    ['getNetwork'],
  ]);
  assert.deepEqual(result.reads, [
    ['exists', configPath],
    ['read', configPath, 'utf-8'],
  ]);
  assert.deepEqual(result.directories, [
    [path.dirname(deploymentPath), { recursive: true }],
  ]);
  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0][0], deploymentPath);
  assert.deepEqual(JSON.parse(result.writes[0][1]), {
    network: networkJSON,
    deployer: signerAddress,
    owner: config.owner,
    pauserRole: config.pauserRole,
    contract: contractAddress,
    timestamp: now,
  });
});

test('deployment preserves missing/zero owner fallback and optional config override', async (t) => {
  for (const owner of [undefined, zeroAddress]) {
    await t.test(`owner ${owner}`, async () => {
      const customConfig = '/inert config/governance.json';
      const stub = deploymentStubs();
      const result = await execute('deploy-governance', {
        env: { AGIJOBS_GOV_CONFIG: customConfig },
        files: { [customConfig]: JSON.stringify({ owner }) },
        ethers: stub.ethers,
      });
      assertSuccess(result);
      assert.deepEqual(stub.calls[2], ['deploy', signerAddress, zeroHash]);
      assert.equal(JSON.parse(result.writes[0][1]).owner, signerAddress);
      assert.deepEqual(result.reads, [
        ['exists', customConfig],
        ['read', customConfig, 'utf-8'],
      ]);
    });
  }
});

test('deployment reports missing config before any Hardhat call', async () => {
  const stub = deploymentStubs();
  const result = await execute('deploy-governance', { ethers: stub.ethers });
  assertFailure(result, '[deploy] failed', /Configuration file not found/);
  assert.deepEqual(stub.calls, []);
});

test('deployment propagates factory, contract and provider failures without a success artifact', async (t) => {
  for (const stage of [
    'getContractFactory',
    'deploy',
    'waitForDeployment',
    'getAddress',
    'getNetwork',
  ]) {
    await t.test(stage, async () => {
      const stub = deploymentStubs(stage);
      const result = await execute('deploy-governance', {
        files: { [configPath]: '{}' },
        ethers: stub.ethers,
      });
      assertFailure(result, '[deploy] failed', stub.failure);
      assert.equal(stub.calls.at(-1)[0], stage);
    });
  }
});

function ledgerStubs(failureAt) {
  const calls = [];
  const failure = new Error('inert ledger failure');
  const step = async (name, args, value) => {
    calls.push([name, ...args]);
    if (failureAt === name) throw failure;
    return value;
  };
  const contract = {
    runner: { provider: { getNetwork: () => step('getNetwork', [], network) } },
    getNationIds: () => step('getNationIds', [], ['nation-1', 'nation-2']),
    getNation: (...args) =>
      step('getNation', args, {
        governor: signerAddress,
        votingWeight: 5n,
        active: true,
        metadataURI: 'ipfs://nation',
      }),
    getMandate: (...args) =>
      step('getMandate', args, {
        quorum: 5n,
        startTimestamp: 10n,
        endTimestamp: 20n,
        supportWeight: 5n,
        againstWeight: 0n,
        executed: false,
        metadataURI: 'ipfs://mandate',
      }),
    getMandateVote: (...args) =>
      step('getMandateVote', args, {
        cast: args[1] === 'nation-1',
        support: true,
        weight: 5n,
        metadataURI: 'ipfs://vote',
        timestamp: 15n,
      }),
  };
  return {
    calls,
    failure,
    ethers: {
      getContractAt: (...args) => step('getContractAt', args, contract),
    },
  };
}

test('ts-node-compiled export accepts direct invocation argv and serializes bigint fields', async () => {
  const stub = ledgerStubs();
  const output = '/inert output with spaces/ledger.json';
  const result = await execute('export-ledger', {
    argv: ['--output', output],
    env: { HARDHAT_NETWORK: 'localhost' },
    files: {
      [deploymentPath]: JSON.stringify({ contract: contractAddress }),
      [configPath]: JSON.stringify({ mandates: [{ id: 'mandate-1' }] }),
    },
    ethers: stub.ethers,
  });
  assertSuccess(result);
  assert.deepEqual(stub.calls, [
    ['getContractAt', 'GlobalGovernanceCouncil', contractAddress],
    ['getNationIds'],
    ['getNetwork'],
    ['getNation', 'nation-1'],
    ['getNation', 'nation-2'],
    ['getMandate', 'mandate-1'],
    ['getMandateVote', 'mandate-1', 'nation-1'],
    ['getMandateVote', 'mandate-1', 'nation-2'],
  ]);
  assert.deepEqual(result.directories, [
    [path.dirname(output), { recursive: true }],
  ]);
  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0][0], output);
  assert.deepEqual(JSON.parse(result.writes[0][1]), {
    contract: contractAddress,
    timestamp: new Date(now).toISOString(),
    network: networkJSON,
    nations: ['nation-1', 'nation-2'].map((id) => ({
      id,
      governor: signerAddress,
      weight: '5',
      active: true,
      metadataURI: 'ipfs://nation',
    })),
    mandates: [
      {
        id: 'mandate-1',
        quorum: '5',
        startTimestamp: '10',
        endTimestamp: '20',
        supportWeight: '5',
        againstWeight: '0',
        executed: false,
        metadataURI: 'ipfs://mandate',
        votes: [
          {
            nationId: 'nation-1',
            support: true,
            weight: '5',
            metadataURI: 'ipfs://vote',
            timestamp: '15',
          },
        ],
      },
    ],
  });
});

test('export retains explicit address and absent optional config behavior', async () => {
  const stub = ledgerStubs();
  const result = await execute('export-ledger', {
    argv: ['--output', 'ledger.json'],
    env: { GOVERNANCE_ADDRESS: contractAddress },
    ethers: stub.ethers,
  });
  assertSuccess(result);
  assert.deepEqual(result.reads, [['exists', configPath]]);
  assert.equal(stub.calls[0][2], contractAddress);
  assert.deepEqual(JSON.parse(result.writes[0][1]).mandates, []);
});

test('export rejects missing, malformed, duplicate and unknown argv before fs or providers', async (t) => {
  const cases = [
    [[], /--output <path> is required/],
    [['--output'], /--output <path> is required/],
    [['--output', ''], /--output <path> is required/],
    [['--output', '  '], /--output <path> is required/],
    [['--output', '--network'], /--output <path> is required/],
    [['--output=ledger.json'], /Unknown argument "--output=ledger.json"/],
    [['--unknown'], /Unknown argument "--unknown"/],
    [['ledger.json'], /Unknown argument "ledger.json"/],
    [['--', '--output', 'ledger.json'], /Unknown argument "--"/],
    [
      ['--output', 'ledger.json', '--output', 'other.json'],
      /Unexpected argument "--output"/,
    ],
    [
      ['--output', 'ledger.json', '--unknown'],
      /Unexpected argument "--unknown"/,
    ],
    [['--output', 'ledger.json', 'extra'], /Unexpected argument "extra"/],
  ];
  for (const [argv, message] of cases) {
    await t.test(JSON.stringify(argv), async () => {
      const stub = ledgerStubs();
      const result = await execute('export-ledger', {
        argv,
        ethers: stub.ethers,
      });
      assertFailure(result, '[export] failed', message);
      assert.match(
        result.errors[0][1].message,
        /Usage: export-ledger.ts --output <path>/
      );
      assert.deepEqual(result.reads, []);
      assert.deepEqual(stub.calls, []);
    });
  }
});

test('export reports missing deployment before any provider call', async () => {
  const stub = ledgerStubs();
  const result = await execute('export-ledger', {
    argv: ['--output', 'ledger.json'],
    ethers: stub.ethers,
  });
  assertFailure(
    result,
    '[export] failed',
    /Missing deployment log.*GOVERNANCE_ADDRESS/
  );
  assert.deepEqual(stub.calls, []);
});

test('export propagates contract/provider failures without writing a partial ledger', async (t) => {
  for (const stage of [
    'getContractAt',
    'getNationIds',
    'getNetwork',
    'getNation',
    'getMandate',
    'getMandateVote',
  ]) {
    await t.test(stage, async () => {
      const stub = ledgerStubs(stage);
      const result = await execute('export-ledger', {
        argv: ['--output', 'ledger.json'],
        env: { GOVERNANCE_ADDRESS: contractAddress },
        files: {
          [configPath]: JSON.stringify({ mandates: [{ id: 'mandate-1' }] }),
        },
        ethers: stub.ethers,
      });
      assertFailure(result, '[export] failed', stub.failure);
      assert.equal(stub.calls.at(-1)[0], stage);
    });
  }
});
