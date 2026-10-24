'use strict';

// These are inert, explicitly synthetic metadata checks. They are not scanner
// artifacts, genuine service observations, source clearance or release evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../scripts/release/source-codeql-service-rc16.cjs');
const sha = 'a'.repeat(40);
const upload = '11111111-1111-1111-1111-111111111111';

test('service API admission is finite, source-bound and read-only', () => {
  for (const resource of [
    'actions/runs/1',
    'actions/runs/1/attempts/1',
    'actions/runs/1/attempts/1/jobs?per_page=100&page=1',
    'actions/jobs/1',
    'actions/artifacts/1',
    'actions/runs/1/artifacts?per_page=100&page=20',
    'actions/workflows/static-analysis.yml/runs?head_sha=' +
      sha + '&per_page=100&page=1',
    'actions/workflows/static-analysis-python-integrations.yml/runs?head_sha=' +
      sha + '&per_page=100&page=20',
    'code-scanning/sarifs/' + upload,
    'code-scanning/analyses?sarif_id=' + upload + '&per_page=100&page=1',
    'code-scanning/analyses/1',
  ])
    assert.equal(service.isServiceApiResource(resource, sha), true, resource);
  for (const resource of [
    'https://api.github.com/repos/another/repository/code-scanning/analyses/1',
    'code-scanning/alerts/1',
    'code-scanning/analyses',
    'code-scanning/analyses/0',
    'code-scanning/sarifs/not-an-upload-id',
    'actions/runs/1/cancel',
    'actions/runs/1/artifacts?per_page=100&page=21',
    'actions/runs/1/attempts/1/jobs?per_page=100&page=0',
    'actions/workflows/static-analysis.yml/runs?head_sha=' +
      'b'.repeat(40) + '&per_page=100&page=1',
  ])
    assert.equal(service.isServiceApiResource(resource, sha), false, resource);
  assert.equal(service.isServiceApiResource('actions/runs/1', ''), false);
});

test('plain metadata never supplies positive authenticated service proof', () => {
  for (const value of [undefined, null, {}, {
    schema: 'agijobsv0/codeql-final-service-evidence/1',
    repository: 'MontrealAI/AGIJobsv0',
    source: sha,
    tree: 'b'.repeat(40),
    languages: { javascript: {}, python: {} },
  }])
    assert.throws(() => service.assertFinalServices(value, { sha }),
      /Positive authenticated/);
});

test('raw binding refuses metadata without independent API observation', () => {
  assert.throws(
    () => service.verifyRawBinding({}, 'javascript', Buffer.from('synthetic')),
    /Positive authenticated/
  );
});

test('complete upload accepts null as an empty errors representation', async () => {
  const { syntheticServiceProof } =
    require('./source-codeql-service-fixture-rc16.cjs');
  const proof = await syntheticServiceProof({ uploadErrors: null });
  assert.doesNotThrow(() => service.assertFinalServices(proof, { sha }));
});

test('complete upload still rejects reported or malformed processing errors', async () => {
  const { syntheticServiceProof } =
    require('./source-codeql-service-fixture-rc16.cjs');
  for (const uploadErrors of [['synthetic processing error'], '', {}, false, 0])
    await assert.rejects(syntheticServiceProof({ uploadErrors }),
      /CodeQL SARIF upload processing has not completed successfully/);
});

// Every identity and response below is synthetic. These controls prove bounded
// admission behavior, not recovery of a genuine provider or release readiness.
function captureFixture({ list, detail, transport } = {}) {
  let phase = 0, clock = 0;
  const requests = [], waits = [], reports = [];
  const complete = () => ({
    id: 301, run_id: 101, run_attempt: 1, head_sha: sha,
    name: 'CodeQL analysis', status: 'in_progress', conclusion: null,
    steps: [{ name: 'Perform CodeQL analysis', status: 'completed', conclusion: 'success' }],
  });
  const api = async (method, resource) => {
    requests.push({ method, resource });
    assert.equal(method, 'GET');
    if (transport) transport(method, resource, phase);
    if (resource === 'actions/runs/101/attempts/1/jobs?per_page=100&page=1')
      return { total_count: 1, jobs: [list ? list(complete(), phase) : complete()] };
    if (resource === 'actions/jobs/301')
      return detail ? detail(complete(), phase) : complete();
    throw Error('Unexpected synthetic capture route');
  };
  return { requests, waits, reports, run: () => service.readCaptureJob(
    api, sha, 'javascript', 101, 1, {
      wait: async (milliseconds) => { waits.push(milliseconds); phase++; clock += milliseconds; },
      now: () => clock,
      report: (value) => reports.push(value),
    }
  ) };
}

