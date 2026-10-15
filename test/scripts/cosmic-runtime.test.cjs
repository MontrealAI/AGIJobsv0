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
const ethersLibrary = require('ethers');
const util = require('node:util');
const Ajv = require('ajv');

const root = path.resolve(__dirname, '../..');
const demo = path.join(root, 'demo/cosmic-omni-sovereign-symphony');
const scripts = path.join(demo, 'scripts');
const configPath = path.join(demo, 'config/multinational-governance.json');
const fixtureText = fs.readFileSync(configPath, 'utf8');
const fixture = JSON.parse(fixtureText);
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
  assert.ok(
    [...entrypoints, 'governance-config', 'governance-json'].includes(name),
    `Unexpected entrypoint ${name}`
  );
  if (!compiled.has(name)) {
    const file = fileFor(name);
    compiled.set(name, compiler.compile(fs.readFileSync(file, 'utf8'), file));
  }
  return compiled.get(name);
}

async function execute(
  name,
  { argv = [], env = {}, files = {}, ethers = {}, filesystem = {} } = {}
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
  const offsets = new Map();
  const rawFile = (target) => {
    assert.ok(Object.hasOwn(files, target), `Unexpected file read ${target}`);
    return Buffer.isBuffer(files[target])
      ? files[target]
      : Buffer.from(files[target]);
  };
  const allowed = {
    fs: {
      constants: fs.constants,
      openSync: (target) => {
        reads.push(['open', target]);
        rawFile(target);
        offsets.set(target, 0);
        return target;
      },
      fstatSync: (target) => ({
        size: rawFile(target).length,
        isFile: () => true,
      }),
      readSync: (target, output, start, size) => {
        const bytes = rawFile(target);
        const offset = offsets.get(target);
        const count = bytes.copy(output, start, offset, offset + size);
        offsets.set(target, offset + count);
        return count;
      },
      closeSync: (target) => reads.push(['close', target]),
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
    ethers: {
      isAddress: ethersLibrary.isAddress,
      ZeroAddress: ethersLibrary.ZeroAddress,
    },
    util,
  };
  Object.assign(allowed.fs, filesystem);
  const modules = new Map();
  const context = vm.createContext({
    Buffer,
    module: { exports: {} },
    require: (name) => {
      const helpers = {
        './governance-config': fileFor('governance-config'),
        './governance-json': fileFor('governance-json'),
        '../../../scripts/phase6/config-validation': path.join(
          root,
          'scripts/phase6/config-validation.ts'
        ),
      };
      if (Object.hasOwn(helpers, name)) {
        if (!modules.has(name)) {
          const target = helpers[name];
          const module = { exports: {} };
          const code = compiler.compile(
            fs.readFileSync(target, 'utf8'),
            target
          );
          const load = new vm.Script(wrap(code), {
            filename: target,
          }).runInContext(context, { timeout: 1000 });
          load(
            module.exports,
            context.require,
            module,
            target,
            path.dirname(target)
          );
          modules.set(name, module.exports);
        }
        return modules.get(name);
      }
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
  // or append to the script source or extract main(). The exact shared validators
  // are loaded through the same wrapper with only allowlisted inert/pure imports.
  new vm.Script(
    `const loadScript = ${wrap(compile(name))}
loadScript(module.exports, require, module, __filename, __dirname);`,
    { filename: file }
  ).runInContext(context, { timeout: 1000 });
  // Every async stub settles immediately; drain the entrypoint's microtasks,
  // including its top-level rejection handler, before inspecting the result.
  await new Promise(setImmediate);
  return {
    process: processStub,
    reads,
    writes,
    directories,
    errors,
    logs,
    modules,
  };
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
    ['open', configPath],
    ['close', configPath],
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

test('deployment requires explicit versioned owner/pauser inputs and supports a valid config override', async () => {
  const customConfig = '/inert config/governance.json';
  const stub = deploymentStubs();
  const result = await execute('deploy-governance', {
    env: { AGIJOBS_GOV_CONFIG: customConfig },
    files: { [customConfig]: fixtureText },
    ethers: stub.ethers,
  });
  assertSuccess(result);
  assert.deepEqual(stub.calls[2], [
    'deploy',
    fixture.owner,
    fixture.pauserRole,
  ]);
  assert.deepEqual(result.reads, [
    ['exists', customConfig],
    ['open', customConfig],
    ['close', customConfig],
  ]);
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
        files: { [configPath]: fixtureText },
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
        exists: true,
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
      [configPath]: fixtureText,
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
    ['getMandate', fixture.mandates[0].id],
    ['getMandateVote', fixture.mandates[0].id, 'nation-1'],
    ['getMandateVote', fixture.mandates[0].id, 'nation-2'],
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
        id: fixture.mandates[0].id,
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

test('export requires config before any provider call, including an explicit address', async () => {
  const stub = ledgerStubs();
  const result = await execute('export-ledger', {
    argv: ['--output', 'ledger.json'],
    env: { GOVERNANCE_ADDRESS: contractAddress },
    ethers: stub.ethers,
  });
  assertFailure(result, '[export] failed', /Configuration file not found/);
  assert.deepEqual(stub.calls, []);
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
    files: { [configPath]: fixtureText },
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
          [configPath]: fixtureText,
        },
        ethers: stub.ethers,
      });
      assertFailure(result, '[export] failed', stub.failure);
      assert.equal(stub.calls.at(-1)[0], stage);
    });
  }
});

const prefixFor = {
  'deploy-governance': '[deploy] failed',
  'seed-governance': '[seed] failed',
  'simulate-governance': '[simulate] failed',
  'export-ledger': '[export] failed',
};
const mutateFixture = (mutate) => {
  const config = structuredClone(fixture);
  mutate(config);
  return config;
};
const unknownId = '0x' + 'f'.repeat(64);
const shapeCases = [
  [
    'missing schema version',
    (c) => {
      delete c.schemaVersion;
    },
  ],
  [
    'unknown schema version',
    (c) => {
      c.schemaVersion = 2;
    },
  ],
  [
    'string schema version',
    (c) => {
      c.schemaVersion = '1';
    },
  ],
  [
    'unknown top-level key',
    (c) => {
      c.chainId = 31337;
    },
  ],
  [
    'missing owner',
    (c) => {
      delete c.owner;
    },
  ],
  [
    'zero owner',
    (c) => {
      c.owner = zeroAddress;
    },
  ],
  [
    'malformed owner',
    (c) => {
      c.owner = 'owner.eth';
    },
  ],
  [
    'bad checksum',
    (c) => {
      c.owner = '0xF39Fd6e51aad88f6f4ce6ab8827279cfffb92266';
    },
  ],
  [
    'zero role',
    (c) => {
      c.pauserRole = zeroHash;
    },
  ],
  [
    'short role',
    (c) => {
      c.pauserRole = '0x12';
    },
  ],
  [
    'oversized role',
    (c) => {
      c.pauserRole += '00';
    },
  ],
  [
    'uppercase role',
    (c) => {
      c.pauserRole = '0x' + 'A'.repeat(64);
    },
  ],
  [
    'invalid role hex',
    (c) => {
      c.pauserRole = '0x' + 'z'.repeat(64);
    },
  ],
  [
    'whitespace identifier',
    (c) => {
      c.nations[0].id += ' ';
    },
  ],
  [
    'zero nation',
    (c) => {
      c.nations[0].id = zeroHash;
    },
  ],
  [
    'short nation',
    (c) => {
      c.nations[0].id = '0x123';
    },
  ],
  [
    'oversized nation',
    (c) => {
      c.nations[0].id += '00';
    },
  ],
  [
    'duplicate nation',
    (c) => {
      c.nations.push(c.nations[0]);
    },
  ],
  [
    'duplicate mandate',
    (c) => {
      c.mandates.push(c.mandates[0]);
    },
  ],
  [
    'unknown mandate reference',
    (c) => {
      c.votes[0].mandateId = unknownId;
    },
  ],
  [
    'unknown nation reference',
    (c) => {
      c.votes[0].nationId = unknownId;
    },
  ],
  [
    'short vote reference',
    (c) => {
      c.votes[0].nationId = '0x12';
    },
  ],
  [
    'missing nation field',
    (c) => {
      delete c.nations[0].metadataURI;
    },
  ],
  [
    'unknown nation field',
    (c) => {
      c.nations[0].votingWeight = 3;
    },
  ],
  [
    'unknown mandate field',
    (c) => {
      c.mandates[0].endTimestamp = 10;
    },
  ],
  [
    'unknown vote field',
    (c) => {
      c.votes[0].weight = 10;
    },
  ],
  [
    'zero governor',
    (c) => {
      c.nations[0].governor = zeroAddress;
    },
  ],
  [
    'zero weight',
    (c) => {
      c.nations[0].weight = 0;
    },
  ],
  [
    'negative weight',
    (c) => {
      c.nations[0].weight = -1;
    },
  ],
  [
    'fractional weight',
    (c) => {
      c.nations[0].weight = 1.5;
    },
  ],
  [
    'string weight',
    (c) => {
      c.nations[0].weight = '2';
    },
  ],
  [
    'boolean weight',
    (c) => {
      c.nations[0].weight = true;
    },
  ],
  [
    'unsafe weight',
    (c) => {
      c.nations[0].weight = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'zero quorum',
    (c) => {
      c.mandates[0].quorum = 0;
    },
  ],
  [
    'null quorum',
    (c) => {
      c.mandates[0].quorum = null;
    },
  ],
  [
    'negative delay',
    (c) => {
      c.mandates[0].startDelaySeconds = -1;
    },
  ],
  [
    'fractional duration',
    (c) => {
      c.mandates[0].durationSeconds = 1.5;
    },
  ],
  [
    'timestamp sum overflow',
    (c) => {
      c.mandates[0].startDelaySeconds = Number.MAX_SAFE_INTEGER;
    },
  ],
  [
    'duration sum overflow',
    (c) => {
      c.mandates[0].durationSeconds = Number.MAX_SAFE_INTEGER;
    },
  ],
  [
    'string support',
    (c) => {
      c.votes[0].support = 'false';
    },
  ],
  [
    'numeric support',
    (c) => {
      c.votes[0].support = 1;
    },
  ],
  [
    'null metadata',
    (c) => {
      c.votes[0].metadataURI = null;
    },
  ],
  [
    'oversized metadata',
    (c) => {
      c.nations[0].metadataURI = 'x'.repeat(2049);
    },
  ],
  [
    'wrong array type',
    (c) => {
      c.nations = {};
    },
  ],
  [
    'null array entry',
    (c) => {
      c.nations[0] = null;
    },
  ],
  [
    'nation count bound',
    (c) => {
      c.nations = Array(257).fill(c.nations[0]);
    },
  ],
  [
    'mandate count bound',
    (c) => {
      c.mandates = Array(257).fill(c.mandates[0]);
    },
  ],
  [
    'vote count bound',
    (c) => {
      c.votes = Array(4097).fill(c.votes[0]);
    },
  ],
];
const rawCases = [
  ['empty JSON', ''],
  ['root array', '[]'],
  [
    'duplicate root key',
    fixtureText.replace(
      '"schemaVersion": 1',
      '"schemaVersion": 1, "schemaVersion": 1'
    ),
  ],
  [
    'escaped duplicate nested key',
    fixtureText.replace('"weight": 1', '"weight": 1, "\\u0077eight": 1'),
  ],
  [
    'negative zero',
    fixtureText.replace('"startDelaySeconds": 30', '"startDelaySeconds": -0'),
  ],
  [
    'decimal integer token',
    fixtureText.replace('"weight": 1', '"weight": 1.0'),
  ],
  [
    'exponent integer token',
    fixtureText.replace('"weight": 1', '"weight": 1e0'),
  ],
  [
    'overflow number token',
    fixtureText.replace('"weight": 1', '"weight": 1e999'),
  ],
  [
    'underflow number token',
    fixtureText.replace('"weight": 1', '"weight": 1e-999'),
  ],
  ['NaN token', fixtureText.replace('"weight": 1', '"weight": NaN')],
  ['Infinity token', fixtureText.replace('"weight": 1', '"weight": Infinity')],
  ['leading-zero number', fixtureText.replace('"weight": 1', '"weight": 01')],
  [
    'fraction rounded to integer',
    fixtureText.replace('"weight": 1', '"weight": 1.0000000000000001'),
  ],
  [
    'UTF-8 BOM',
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(fixtureText)]),
  ],
  [
    'malformed UTF-8',
    Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d]),
  ],
  [
    'unpaired surrogate',
    fixtureText.replace('ipfs://example-governance-harmony', '\\ud800'),
  ],
  ['depth bound', '['.repeat(9) + '0' + ']'.repeat(9)],
  ['object depth bound', '{"x":'.repeat(9) + '0' + '}'.repeat(9)],
  ['byte bound', Buffer.alloc(1024 * 1024 + 1, 0x20)],
  ['trailing JSON', fixtureText + '{}'],
  [
    'trailing comma',
    fixtureText.replace('"schemaVersion": 1,', '"schemaVersion": 1,,'),
  ],
  ['unterminated string', '{"x":"unfinished'],
  ['wrong bracket', '{"x":[1}'],
];

