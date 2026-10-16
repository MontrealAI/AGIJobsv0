'use strict';
// All dependency/provider/compiler interfaces are inert stubs. These tests do
// not require npm install and do not compile, start a node, or contact a network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const demo = path.join(root, 'demo/cosmic-omni-sovereign-symphony');
const configPath = path.join(demo, 'config/hardhat.local.cjs');
const { localEndpoint } = require('../../demo/aurora/bin/local-rpc.cjs');
const hash = '0x' + 'a'.repeat(64);

function config(cache, env = {}) {
  let action;
  const downloaded = [];
  const module = { exports: {} };
  const allowed = {
    'ts-node/register/transpile-only': {},
    '@nomicfoundation/hardhat-toolbox': {},
    'node:path': path,
    'node:fs/promises': fs.promises,
    ethers: {
      keccak256: (data) =>
        data.toString() === 'verified compiler' ? hash : '0x' + 'b'.repeat(64),
    },
    'hardhat/config': {
      subtask: () => ({
        setAction: (fn) => {
          action = fn;
        },
      }),
    },
    'hardhat/builtin-tasks/task-names': {
      TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD: 'build',
    },
    'hardhat/internal/util/global-dir': { getCompilersDir: async () => cache },
    'hardhat/internal/solidity/compiler/downloader': {
      CompilerPlatform: { WASM: 'wasm' },
      CompilerDownloader: {
        getCompilerPlatform: () => 'linux-amd64',
        getConcurrencySafeDownloader: (platform) => ({
          isCompilerDownloaded: async () =>
            fs.existsSync(path.join(cache, platform, 'compiler')),
          getCompiler: async () => ({
            compilerPath: path.join(cache, platform, 'compiler'),
            version: '0.8.37',
          }),
          downloadCompiler: () => {
            downloaded.push(platform);
            throw Error('Downloads forbidden');
          },
        }),
      },
    },
    '../../aurora/bin/local-rpc.cjs': {
      localEndpoint: () => localEndpoint(env),
    },
  };
  vm.runInNewContext(
    fs.readFileSync(configPath, 'utf8'),
    {
      require: (name) => {
        assert.ok(Object.hasOwn(allowed, name), `Unexpected module ${name}`);
        return allowed[name];
      },
      module,
      __dirname: path.dirname(configPath),
    },
    { filename: configPath }
  );
  return { value: module.exports, compile: action, downloaded };
}

function fixture(t) {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'cosmic-config-test-'));
  t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
  return cache;
}

function cachedCompiler(
  cache,
  platform = 'linux-amd64',
  content = 'verified compiler'
) {
  const directory = path.join(cache, platform);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'compiler'), content);
  fs.writeFileSync(
    path.join(directory, 'list.json'),
    JSON.stringify({
      builds: [
        {
          version: '0.8.37',
          longVersion: '0.8.37+commit.f401782d',
          path: 'compiler',
          keccak256: hash,
        },
      ],
    })
  );
}

test('local config has only unforked Hardhat and guard-bound loopback; exact Solidity settings', (t) => {
  const { value } = config(fixture(t), {
    DEMO_PORT: '18545',
    MAINNET_PRIVATE_KEY: 'never-use',
  });
  assert.deepEqual(Object.keys(value.networks), ['hardhat', 'localhost']);
  assert.equal(value.defaultNetwork, 'hardhat');
  assert.equal(value.networks.localhost.url, 'http://127.0.0.1:18545');
  assert.equal(value.networks.localhost.accounts, 'remote');
  assert.equal(value.networks.hardhat.chainId, 31337);
  assert.equal(value.networks.hardhat.forking, undefined);
  assert.equal(value.paths.root, root);
  assert.deepEqual(JSON.parse(JSON.stringify(value.solidity)), {
    compilers: [
      {
        version: '0.8.37',
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: 'cancun',
          outputSelection: { '*': { '*': ['storageLayout'] } },
        },
      },
    ],
  });
  assert.throws(
    () => config(fixture(t), { LOCALHOST_RPC_URL: 'https://external.invalid' }),
    /must equal/
  );
  assert.throws(() => config(fixture(t), { CHAIN_ID: '1' }), /31337/);
});

