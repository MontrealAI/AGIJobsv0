import test from 'node:test';
import assert from 'node:assert/strict';
import * as Signer from '@ucanto/principal/ed25519';
import { delegate } from '@storacha/client/delegation';
import { createW3upClient } from '../../lib/w3up-upload.mjs';

async function authorization(overrides = {}) {
  const issuer = await Signer.generate();
  const agent = await Signer.generate();
  const proof = await delegate({
    issuer,
    audience: agent,
    capabilities: [{ with: issuer.did(), can: '*' }],
    expiration: Math.floor(Date.now() / 1000) + 600,
    ...overrides,
  });
  const archived = await proof.archive();
  assert.equal(archived.error, undefined);
  return { issuer, agent, env: {
    W3UP_KEY: Signer.format(agent),
    W3UP_PROOF: Buffer.from(archived.ok).toString('base64'),
    W3UP_SPACE_DID: issuer.did(),
  } };
}

test('real signed delegation is parsed into the exact in-memory agent and space without network access', async () => {
  const fixture = await authorization();
  const fetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('No network is allowed in this test'); };
  try {
    const client = await createW3upClient(fixture.env);
    assert.equal(client.did(), fixture.agent.did());
    assert.equal(client.currentSpace().did(), fixture.issuer.did());
    assert.equal(requests, 0);
  } finally { globalThis.fetch = fetch; }
});
for (const scenario of ['wrong-agent', 'wrong-space', 'expired', 'not-yet-valid']) {
  test(`real delegation rejects ${scenario} without leaking signing material`, async () => {
    const now = Math.floor(Date.now() / 1000);
    const fixture = await authorization(scenario === 'expired' ? { expiration: now - 1 } :
      scenario === 'not-yet-valid' ? { notBefore: now + 60 } : {});
    if (scenario === 'wrong-agent') fixture.env.W3UP_KEY = Signer.format(await Signer.generate());
    if (scenario === 'wrong-space') fixture.env.W3UP_SPACE_DID = (await Signer.generate()).did();
    await assert.rejects(createW3upClient(fixture.env), (error) =>
      error.message.startsWith('W3UP_AUTHORIZATION_INVALID') && error.cause === undefined &&
      !String(error).includes(fixture.env.W3UP_KEY) && !String(error).includes(fixture.env.W3UP_PROOF));
  });
}
