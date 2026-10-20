'use strict';

// Separate service evidence complements, and never replaces, the original
// complete SARIF, query, result, extraction, source and native release gates.
// The upload ID comes only from the pinned analyze action's sarif-id output.
// REST analysis summaries do not establish equality with original raw SARIF.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { inflateRawSync } = require('node:zlib');

const repository = 'MontrealAI/AGIJobsv0';
const repositoryId = 1031364470;
const apiRoot = 'https://api.github.com/repos/' + repository + '/';
const helperPath = 'scripts/release/source-codeql-service-rc16.cjs';
const receiptName = 'codeql-service-receipt.json';
const receiptSchema = 'agijobsv0/codeql-service-receipt/1';
const bundleSchema = 'agijobsv0/codeql-final-service-evidence/1';
const maxZipBytes = 1024 * 1024;
const maxReceiptBytes = 256 * 1024;
const maxRawBytes = 32 * 1024 * 1024;
const observed = new WeakSet();
const policies = Object.freeze({
  javascript: Object.freeze({
    workflowPath: '.github/workflows/static-analysis.yml',
    configPath: '.github/codeql/config-integrations.yml',
    jobKey: 'codeql',
    jobName: 'CodeQL analysis',
    analyzeName: 'Perform CodeQL analysis',
    rawPath: 'reports/security/codeql/javascript.sarif',
  }),
  python: Object.freeze({
    workflowPath: '.github/workflows/static-analysis-python-integrations.yml',
    configPath: '.github/codeql/config-python-integrations.yml',
    jobKey: 'codeql-python',
    jobName: 'Python integration CodeQL analysis',
    analyzeName: 'Perform Python CodeQL analysis',
    rawPath: 'reports/security/codeql-python/python.sarif',
  }),
});
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const identity = (value) => /^[a-f0-9]{40}$/.test(value || '');
const digest = (value) => /^[a-f0-9]{64}$/.test(value || '');
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const canonical = (value) =>
  value && typeof value === 'object'
    ? Array.isArray(value)
      ? '[' + value.map(canonical).join(',') + ']'
      : '{' +
        Object.keys(value).sort().map(
          (key) => JSON.stringify(key) + ':' + canonical(value[key])
        ).join(',') +
        '}'
    : JSON.stringify(value);
