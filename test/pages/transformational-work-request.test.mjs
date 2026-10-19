import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  canonical,
  digest,
  parseBounded,
} from '../../integrations/alpha-agent/vendor/alpha/docs/assets/successor/engine.mjs';
import {
  createTransformationWorkDraft,
  inspectTransformationWorkDraft,
  inspectTransformationWorkRequest,
} from '../../integrations/alpha-agent/transformational-work-request.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const byteDigest = (value) => 'sha256:' + sha(value);
async function fixture(mutate = () => {}) {
  const request = {
    schema: 'transformational-intelligence/v1',
    campaign_id: '00000000-0000-4000-8000-000000000001',
    revision: 0,
    charter: {
      schema: 'intent-charter/v1',
      purpose: 'Preserve the fixed summary',
      publicOnly: true,
      payment_route: 'AGIALPHA',
      budgets: { AGIALPHABaseUnits: '7000000000000000000', USDCBaseUnits: '0' },
    },
    formulation: {
      schema: 'formulation/v1',
      representation: 'audited-argument-map',
    },
    transformation: {
      schema: 'transformation-package/v1',
      witness: {
        purpose: 'Preserve the fixed summary',
        falsifier: 'Annotation errors outweigh structural gains',
      },
    },
    evaluation: {
      instrument: {
        schema: 'evaluation-instrument/v1',
        measurement: 'structural-only',
        calibration: 'missing',
      },
      epoch: 1,
    },
    bindings: {
      code: sha('code'),
      model: sha('none'),
      configuration: sha('configuration'),
      evidence: sha('evidence'),
    },
    authorization: {
      scope: 'local-bounded',
      binding: null,
      authority_expansion: false,
    },
    review: { independent: false },
    settlement: {
      route: 'AGIALPHA',
      status: 'unfunded',
      transaction_prepared: false,
    },
  };
  mutate(request);
  for (const key of ['charter', 'formulation', 'transformation', 'bindings'])
    request[key + '_digest'] = await digest('ti-' + key, request[key]);
  request.evaluation.instrument_digest = await digest(
    'ti-instrument',
    request.evaluation.instrument
  );
  return request;
}
// This double tests only the market boundary. A separate actual native inspector
// test covers the real free campaign; this positive-budget shape is not native v1.
const inspectWorkRequest = async (raw) => parseBounded(raw);
const options = (request) => ({
  inspectWorkRequest,
  expectedBindingsDigest: request.bindings_digest,
  amountBaseUnits: '7000000000000000000',
  createdAt: '2026-10-19T15:00:00.000Z',
});
async function resign(value) {
  const { sha256, ...body } = value;
  return canonical({ ...body, sha256: byteDigest(canonical(body)) });
}

test('an installed inspector preserves the native free revision-zero campaign without paid authority', async () => {
  const request = await fixture((x) => {
    x.charter.payment_route = 'none';
    x.charter.budgets.AGIALPHABaseUnits = '0';
    x.settlement.route = 'none';
  });
  const inspected = await inspectTransformationWorkRequest(
    canonical(request),
    options(request)
  );
  assert.equal(inspected.revision, 0);
  assert.equal(canonical(inspected), canonical(request));
  await assert.rejects(
    createTransformationWorkDraft(canonical(request), options(request)),
    /AGIALPHA_ROUTE/
  );
});

test('a policy-double positive charter yields an inert exact-18-decimal proposal bound to every native object and source', async () => {
  const request = await fixture(),
    original = JSON.stringify(request, null, 2);
  const raw = await createTransformationWorkDraft(original, options(request));
  const draft = await inspectTransformationWorkDraft(raw, options(request));
  assert.equal(draft.original, original);
  assert.equal(draft.bindings.requestRawSha256, byteDigest(original));
  assert.equal(draft.bindings.charterDigest, request.charter_digest);
  assert.equal(
    draft.bindings.transformationDigest,
    request.transformation_digest
  );
  assert.equal(
    draft.bindings.instrumentDigest,
    request.evaluation.instrument_digest
  );
  assert.equal(draft.bindings.measurementEpoch, 1);
  assert.equal(
    draft.bindings.adapterSha256,
    byteDigest(
      readFileSync(
        new URL(
          '../../integrations/alpha-agent/transformational-work-request.mjs',
          import.meta.url
        )
      )
    )
  );
  assert.equal(draft.route.asset, 'AGIALPHA');
  assert.equal(draft.route.decimals, 18);
  assert.equal(draft.planning.amountBaseUnits, '7000000000000000000');
  assert.equal(draft.planning.reservedBaseUnits, '0');
  assert.equal(
    draft.jobSpecification.sha256,
    byteDigest(draft.jobSpecification.raw)
  );
  assert.equal(
    draft.commissioning.specHash,
    '0x' + sha(draft.jobSpecification.raw)
  );
  for (const key of ['transaction', 'deadline', 'specURI'])
    assert.equal(draft.commissioning[key], null);
  for (const key of [
    'independentProof',
    'trustedComputerExecution',
    'executionApproved',
    'settlementApproved',
    'productionApproved',
  ])
    assert.equal(draft[key], false);
  assert.equal(draft.authority, 'none');
  assert.equal(draft.settlement, 'not-connected');
});