test('every entrypoint rejects malformed raw or schema input before any provider or output effects', async (t) => {
  const cases = [
    ...shapeCases.map(([label, mutate]) => [
      label,
      JSON.stringify(mutateFixture(mutate)),
    ]),
    ...rawCases,
  ];
  for (const [label, input] of cases) {
    await t.test(label, async () => {
      for (const name of entrypoints) {
        const calls = [];
        const forbidden = new Proxy(
          {},
          {
            get: (_, key) => {
              calls.push(key);
              throw Error(`Provider access forbidden: ${String(key)}`);
            },
          }
        );
        const result = await execute(name, {
          argv: name === 'export-ledger' ? ['--output', 'ledger.json'] : [],
          env: { GOVERNANCE_ADDRESS: contractAddress },
          files: { [configPath]: input },
          ethers: forbidden,
        });
        assertFailure(result, prefixFor[name], /./);
        assert.deepEqual(
          calls,
          [],
          `${name}: ${label} must fail before Hardhat/provider access`
        );
      }
    });
  }
});

test('versioned JSON schema and runtime agree on shape; runtime additionally checks semantic bindings', async () => {
  const result = await execute('deploy-governance');
  const { validateGovernanceConfig, resolveMandateWindow } = result.modules.get(
    './governance-config'
  );
  const { parseGovernanceJson, GOVERNANCE_JSON_MAX_BYTES } =
    result.modules.get('./governance-json');
  const schema = JSON.parse(
    fs.readFileSync(
      path.join(demo, 'config/multinational-governance.schema.v1.json'),
      'utf8'
    )
  );
  const validate = new Ajv({ allErrors: true }).compile(schema);
  assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  assert.equal(
    validateGovernanceConfig(fixture, now / 1000),
    fixture,
    'validator must not normalize or mutate input'
  );
  const runtimeOnly = new Set([
    'bad checksum',
    'duplicate nation',
    'duplicate mandate',
    'unknown mandate reference',
    'unknown nation reference',
    'timestamp sum overflow',
    'duration sum overflow',
  ]);
  for (const [label, mutate] of shapeCases) {
    const config = mutateFixture(mutate);
    assert.throws(
      () => validateGovernanceConfig(config, now / 1000),
      undefined,
      label
    );
    if (!runtimeOnly.has(label)) assert.equal(validate(config), false, label);
  }
  const supported = mutateFixture((c) => {
    c.mandates[0].startDelaySeconds = 0;
    c.mandates[0].durationSeconds = 0;
    c.mandates[0].quorum = Number.MAX_SAFE_INTEGER; // unreachable quorum is permitted by the Council
    c.nations[0].weight = Number.MAX_SAFE_INTEGER;
    c.nations[1].governor = c.nations[0].governor; // one governor can represent multiple nations
    c.votes.push({ ...c.votes[0], support: false }); // ordered recast
  });
  assert.equal(validate(supported), true);
  assert.equal(validateGovernanceConfig(supported, now / 1000), supported);
  assert.deepEqual(
    { ...resolveMandateWindow(supported.mandates[0], now / 1000) },
    { start: BigInt(now / 1000), end: 0n }
  );
  assert.throws(
    () => resolveMandateWindow(supported.mandates[0], 0),
    /timestamp/
  );
  const boundary = mutateFixture((c) => {
    c.mandates[0].durationSeconds =
      Number.MAX_SAFE_INTEGER - now / 1000 - c.mandates[0].startDelaySeconds;
  });
  assert.equal(validateGovernanceConfig(boundary, now / 1000), boundary);
  assert.equal(
    resolveMandateWindow(boundary.mandates[0], now / 1000).end,
    BigInt(Number.MAX_SAFE_INTEGER)
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(parseGovernanceJson(Buffer.from(fixtureText)))),
    fixture
  );
  const exactLimit = Buffer.from(
    fixtureText +
      ' '.repeat(GOVERNANCE_JSON_MAX_BYTES - Buffer.byteLength(fixtureText))
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(parseGovernanceJson(exactLimit))),
    fixture
  );
  assert.throws(
    () => parseGovernanceJson(Buffer.concat([exactLimit, Buffer.from(' ')])),
    /1 MiB/
  );
});

