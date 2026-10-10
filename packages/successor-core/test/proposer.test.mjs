import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createResponsesProposer,
  validateParameterProposal,
} from '../src/proposer.mjs';
const parameters = {
  leakKWh: 2,
  conditionalOnHot: true,
  rationale: 'Observed thermal loss',
  falsifier: 'Cold cases should have no loss',
};
const input = {
  evidence: 'synthetic energy observations',
  dataClass: 'synthetic',
  missionId: 'energy',
  jobId: 'form-1',
};
const response = (value) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: JSON.stringify(value) }],
        },
      ],
    })
  );
test('Provider requires explicit opt-in and budget admission; no request sent on denial', async () => {
  assert.throws(() => createResponsesProposer(), {
    code: 'PROVIDER_NOT_AUTHORIZED',
  });
  let calls = 0;
  const proposer = createResponsesProposer({
    enabled: true,
    model: 'operator-configured',
    apiKey: 'fixture-secret',
    authorizeCall: async () => ({ allowed: false }),
    fetchImpl: async () => {
      calls++;
      return response(parameters);
    },
  });
  await assert.rejects(proposer.propose(input), {
    code: 'PROVIDER_NOT_AUTHORIZED',
  });
  assert.equal(calls, 0);
});
test('D01 provider supplies bounded hypothesis parameters, not code or authority', async () => {
  let request;
  const proposer = createResponsesProposer({
    enabled: true,
    model: 'operator-configured',
    apiKey: 'fixture-secret',
    authorizeCall: async () => ({ allowed: true, reservationId: 'reserved-1' }),
    fetchImpl: async (url, options) => {
      request = JSON.parse(options.body);
      return response(parameters);
    },
  });
  const result = await proposer.propose(input);
  assert.equal(result.status, 'UNVERIFIED_HYPOTHESIS');
  assert.equal(result.productionAuthority, false);
  assert.equal(result.provider.immutableWeights, false);
  assert.equal(request.store, false);
  assert.deepEqual(request.tools, []);
  assert.throws(
    () => validateParameterProposal({ ...parameters, eval: 'process.env' }),
    { code: 'PROPOSAL_INVALID' }
  );
  assert.throws(
    () => validateParameterProposal({ ...parameters, leakKWh: Infinity }),
    { code: 'PROPOSAL_INVALID' }
  );
});
test('O01 timeout/oversize do not retry and provider secrets are absent from errors', async () => {
  let calls = 0;
  const base = {
    enabled: true,
    model: 'configured',
    apiKey: 'fixture-secret',
    authorizeCall: async () => ({ allowed: true, reservationId: 'r1' }),
  };
  const proposer = createResponsesProposer({
    ...base,
    fetchImpl: async () => {
      calls++;
      throw new Error('fixture-secret');
    },
  });
  await assert.rejects(
    proposer.propose(input),
    (error) =>
      error.code === 'PROVIDER_OUTCOME_UNKNOWN' &&
      !error.message.includes('fixture-secret')
  );
  assert.equal(calls, 1);
  const large = createResponsesProposer({
    ...base,
    maxResponseBytes: 1024,
    fetchImpl: async () => new Response('x'.repeat(2000)),
  });
  await assert.rejects(large.propose(input), {
    code: 'PROVIDER_RESPONSE_LIMIT',
  });
});