test('compiler cache is mandatory, version and checksum are verified, no downloader fallback', async (t) => {
  const cache = fixture(t);
  const loaded = config(cache);
  await assert.rejects(
    loaded.compile({ solcVersion: '0.8.37' }),
    /verified cached/
  );
  await assert.rejects(
    loaded.compile({ solcVersion: '0.8.26' }),
    /Only Solidity/
  );
  cachedCompiler(cache);
  assert.equal(
    (await loaded.compile({ solcVersion: '0.8.37' })).version,
    '0.8.37'
  );
  const listPath = path.join(cache, 'linux-amd64', 'list.json');
  const metadata = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  metadata.builds[0].longVersion = '0.8.37+commit.1234abcd';
  fs.writeFileSync(listPath, JSON.stringify(metadata));
  await assert.rejects(
    loaded.compile({ solcVersion: '0.8.37' }),
    /verified cached/
  );
  cachedCompiler(cache, 'linux-amd64', 'tampered compiler');
  await assert.rejects(
    loaded.compile({ solcVersion: '0.8.37' }),
    /checksum mismatch/
  );
  assert.deepEqual(loaded.downloaded, []);
});

test('offline verifier retains substantive checks and records synthetic evidence honestly', (t) => {
  const temp = fixture(t);
  const target = path.join(temp, 'demo');
  const reports = path.join(temp, 'reports');
  const logs = path.join(target, 'logs');
  const flagship = path.join(logs, 'flagship-demo');
  fs.mkdirSync(flagship, { recursive: true });
  fs.mkdirSync(path.join(reports, 'mission-bundle'), { recursive: true });
  const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data));
  const scope = { evidenceMode: 'offline-fixture', synthetic: true };
  write(path.join(logs, 'run-status.json'), {
    mode: 'offline-fixture',
    status: 'completed',
  });
  write(path.join(logs, 'ledger-latest.json'), {
    ...scope,
    nations: [{}],
    mandates: [{}],
  });
  write(path.join(logs, 'vote-simulation.json'), {
    ...scope,
    votes: [{}],
    ownerActions: [{ action: 'pause' }, { action: 'unpause' }],
  });
  write(path.join(logs, 'execution-plan.json'), {
    ...scope,
    steps: Array(5).fill({}),
  });
  fs.writeFileSync(
    path.join(flagship, 'flagship-demo.log'),
    'Synthetic fixture run'
  );
  const summary = path.join(flagship, 'summary.txt');
  fs.writeFileSync(
    summary,
    'Flagship Demo Completed\nSynthetic governance and offline mission fixtures.'
  );
  fs.writeFileSync(
    path.join(reports, 'mission-bundle', 'fixture.md'),
    'Illustrative fixture'
  );
  write(path.join(reports, 'owner-control-matrix.json'), {
    modules: [{}],
    summary: { total: 1, ready: 1 },
  });
  write(path.join(reports, 'grand-summary.json'), {
    mission: { initiative: 'fixture' },
    control: { modules: [{}] },
  });
  const output = path.join(flagship, 'verification.json');
  const verify = () =>
    spawnSync(
      process.execPath,
      [
        path.join(demo, 'scripts/verify-flagship-report.mjs'),
        '--demo-root',
        target,
        '--reports-root',
        reports,
        '--summary',
        summary,
        '--output',
        output,
      ],
      { encoding: 'utf8' }
    );
  let result = verify();
  assert.equal(result.status, 0, result.stderr + result.stdout);
  let report = JSON.parse(fs.readFileSync(output));
  assert.equal(report.status, 'pass');
  assert.equal(report.evidenceMode, 'offline-fixture');
  assert.equal(report.productionApproved, false);
  assert.equal(report.checks.length, 9);
  write(path.join(logs, 'ledger-latest.json'), {
    nations: [{}],
    mandates: [{}],
  });
  result = verify();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /labeled synthetic/);
  fs.unlinkSync(path.join(reports, 'owner-control-matrix.json'));
  result = verify();
  assert.equal(result.status, 1);
  report = JSON.parse(fs.readFileSync(output));
  assert.equal(report.checks.find((c) => c.key === 'matrix').status, 'fail');
});
