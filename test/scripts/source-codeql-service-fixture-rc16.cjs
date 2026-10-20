'use strict';

// TEST ONLY: every API response, ID, source string and upload below is synthetic.
// This fixture never contacts GitHub and is never published as scan evidence.
// It exercises the real observer without a test-only production trust bypass.
const { createHash } = require('node:crypto');
const service = require('../../scripts/release/source-codeql-service-rc16.cjs');
const repository = 'MontrealAI/AGIJobsv0';
const apiRoot = 'https://api.github.com/repos/' + repository + '/';
const helperPath = 'scripts/release/source-codeql-service-rc16.cjs';
const name = 'codeql-service-receipt.json';
const hash = (value) => createHash('sha256').update(value).digest('hex');
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++)
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}
function metadataZip(raw) {
  const filename = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc32(raw), 14);
  local.writeUInt32LE(raw.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc32(raw), 16);
  central.writeUInt32LE(raw.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + raw.length, 16);
  return Buffer.concat([local, filename, raw, central, filename, end]);
}
async function syntheticServiceProof({
  sha = 'a'.repeat(40), tree = 'c'.repeat(40),
  javascriptRaw = Buffer.from('synthetic raw metadata only'),
  pythonRaw = Buffer.from('synthetic raw metadata only'),
} = {}) {
  const source = Buffer.from('synthetic source metadata only\n');
  const blob = 'd'.repeat(40);
  const git = (command, selector) => {
    if (command === 'show') return source;
    if (command === 'rev-parse' && selector === sha + '^{tree}') return tree;
    if (command === 'rev-parse' && selector.startsWith(sha + ':')) return blob;
    throw Error('Unexpected synthetic Git metadata operation');
  };
  const responses = new Map();
  const archives = new Map();
  const runs = [];
  const definitions = [
    ['javascript', 101, 'codeql', 'CodeQL analysis', 'Perform CodeQL analysis',
      '.github/workflows/static-analysis.yml',
      '.github/codeql/config-integrations.yml',
      'reports/security/codeql/javascript.sarif', javascriptRaw],
    ['python', 102, 'codeql-python', 'Python integration CodeQL analysis',
      'Perform Python CodeQL analysis',
      '.github/workflows/static-analysis-python-integrations.yml',
      '.github/codeql/config-python-integrations.yml',
      'reports/security/codeql-python/python.sarif', pythonRaw],
  ];
  for (const [language, id, key, jobName, analyzeName, workflowPath,
    configPath, rawPath, rawSarif] of definitions) {
    const uploadId = language === 'javascript'
      ? '11111111-1111-1111-1111-111111111111'
      : '22222222-2222-2222-2222-222222222222';
    const run = {
      id, run_attempt: 1, run_number: 1, head_sha: sha,
      path: workflowPath, event: 'push', head_branch: 'main',
      status: 'completed', conclusion: 'success',
      repository: { full_name: repository, id: 1031364470 },
      head_repository: { full_name: repository, id: 1031364470 },
    };
    runs.push(run);
    const job = {
      id: id + 200, run_id: id, run_attempt: 1, head_sha: sha,
      name: jobName, status: 'completed', conclusion: 'success',
      steps: [{ name: analyzeName, status: 'completed', conclusion: 'success' }],
    };
    const projectedJob = {
      id: job.id, runId: id, runAttempt: 1,
      key, name: jobName, source: sha,
    };
    let rawTool = { name: 'CodeQL', version: 'synthetic-test-only', guid: null };
    try {
      const driver = JSON.parse(rawSarif.toString('utf8')).runs[0].tool.driver;
      rawTool = { name: driver.name, version: driver.semanticVersion,
        guid: driver.guid ?? null };
    } catch {
      // Plain synthetic metadata is sufficient for gate-only observer tests.
    }
    const analysis = {
      id: id + 300, commit_sha: sha, ref: 'refs/heads/main',
      sarif_id: uploadId, error: '', warning: '',
      url: apiRoot + 'code-scanning/analyses/' + (id + 300),
      results_count: 0, rules_count: 1,
      analysis_key: workflowPath + ':' + key,
      category: workflowPath + ':' + key + '/explicitly-synthetic/',
      environment: '{}', created_at: '2000-01-01T00:00:00Z',
      tool: rawTool,
    };
    const upload = {
      id: uploadId, processingStatus: 'complete',
      analysesUrl: apiRoot + 'code-scanning/analyses?sarif_id=' + uploadId,
    };
    const projectedAnalysis = {
      id: analysis.id, url: analysis.url, commitSha: sha, ref: analysis.ref,
      sarifId: uploadId, analysisKey: analysis.analysis_key,
      category: analysis.category, environment: analysis.environment,
      error: '', warning: '', resultsCount: 0, rulesCount: 1,
      createdAt: analysis.created_at, tool: analysis.tool,
    };
    const sourceFiles = {};
    for (const [label, file] of [
      ['workflow', workflowPath], ['config', configPath], ['helper', helperPath],
    ]) sourceFiles[label] = { path: file, blob, sha256: hash(source) };
    const receipt = {
      schema: 'agijobsv0/codeql-service-receipt/1', repository, language,
      source: sha, tree, event: 'push', ref: 'refs/heads/main',
      run: { id, attempt: 1, number: 1, workflowPath },
      job: projectedJob, sourceFiles,
      rawSarif: { path: rawPath, bytes: rawSarif.length, sha256: hash(rawSarif), tool: rawTool },
      upload, analysis: projectedAnalysis,
    };
    const zip = metadataZip(Buffer.from(JSON.stringify(receipt, null, 2) + '\n'));
    const artifact = {
      id: id + 100,
      name: 'codeql-service-receipt-' + language + '-' + sha + '-' + id + '-1',
      expired: false, size_in_bytes: zip.length, digest: 'sha256:' + hash(zip),
      workflow_run: { id, head_sha: sha, head_branch: 'main' },
    };
    archives.set(artifact.id, zip);
    responses.set('actions/workflows/' + workflowPath.split('/').pop() +
      '/runs?head_sha=' + sha + '&per_page=100&page=1',
      { total_count: 1, workflow_runs: [run] });
    responses.set('actions/runs/' + id, run);
    responses.set('actions/runs/' + id + '/attempts/1', run);
    responses.set('actions/runs/' + id + '/attempts/1/jobs?per_page=100&page=1',
      { total_count: 1, jobs: [job] });
    responses.set('actions/jobs/' + job.id, job);
    responses.set('actions/runs/' + id + '/artifacts?per_page=100&page=1',
      { total_count: 1, artifacts: [artifact] });
    responses.set('actions/artifacts/' + artifact.id, artifact);
    responses.set('code-scanning/sarifs/' + uploadId, {
      processing_status: 'complete', analyses_url: upload.analysesUrl, errors: [],
    });
    responses.set('code-scanning/analyses?sarif_id=' + uploadId +
      '&per_page=100&page=1', [analysis]);
    responses.set('code-scanning/analyses/' + analysis.id, analysis);
  }
  return service.observeFinalServices({
    sha, tree, runs, git,
    api: async (method, resource) => {
      assertSynthetic(method === 'GET' && responses.has(resource));
      return responses.get(resource);
    },
    download: async (id) => {
      assertSynthetic(archives.has(id));
      return archives.get(id);
    },
  });
}
function assertSynthetic(condition) {
  if (!condition) throw Error('Unexpected synthetic service metadata request');
}
module.exports = { syntheticServiceProof };