test('bundled identifiers are documented right-zero-padded ASCII bytes and encode with the actual Council signatures', () => {
  const values = [
    fixture.pauserRole,
    ...fixture.nations.map((n) => n.id),
    ...fixture.mandates.map((m) => m.id),
  ];
  const originals = [
    'pauserrole:cosmic-omni',
    'GLOBAL_NORTHERN_ALLIANCE',
    'PACIFIC_COOLITION_SOVEREIGN',
    'GOVERNANCE_HARMONY',
  ];
  values.forEach((value, i) => {
    assert.equal(
      value,
      '0x' + Buffer.from(originals[i], 'ascii').toString('hex').padEnd(64, '0')
    );
    assert.equal(ethersLibrary.getBytes(value).length, 32);
  });
  const source = fs.readFileSync(
    path.join(root, 'contracts/v2/governance/GlobalGovernanceCouncil.sol'),
    'utf8'
  );
  const constructorArgs = source.match(/constructor\(([^)]*)\)/)[1];
  const functions = ['registerNation', 'createMandate', 'recordNationVote'];
  const signatures = functions.map(
    (name) =>
      `function ${name}(${source
        .match(new RegExp(`function ${name}\\(([^)]*)\\)`))[1]
        .replace(/\b(calldata|memory)\b/g, '')})`
  );
  const abi = new ethersLibrary.Interface([
    `constructor(${constructorArgs})`,
    ...signatures,
  ]);
  assert.doesNotThrow(() =>
    abi.encodeDeploy([fixture.owner, fixture.pauserRole])
  );
  for (const n of fixture.nations)
    assert.doesNotThrow(() =>
      abi.encodeFunctionData('registerNation', [
        n.id,
        n.governor,
        BigInt(n.weight),
        n.metadataURI,
      ])
    );
  for (const m of fixture.mandates)
    assert.doesNotThrow(() =>
      abi.encodeFunctionData('createMandate', [
        m.id,
        BigInt(m.quorum),
        BigInt(now / 1000 + m.startDelaySeconds),
        BigInt(now / 1000 + m.startDelaySeconds + m.durationSeconds),
        m.metadataURI,
      ])
    );
  for (const v of fixture.votes)
    assert.doesNotThrow(() =>
      abi.encodeFunctionData('recordNationVote', [
        v.mandateId,
        v.nationId,
        v.support,
        v.metadataURI,
      ])
    );
  assert.throws(
    () => abi.encodeDeploy([fixture.owner, '0x12']),
    /incorrect data length/
  );
});

