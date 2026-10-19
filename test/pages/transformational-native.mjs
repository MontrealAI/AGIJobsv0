import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import {
  inspectTransformationWorkRequest,
  createTransformationWorkDraft,
} from '../../integrations/alpha-agent/transformational-work-request.mjs';

const [alphaRoot, fixtureFile] = process.argv.slice(2);
assert(
  path.isAbsolute(alphaRoot ?? '') && path.isAbsolute(fixtureFile ?? ''),
  'Supply explicit absolute reviewed Alpha and fixture paths'
);
const { inspectTransformationEnvelope } = await import(
  pathToFileURL(
    path.join(alphaRoot, 'examples/transformational-intelligence/inspector.mjs')
  ).href
);
const raw = fs.readFileSync(fixtureFile, 'utf8');
const request = await inspectTransformationEnvelope(raw);
const options = {
  inspectWorkRequest: inspectTransformationEnvelope,
  expectedBindingsDigest: request.bindings_digest,
  amountBaseUnits: '1000000000000000000',
  createdAt: '2026-10-19T15:00:00.000Z',
};
const actual = await inspectTransformationWorkRequest(raw, options);
assert.deepEqual(
  JSON.parse(JSON.stringify(actual)),
  JSON.parse(JSON.stringify(request))
);
assert.equal(actual.charter.budgets.AGIALPHABaseUnits, '0');
await assert.rejects(
  createTransformationWorkDraft(raw, options),
  /AGIALPHA_ROUTE|AGIALPHA_CAP/
);
const changed = JSON.parse(raw);
changed.authorization.authority_expansion = true;
await assert.rejects(
  inspectTransformationWorkRequest(JSON.stringify(changed), options)
);
await assert.rejects(
  inspectTransformationWorkRequest(raw, {
    ...options,
    expectedBindingsDigest: '0'.repeat(64),
  }),
  /STALE_BINDINGS/
);
console.log(
  JSON.stringify({
    campaign: actual.campaign_id,
    revision: actual.revision,
    nativeFreeInspection: true,
    positiveAGIALPHARefused: true,
    staleBindingsRefused: true,
    authorityExpansionRefused: true,
    currencySpend: '0',
    chainOperations: 0,
    independentProof: false,
    executionAuthority: false,
  })
);
