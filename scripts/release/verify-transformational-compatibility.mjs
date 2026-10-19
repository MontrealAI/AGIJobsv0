import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import {
  inspectTransformationWorkRequest,
  createTransformationWorkDraft,
} from '../../integrations/alpha-agent/transformational-work-request.mjs';

const require = createRequire(import.meta.url);
const {
  assertPinnedAlphaCheckout,
} = require('../../integrations/alpha-agent/pinned-alpha-checkout.cjs');
const { profile } = require('./source-profile-rc16.cjs');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function resolvePinnedNativeRoot(alphaRoot, expectedCommit) {
  assert(
    path.isAbsolute(alphaRoot || ''),
    'Supply the absolute pinned Alpha checkout'
  );
  const physicalRoot = fs.realpathSync(alphaRoot);
  assertPinnedAlphaCheckout(physicalRoot, expectedCommit);
  return physicalRoot;
}

export function validateNativeReport(
  report,
  { jobsCommit, jobsTree, native = profile.nativeCompatibility } = {}
) {
  assert(
    /^[a-f0-9]{40}$/.test(jobsCommit || '') &&
      /^[a-f0-9]{40}$/.test(jobsTree || ''),
    'Native report requires exact expected Jobs source identities'
  );
  assert(
    report?.schema === 'agijobsv0/native-ti-compatibility/1',
    'Invalid native compatibility schema'
  );
  assert(
    report.jobsCommit === jobsCommit && report.jobsTree === jobsTree,
    'Native report uses different Jobs source'
  );
  assert(
    report.alphaCommit === native.commit && report.alphaTree === native.tree,
    'Native report uses different Alpha source'
  );
  assert.deepEqual(
    report.sources,
    native.files,
    'Native source inventory mismatch'
  );
  for (const field of [
    'nativeFreeInspection',
    'positiveAGIALPHARefused',
    'staleBindingsRefused',
    'authorityExpansionRefused',
    'credentialFieldsRefused',
    'privateURLsRefused',
    'sourceCheckedBeforeAndAfter',
  ])
    assert.equal(report[field], true, 'Missing actual native check: ' + field);
  assert.equal(report.currencySpend, '0');
  assert.equal(report.chainOperations, 0);
  assert.equal(report.independentProof, false);
  assert.equal(report.executionAuthority, false);
  assert.deepEqual(report.currencyCaps, {
    AGIALPHABaseUnits: '0',
    USDCBaseUnits: '0',
  });
  return report;
}