test('seed forwards all validated fields as exact contract inputs and resolves windows before transactions', async () => {
  const calls = [];
  const transaction = { hash: 'inert', wait: async () => calls.push(['wait']) };
  const contract = {
    registerNation: async (...args) => {
      calls.push(['registerNation', ...args]);
      return transaction;
    },
    createMandate: async (...args) => {
      calls.push(['createMandate', ...args]);
      return transaction;
    },
  };
  const result = await execute('seed-governance', {
    env: { GOVERNANCE_ADDRESS: contractAddress },
    files: { [configPath]: fixtureText },
    ethers: {
      getContractAt: async (...args) => {
        calls.push(['getContractAt', ...args]);
        return contract;
      },
    },
  });
  assertSuccess(result);
  const expected = [
    ['getContractAt', 'GlobalGovernanceCouncil', contractAddress],
  ];
  for (const n of fixture.nations)
    expected.push(
      ['registerNation', n.id, n.governor, BigInt(n.weight), n.metadataURI],
      ['wait']
    );
  for (const m of fixture.mandates) {
    const start = BigInt(now / 1000 + m.startDelaySeconds);
    expected.push(
      [
        'createMandate',
        m.id,
        BigInt(m.quorum),
        start,
        start + BigInt(m.durationSeconds),
        m.metadataURI,
      ],
      ['wait']
    );
  }
  assert.deepEqual(calls, expected);
});

