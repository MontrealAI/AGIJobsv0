const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const {
  localEndpoint,
  assertPortAvailable,
  assertLocalChain,
} = require('../../demo/aurora/bin/local-rpc.cjs');

test('local demo validates its endpoint before any deployment', () => {
  assert.deepEqual(localEndpoint({}), {
    port: 8545,
    url: 'http://127.0.0.1:8545',
  });
  assert.equal(
    localEndpoint({ DEMO_PORT: '19545', RPC_URL: 'http://127.0.0.1:19545' })
      .port,
    19545
  );
  for (const value of ['0', '80', '65536', '-1', '8545/other', '8e3']) {
    assert.throws(() => localEndpoint({ DEMO_PORT: value }), /DEMO_PORT/);
  }
  assert.throws(
    () => localEndpoint({ RPC_URL: 'https://example.org' }),
    /RPC_URL/
  );
  assert.throws(
    () => localEndpoint({ LOCALHOST_RPC_URL: 'http://127.0.0.1:9999' }),
    /LOCALHOST_RPC_URL/
  );
  assert.throws(() => localEndpoint({ CHAIN_ID: '1' }), /31337/);
  assert.throws(
    () => localEndpoint({ AGI_RPC_URL: 'https://example.org' }),
    /AGI_RPC_URL/
  );
});

test('occupied ports are refused without stopping the existing server', async (t) => {
  const server = http.createServer((req, res) => res.end('still here'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  await assert.rejects(assertPortAvailable(port), /occupied or unavailable/);
  assert.equal(
    await (await fetch(`http://127.0.0.1:${port}`)).text(),
    'still here'
  );
});

test('readiness requires a successful JSON-RPC response from the local chain', async (t) => {
  let status = 200;
  let payload = { jsonrpc: '2.0', id: 1, result: '0x7a69' };
  const server = http.createServer((req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  await assertLocalChain(url);
  for (const invalid of [
    { id: 1, result: '0x1' },
    { id: 2, result: '0x7a69' },
    { id: 1, error: { code: -32000 } },
  ]) {
    payload = invalid;
    await assert.rejects(assertLocalChain(url), /31337/);
  }
  status = 503;
  await assert.rejects(assertLocalChain(url), /HTTP 503/);
});

test('both mission launchers preserve an occupied RPC server', async (t) => {
  const { promisify } = require('node:util');
  const execFile = promisify(require('node:child_process').execFile);
  const path = require('node:path');
  const root = path.resolve(__dirname, '../..');
  const server = http.createServer((req, res) => res.end('unrelated service'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const env = {
    ...process.env,
    DEMO_PORT: String(port),
    AURORA_REPORT_SCOPE: 'launcher-safety-test',
  };
  for (const key of ['RPC_URL', 'LOCALHOST_RPC_URL', 'AGI_RPC_URL', 'CHAIN_ID'])
    delete env[key];
  for (const demo of ['asi-global', 'atlas-conductor']) {
    await assert.rejects(
      execFile('bash', [`demo/${demo}/bin/${demo}-local.sh`], {
        cwd: root,
        env,
        timeout: 10000,
      }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /occupied or unavailable/);
        return true;
      }
    );
    assert.equal(
      await (await fetch(`http://127.0.0.1:${port}`)).text(),
      'unrelated service'
    );
  }
});