test('capture waits for an incomplete list, then requires successful list and detail', async () => {
  const fixture = captureFixture({ list: (job, phase) =>
    phase === 0 ? { ...job, steps: [] } : job });
  const job = await fixture.run();
  assert.equal(job.id, 301);
  assert.deepEqual(fixture.waits, [1000]);
  assert.equal(fixture.requests.filter((item) => item.resource === 'actions/jobs/301').length, 1);
  assert.deepEqual(fixture.reports.map((value) => [value.method, value.step, value.jobId]),
    [['GET', 'absent', 301]]);
});

test('capture does not accept a complete list while detail remains pending', async () => {
  const fixture = captureFixture({ detail: (job, phase) => phase === 0
    ? { ...job, steps: [{ name: 'Perform CodeQL analysis', status: 'in_progress', conclusion: null }] }
    : job });
  await fixture.run();
  assert.deepEqual(fixture.waits, [1000]);
  assert.equal(fixture.requests.length, 4);
  assert.equal(fixture.reports[0].url,
    'https://api.github.com/repos/MontrealAI/AGIJobsv0/actions/jobs/301');
});

test('persistent empty projections exhaust their fixed budget without positive evidence', async () => {
  const fixture = captureFixture({ list: (job) => ({ ...job, steps: [] }) });
  await assert.rejects(fixture.run(), /remained incomplete within capture budget/);
  assert.equal(fixture.requests.length, 8);
  assert.equal(fixture.reports.length, 8);
  assert.deepEqual(fixture.waits, [1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  assert.equal(fixture.waits.reduce((sum, value) => sum + value, 0), 60000);
});

test('capture refuses terminal job/step states and malformed steps without retrying', async () => {
  const mutations = [
    (job) => ({ ...job, status: 'completed', conclusion: 'failure', steps: [] }),
    (job) => ({ ...job, steps: [{ name: 'Perform CodeQL analysis', status: 'completed', conclusion: 'failure' }] }),
    (job) => ({ ...job, steps: [{ name: 'Perform CodeQL analysis', status: 'completed', conclusion: 'cancelled' }] }),
    (job) => ({ ...job, steps: [{ name: 'Perform CodeQL analysis', status: 'completed', conclusion: 'skipped' }] }),
    (job) => ({ ...job, steps: [{ name: 'Install dependencies', status: 'completed', conclusion: 'failure' }] }),
    (job) => ({ ...job, steps: [{ name: 'Install dependencies', status: 'unrecognized', conclusion: null }] }),
    (job) => ({ ...job, steps: [null] }),
    (job) => ({ ...job, steps: [{ status: 'in_progress', conclusion: null }] }),
    (job) => ({ ...job, steps: [job.steps[0], job.steps[0]] }),
  ];
  for (const mutate of mutations) {
    const fixture = captureFixture({ list: mutate });
    await assert.rejects(fixture.run());
    assert.equal(fixture.requests.length, 1);
    assert.deepEqual(fixture.waits, []);
    assert.deepEqual(fixture.reports, []);
  }
});

test('capture pins the initial job ID and rejects identity drift without a second wait', async () => {
  for (const mutate of [
    (job) => ({ ...job, id: 302 }),
    (job) => ({ ...job, run_attempt: 2 }),
    (job) => ({ ...job, run_id: 102 }),
    (job) => ({ ...job, head_sha: 'b'.repeat(40) }),
    (job) => ({ ...job, name: 'Another job' }),
  ]) {
    const fixture = captureFixture({ list: (job, phase) =>
      phase === 0 ? { ...job, steps: [] } : mutate(job) });
    await assert.rejects(fixture.run());
    assert.deepEqual(fixture.waits, [1000]);
  }
});

test('capture does not retry transport failures or arbitrary API assertions', async () => {
  for (const failure of [Error('synthetic transport error'),
    new assert.AssertionError({ message: 'Pinned CodeQL analyze step did not succeed in the receipt producer' })]) {
    const fixture = captureFixture({ transport: () => { throw failure; } });
    await assert.rejects(fixture.run(), (error) => error === failure);
    assert.deepEqual(fixture.waits, []);
    assert.deepEqual(fixture.reports, []);
  }
});

test('capture also bounds elapsed network time and starts no request after its deadline', async () => {
  let clock = 0, requests = 0;
  const job = { id: 301, run_id: 101, run_attempt: 1, head_sha: sha,
    name: 'CodeQL analysis', status: 'in_progress', conclusion: null,
    steps: [{ name: 'Perform CodeQL analysis', status: 'completed', conclusion: 'success' }] };
  await assert.rejects(service.readCaptureJob(async (method, resource) => {
    assert.equal(method, 'GET'); requests++; clock += 121000;
    return resource.startsWith('actions/runs/') ? { total_count: 1, jobs: [job] } : job;
  }, sha, 'javascript', 101, 1, { now: () => clock }),
  /remained incomplete within capture budget/);
  assert.equal(requests, 1);
});