function simulationStubs({
  start = BigInt(now / 1000 + 30),
  end = BigInt(now / 1000 + 3630),
  failVote = false,
} = {}) {
  const calls = [];
  let blockTime = now / 1000;
  const tx = { hash: 'inert-tx', wait: async () => ({ blockNumber: 7 }) };
  const contract = {
    getMandate: async (id) => {
      calls.push(['getMandate', id]);
      return { exists: true, startTimestamp: start, endTimestamp: end };
    },
    connect: (signer) => {
      calls.push(['connect', signer]);
      return {
        recordNationVote: async (...args) => {
          calls.push(['recordNationVote', ...args]);
          if (failVote) throw Error('vote failed');
          return tx;
        },
        pause: async () => {
          calls.push(['pause']);
          return tx;
        },
        unpause: async () => {
          calls.push(['unpause']);
          return tx;
        },
      };
    },
    hasMandateReachedQuorum: async (id) => {
      calls.push(['hasMandateReachedQuorum', id]);
      return true;
    },
  };
  return {
    calls,
    ethers: {
      getAddress: ethersLibrary.getAddress,
      getContractAt: async (...args) => {
        calls.push(['getContractAt', ...args]);
        return contract;
      },
      getImpersonatedSigner: async (address) => {
        calls.push(['getImpersonatedSigner', address]);
        return address;
      },
      provider: {
        getNetwork: async () => network,
        getBlock: async () => ({ timestamp: blockTime }),
        send: async (name, args) => {
          calls.push([name, ...args]);
          if (name === 'evm_increaseTime') blockTime += args[0];
        },
      },
    },
  };
}

