const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  probeRpc,
  parseChainId,
  fetchAccountBalance,
  formatEtherFromHex,
  evaluateAddressShape,
  normaliseAddress,
  fetchContractOwner,
  fetchPauseStatus,
  inspectOwnerSurface,
} = require('../lib/rpc.js');

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
      stakeManagerAddress: '0x000000000000000000000000000000000000c0de',
      systemPauseAddress: '0x000000000000000000000000000000000000c0de',
    });
    assert.equal(probe.status, 'ready');
    assert.equal(probe.chain?.decimal, 11155111);
    assert.equal(probe.jobRegistry?.status, 'ok');
    assert.equal(probe.stakeManager?.status, 'ok');
    assert.equal(probe.systemPause?.status, 'ok');
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
    stakeManagerAddress: '0x0000000000000000000000000000000000000000',
    fetchImpl,
  });
  assert.equal(probe.status, 'ready');
  assert.equal(probe.jobRegistry.status, 'invalid');
  assert.equal(probe.stakeManager.status, 'placeholder');
  assert.equal(probe.systemPause.status, 'missing');
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
    stakeManagerAddress: '0x0000000000000000000000000000000000000000',
    systemPauseAddress: '',
    fetchImpl,
  });
  assert.equal(probePlaceholder.status, 'ready');
  assert.equal(probePlaceholder.jobRegistry.status, 'placeholder');
  assert.equal(probePlaceholder.stakeManager.status, 'placeholder');
  assert.equal(probePlaceholder.systemPause.status, 'missing');

  const probeMissing = await probeRpc({
    rpcUrl: 'http://example.invalid',
    jobRegistryAddress: '',
    stakeManagerAddress: undefined,
    systemPauseAddress: undefined,
    fetchImpl,
  });
  assert.equal(probeMissing.status, 'ready');
  assert.equal(probeMissing.jobRegistry.status, 'missing');
  assert.equal(probeMissing.stakeManager.status, 'missing');
  assert.equal(probeMissing.systemPause.status, 'missing');
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

test('formatEtherFromHex renders decimal balances', () => {
  assert.equal(formatEtherFromHex('0x0'), '0');
  assert.equal(formatEtherFromHex('0xde0b6b3a7640000'), '1');
  assert.equal(formatEtherFromHex('0x1'), '0.000000000000000001');
});

test('fetchAccountBalance returns formatted ether values', async () => {
  const server = createRpcServer({
    eth_getBalance: () => '0x4563918244f40000',
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const rpcUrl = `http://127.0.0.1:${port}`;

  try {
    const balance = await fetchAccountBalance({
      rpcUrl,
      address: '0x000000000000000000000000000000000000c0de',
    });
    assert.equal(balance.status, 'ok');
    assert.equal(balance.balanceHex, '0x4563918244f40000');
    assert.equal(balance.balanceEther, '5');
  } finally {
    server.close();
  }
});

test('fetchAccountBalance validates address input', async () => {
  const balance = await fetchAccountBalance({
    rpcUrl: 'http://127.0.0.1:8545',
    address: 'not-an-address',
  });
  assert.equal(balance.status, 'invalid_address');
});

test('fetchContractOwner decodes owner address from eth_call responses', async () => {
  const expectedOwner = '0x000000000000000000000000000000000000c0de';
  const server = createRpcServer({
    eth_call: ([call]) => {
      if (!call || call.data !== '0x8da5cb5b') {
        throw new Error('Unexpected call payload');
      }
      return `0x${'0'.repeat(24)}c0de`;
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const rpcUrl = `http://127.0.0.1:${port}`;
  try {
    const owner = await fetchContractOwner({
      rpcUrl,
      address: expectedOwner,
    });
    assert.equal(owner.status, 'ok');
    assert.equal(owner.owner, expectedOwner.toLowerCase());
  } finally {
    server.close();
  }
});

test('fetchPauseStatus decodes boolean pause state', async () => {
  const server = createRpcServer({
    eth_call: ([call]) => {
      if (!call || call.data !== '0x5c975abb') {
        throw new Error('Unexpected call payload');
      }
      return `0x${'0'.repeat(63)}1`;
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const rpcUrl = `http://127.0.0.1:${port}`;
  try {
    const paused = await fetchPauseStatus({
      rpcUrl,
      address: '0x000000000000000000000000000000000000babe',
    });
    assert.equal(paused.status, 'ok');
    assert.equal(paused.paused, true);
  } finally {
    server.close();
  }
});

test('inspectOwnerSurface aggregates owner and pause status', async () => {
  const server = createRpcServer({
    eth_call: ([call]) => {
      if (!call || !call.to) {
        throw new Error('Missing call target');
      }
      if (call.data === '0x8da5cb5b') {
        return `0x${'0'.repeat(24)}${call.to.slice(-4)}`;
      }
      if (call.data === '0x5c975abb') {
        return call.to.endsWith('c0de') ? `0x${'0'.repeat(64)}` : `0x${'0'.repeat(63)}1`;
      }
      throw new Error('Unexpected selector');
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const rpcUrl = `http://127.0.0.1:${port}`;
  try {
    const surface = await inspectOwnerSurface({
      rpcUrl,
      jobRegistryAddress: '0x000000000000000000000000000000000000c0de',
      stakeManagerAddress: '0x000000000000000000000000000000000000f00d',
      systemPauseAddress: '0x000000000000000000000000000000000000babe',
    });
    assert.equal(surface.jobRegistry.owner.status, 'ok');
    assert.equal(surface.jobRegistry.owner.owner, '0x000000000000000000000000000000000000c0de');
    assert.equal(surface.jobRegistry.paused.status, 'ok');
    assert.equal(surface.jobRegistry.paused.paused, false);
    assert.equal(surface.stakeManager.paused.paused, true);
    assert.equal(surface.systemPause.owner.status, 'ok');
    assert.equal(surface.systemPause.paused.status, 'unsupported');
  } finally {
    server.close();
  }
});

test('normaliseAddress trims strings and guards non-string values', () => {
  assert.equal(normaliseAddress(' 0xabc '), '0xabc');
  assert.equal(normaliseAddress(null), '');
  assert.equal(normaliseAddress(undefined), '');
});

test('evaluateAddressShape classifies different address forms', () => {
  assert.equal(evaluateAddressShape(''), 'missing');
  assert.equal(evaluateAddressShape('0x0'), 'invalid');
  assert.equal(evaluateAddressShape('0x0000000000000000000000000000000000000000'), 'placeholder');
  assert.equal(
    evaluateAddressShape('0x000000000000000000000000000000000000c0de'),
    'candidate'
  );
});