test('a free campaign and the USDC route cannot become an AGIALPHA proposal', async () => {
  for (const route of ['none', 'USDC']) {
    const request = await fixture((x) => {
      x.charter.payment_route = route;
      x.settlement.route = route;
    });
    await assert.rejects(
      createTransformationWorkDraft(canonical(request), options(request)),
      /AGIALPHA_ROUTE/
    );
  }
  const request = await fixture((x) => {
    x.charter.budgets.AGIALPHABaseUnits = '0';
  });
  await assert.rejects(
    createTransformationWorkDraft(canonical(request), options(request)),
    /AGIALPHA_CAP/
  );
});

test('integer AGIALPHA units reject ambiguity, overflow and charter-cap exhaustion', async () => {
  const request = await fixture();
  for (const amountBaseUnits of [
    '0',
    '01',
    '-1',
    '1.0',
    '1e18',
    ' 1',
    1,
    undefined,
    (1n << 96n).toString(),
  ])
    await assert.rejects(
      createTransformationWorkDraft(canonical(request), {
        ...options(request),
        amountBaseUnits,
      }),
      /AGIALPHA_AMOUNT/
    );
  await assert.rejects(
    createTransformationWorkDraft(canonical(request), {
      ...options(request),
      amountBaseUnits: '7000000000000000001',
    }),
    /AGIALPHA_CAP/
  );
  const max = await fixture((x) => {
    x.charter.budgets.AGIALPHABaseUnits = ((1n << 96n) - 1n).toString();
  });
  for (const amountBaseUnits of ['1', ((1n << 96n) - 1n).toString()]) {
    const draft = JSON.parse(
      await createTransformationWorkDraft(canonical(max), {
        ...options(max),
        amountBaseUnits,
      })
    );
    assert.equal(draft.planning.amountBaseUnits, amountBaseUnits);
  }
  for (const cap of ['01', '-1', 1, (1n << 96n).toString()]) {
    const bad = await fixture((x) => {
      x.charter.budgets.AGIALPHABaseUnits = cap;
    });
    await assert.rejects(
      createTransformationWorkDraft(canonical(bad), options(bad)),
      /AGIALPHA_CAP/
    );
  }
});

test('native inspection is mandatory and an unrelated acceptance verdict cannot substitute for the exact campaign', async () => {
  const request = await fixture(),
    raw = canonical(request);
  await assert.rejects(
    createTransformationWorkDraft(raw, {
      ...options(request),
      inspectWorkRequest: undefined,
    }),
    /INSPECTOR_REQUIRED/
  );
  for (const callback of [
    async () => ({ accepted: true }),
    async () => {
      throw Error('NATIVE_REJECTED');
    },
  ])
    await assert.rejects(
      createTransformationWorkDraft(raw, {
        ...options(request),
        inspectWorkRequest: callback,
      }),
      /NATIVE_BINDING|NATIVE_REJECTED/
    );
});

test('changed charter, formulation, witness and bindings cannot reuse old object commitments', async () => {
  for (const key of ['charter', 'formulation', 'transformation', 'bindings']) {
    const request = await fixture();
    request[key + '_digest'] = '0'.repeat(64);
    await assert.rejects(
      createTransformationWorkDraft(canonical(request), options(request)),
      /OBJECT_BINDING/
    );
  }
});

test('fresh runtime context rejects an earlier proposal after code, model, configuration or evidence changes', async () => {
  const request = await fixture(),
    raw = await createTransformationWorkDraft(
      canonical(request),
      options(request)
    );
  for (const key of ['code', 'model', 'configuration', 'evidence']) {
    const changed = await fixture((x) => {
      x.bindings[key] = sha('new-' + key);
    });
    await assert.rejects(
      inspectTransformationWorkDraft(raw, options(changed)),
      /STALE_BINDINGS/
    );
  }
  await assert.rejects(
    inspectTransformationWorkDraft(raw, { inspectWorkRequest }),
    /EXPECTED_BINDINGS/
  );
});

