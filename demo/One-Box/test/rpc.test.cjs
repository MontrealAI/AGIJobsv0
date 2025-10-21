const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { probeRpc, parseChainId } = require('../lib/rpc.js');

function createRpcServer(handlers) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const handler = handlers[payload.method];
        if (!handler) {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ jsonrpc: '2.0', id: payload.id ?? 1, error: { code: -32601, message: 'Method not found' } }));
          return;
        }
        const result = handler(payload.params ?? []);
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: payload.id ?? 1, result }));
      } catch (error) {
        res.statusCode = 500;
        res.end(error.message);
      }
    });
  });
  return server;
}

test('parseChainId decodes known networks', () => {
  const decoded = parseChainId('0xaa36a7');
  assert.equal(decoded.decimal, 11155111);
  assert.equal(decoded.networkName, 'Ethereum Sepolia');
});

test('probeRpc reports chain information and contract bytecode presence', async () => {
  const server = createRpcServer({
    eth_chainId: () => '0xaa36a7',
    eth_getCode: () => '0x60016001',
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const rpcUrl = `http://127.0.0.1:${port}`;

  try {
    const probe = await probeRpc({
      rpcUrl,
      jobRegistryAddress: '0x000000000000000000000000000000000000c0de',
    });
    assert.equal(probe.status, 'ready');
    assert.equal(probe.chain?.decimal, 11155111);
    assert.equal(probe.jobRegistry?.status, 'ok');
  } finally {
    server.close();
  }
});

test('probeRpc reports invalid address formats immediately', async () => {
  const chainIdResponse = {
    jsonrpc: '2.0',
    id: 1,
    result: '0x1',
  };
  const fetchImpl = async (_url, options) => ({
    ok: true,
    json: async () => chainIdResponse,
  });

  const probe = await probeRpc({
    rpcUrl: 'http://example.invalid',
    jobRegistryAddress: 'not-an-address',
    fetchImpl,
  });
  assert.equal(probe.status, 'ready');
  assert.equal(probe.jobRegistry.status, 'invalid');
});

test('probeRpc flags placeholder and missing addresses without fetching bytecode', async () => {
  const chainIdResponse = {
    jsonrpc: '2.0',
    id: 1,
    result: '0x1',
  };
  const fetchImpl = async (_url, options) => {
    const payload = JSON.parse(options.body);
    if (payload.method === 'eth_chainId') {
      return {
        ok: true,
        json: async () => chainIdResponse,
      };
    }
    throw new Error(`Unexpected method ${payload.method}`);
  };

  const probePlaceholder = await probeRpc({
    rpcUrl: 'http://example.invalid',
    jobRegistryAddress: '0x0000000000000000000000000000000000000000',
    fetchImpl,
  });
  assert.equal(probePlaceholder.status, 'ready');
  assert.equal(probePlaceholder.jobRegistry.status, 'placeholder');

  const probeMissing = await probeRpc({
    rpcUrl: 'http://example.invalid',
    jobRegistryAddress: '',
    fetchImpl,
  });
  assert.equal(probeMissing.status, 'ready');
  assert.equal(probeMissing.jobRegistry.status, 'missing');
});

test('probeRpc surfaces RPC errors', async () => {
  const server = createRpcServer({
    eth_chainId: () => {
      throw new Error('boom');
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const rpcUrl = `http://127.0.0.1:${port}`;

  try {
    const probe = await probeRpc({ rpcUrl });
    assert.equal(probe.status, 'error');
    assert.match(probe.error, /boom|RPC/);
  } finally {
    server.close();
  }
});
