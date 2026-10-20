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
