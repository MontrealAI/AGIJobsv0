#!/usr/bin/env node
'use strict';
// Positive image boot test against an isolated local chain. This is packaging /
// startup evidence, not an external-worker or economic commissioning report.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { ethers } = require('ethers');

const image = process.argv[2];
if (!image)
  throw new Error('Usage: node scripts/docker/gateway-smoke.cjs IMAGE');
const root = path.resolve(__dirname, '../..');
const name = `gateway-smoke-${process.pid}`;
const volume = `${name}-state`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-smoke-'));
fs.chmodSync(temporary, 0o755);
const chainLog = fs.openSync(path.join(temporary, 'chain.log'), 'w');
let chain;
let provider;
let keystore;
const pause = () => new Promise((resolve) => setTimeout(resolve, 500));
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', timeout: 30000 });

async function until(check, label) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      if (await check()) return;
    } catch {
      /* bounded readiness retry */
    }
    await pause();
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function main() {
  chain = spawn(
    process.execPath,
    [
      'node_modules/hardhat/internal/cli/cli.js',
      'node',
      '--hostname',
      '127.0.0.1',
      '--port',
      '18545',
    ],
    {
      cwd: root,
      stdio: ['ignore', chainLog, chainLog],
    }
  );
  const rpcRequest = new ethers.FetchRequest('http://127.0.0.1:18545');
  rpcRequest.timeout = 2000;
  provider = new ethers.JsonRpcProvider(rpcRequest);
  await until(
    async () => (await provider.getNetwork()).chainId === 31337n,
    'local chain'
  );
  const signer = await provider.getSigner(0);
  async function deploy(source, contract, args = []) {
    const artifact = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          'cache/container-fixtures/artifacts',
          source,
          `${contract}.json`
        ),
        'utf8'
      )
    );
    const instance = await new ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode,
      signer
    ).deploy(...args);
    await instance.waitForDeployment();
    return instance;
  }
  const token = await deploy('contracts/test/MockERC20.sol', 'MockERC20');
  const registry = await deploy(
    'contracts/test/SimpleJobRegistry.sol',
    'SimpleJobRegistry',
    [await token.getAddress()]
  );
  const validation = await deploy(
    'contracts/test/DeterministicValidationModule.sol',
    'DeterministicValidationModule'
  );
  const fixtureWallet = ethers.Wallet.createRandom();
  keystore = http.createServer((request, response) => {
    if (
      request.url !== '/keys' ||
      request.headers.authorization !== 'Bearer local-fixture-only'
    ) {
      response.writeHead(403).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ keys: [fixtureWallet.privateKey] }));
  });
  await new Promise((resolve) => keystore.listen(18546, '127.0.0.1', resolve));
  const tokenConfig = path.join(temporary, 'agialpha.ci.json');
  fs.writeFileSync(
    tokenConfig,
    JSON.stringify({
      address: '0x1111111111111111111111111111111111111111',
      decimals: 18,
      symbol: 'MTK',
      name: 'MockToken',
    }),
    { mode: 0o644 }
  );
  const environment = {
    RPC_URL: 'http://127.0.0.1:18545',
    JOB_REGISTRY_ADDRESS: await registry.getAddress(),
    VALIDATION_MODULE_ADDRESS: await validation.getAddress(),
    AGIALPHA_NETWORK: 'ci',
    AGIALPHA_TOKEN: await token.getAddress(),
    KEYSTORE_URL: 'http://127.0.0.1:18546/keys',
    KEYSTORE_TOKEN: 'local-fixture-only',
    GATEWAY_API_KEY: 'local-fixture-api',
    PORT: '18090',
    GRPC_PORT: '18551',
    AUDIT_ANCHOR_INTERVAL_MS: '0',
    VALIDATION_STORAGE_DIR: '/app/agent-gateway/dist/storage/validation',
  };
  const run = () =>
    docker(
      'run',
      '-d',
      '--name',
      name,
      '--network',
      'host',
      '--mount',
      `type=bind,source=${tokenConfig},target=/app/agent-gateway/dist/config/agialpha.ci.json,readonly`,
      '--mount',
      `type=volume,source=${volume},target=/app/agent-gateway/dist/storage`,
      ...Object.entries(environment).flatMap(([key, value]) => [
        '-e',
        `${key}=${value}`,
      ]),
      image
    );
  async function ready() {
    await until(
      async () =>
        (
          await fetch('http://127.0.0.1:18090/health', {
            signal: AbortSignal.timeout(2000),
          })
        ).ok,
      'gateway HTTP health'
    );
    await new Promise((resolve, reject) => {
      const socket = net.connect(18551, '127.0.0.1');
      socket.setTimeout(2000, () => {
        socket.destroy();
        reject(new Error('gRPC did not listen'));
      });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', reject);
    });
    const logs = docker('logs', name);
    if (
      !logs.includes(fixtureWallet.address.toLowerCase()) &&
      !logs.includes(fixtureWallet.address)
    )
      throw new Error('Fixture wallet was not loaded');
  }
  run();
  await ready();
  if (docker('inspect', '--format', '{{.Config.User}}', name).trim() !== 'node')
    throw new Error('Gateway does not run as node');
  docker(
    'exec',
    name,
    'node',
    '-e',
    `const fs = require('node:fs');
const assert = require('node:assert/strict');
assert.notEqual(process.getuid(), 0);
for (const target of ['/app', '/app/package.json', '/app/package-lock.json', '/app/node_modules', '/app/node_modules/ethers', '/app/node_modules/ethers/package.json', '/app/scripts', '/app/scripts/start-telemetry.sh']) {
  assert.equal(fs.statSync(target).uid, 0, target + ' must remain root-owned');
  assert.throws(() => fs.accessSync(target, fs.constants.W_OK), { code: 'EACCES' }, target + ' must not be writable by the runtime user');
}
for (const target of ['/app/storage', '/app/logs', '/app/agent-gateway/dist', '/app/agent-gateway/dist/storage', '/app/agent-gateway/dist/logs', '/app/agent-gateway/dist/config']) {
  assert.equal(fs.statSync(target).uid, process.getuid(), target + ' must belong to the runtime user');
  const probe = fs.mkdtempSync(target + '/.write-probe-');
  fs.writeFileSync(probe + '/record', 'runtime-write');
  assert.equal(fs.readFileSync(probe + '/record', 'utf8'), 'runtime-write');
  fs.rmSync(probe, { recursive: true });
}`
  );
  const block = await provider.getBlock('latest');
  const record = {
    jobId: '1',
    validator: fixtureWallet.address.toLowerCase(),
    approve: true,
    salt: ethers.ZeroHash,
    commitHash: ethers.ZeroHash,
    committedAt: new Date().toISOString(),
    roundScope: {
      chainId: '31337',
      validationModule: await validation.getAddress(),
      nonce: '1',
      commitDeadline: String(block.timestamp + 100),
      domain: ethers.ZeroHash,
      specHash: ethers.ZeroHash,
      blockNumber: block.number,
      blockHash: block.hash,
    },
  };
  docker(
    'exec',
    name,
    'node',
    '-e',
    `require('./agent-gateway/dist/agent-gateway/validationStore.js').beginCommitRecord('1',${JSON.stringify(
      record.validator
    )},${JSON.stringify(record)},null)`
  );
  docker('stop', '--time', '10', name);
  if (docker('inspect', '--format', '{{.State.ExitCode}}', name).trim() !== '0')
    throw new Error('Gateway SIGTERM did not exit cleanly');
  docker('rm', name);
  run();
  await ready();
  docker(
    'exec',
    name,
    'node',
    '-e',
    `const r=require('./agent-gateway/dist/agent-gateway/validationStore.js').loadCommitRecord('1',${JSON.stringify(
      record.validator
    )});if(!r||r.commitHash!==${JSON.stringify(
      ethers.ZeroHash
    )})process.exit(1)`
  );
  console.log(
    'PASS: gateway token verification, wallet loading, HTTP/gRPC boot, non-root process, protected dependencies, writable runtime state, durable record across recreation and graceful shutdown (local contract fixtures).'
  );
}

main()
  .catch((error) => {
    try {
      execFileSync('docker', ['logs', name], {
        stdio: 'inherit',
        timeout: 10000,
      });
    } catch {
      /* absent container */
    }
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      docker('rm', '-f', name);
    } catch {
      /* cleanup only */
    }
    try {
      docker('volume', 'rm', volume);
    } catch {
      /* cleanup only */
    }
    if (keystore) await new Promise((resolve) => keystore.close(resolve));
    if (provider) provider.destroy();
    if (chain) chain.kill('SIGTERM');
    fs.closeSync(chainLog);
    fs.rmSync(temporary, { recursive: true, force: true });
  });