test('simulation binds canonical IDs to governors and preserves ordered recasts and owner pause controls', async () => {
  const config = mutateFixture((c) => {
    c.votes.push({ ...c.votes[0], support: false });
  });
  const stub = simulationStubs();
  const result = await execute('simulate-governance', {
    env: { GOVERNANCE_ADDRESS: contractAddress },
    files: { [configPath]: JSON.stringify(config) },
    ethers: stub.ethers,
  });
  assertSuccess(result);
  assert.deepEqual(
    stub.calls.filter((c) => c[0] === 'recordNationVote'),
    config.votes.map((v) => [
      'recordNationVote',
      v.mandateId,
      v.nationId,
      v.support,
      v.metadataURI,
    ])
  );
  const governors = config.votes.map((v) =>
    ethersLibrary.getAddress(
      config.nations.find((n) => n.id === v.nationId).governor
    )
  );
  assert.deepEqual(
    stub.calls
      .filter((c) => c[0] === 'hardhat_impersonateAccount')
      .map((c) => c[1]),
    [...governors, ethersLibrary.getAddress(config.owner)]
  );
  assert.equal(
    stub.calls.filter((c) => c[0] === 'hardhat_stopImpersonatingAccount')
      .length,
    4
  );
  assert.deepEqual(
    stub.calls.filter((c) => ['pause', 'unpause'].includes(c[0])),
    [['pause'], ['unpause']]
  );
  assert.deepEqual(
    stub.calls.find((c) => c[0] === 'evm_increaseTime'),
    ['evm_increaseTime', 31]
  );
  const ledger = JSON.parse(result.writes[0][1]);
  assert.equal(ledger.votes.length, 3);
  assert.deepEqual(ledger.quorum, [
    { mandateId: fixture.mandates[0].id, reached: true },
  ]);
});

test('simulation rejects unsafe on-chain time before time mutation and cleans up after a failed vote', async () => {
  const unsafe = simulationStubs({
    start: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
  });
  let result = await execute('simulate-governance', {
    env: { GOVERNANCE_ADDRESS: contractAddress },
    files: { [configPath]: fixtureText },
    ethers: unsafe.ethers,
  });
  assertFailure(result, '[simulate] failed', /unsafe time window/);
  assert.deepEqual(
    unsafe.calls.filter(
      (c) => c[0].startsWith('evm_') || c[0].startsWith('hardhat_')
    ),
    []
  );
  const failed = simulationStubs({ failVote: true });
  result = await execute('simulate-governance', {
    env: { GOVERNANCE_ADDRESS: contractAddress },
    files: { [configPath]: fixtureText },
    ethers: failed.ethers,
  });
  assertFailure(result, '[simulate] failed', /vote failed/);
  assert.equal(failed.calls.at(-1)[0], 'hardhat_stopImpersonatingAccount');
});

