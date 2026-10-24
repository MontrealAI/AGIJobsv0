// SPDX-License-Identifier: MIT
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { z } = require('zod');
const root = path.resolve(__dirname, '../../..');
function source(name) {
  const filename = path.join(root, name);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled.outputText, filename);
  return loaded.exports;
}
test('patched collection validation rejects size before accumulating element failures', () => {
  const result = z.array(z.string()).max(2).safeParse([1, 2, 3]);
  assert.equal(result.success, false);
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0].code, 'too_big');
});
test('SDK dictionaries retain arbitrary string keys, values and existing defaults', () => {
  const sdk = source('packages/onebox-sdk/src/types.ts');
  const constraints = { '': true, labels: ['a'], nested: { score: 3 } };
  assert.deepEqual(sdk.JobIntentSchema.parse({ kind: 'custom', constraints }), {
    kind: 'custom', attachments: [], constraints,
  });
  assert.deepEqual(sdk.StepSchema.parse({ id: 'one', name: 'Review', kind: 'validate' }), {
    id: 'one', name: 'Review', kind: 'validate', params: {}, needs: [],
  });
});
test('orchestrator dictionaries and historical UUID-like trace identifiers remain accepted', () => {
  const { ICSSchema } = source('packages/orchestrator/src/ics.ts');
  const request = { intent: 'create_job', params: { job: { rewardAGIA: '1', deadline: 5,
    spec: { labels: ['a'], nested: { score: 3 } } } },
    meta: { traceId: '123e4567-e89b-12d3-3456-426614174000' } };
  assert.deepEqual(ICSSchema.parse(request), request);
  assert.deepEqual(ICSSchema.parse({ intent: 'validate' }), { intent: 'validate', params: {} });
});
test('onebox retains omitted any-valued settings and historical trace identifiers', () => {
  const { IntentSchema } = source('packages/onebox-orchestrator/src/ics/schema.ts');
  const request = { intent: 'admin_set', params: { key: 'mode' },
    meta: { traceId: '123e4567-e89b-12d3-3456-426614174000' } };
  assert.deepEqual(IntentSchema.parse(request), request);
});
test('onebox retains distinct missing-field and custom type-error messages', () => {
  const { IntentSchema } = source('packages/onebox-orchestrator/src/ics/schema.ts');
  const payload = { intent: 'create_job', params: { job: {
    title: 42, description: 'A bounded review mission', rewardAmount: '1', deadlineDays: 1,
  } } };
  const invalid = IntentSchema.safeParse(payload);
  assert.equal(invalid.success, false);
  assert.ok(invalid.error.issues.some(issue => issue.message === 'Job title must be a string'));
  delete payload.params.job.title;
  const missing = IntentSchema.safeParse(payload);
  assert.equal(missing.success, false);
  assert.ok(missing.error.issues.some(issue => issue.message === 'Required'));
});
test('arena metadata records and omitted submission retain their prior shape', () => {
  const schemas = source('services/arena/src/validators.ts');
  const request = { contestantIds: ['a'], validatorIds: ['b'], roundMetadata: { nested: { score: 1 } } };
  assert.deepEqual(schemas.startRoundSchema.parse(request), request);
  const reveal = { roundId: 'r', agentId: 'a', proof: 'proof' };
  assert.deepEqual(schemas.revealSchema.parse(reveal), reveal);
});
test('Phase8 retains required and invalid-type manifest diagnostics', () => {
  const { parseManifest } = source('demo/Phase-8-Universal-Value-Dominance/scripts/run-phase8-demo.ts');
  const config = JSON.parse(fs.readFileSync(path.join(root,
    'demo/Phase-8-Universal-Value-Dominance/config/universal.value.manifest.json'), 'utf8'));
  assert.ok(parseManifest(config));
  const slug = config.domains[0].slug;
  delete config.domains[0].slug;
  assert.throws(() => parseManifest(config), /domains\.0\.slug: Domain slug is required/);
  config.domains[0].slug = slug;
  config.domains[0].orchestrator = 42;
  assert.throws(() => parseManifest(config), /Address must be provided as a string/);
});
for (const [collection, field] of [['domains', 'tvlLimit'], ['stakeTiers', 'minimumStake']]) {
  for (const presence of ['omitted', 'undefined']) {
    test(`Phase8 ${presence} ${field} retains zero normalization`, () => {
      const { parseManifest } = source('demo/Phase-8-Universal-Value-Dominance/scripts/run-phase8-demo.ts');
      const baseline = JSON.parse(fs.readFileSync(path.join(root,
        'demo/Phase-8-Universal-Value-Dominance/config/universal.value.manifest.json'), 'utf8'));
      const entries = collection === 'domains' ? baseline.domains : baseline.economy.stakeTiers;
      for (let index = 0; index < entries.length; index += 1) {
        const config = structuredClone(baseline);
        const input = collection === 'domains' ? config.domains[index] : config.economy.stakeTiers[index];
        if (presence === 'omitted') delete input[field]; else input[field] = undefined;
        const parsed = parseManifest(config);
        const result = collection === 'domains' ? parsed.domains[index] : parsed.economy.stakeTiers[index];
        assert.equal(result[field], '0');
        assert.equal(Object.hasOwn(input, field), presence !== 'omitted');
        assert.equal(input[field], undefined);
      }
    });
  }
}
test('Phase8 numeric normalization retains nonmissing values and invalid-value refusals', () => {
  const { parseManifest } = source('demo/Phase-8-Universal-Value-Dominance/scripts/run-phase8-demo.ts');
  const baseline = JSON.parse(fs.readFileSync(path.join(root,
    'demo/Phase-8-Universal-Value-Dominance/config/universal.value.manifest.json'), 'utf8'));
  for (const field of ['tvlLimit', 'minimumStake']) {
    for (const [value, expected] of [[null, '0'], [0, '0'], [42, '42'], [42n, '42'], ['', '0'],
      ['00042', '00042'], [' 42 ', '42']]) {
      const config = structuredClone(baseline);
      const input = field === 'tvlLimit' ? config.domains[0] : config.economy.stakeTiers[0];
      input[field] = value;
      const parsed = parseManifest(config);
      assert.equal((field === 'tvlLimit' ? parsed.domains[0] : parsed.economy.stakeTiers[0])[field], expected);
    }
    for (const value of [-1, -1n, '-1', 'not-a-number', Number.MAX_SAFE_INTEGER + 1]) {
      const config = structuredClone(baseline);
      (field === 'tvlLimit' ? config.domains[0] : config.economy.stakeTiers[0])[field] = value;
      assert.throws(() => parseManifest(config));
    }
  }
});
const indexerEnvironment = ['INDEXER_PORT', 'RPC_URL', 'CULTURE_REGISTRY_ADDRESS', 'SELF_PLAY_ARENA_ADDRESS',
  'DATABASE_URL', 'SQLITE_PATH', 'POLL_INTERVAL_MS', 'BLOCK_BATCH_SIZE', 'FINALITY_DEPTH',
  'INFLUENCE_DAMPING_FACTOR', 'INFLUENCE_ITERATIONS', 'INFLUENCE_TOLERANCE', 'INFLUENCE_VALIDATION_MULTIPLIER',
  'CULTURE_WEEKLY_METRICS', 'INDEXER_WEEKLY_METRICS', 'CULTURE_ANALYTICS_EXPORT', 'CULTURE_NETWORK',
  'HARDHAT_NETWORK', 'API_RATE_LIMIT_MAX', 'API_RATE_LIMIT_WINDOW', 'BACKFILL_INTERVAL_MS', 'CHECKSUM_INTERVAL_MS'];
for (const name of ['services/culture-graph-indexer/src/config.ts',
  'demo/CULTURE-v0/indexers/culture-graph-indexer/src/config.ts']) {
  for (const [label, input, expected] of [['missing', undefined, 4100], ['valid', '4200', 4200],
    ['invalid', 'not-a-port', 4100]]) {
    test(`${name} keeps ${label} port input numeric without starting a server`, () => {
      const prior = new Map(indexerEnvironment.map(key => [key, process.env[key]]));
      const cwd = process.cwd(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zod-indexer-config-'));
      try {
        process.chdir(directory);
        for (const key of indexerEnvironment) delete process.env[key];
        if (input !== undefined) process.env.INDEXER_PORT = input;
        const { loadConfig } = source(name);
        const config = loadConfig();
        assert.equal(typeof config.port, 'number');
        assert.equal(config.port, expected);
      } finally {
        process.chdir(cwd);
        for (const [key, value] of prior) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }
}