export async function verifyNativeCompatibility(
  alphaRoot,
  { native = profile.nativeCompatibility } = {}
) {
  const jobsRoot = path.resolve(import.meta.dirname, '../..');
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
    ),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
  };
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '--no-replace-objects',
        '-c',
        'core.fsmonitor=false',
        '-C',
        jobsRoot,
        ...args,
      ],
      { encoding: 'utf8', env }
    ).trim();
  const jobsCommit = git('rev-parse', 'HEAD'),
    jobsTree = git('rev-parse', 'HEAD^{tree}');
  assertPinnedAlphaCheckout(jobsRoot, jobsCommit);
  // Retain the verified physical checkout for every read/import and checkpoint.
  // Reusing the configured alias could select other code after verification.
  alphaRoot = resolvePinnedNativeRoot(alphaRoot, native.commit);
  const alphaTree = execFileSync(
    'git',
    [
      '--no-replace-objects',
      '-c',
      'core.fsmonitor=false',
      '-C',
      alphaRoot,
      'rev-parse',
      'HEAD^{tree}',
    ],
    { encoding: 'utf8', env }
  ).trim();
  assert.equal(alphaTree, native.tree, 'Alpha tree differs from its pin');
  for (const [name, expected] of Object.entries(native.files))
    assert.equal(
      sha256(fs.readFileSync(path.join(alphaRoot, name))),
      expected,
      'Pinned native bytes differ: ' + name
    );
  const fixture = path.join(
    alphaRoot,
    'examples/transformational-intelligence/campaign.json'
  );
  assert(
    fs.statSync(fixture).size <= 2_000_000,
    'Native fixture exceeds intake bound'
  );
  const raw = fs.readFileSync(fixture, 'utf8');
  const { inspectTransformationEnvelope } = await import(
    pathToFileURL(
      path.join(
        alphaRoot,
        'examples/transformational-intelligence/inspector.mjs'
      )
    ).href
  );
  const { digest } = await import(
    pathToFileURL(path.join(alphaRoot, 'docs/assets/successor/engine.mjs')).href
  );
  const inspected = await inspectTransformationEnvelope(raw);
  const options = {
    inspectWorkRequest: inspectTransformationEnvelope,
    expectedBindingsDigest: inspected.bindings_digest,
    amountBaseUnits: '1000000000000000000',
    createdAt: '2026-10-19T15:00:00.000Z',
  };
  const actual = await inspectTransformationWorkRequest(raw, options);
  assert.deepEqual(
    JSON.parse(JSON.stringify(actual)),
    JSON.parse(JSON.stringify(inspected))
  );
  assert.deepEqual(
    {
      AGIALPHABaseUnits: actual.charter.budgets.AGIALPHABaseUnits,
      USDCBaseUnits: actual.charter.budgets.USDCBaseUnits,
    },
    { AGIALPHABaseUnits: '0', USDCBaseUnits: '0' }
  );
  await assert.rejects(
    createTransformationWorkDraft(raw, options),
    /AGIALPHA_ROUTE|AGIALPHA_CAP/
  );
  await assert.rejects(
    inspectTransformationWorkRequest(raw, {
      ...options,
      expectedBindingsDigest: '0'.repeat(64),
    }),
    /STALE_BINDINGS/
  );
  const authority = JSON.parse(raw);
  authority.authorization.authority_expansion = true;
  await assert.rejects(
    inspectTransformationWorkRequest(JSON.stringify(authority), options)
  );
  for (const configuration of [
    { 'x-api-key': { value: 'synthetic-fixture-only' } },
    { reference: 'https://192.168.1.10/' },
  ]) {
    const changed = JSON.parse(raw);
    changed.bindings.request.configuration = configuration;
    changed.bindings_digest = await digest('ti-bindings', changed.bindings);
    changed.freeze = null;
    changed.result = null;
    changed.phase = 'queued';
    let called = false;
    await assert.rejects(
      inspectTransformationWorkRequest(JSON.stringify(changed), {
        ...options,
        expectedBindingsDigest: changed.bindings_digest,
        inspectWorkRequest: async (input) => {
          called = true;
          return inspectTransformationEnvelope(input);
        },
      }),
      /PRIVATE_INPUT|PUBLIC_URL/
    );
    assert.equal(
      called,
      false,
      'Private input reached the installed native callback'
    );
  }
  assertPinnedAlphaCheckout(alphaRoot, native.commit);
  assertPinnedAlphaCheckout(jobsRoot, jobsCommit);
  const report = {
    schema: 'agijobsv0/native-ti-compatibility/1',
    jobsCommit,
    jobsTree,
    alphaCommit: native.commit,
    alphaTree,
    sources: native.files,
    campaign: actual.campaign_id,
    revision: actual.revision,
    currencyCaps: { AGIALPHABaseUnits: '0', USDCBaseUnits: '0' },
    nativeFreeInspection: true,
    positiveAGIALPHARefused: true,
    staleBindingsRefused: true,
    authorityExpansionRefused: true,
    credentialFieldsRefused: true,
    privateURLsRefused: true,
    sourceCheckedBeforeAndAfter: true,
    currencySpend: '0',
    chainOperations: 0,
    independentProof: false,
    executionAuthority: false,
  };
  return validateNativeReport(report, { jobsCommit, jobsTree, native });
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  assert.equal(
    process.argv.length,
    3,
    'Supply only one reviewed Alpha checkout'
  );
  console.log(
    JSON.stringify(
      await verifyNativeCompatibility(path.resolve(process.argv[2]))
    )
  );
}