test('bad target addresses and ambiguous deployment JSON fail before provider access', async () => {
  for (const name of entrypoints.filter((n) => n !== 'deploy-governance')) {
    for (const env of [
      { GOVERNANCE_ADDRESS: zeroAddress },
      { GOVERNANCE_ADDRESS: 'council.eth' },
      { GOVERNANCE_ADDRESS: '' },
      {},
    ]) {
      const calls = [];
      const result = await execute(name, {
        argv: name === 'export-ledger' ? ['--output', 'ledger.json'] : [],
        env,
        files: {
          [configPath]: fixtureText,
          [deploymentPath]: `{"contract":"${contractAddress}","contract":"${contractAddress}"}`,
        },
        ethers: new Proxy(
          {},
          {
            get: (_, key) => {
              calls.push(key);
              throw Error('forbidden');
            },
          }
        ),
      });
      assertFailure(result, prefixFor[name], /address|duplicate JSON key/);
      assert.deepEqual(calls, []);
    }
  }
});

test('bounded file reader rejects special files and file growth, closes on failure, and supports short reads', async () => {
  const cases = [
    [
      'special file',
      { fstatSync: () => ({ size: 0, isFile: () => false }) },
      /regular file/,
    ],
    [
      'file grew past byte limit',
      {
        fstatSync: () => ({ size: 1, isFile: () => true }),
        readSync: (_fd, output, offset, size) => {
          output.fill(0x20, offset, offset + size);
          return size;
        },
      },
      /1 MiB/,
    ],
    [
      'read error',
      {
        readSync: () => {
          throw Error('inert read failure');
        },
      },
      /inert read failure/,
    ],
  ];
  for (const [_label, filesystem, message] of cases) {
    const stub = deploymentStubs();
    const result = await execute('deploy-governance', {
      files: { [configPath]: fixtureText },
      ethers: stub.ethers,
      filesystem,
    });
    assertFailure(result, '[deploy] failed', message);
    assert.deepEqual(result.reads.at(-1), ['close', configPath]);
    assert.deepEqual(stub.calls, []);
  }
  let offset = 0;
  const bytes = Buffer.from(fixtureText);
  const stub = deploymentStubs();
  const result = await execute('deploy-governance', {
    files: { [configPath]: fixtureText },
    ethers: stub.ethers,
    filesystem: {
      readSync: (_fd, output, start, size) => {
        const count = bytes.copy(
          output,
          start,
          offset,
          offset + Math.min(size, 7)
        );
        offset += count;
        return count;
      },
    },
  });
  assertSuccess(result);
  assert.deepEqual(result.reads.at(-1), ['close', configPath]);
});

test('ethers tuple properties agree with the actual Council struct fields used by export', () => {
  const source = fs.readFileSync(
    path.join(root, 'contracts/v2/governance/GlobalGovernanceCouncil.sol'),
    'utf8'
  );
  const examples = {
    NationConfig: ['ipfs://nation', fixture.nations[0].governor, 2n, true],
    Mandate: ['ipfs://mandate', 2n, 10n, 20n, 3n, 0n, false, true],
    VoteRecord: [true, true, 2n, 'ipfs://vote', 15n],
  };
  for (const [name, values] of Object.entries(examples)) {
    const fields = source
      .match(new RegExp(`struct ${name}\\s*\\{([^}]+)\\}`))[1]
      .trim()
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    const abi = new ethersLibrary.Interface([
      `function snapshot() view returns (tuple(${fields.join(',')}))`,
    ]);
    const result = abi.decodeFunctionResult(
      'snapshot',
      abi.encodeFunctionResult('snapshot', [values])
    )[0];
    fields.forEach((field, index) => {
      const key = field.split(/\s+/).at(-1);
      if (field.startsWith('address '))
        assert.equal(result[key].toLowerCase(), values[index].toLowerCase());
      else assert.equal(result[key], values[index]);
    });
  }
});

test('export fails instead of inventing a ledger record for an absent on-chain mandate', async () => {
  const stub = ledgerStubs();
  const original = stub.ethers.getContractAt;
  stub.ethers.getContractAt = async (...args) => ({
    ...(await original(...args)),
    getMandate: async () => ({ exists: false }),
  });
  const result = await execute('export-ledger', {
    argv: ['--output', 'ledger.json'],
    env: { GOVERNANCE_ADDRESS: contractAddress },
    files: { [configPath]: fixtureText },
    ethers: stub.ethers,
  });
  assertFailure(result, '[export] failed', /does not exist/);
});