test('rehashed edits cannot grant authority or alter token, budget, epoch, source or commissioning terms', async () => {
  const request = await fixture(),
    raw = await createTransformationWorkDraft(
      canonical(request),
      options(request)
    );
  for (const change of [
    (x) => {
      x.authority = 'execute';
    },
    (x) => {
      x.productionApproved = true;
    },
    (x) => {
      x.executionApproved = true;
    },
    (x) => {
      x.independentProof = true;
    },
    (x) => {
      x.settlementApproved = true;
    },
    (x) => {
      x.route.asset = 'USDC';
    },
    (x) => {
      x.route.decimals = 6;
    },
    (x) => {
      x.planning.reservedBaseUnits = '1';
    },
    (x) => {
      x.authorizedCapBaseUnits = '0';
    },
    (x) => {
      x.bindings.measurementEpoch++;
    },
    (x) => {
      x.bindings.adapterSha256 = 'sha256:' + '0'.repeat(64);
    },
    (x) => {
      x.commissioning.transaction = {};
    },
  ]) {
    const draft = JSON.parse(raw);
    change(draft);
    await assert.rejects(
      inspectTransformationWorkDraft(await resign(draft), options(request)),
      /DRAFT_INTEGRITY/
    );
  }
});

test('decoded credential, private-address and duplicate-key inputs are rejected before native inspection', async () => {
  const request = await fixture((x) => {
    x.charter.purpose = 'Read operator@example.invalid';
  });
  await assert.rejects(
    inspectTransformationWorkRequest(
      canonical(request).replace('@', '\\u0040'),
      options(request)
    ),
    /PRIVATE_INPUT/
  );
  let called = false;
  await assert.rejects(
    inspectTransformationWorkRequest('{"schema":"a","schema":"b"}', {
      ...options(request),
      inspectWorkRequest: async () => {
        called = true;
      },
    }),
    /Duplicate JSON key/
  );
  assert.equal(called, false);
  for (const key of [
    'api_key',
    'API-KEY',
    'private_key',
    'password',
    'access_token',
    'seed phrase',
    'client_secret',
    'signing_key',
  ]) {
    const credential = await fixture((x) => {
      x.bindings.configuration = { [key]: 'synthetic-fixture-only' };
    });
    called = false;
    await assert.rejects(
      inspectTransformationWorkRequest(canonical(credential), {
        ...options(credential),
        inspectWorkRequest: async () => {
          called = true;
        },
      }),
      /PRIVATE_INPUT/
    );
    assert.equal(called, false);
    if (key === 'api_key') {
      await assert.rejects(
        inspectTransformationWorkRequest(
          canonical(credential).replace('"api_key":', '"api\\u005fkey":'),
          options(credential)
        ),
        /PRIVATE_INPUT/
      );
    }
  }
});

test('evaluation, authorization and settlement cannot expand the imported campaign authority', async () => {
  for (const change of [
    (x) => {
      x.evaluation.epoch = 0;
    },
    (x) => {
      x.authorization.scope = 'mainnet';
    },
    (x) => {
      x.authorization.authority_expansion = true;
    },
    (x) => {
      x.settlement.status = 'funded';
    },
    (x) => {
      x.settlement.transaction_prepared = true;
    },
    (x) => {
      x.review.independent = true;
    },
  ]) {
    const request = await fixture(change);
    await assert.rejects(
      createTransformationWorkDraft(canonical(request), options(request)),
      /TRANSFORMATION_/
    );
  }
});

test('inert reinspection is deterministic and bounded; noncanonical clock or outer bytes are refused', async () => {
  const request = await fixture(),
    raw = await createTransformationWorkDraft(
      canonical(request),
      options(request)
    );
  assert.equal(
    canonical(await inspectTransformationWorkDraft(raw, options(request))),
    canonical(await inspectTransformationWorkDraft(raw, options(request)))
  );
  await assert.rejects(
    createTransformationWorkDraft(' '.repeat(2_000_001), options(request)),
    /INPUT_SIZE/
  );
  await assert.rejects(
    createTransformationWorkDraft(canonical(request), {
      ...options(request),
      createdAt: '2026-10-19',
    }),
    /CLOCK/
  );
  await assert.rejects(
    inspectTransformationWorkDraft(raw + '\n', options(request)),
    /DRAFT_INTEGRITY/
  );
});
