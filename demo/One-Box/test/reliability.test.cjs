const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { ROOT_DIR, DEMO_DIR, loadEnvironment, parseCliArgs, resolveConfig, waitForOrchestrator, stopChild } = require('../lib/launcher.js');
const { startStaticServer, createDemoUrl } = require('../lib/static-server.cjs');
const { parseChainId, formatEtherFromHex, probeRpc, jsonRpcRequest, decodeAddressFromCallResult, decodeBooleanFromCallResult } = require('../lib/rpc.js');

test('launcher resolves repository paths, exported configuration wins, and demo needs no credentials', () => {
  assert.equal(ROOT_DIR, path.resolve(__dirname, '../../..'));
  assert.equal(DEMO_DIR, path.resolve(__dirname, '..'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onebox-env-'));
  try {
    fs.writeFileSync(path.join(root, '.env'), 'ONEBOX_API_TOKEN=file-token\n');
    assert.equal(loadEnvironment({ rootDir: root, demoDir: root, processEnv: { ONEBOX_API_TOKEN: 'shell-token' } }).ONEBOX_API_TOKEN, 'shell-token');
    const config = resolveConfig({}, { allowPartial: true, staticOnly: true });
    assert.equal(config.uiHost, '127.0.0.1');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  assert.equal(parseCliArgs(['--token=abc==']).apiToken, 'abc==');
  assert.equal(parseCliArgs(['--demo']).staticOnly, true);
  for (const arg of ['--wat', '--ui-port=65536', '--ui-port=4000oops', '--ui-port=0']) assert.throws(() => parseCliArgs([arg]));
});

test('readiness requires authenticated status and detects exit, failure, timeout', async () => {
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  const config = { orchestratorHost: '127.0.0.1', orchestratorPort: 1234, prefix: '/onebox', apiToken: 'secret-test-token' };
  const fetchImpl = async (url, opts) => {
    if (url.endsWith('status')) assert.equal(opts.headers.Authorization, 'Bearer secret-test-token');
    return { ok: true, json: async () => url.endsWith('healthz') ? { ok: true } : { jobs: [] } };
  };
  await waitForOrchestrator(child, config, { fetchImpl });
  await assert.rejects(waitForOrchestrator(child, config, { fetchImpl: async url => url.endsWith('healthz') ? { ok: true, json: async () => ({ ok: true }) } : { status: 401 } }), /API token/);
  child.exitCode = 1;
  await assert.rejects(waitForOrchestrator(child, config, { fetchImpl }), /exited/);
  child.exitCode = null;
  await assert.rejects(waitForOrchestrator(child, config, { timeoutMs: 5, fetchImpl: async () => { throw new Error('offline'); } }), /timed out/);
  await stopChild(Object.assign(new EventEmitter(), { pid: undefined, exitCode: null, signalCode: null }));
  assert.equal(child.listenerCount('error'), 0);
});

test('static hosting is credential-free, offline, method-safe and path-safe', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onebox-static-'));
  const config = { uiHost: '127.0.0.1', uiPort: 0, demoMode: true, apiToken: 'MUST_NOT_LEAK' };
  fs.writeFileSync(path.join(root, 'index.html'), '<head><meta http-equiv="Content-Security-Policy" content="connect-src https://example.com;"></head>');
  fs.writeFileSync(path.join(root, 'app.js'), 'export {};');
  fs.mkdirSync(path.join(root, 'folder'));
  fs.symlinkSync(__filename, path.join(root, 'outside.js'));
  const server = await startStaticServer(root, config);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const redirect = await fetch(base, { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.ok(!redirect.headers.get('location').includes(config.apiToken));
    assert.ok(!createDemoUrl(config).includes(config.apiToken));
    const response = await fetch(base);
    assert.match(await response.text(), /connect-src 'none'/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal((await fetch(base + '/app.js', { method: 'HEAD' })).headers.get('content-type'), 'text/javascript; charset=utf-8');
    for (const [url, status] of [['/missing.js',404],['/folder',404],['/%ZZ',400],['/.env',403],['/outside.js',403]]) assert.equal((await fetch(base + url)).status, status, url);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); fs.rmSync(root, { recursive: true, force: true }); }
});

test('RPC refuses malformed quantities, ABI words, bytecode and mismatched response IDs', async () => {
  for (const value of ['0x1junk','0x01','-1','0x20000000000000',null]) assert.throws(() => parseChainId(value));
  for (const value of ['0xZZ','-0x1',null]) assert.throws(() => formatEtherFromHex(value));
  assert.throws(() => decodeAddressFromCallResult('0x' + '0'.repeat(24) + 'c0de'), /ABI address/);
  assert.throws(() => decodeBooleanFromCallResult('0x' + '0'.repeat(63) + '2'), /ABI boolean/);
  const fetchImpl = async (_url, options) => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: JSON.parse(options.body).id, result: JSON.parse(options.body).method === 'eth_chainId' ? '0x1' : '0xNOTCODE' }) });
  const probe = await probeRpc({ rpcUrl: 'http://localhost', jobRegistryAddress: '0x' + '11'.repeat(20), fetchImpl });
  assert.equal(probe.jobRegistry.status, 'error');
  await assert.rejects(jsonRpcRequest(async () => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: -1, result: '0x1' }) }), 'http://localhost', 'eth_chainId', []), /response/i);
});