function fields(value, names, message) {
  assert(value && typeof value === 'object' && !Array.isArray(value), message);
  assert.deepEqual(Object.keys(value).sort(), [...names].sort(), message);
}
function text(value, label, { empty = false, limit = 4096 } = {}) {
  assert(
    typeof value === 'string' &&
      (empty || value.length > 0) &&
      value.length <= limit &&
      !/[\0\r\n]/.test(value),
    'Invalid CodeQL service ' + label
  );
  return value;
}
function artifactName(language, sha, id, attempt) {
  return 'codeql-service-receipt-' + language + '-' + sha + '-' + id + '-' + attempt;
}
function sourceIdentity(git, sha, tree, language) {
  const policy = policies[language];
  assert(policy && typeof git === 'function' && identity(sha) && identity(tree),
    'Immutable CodeQL service source identity required');
  assert.equal(String(git('rev-parse', sha + '^{tree}')).trim(), tree,
    'CodeQL service tree differs from immutable Git source');
  const result = {};
  for (const [key, name] of [
    ['workflow', policy.workflowPath],
    ['config', policy.configPath],
    ['helper', helperPath],
  ]) {
    const blob = String(git('rev-parse', sha + ':' + name)).trim();
    const raw = Buffer.from(git('show', sha + ':' + name));
    assert(identity(blob) && raw.length > 0 && raw.length <= 2 * 1024 * 1024,
      'CodeQL service source blob is absent or unbounded');
    result[key] = { path: name, blob, sha256: sha256(raw) };
  }
  return result;
}
function isServiceApiResource(resource, finalSha) {
  if (typeof resource !== 'string' || !identity(finalSha)) return false;
  const number = '[1-9][0-9]*';
  const page = '(?:[1-9]|1[0-9]|20)';
  const upload = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  return [
    new RegExp('^actions/runs/' + number + '$'),
    new RegExp('^actions/runs/' + number + '/attempts/' + number + '$'),
    new RegExp('^actions/runs/' + number + '/attempts/' + number +
      '/jobs\\?per_page=100&page=' + page + '$'),
    new RegExp('^actions/jobs/' + number + '$'),
    new RegExp('^actions/artifacts/' + number + '$'),
    new RegExp('^actions/runs/' + number +
      '/artifacts\\?per_page=100&page=' + page + '$'),
    new RegExp('^code-scanning/sarifs/' + upload + '$'),
    new RegExp('^code-scanning/analyses\\?sarif_id=' + upload +
      '&per_page=100&page=' + page + '$'),
    new RegExp('^code-scanning/analyses/' + number + '$'),
  ].some((pattern) => pattern.test(resource)) ||
    Object.values(policies).some((policy) =>
      Array.from({ length: 20 }, (_, index) =>
        'actions/workflows/' + policy.workflowPath.split('/').pop() +
        '/runs?head_sha=' + finalSha + '&per_page=100&page=' + (index + 1)
      ).includes(resource)
    );
}
async function pages(api, prefix, key) {
  const values = [], seen = new Set();
  let total;
  for (let page = 1; page <= 20; page++) {
    const separator = prefix.endsWith('?') ? '' : '&';
    const response = await api(
      'GET', prefix + separator + 'per_page=100&page=' + page
    );
    assert(
      positive(response?.total_count) || response?.total_count === 0,
      'Malformed CodeQL service inventory count'
    );
    assert(
      response.total_count <= 2000 &&
        (total === undefined || total === response.total_count) &&
        Array.isArray(response[key]) && response[key].length <= 100,
      'Incomplete CodeQL service inventory'
    );
    total = response.total_count;
    for (const value of response[key]) {
      assert(positive(value?.id) && !seen.has(value.id),
        'Duplicate CodeQL service inventory identity');
      seen.add(value.id);
      values.push(value);
    }
    if (values.length === total) return values;
    assert(values.length < total && response[key].length === 100,
      'Truncated CodeQL service inventory');
  }
  throw Error('CodeQL service inventory exceeds its page bound');
}
function validRun(run, sha, policy, id, attempt, final) {
  assert(
    run?.id === id && run.run_attempt === attempt &&
      positive(run.run_number) && run.head_sha === sha &&
      run.path === policy.workflowPath && run.event === 'push' &&
      run.head_branch === 'main' &&
      run.repository?.full_name === repository &&
      run.repository.id === repositoryId &&
      run.head_repository?.full_name === repository &&
      run.head_repository.id === repositoryId &&
      (final
        ? run.status === 'completed' && run.conclusion === 'success'
        : run.status === 'in_progress' && run.conclusion === null),
    'CodeQL service producer is not the exact required main push'
  );
}
function projectJob(job, sha, policy, id, attempt, final) {
  assert(
    positive(job?.id) && job.run_id === id &&
      job.head_sha === sha && job.name === policy.jobName &&
      (job.run_attempt === undefined || job.run_attempt === attempt) &&
      (final
        ? job.status === 'completed' && job.conclusion === 'success'
        : job.status === 'in_progress' && job.conclusion === null) &&
      Array.isArray(job.steps),
    'CodeQL service job does not match its exact producer attempt'
  );
  const analyze = job.steps.filter((step) => step.name === policy.analyzeName);
  assert(analyze.length === 1 && analyze[0].status === 'completed' &&
    analyze[0].conclusion === 'success',
    'Pinned CodeQL analyze step did not succeed in the receipt producer');
  return {
    id: job.id, runId: id, runAttempt: attempt,
    key: policy.jobKey, name: policy.jobName, source: sha,
  };
}
async function readJob(api, sha, policy, id, attempt, final) {
  const jobs = await pages(
    api, 'actions/runs/' + id + '/attempts/' + attempt + '/jobs?', 'jobs'
  );
  const matches = jobs.filter((job) => job.name === policy.jobName);
  assert.equal(matches.length, 1, 'CodeQL service job is absent or ambiguous');
  const selected = projectJob(matches[0], sha, policy, id, attempt, final);
  const detail = await api('GET', 'actions/jobs/' + selected.id);
  assert.equal(canonical(projectJob(detail, sha, policy, id, attempt, final)),
    canonical(selected), 'CodeQL service job API observations differ');
  return selected;
}
function projectAnalysis(value, sha, uploadId, policy) {
  assert(
    positive(value?.id) && value.commit_sha === sha &&
      value.ref === 'refs/heads/main' && value.sarif_id === uploadId &&
      value.url === apiRoot + 'code-scanning/analyses/' + value.id &&
      value.error === '' && value.warning === '' &&
      value.analysis_key === policy.workflowPath + ':' + policy.jobKey &&
      typeof value.category === 'string' &&
      (value.category === value.analysis_key ||
        value.category.startsWith(value.analysis_key + '/')) &&
      Number.isSafeInteger(value.results_count) && value.results_count >= 0 &&
      positive(value.rules_count) && value.tool?.name === 'CodeQL',
    'CodeQL upload does not have a successful exact-main service analysis'
  );
  const tool = {
    name: value.tool.name,
    version: text(value.tool.version, 'tool version', { limit: 256 }),
    guid: value.tool.guid === null || value.tool.guid === undefined
      ? null : text(value.tool.guid, 'tool GUID', { limit: 256 }),
  };
  return {
    id: value.id, url: value.url, commitSha: sha, ref: value.ref,
    sarifId: uploadId,
    analysisKey: text(value.analysis_key, 'analysis key', { limit: 2048 }),
    category: text(value.category, 'category', { limit: 2048 }),
    environment: text(value.environment, 'environment', { empty: true }),
    error: '', warning: '',
    resultsCount: value.results_count, rulesCount: value.rules_count,
    createdAt: text(value.created_at, 'analysis creation time', { limit: 64 }),
    tool,
  };
}
async function readProcessedUpload(api, sha, uploadId, policy) {
  assert(uuid(uploadId), 'Pinned analyze SARIF upload ID is absent or invalid');
  const status = await api('GET', 'code-scanning/sarifs/' + uploadId);
  const analysesUrl = apiRoot + 'code-scanning/analyses?sarif_id=' + uploadId;
  assert(
    status?.processing_status === 'complete' &&
      status.analyses_url === analysesUrl &&
      (status.errors === undefined ||
        Array.isArray(status.errors) && status.errors.length === 0),
    'CodeQL SARIF upload processing has not completed successfully'
  );
  const values = [], seen = new Set();
  for (let page = 1; page <= 20; page++) {
    const response = await api('GET',
      'code-scanning/analyses?sarif_id=' + uploadId +
      '&per_page=100&page=' + page);
    assert(Array.isArray(response) && response.length <= 100,
      'Malformed CodeQL upload analysis inventory');
    for (const value of response) {
      assert(positive(value?.id) && !seen.has(value.id),
        'Duplicate CodeQL upload analysis identity');
      seen.add(value.id);
      values.push(projectAnalysis(value, sha, uploadId, policy));
    }
    if (response.length < 100) break;
    assert(page < 20, 'CodeQL upload analysis inventory exceeds its bound');
  }
  assert.equal(values.length, 1,
    'Single-language CodeQL upload must have exactly one processed analysis');
  const selected = values[0];
  const detail = await api('GET', 'code-scanning/analyses/' + selected.id);
  assert.equal(canonical(projectAnalysis(detail, sha, uploadId, policy)),
    canonical(selected), 'CodeQL service analysis observations differ');
  return {
    upload: { id: uploadId, processingStatus: 'complete', analysesUrl },
    analysis: selected,
  };
}
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++)
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}
function readReceiptZip(bytes) {
  assert(Buffer.isBuffer(bytes) && bytes.length >= 22 &&
    bytes.length <= maxZipBytes, 'Bounded original service receipt ZIP required');
  const end = bytes.length - 22;
  assert(
    bytes.readUInt32LE(end) === 0x06054b50 &&
      bytes.readUInt16LE(end + 4) === 0 &&
      bytes.readUInt16LE(end + 6) === 0 &&
      bytes.readUInt16LE(end + 8) === 1 &&
      bytes.readUInt16LE(end + 10) === 1 &&
      bytes.readUInt16LE(end + 20) === 0,
    'Service receipt ZIP must have one complete non-split record'
  );
  const centralSize = bytes.readUInt32LE(end + 12);
  const central = bytes.readUInt32LE(end + 16);
  assert(central > 0 && central + centralSize === end && centralSize >= 46,
    'Malformed service receipt ZIP central directory');
  assert.equal(bytes.readUInt32LE(central), 0x02014b50,
    'Malformed service receipt ZIP directory record');
  const flags = bytes.readUInt16LE(central + 8);
  const method = bytes.readUInt16LE(central + 10);
  const crc = bytes.readUInt32LE(central + 16);
  const compressed = bytes.readUInt32LE(central + 20);
  const length = bytes.readUInt32LE(central + 24);
  const nameLength = bytes.readUInt16LE(central + 28);
  const extraLength = bytes.readUInt16LE(central + 30);
  const commentLength = bytes.readUInt16LE(central + 32);
  const mode = bytes.readUInt32LE(central + 38) >>> 16;
  const local = bytes.readUInt32LE(central + 42);
  assert(
    (flags & ~0x080e) === 0 && [0, 8].includes(method) &&
      compressed > 0 && compressed <= maxZipBytes &&
      length > 0 && length <= maxReceiptBytes &&
      nameLength === Buffer.byteLength(receiptName) &&
      extraLength <= 2048 && commentLength === 0 && local === 0 &&
      [0, 0o100000].includes(mode & 0o170000) &&
      46 + nameLength + extraLength === centralSize &&
      bytes.subarray(central + 46, central + 46 + nameLength)
        .equals(Buffer.from(receiptName)) &&
      bytes.readUInt16LE(central + 34) === 0,
    'Service receipt ZIP inventory, method, mode or size differs'
  );
  assert(bytes.readUInt32LE(local) === 0x04034b50 &&
    bytes.readUInt16LE(local + 6) === flags &&
    bytes.readUInt16LE(local + 8) === method,
    'Service receipt ZIP local header differs');
  const localName = bytes.readUInt16LE(local + 26);
  const localExtra = bytes.readUInt16LE(local + 28);
  const start = local + 30 + localName + localExtra;
  assert(localName === nameLength && localExtra <= 2048 &&
    bytes.subarray(local + 30, local + 30 + localName)
      .equals(Buffer.from(receiptName)) &&
    start <= central && start + compressed <= central,
    'Service receipt ZIP local source differs');
  if (!(flags & 8)) {
    assert(bytes.readUInt32LE(local + 14) === crc &&
      bytes.readUInt32LE(local + 18) === compressed &&
      bytes.readUInt32LE(local + 22) === length &&
      start + compressed === central,
      'Service receipt ZIP local digest or length differs');
  } else {
    for (const [offset, expected] of [[14, crc], [18, compressed], [22, length]])
      assert([0, expected].includes(bytes.readUInt32LE(local + offset)),
        'Service receipt ZIP local descriptor identity differs');
    let descriptor = start + compressed;
    if (bytes.readUInt32LE(descriptor) === 0x08074b50) descriptor += 4;
    assert(descriptor + 12 === central &&
      bytes.readUInt32LE(descriptor) === crc &&
      bytes.readUInt32LE(descriptor + 4) === compressed &&
      bytes.readUInt32LE(descriptor + 8) === length,
      'Service receipt ZIP descriptor differs');
  }
  const packed = bytes.subarray(start, start + compressed);
  const raw = method === 0 ? Buffer.from(packed) :
    inflateRawSync(packed, { maxOutputLength: maxReceiptBytes });
  assert(raw.length === length && crc32(raw) === crc,
    'Service receipt ZIP decompressed bytes differ');
  const source = raw.toString('utf8');
  assert(Buffer.from(source).equals(raw),
    'Service receipt JSON is not exact UTF8');
  const value = JSON.parse(source);
  assert.equal(JSON.stringify(value, null, 2) + '\n', source,
    'Service receipt JSON serialization differs');
  return { value, raw };
}
function validateReceipt(receipt, {
  language, sha, tree, source, run, job, service,
}) {
  fields(receipt, [
    'schema', 'repository', 'language', 'source', 'tree', 'event', 'ref',
    'run', 'job', 'sourceFiles', 'rawSarif', 'upload', 'analysis',
  ], 'CodeQL service receipt fields differ');
  assert(
    receipt.schema === receiptSchema && receipt.repository === repository &&
      receipt.language === language && receipt.source === sha &&
      receipt.tree === tree && receipt.event === 'push' &&
      receipt.ref === 'refs/heads/main' &&
      canonical(receipt.sourceFiles) === canonical(source) &&
      canonical(receipt.run) === canonical({
        id: run.id, attempt: run.run_attempt, number: run.run_number,
        workflowPath: policies[language].workflowPath,
      }) &&
      canonical(receipt.job) === canonical(job) &&
      canonical(receipt.upload) === canonical(service.upload) &&
      canonical(receipt.analysis) === canonical(service.analysis),
    'CodeQL service receipt is not bound to the exact observed source and producer'
  );
  fields(receipt.rawSarif, ['path', 'bytes', 'sha256', 'tool'],
    'Original raw SARIF receipt fields differ');
  assert(receipt.rawSarif.path === policies[language].rawPath &&
    positive(receipt.rawSarif.bytes) && receipt.rawSarif.bytes <= maxRawBytes &&
    digest(receipt.rawSarif.sha256) &&
    canonical(receipt.rawSarif.tool) === canonical(service.analysis.tool),
    'Original raw SARIF digest binding is absent');
}
function projectArtifact(value, language, sha, run) {
  assert(
    positive(value?.id) && value.expired === false &&
      value.name === artifactName(language, sha, run.id, run.run_attempt) &&
      positive(value.size_in_bytes) && value.size_in_bytes <= maxZipBytes &&
      /^sha256:[a-f0-9]{64}$/.test(value.digest || '') &&
      value.workflow_run?.id === run.id &&
      value.workflow_run.head_sha === sha &&
      value.workflow_run.head_branch === 'main',
    'CodeQL service receipt artifact is not the exact current producer artifact'
  );
  return {
    id: value.id, name: value.name, bytes: value.size_in_bytes,
    githubDigest: value.digest, runId: run.id,
    source: sha, headBranch: 'main', expired: false,
  };
}
async function observeLanguage({
  api, download, git, sha, tree, runs, language, retained,
}) {
  const policy = policies[language];
  const source = sourceIdentity(git, sha, tree, language);
  const list = await pages(api,
    'actions/workflows/' + policy.workflowPath.split('/').pop() +
      '/runs?head_sha=' + sha, 'workflow_runs');
  const latest = list.filter((run) =>
    run.head_sha === sha && run.path === policy.workflowPath &&
      run.event === 'push' && run.head_branch === 'main'
  ).sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt);
  assert(latest.length > 0 && latest.every((run) =>
    positive(run.run_number) && positive(run.run_attempt)),
    'Exact-main CodeQL service producer is absent or malformed');
  const selected = latest[0];
  assert(positive(selected.id) && positive(selected.run_attempt),
    'CodeQL service producer identity is malformed');
  const [current, attempt] = await Promise.all([
    api('GET', 'actions/runs/' + selected.id),
    api('GET', 'actions/runs/' + selected.id + '/attempts/' + selected.run_attempt),
  ]);
  for (const run of [selected, current, attempt])
    validRun(run, sha, policy, selected.id, selected.run_attempt, true);
  assert(current.run_number === selected.run_number &&
    attempt.run_number === selected.run_number &&
    Array.isArray(runs) && runs.some((run) =>
      run.id === selected.id && run.path === policy.workflowPath &&
      run.head_sha === sha && run.run_attempt === selected.run_attempt &&
      run.conclusion === 'success'
    ), 'CodeQL service producer differs from qualified workflow inventory');
  const job = await readJob(api, sha, policy,
    current.id, current.run_attempt, true);
  const artifacts = await pages(api,
    'actions/runs/' + current.id + '/artifacts?', 'artifacts');
  const matches = artifacts.filter((artifact) =>
    artifact.name === artifactName(language, sha, current.id, current.run_attempt));
  assert.equal(matches.length, 1,
    'Exact CodeQL service receipt artifact is absent or ambiguous');
  const artifact = projectArtifact(matches[0], language, sha, current);
  const detail = await api('GET', 'actions/artifacts/' + artifact.id);
  assert.equal(canonical(projectArtifact(detail, language, sha, current)),
    canonical(artifact), 'CodeQL service artifact API observations differ');
  let zip;
  if (retained !== undefined) {
    fields(retained, ['language', 'source', 'tree', 'producer', 'job',
      'artifact', 'archive', 'receipt', 'upload', 'analysis'],
      'Retained CodeQL service evidence fields differ');
    assert(typeof retained.archive?.base64 === 'string' &&
      retained.archive.base64.length <= Math.ceil(maxZipBytes / 3) * 4,
      'Bounded retained service receipt ZIP required');
    zip = Buffer.from(retained.archive.base64, 'base64');
    assert.equal(zip.toString('base64'), retained.archive.base64,
      'Retained service receipt ZIP base64 differs');
  } else {
    assert.equal(typeof download, 'function',
      'First service receipt observation requires authenticated artifact acquisition');
    zip = await download(artifact.id);
  }
  assert(Buffer.isBuffer(zip) && zip.length === artifact.bytes &&
    'sha256:' + sha256(zip) === artifact.githubDigest,
    'Original service receipt ZIP differs from authenticated GitHub digest');
  const captured = readReceiptZip(zip);
  assert(uuid(captured.value.upload?.id),
    'Service receipt lacks the pinned analyze upload ID');
  const service = await readProcessedUpload(api, sha, captured.value.upload.id, policy);
  validateReceipt(captured.value, {
    language, sha, tree, source, run: current, job, service,
  });
  const [finalRun, finalAttempt, finalRuns, finalArtifacts, finalDetail] =
    await Promise.all([
      api('GET', 'actions/runs/' + current.id),
      api('GET', 'actions/runs/' + current.id + '/attempts/' + current.run_attempt),
      pages(api, 'actions/workflows/' + policy.workflowPath.split('/').pop() +
        '/runs?head_sha=' + sha, 'workflow_runs'),
      pages(api, 'actions/runs/' + current.id + '/artifacts?', 'artifacts'),
      api('GET', 'actions/artifacts/' + artifact.id),
    ]);
  for (const run of [finalRun, finalAttempt])
    validRun(run, sha, policy, current.id, current.run_attempt, true);
  const finalLatest = finalRuns.filter((run) =>
    run.head_sha === sha && run.path === policy.workflowPath &&
      run.event === 'push' && run.head_branch === 'main'
  ).sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt);
  const finalMatching = finalArtifacts.filter((item) => item.name === artifact.name);
  const finalJob = await readJob(
    api, sha, policy, current.id, current.run_attempt, true
  );
  assert(finalRun.run_number === current.run_number &&
    finalAttempt.run_number === current.run_number &&
    finalLatest.length > 0 && finalLatest.every((run) =>
      positive(run.run_number) && positive(run.run_attempt)) &&
    finalLatest[0].id === current.id &&
    finalLatest[0].run_attempt === current.run_attempt &&
    finalLatest[0].run_number === current.run_number &&
    finalMatching.length === 1 &&
    canonical(projectArtifact(finalMatching[0], language, sha, finalRun)) ===
      canonical(artifact) &&
    canonical(projectArtifact(finalDetail, language, sha, finalRun)) ===
      canonical(artifact) &&
    canonical(finalJob) === canonical(job),
    'CodeQL service producer or artifact changed during authenticated observation');
  const result = {
    language, source: sha, tree,
    producer: {
      runId: current.id, runAttempt: current.run_attempt,
      runNumber: current.run_number, event: 'push', headBranch: 'main',
      ref: 'refs/heads/main', workflowPath: policy.workflowPath,
      sourceFiles: source,
    },
    job, artifact,
    archive: {
      bytes: zip.length, sha256: sha256(zip), base64: zip.toString('base64'),
    },
    receipt: {
      bytes: captured.raw.length, sha256: sha256(captured.raw),
      rawSarif: captured.value.rawSarif,
    },
    upload: service.upload, analysis: service.analysis,
  };
  if (retained !== undefined)
    assert.equal(canonical(result), canonical(retained),
      'Retained CodeQL service evidence differs from authenticated reobservation');
  return result;
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
async function observeFinalServices({
  api, download, git, sha, tree, runs, retained,
}) {
  assert(typeof api === 'function' && identity(sha) && identity(tree),
    'Exact-main authenticated CodeQL service observer required');
  if (retained !== undefined) {
    fields(retained, ['schema', 'repository', 'source', 'tree', 'languages'],
      'Retained final CodeQL service bundle fields differ');
    fields(retained.languages, ['javascript', 'python'],
      'Both final CodeQL service languages are required');
    assert(retained.schema === bundleSchema && retained.repository === repository &&
      retained.source === sha && retained.tree === tree,
      'Retained final CodeQL service source differs');
  }
  const languages = {};
  for (const language of ['javascript', 'python'])
    languages[language] = await observeLanguage({
      api, download, git, sha, tree, runs, language,
      retained: retained?.languages[language],
    });
  const result = {
    schema: bundleSchema, repository, source: sha, tree, languages,
  };
  if (retained !== undefined)
    assert.equal(canonical(result), canonical(retained),
      'Retained final CodeQL service bundle changed');
  freeze(result);
  observed.add(result);
  return result;
}
function assertFinalServices(proof, { sha, tree } = {}) {
  assert(
    proof && observed.has(proof) && identity(sha) &&
      proof.schema === bundleSchema && proof.repository === repository &&
      proof.source === sha && (tree === undefined || proof.tree === tree) &&
      identity(proof.tree) &&
      Object.keys(proof.languages).sort().join(',') === 'javascript,python',
    'Positive authenticated exact-main JS and Python service proof required'
  );
  return proof;
}
function rawTool(raw) {
  const document = JSON.parse(raw.toString('utf8'));
  assert(Array.isArray(document.runs) && document.runs.length === 1 &&
    document.runs[0].tool?.driver?.name === 'CodeQL',
    'Original CodeQL raw tool identity required');
  const driver = document.runs[0].tool.driver;
  return {
    name: 'CodeQL',
    version: text(driver.semanticVersion, 'raw tool version', { limit: 256 }),
    guid: driver.guid === undefined || driver.guid === null
      ? null : text(driver.guid, 'raw tool GUID', { limit: 256 }),
  };
}
function verifyRawBinding(proof, language, raw) {
  assertFinalServices(proof, { sha: proof?.source, tree: proof?.tree });
  assert(Object.hasOwn(policies, language) && Buffer.isBuffer(raw) &&
    raw.length > 0 && raw.length <= maxRawBytes,
    'Original complete raw SARIF bytes required');
  const expected = proof.languages[language].receipt.rawSarif;
  assert(raw.length === expected.bytes && sha256(raw) === expected.sha256 &&
    expected.path === policies[language].rawPath &&
    canonical(rawTool(raw)) === canonical(expected.tool) &&
    canonical(expected.tool) === canonical(proof.languages[language].analysis.tool),
    'Original raw SARIF differs from its authenticated processed upload receipt');
  return true;
}
function gitCommand(...args) {
  return execFileSync('git', [
    '--no-replace-objects', '-c', 'core.fsmonitor=false', ...args,
  ], {
    encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    env: {
      ...Object.fromEntries(Object.entries(process.env)
        .filter(([name]) => !name.startsWith('GIT_'))),
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0',
      GIT_NO_LAZY_FETCH: '1',
    },
  });
}
async function capture(language, output) {
  const policy = policies[language];
  const env = process.env;
  const id = Number(env.GITHUB_RUN_ID);
  const attempt = Number(env.GITHUB_RUN_ATTEMPT);
  const sha = env.GITHUB_SHA;
  const expectedOutput = 'reports/security/codeql-service-' +
    language + '/' + receiptName;
  assert(policy && output === expectedOutput && identity(sha) &&
    positive(id) && positive(attempt) &&
    String(id) === env.GITHUB_RUN_ID &&
    String(attempt) === env.GITHUB_RUN_ATTEMPT &&
    env.GITHUB_REPOSITORY === repository &&
    env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main' &&
    env.GITHUB_JOB === policy.jobKey &&
    env.GITHUB_WORKFLOW_REF === repository + '/' +
      policy.workflowPath + '@refs/heads/main' &&
    typeof env.GH_TOKEN === 'string' && env.GH_TOKEN.length > 0 &&
    uuid(env.SARIF_UPLOAD_ID),
    'Invalid exact-main CodeQL service capture identity');
  assert.equal(gitCommand('rev-parse', 'HEAD').trim(), sha,
    'CodeQL service capture checkout source differs');
  const tree = gitCommand('rev-parse', sha + '^{tree}').trim();
  const source = sourceIdentity(gitCommand, sha, tree, language);
  for (const item of Object.values(source)) {
    const raw = fs.readFileSync(item.path);
    assert.equal(sha256(raw), item.sha256,
      'CodeQL service source changed before receipt capture');
  }
  const api = async (method, resource) => {
    assert(method === 'GET' && isServiceApiResource(resource, sha),
      'Unsupported CodeQL service capture API route');
    const response = await fetch(apiRoot + resource, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: 'Bearer ' + env.GH_TOKEN,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    assert(response.ok, 'Cannot authenticate CodeQL service capture metadata');
    const body = await response.text();
    assert(Buffer.byteLength(body) <= 2 * 1024 * 1024,
      'CodeQL service metadata response exceeds its bound');
    return JSON.parse(body);
  };
  const [current, currentAttempt] = await Promise.all([
    api('GET', 'actions/runs/' + id),
    api('GET', 'actions/runs/' + id + '/attempts/' + attempt),
  ]);
  for (const run of [current, currentAttempt])
    validRun(run, sha, policy, id, attempt, false);
  assert.equal(current.run_number, currentAttempt.run_number,
    'CodeQL service capture run observations differ');
  const job = await readJob(api, sha, policy, id, attempt, false);
  const service = await readProcessedUpload(api, sha, env.SARIF_UPLOAD_ID, policy);
  const raw = fs.readFileSync(policy.rawPath);
  assert(raw.length > 0 && raw.length <= maxRawBytes,
    'Bounded original raw SARIF is required for service capture');
  const tool = rawTool(raw);
  assert.equal(canonical(tool), canonical(service.analysis.tool),
    'Processed CodeQL service tool differs from original raw report');
  const value = {
    schema: receiptSchema, repository, language, source: sha, tree,
    event: 'push', ref: 'refs/heads/main',
    run: { id, attempt, number: current.run_number,
      workflowPath: policy.workflowPath },
    job, sourceFiles: source,
    rawSarif: { path: policy.rawPath, bytes: raw.length, sha256: sha256(raw), tool },
    upload: service.upload, analysis: service.analysis,
  };
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  assert(bytes.length <= maxReceiptBytes, 'CodeQL service receipt exceeds its bound');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const fd = fs.openSync(output,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
      fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); } finally { fs.closeSync(fd); }
}
async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 5 && args[0] === '--capture' &&
    args[1] === '--language' && Object.hasOwn(policies, args[2]) &&
    args[3] === '--output', 'Unsupported CodeQL service capture arguments');
  await capture(args[2], args[4]);
  console.log('Retained authenticated processed CodeQL service receipt');
}
module.exports = {
  observeFinalServices, assertFinalServices, verifyRawBinding,
  isServiceApiResource,
};
if (require.main === module)
  main().catch(() => {
    console.error('CodeQL processed service receipt capture failed; no qualification');
    process.exitCode = 1;
  });
