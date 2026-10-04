const net = require('node:net');

function localEndpoint(env = process.env) {
  const raw = env.DEMO_PORT || '8545';
  if (!/^\d+$/.test(raw) || Number(raw) < 1024 || Number(raw) > 65535) {
    throw new Error('DEMO_PORT must be an integer between 1024 and 65535.');
  }
  const port = Number(raw);
  const url = `http://127.0.0.1:${port}`;
  for (const key of ['RPC_URL', 'LOCALHOST_RPC_URL', 'AGI_RPC_URL']) {
    if (env[key] && env[key] !== url) {
      throw new Error(
        `${key} must equal ${url} for this disposable local demo.`
      );
    }
  }
  if (env.CHAIN_ID && env.CHAIN_ID !== '31337') {
    throw new Error('The disposable local demo requires CHAIN_ID=31337.');
  }
  return { port, url };
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () =>
      reject(
        new Error(
          `Local port ${port} is occupied or unavailable. Stop your own node or choose another DEMO_PORT; no existing process was stopped.`
        )
      )
    );
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

async function assertLocalChain(url) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_chainId',
      params: [],
    }),
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok)
    throw new Error(`Local RPC returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error || payload.id !== 1 || payload.result !== '0x7a69') {
    throw new Error('Local RPC must confirm chain ID 31337.');
  }
}

module.exports = { localEndpoint, assertPortAvailable, assertLocalChain };

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const { port, url } = localEndpoint();
      if (process.argv[2] === 'preflight') await assertPortAvailable(port);
      else if (process.argv[2] === 'ready') await assertLocalChain(url);
      else throw new Error('Expected preflight or ready.');
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
