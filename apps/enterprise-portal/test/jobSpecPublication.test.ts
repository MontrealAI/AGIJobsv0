import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { keccak256, toUtf8Bytes } from 'ethers';
import { computeSpecHash, serializeSpecPayload } from '../src/lib/crypto';
import {
  resolveSpecificationLocation,
  submitPublishedSpecification,
  verifyPublishedSpecification,
  type SpecificationPolicy,
} from '../src/lib/jobSpecPublication';

const payload = {
  title: 'Supplier comparison',
  description: 'Compare 40 units',
  requiredSkills: ['research'],
  metadata: { z: 'é', a: 1 },
};
const exact = serializeSpecPayload(payload);
let origin: string;
let policy: SpecificationPolicy;
let downloads = 0;
const server = createServer((request, response) => {
  downloads++;
  if (request.url === '/slow') return;
  if (request.url === '/missing') {
    response.writeHead(404);
    response.end();
    return;
  }
  if (request.url === '/redirect') {
    response.writeHead(302, { Location: '/spec' });
    response.end();
    return;
  }
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/changed')
    response.end(JSON.stringify({ ...payload, title: 'Substituted work' }));
  else if (request.url === '/pretty')
    response.end(JSON.stringify(JSON.parse(exact), null, 2));
  else if (request.url === '/large')
    response.end('x'.repeat(4 * 1024 * 1024 + 1));
  else response.end(exact);
});

before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  origin = `http://127.0.0.1:${address.port}`;
  policy = { gateway: `${origin}/ipfs`, allowedOrigins: [origin] };
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('exported canonical bytes and the displayed/on-chain hash agree', () => {
  assert.equal(
    exact,
    serializeSpecPayload({
      metadata: { a: 1, z: 'é' },
      requiredSkills: ['research'],
      description: payload.description,
      title: payload.title,
    })
  );
  assert.equal(computeSpecHash(payload), keccak256(toUtf8Bytes(exact)));
  assert.notEqual(
    computeSpecHash({ values: [1, 2] }),
    computeSpecHash({ values: [2, 1] })
  );
});

test('retrieves exact published bytes before invoking the wallet callback once', async () => {
  let submissions = 0;
  const startingDownloads = downloads;
  const result = await submitPublishedSpecification(
    payload,
    `${origin}/spec`,
    async (verified) => {
      submissions++;
      assert.equal(downloads, startingDownloads + 1);
      assert.equal(verified.specHash, computeSpecHash(payload));
      assert.equal(verified.uri, `${origin}/spec`);
      return 'submitted';
    },
    policy
  );
  assert.equal(result, 'submitted');
  assert.equal(submissions, 1);
});

test('IPFS publication uses the configured gateway and retains the actual IPFS URI', async () => {
  const result = await verifyPublishedSpecification(
    payload,
    'ipfs://bafyfixture/spec.json',
    { ...policy, allowedOrigins: [] }
  );
  assert.equal(result.uri, 'ipfs://bafyfixture/spec.json');
  assert.equal(result.specHash, computeSpecHash(payload));
});

test('missing, substituted, reformatted and redirected specifications never invoke the wallet', async (t) => {
  for (const route of ['', '/missing', '/changed', '/pretty', '/redirect']) {
    await t.test(route || 'blank URI', async () => {
      let submissions = 0;
      await assert.rejects(
        submitPublishedSpecification(
          payload,
          route ? `${origin}${route}` : '',
          async () => {
            submissions++;
          },
          policy
        )
      );
      assert.equal(submissions, 0);
    });
  }
});

test('unapproved origins and unsafe IPFS paths are rejected before fetching', async () => {
  const restricted = { gateway: `${origin}/ipfs`, allowedOrigins: [] };
  const blocked = [
    'https://unapproved.example/spec',
    'http://unapproved.example/spec',
    'https://user:password@ipfs.io/spec',
    'https://ipfs.io/spec?token=secret',
    'https://ipfs.io/spec#fragment',
    'file:///etc/passwd',
    'ipfs://job-spec/abc',
    'ipfs://../admin',
    'ipfs://cid/../admin',
    'ipfs://cid/%2e%2e/admin',
    'ipfs://cid/%252e%252e/admin',
    'ipfs://cid/a%2fb',
    'ipfs://cid/a%5cb',
    `${origin}/admin`,
    `${origin}/ipfs/../admin`,
    `${origin}/ipfs/cid/%252e%252e/admin`,
  ];
  let fetches = 0;
  const fetcher: typeof fetch = async () => {
    fetches++;
    throw new Error('Unexpected fetch');
  };
  for (const uri of blocked)
    await assert.rejects(
      verifyPublishedSpecification(payload, uri, restricted, fetcher)
    );
  assert.equal(fetches, 0);
  assert.equal(
    resolveSpecificationLocation(`${origin}/ipfs/cid/spec.json`, restricted),
    `${origin}/ipfs/cid/spec.json`
  );
});

test('oversized downloads and timeouts never invoke the wallet', async (t) => {
  for (const route of ['/large', '/slow']) {
    await t.test(route, async () => {
      let submissions = 0;
      await assert.rejects(
        submitPublishedSpecification(
          payload,
          `${origin}${route}`,
          async () => {
            submissions++;
          },
          { ...policy, timeoutMs: route === '/slow' ? 30 : 15000 }
        )
      );
      assert.equal(submissions, 0);
    });
  }
});

test('oversized local drafts fail before any network or wallet call', async () => {
  let fetches = 0;
  let submissions = 0;
  await assert.rejects(
    submitPublishedSpecification(
      { data: 'x'.repeat(4 * 1024 * 1024) },
      `${origin}/spec`,
      async () => {
        submissions++;
      },
      policy,
      async () => {
        fetches++;
        return new Response(exact);
      }
    ),
    /4 MiB/
  );
  assert.equal(fetches, 0);
  assert.equal(submissions, 0);
});

test('a prior verification cannot authorize an edited draft', async () => {
  await verifyPublishedSpecification(payload, `${origin}/spec`, policy);
  let submissions = 0;
  await assert.rejects(
    submitPublishedSpecification(
      { ...payload, description: 'Changed acceptance criteria' },
      `${origin}/spec`,
      async () => {
        submissions++;
      },
      policy
    ),
    /do not match/
  );
  assert.equal(submissions, 0);
});

test('verification omits credentials, disables caching and rejects redirects', async () => {
  const fetcher: typeof fetch = async (_input, options) => {
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.cache, 'no-store');
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal);
    return new Response(exact);
  };
  await verifyPublishedSpecification(
    payload,
    `${origin}/spec`,
    policy,
    fetcher
  );
});
