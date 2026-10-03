import assert from 'node:assert/strict';

for (const url of [
  'http://127.0.0.1:4005/metrics',
  'http://127.0.0.1:4100/healthz',
  'http://127.0.0.1:4173/healthz',
]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.ok, true, `Unhealthy endpoint: ${url}`);
}
const response = await fetch('http://127.0.0.1:4100/graphql', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: '{ artifacts(limit: 10) { id cid } }' }),
  signal: AbortSignal.timeout(10_000),
});
assert.equal(response.ok, true, 'Indexer GraphQL request failed');
const payload = await response.json();
assert.equal(payload.errors, undefined, 'Indexer returned GraphQL errors');
assert.ok(
  payload.data.artifacts.length > 0,
  'Indexer did not ingest the on-chain seed artifacts'
);
const unauthenticated = await fetch('http://127.0.0.1:4005/arena/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
  signal: AbortSignal.timeout(10_000),
});
assert.equal(
  unauthenticated.status,
  401,
  'On-chain arena writes must require authentication'
);
console.log(
  `Local stack health and on-chain ingestion pass (${payload.data.artifacts.length} artifacts).`
);
