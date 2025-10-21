import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOneboxUrl, normalisePrefix, parseOverrideParams } from '../url-overrides.js';

test('normalisePrefix trims input and enforces a single leading slash', () => {
  assert.equal(normalisePrefix(undefined), '');
  assert.equal(normalisePrefix(null), '');
  assert.equal(normalisePrefix(''), '');
  assert.equal(normalisePrefix('onebox'), '/onebox');
  assert.equal(normalisePrefix('/custom/'), '/custom');
  assert.equal(normalisePrefix('  /teams/sub   '), '/teams/sub');
});

test('buildOneboxUrl composes base, prefix, and path safely', () => {
  assert.equal(buildOneboxUrl('https://demo.example', '/onebox', '/onebox/plan'), 'https://demo.example/onebox/plan');
  assert.equal(buildOneboxUrl('https://demo.example/', '/onebox', 'plan'), 'https://demo.example/onebox/plan');
  assert.equal(buildOneboxUrl('https://demo.example/api', '', '/onebox/plan'), 'https://demo.example/api/plan');
  assert.equal(
    buildOneboxUrl('https://demo.example', '/trusted', 'onebox/status?jobId=12'),
    'https://demo.example/trusted/status?jobId=12'
  );
});

test('parseOverrideParams extracts orchestrator, prefix, token, and mode', () => {
  const overrides = parseOverrideParams(
    'https://demo.local/?orchestrator=https://alpha.example&oneboxPrefix=bridge&token=demo-key&mode=EXPERT'
  );
  assert.equal(overrides.orchestrator, 'https://alpha.example');
  assert.equal(overrides.prefix, '/bridge');
  assert.equal(overrides.token, 'demo-key');
  assert.equal(overrides.mode, 'expert');
  assert.deepEqual(overrides.appliedParams.sort(), ['mode', 'oneboxPrefix', 'orchestrator', 'token'].sort());
});

test('parseOverrideParams handles demo reset and empty values', () => {
  const overrides = parseOverrideParams('https://demo.local/?orchestrator=demo&oneboxPrefix=&token=');
  assert.equal(overrides.orchestrator, '');
  assert.equal(overrides.prefix, '');
  assert.equal(overrides.token, '');
});
