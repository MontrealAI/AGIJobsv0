const assert = require('node:assert/strict');
const http = require('node:http');
const { before, after, test } = require('node:test');
const {
  invokeAgentEndpoint,
} = require('../../agent-gateway/dist/agent-gateway/agentEndpoint.js');

let server,
  origin,
  ipfsFailure = false,
  redirects = 0;
const content = JSON.stringify({
  result: 'local provider-contract fixture',
  simulation: true,
});
const cid = 'QmYwAPJzv5CZsnAzt8auVZRnGvgQLvwiUjMPN6mvnM5M1g';
before(async () => {
  server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    const route = new URL(req.url, 'http://localhost').pathname;
    if (route.startsWith('/api/v0/')) {
      if (ipfsFailure) {
        res.writeHead(503);
        res.end('fixture outage');
        return;
      }
      if (route === '/api/v0/add') {
        if (!body.includes(content)) {
          res.writeHead(400);
          res.end();
          return;
        }
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            Name: 'result.json',
            Hash: cid,
            Size: String(content.length),
          }) + '\n'
        );
      } else if (route === '/api/v0/cat') {
        res.end(content);
      } else {
        res.writeHead(404);
        res.end();
      }
      return;
    }
    if (route === '/slow') {
      setTimeout(() => res.end('late'), 250).unref();
      return;
    }
    if (route === '/redirect') {
      res.writeHead(307, { location: '/redirect-target' });
      res.end();
      return;
    }
    if (route === '/redirect-target') {
      redirects++;
      res.end('unexpected');
      return;
    }
    if (/^\/status\//.test(route)) {
      res.writeHead(Number(route.split('/')[2]));
      res.end('fixture rejection');
      return;
    }
    if (route === '/large') {
      res.end('x'.repeat(4096));
      return;
    }
    if (route === '/text') {
      res.setHeader('content-type', 'text/plain');
      res.end('A text deliverable');
      return;
    }
    res.setHeader('content-type', 'application/json');
    if (route === '/bad-json') res.end('{broken');
    else if (route === '/empty') res.end('');
    else if (route === '/null') res.end('null');
    else
      res.end(JSON.stringify({ received: JSON.parse(body), simulation: true }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

test('compiled gateway sends real HTTP requests and accepts JSON and text deliverables', async () => {
  assert.deepEqual(
    await invokeAgentEndpoint(
      `${origin}/ok`,
      {
        jobId: 'fixture-1',
        analysis: { reward: 9007199254740993n, stake: 0n },
      },
      2000
    ),
    {
      received: {
        jobId: 'fixture-1',
        analysis: { reward: '9007199254740993', stake: '0' },
      },
      simulation: true,
    }
  );
  assert.equal(
    await invokeAgentEndpoint(`${origin}/text`, {}, 2000),
    'A text deliverable'
  );
});
test('authentication, rate-limit, and service failures reject without inventing results', async () => {
  for (const status of [401, 403, 429, 500, 503])
    await assert.rejects(
      invokeAgentEndpoint(`${origin}/status/${status}`, {}, 2000),
      new RegExp(`HTTP ${status}`)
    );
});
test('malformed JSON, empty and null responses are rejected', async () => {
  for (const route of ['bad-json', 'empty', 'null'])
    await assert.rejects(
      invokeAgentEndpoint(`${origin}/${route}`, {}, 2000),
      /invalid JSON|empty response/
    );
});
test('redirects do not forward job payloads', async () => {
  await assert.rejects(
    invokeAgentEndpoint(
      `${origin}/redirect`,
      { privateFixture: 'not-forwarded' },
      2000
    )
  );
  assert.equal(redirects, 0);
});
test('timeouts and response-size limits abort actual HTTP reads; a later request recovers', async () => {
  await assert.rejects(invokeAgentEndpoint(`${origin}/slow`, {}, 30));
  await assert.rejects(
    invokeAgentEndpoint(`${origin}/large`, {}, 2000, 256),
    /size limit/
  );
  assert.equal(
    (await invokeAgentEndpoint(`${origin}/ok`, {}, 2000)).simulation,
    true
  );
});
test('compiled default IPFS adapter loads its ESM client and performs add/cat over HTTP', async () => {
  process.env.IPFS_API_URL = origin;
  const {
    getIpfsClient,
  } = require('../../agent-gateway/dist/agent-gateway/ipfsClient.js');
  const client = await getIpfsClient();
  const added = await client.add(Buffer.from(content));
  assert.equal(added.cid.toString(), cid);
  const chunks = [];
  for await (const chunk of client.cat(added.cid)) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), content);
  ipfsFailure = true;
  await assert.rejects(client.add(Buffer.from(content)));
  ipfsFailure = false;
  assert.equal((await client.add(Buffer.from(content))).cid.toString(), cid);
});
