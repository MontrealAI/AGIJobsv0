'use strict';

// Read-only evidence transport for the exact premerge review branch.
// This collector does not execute analyzed code or approve scanner findings.
// The original artifact is acquired once; logs retain exact ZIP and raw bytes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repository = 'MontrealAI/AGIJobsv0';
const repositoryId = 1031364470;
const branch = 'fix/processed-codeql-release-proof-20261020';
const ref = 'refs/heads/' + branch;
const apiRoot = 'https://api.github.com/repos/' + repository + '/';
const helperPath = 'scripts/release/emit-codeql-review-rc16.cjs';
const schema = 'agijobsv0/codeql-review-byte-log/1';
const prefix = 'AGIJOBS_CODEQL_REVIEW_V1 ';
const chunkBytes = 12288;
const maxZipBytes = 32 * 1024 * 1024;
const maxFileBytes = 32 * 1024 * 1024;
const maxTotalRawBytes = 64 * 1024 * 1024;
const reviewJobKey = 'codeql-review-bytes';
const policies = Object.freeze({
  javascript: Object.freeze({
    workflow: '.github/workflows/static-analysis.yml',
    producerJobKey: 'codeql',
    producerJobName: 'CodeQL analysis',
    uploadStepName: 'Upload CodeQL artefacts',
    reviewJobName: 'Complete JavaScript CodeQL review bytes',
    artifactPrefix: 'codeql-security-report-',
    rawFile: 'javascript.sarif',
  }),
  python: Object.freeze({
    workflow: '.github/workflows/static-analysis-python-integrations.yml',
    producerJobKey: 'codeql-python',
    producerJobName: 'Python integration CodeQL analysis',
    uploadStepName: 'Upload Python CodeQL artefacts',
    reviewJobName: 'Complete Python CodeQL review bytes',
    artifactPrefix: 'python-codeql-security-report-',
    rawFile: 'python.sarif',
  }),
});
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const identity = (value) => /^[a-f0-9]{40}$/.test(value || '');
const canonical = (value) =>
  value && typeof value === 'object'
    ? Array.isArray(value)
      ? '[' + value.map(canonical).join(',') + ']'
      : '{' + Object.keys(value).sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
        .join(',') + '}'
    : JSON.stringify(value);
function requireValue(condition) {
  assert(condition, 'CodeQL raw review evidence identity or custody refused');
}
function integer(value) {
  const result = Number(value);
  requireValue(positive(result) && String(result) === value);
  return result;
}
async function boundedResponse(response, limit) {
  requireValue(response.ok && response.body);
  const declared = response.headers.get('content-length');
  if (declared !== null)
    requireValue(/^[0-9]+$/.test(declared) && Number(declared) <= limit);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    requireValue(size <= limit);
    chunks.push(bytes);
  }
  requireValue(size > 0);
  return Buffer.concat(chunks, size);
}
function apiResource(resource, source, id, attempt, artifactId, workflow) {
  if (typeof resource !== 'string' || resource.length > 1024) return false;
  if ([
    'actions/runs/' + id,
    'actions/runs/' + id + '/attempts/' + attempt,
    'actions/artifacts/' + artifactId,
    'git/commits/' + source,
  ].includes(resource)) return true;
  return Array.from({ length: 20 }, (_, index) => index + 1).some((page) =>
    resource === 'actions/runs/' + id + '/attempts/' + attempt +
      '/jobs?per_page=100&page=' + page ||
    resource === 'actions/workflows/' + workflow.split('/').pop() +
      '/runs?head_sha=' + source + '&per_page=100&page=' + page
  );
}
async function pages(api, base, key) {
  const result = [], seen = new Set();
  let total;
  for (let page = 1; page <= 20; page++) {
    const separator = base.endsWith('?') ? '' : '&';
    const response = await api(base + separator + 'per_page=100&page=' + page);
    requireValue(Number.isSafeInteger(response?.total_count) &&
      response.total_count >= 0 && response.total_count <= 2000 &&
      (total === undefined || total === response.total_count) &&
      Array.isArray(response[key]) && response[key].length <= 100);
    total = response.total_count;
    for (const item of response[key]) {
      requireValue(positive(item?.id) && !seen.has(item.id));
      seen.add(item.id);
      result.push(item);
    }
    if (result.length === total) return result;
    requireValue(result.length < total && response[key].length === 100);
  }
  throw Error('CodeQL review metadata exceeds its page bound');
}
function projectRun(run, { source, id, attempt, policy }) {
  requireValue(
    run?.id === id && run.run_attempt === attempt &&
      positive(run.run_number) && run.head_sha === source &&
      run.head_branch === branch && run.event === 'push' &&
      run.path === policy.workflow &&
      run.repository?.full_name === repository &&
      run.repository.id === repositoryId &&
      run.head_repository?.full_name === repository &&
      run.head_repository.id === repositoryId &&
      run.status === 'in_progress' && run.conclusion === null
  );
  return {
    id, attempt, number: run.run_number, source, branch, event: 'push',
    workflow: policy.workflow, status: run.status, conclusion: run.conclusion,
  };
}
function projectArtifact(value, { source, id, attempt, artifactId, policy }) {
  const name = policy.artifactPrefix + source + '-' + id + '-' + attempt;
  requireValue(
    value?.id === artifactId && value.name === name &&
      value.expired === false && positive(value.size_in_bytes) &&
      value.size_in_bytes <= maxZipBytes &&
      /^sha256:[a-f0-9]{64}$/.test(value.digest || '') &&
      value.workflow_run?.id === id &&
      value.workflow_run.head_sha === source &&
      value.workflow_run.head_branch === branch
  );
  return {
    id: artifactId, name, bytes: value.size_in_bytes,
    githubDigest: value.digest, source, runId: id, headBranch: branch,
  };
}
function projectJobs(jobs, context) {
  const { source, id, attempt, policy } = context;
  const producer = jobs.filter((job) => job.name === policy.producerJobName);
  const collector = jobs.filter((job) => job.name === policy.reviewJobName);
  requireValue(producer.length === 1 && collector.length === 1);
  for (const job of [producer[0], collector[0]])
    requireValue(positive(job.id) && job.run_id === id &&
      job.head_sha === source &&
      (job.run_attempt === undefined || job.run_attempt === attempt));
  requireValue(producer[0].status === 'completed' &&
    producer[0].conclusion === 'success' &&
    collector[0].status === 'in_progress' && collector[0].conclusion === null &&
    Array.isArray(producer[0].steps));
  const uploaded = producer[0].steps.filter((step) =>
    step.name === policy.uploadStepName);
  requireValue(uploaded.length === 1 && uploaded[0].status === 'completed' &&
    uploaded[0].conclusion === 'success');
  return {
    producer: {
      id: producer[0].id, runId: id, attempt, source,
      key: policy.producerJobKey, name: producer[0].name,
      status: 'completed', conclusion: 'success', uploadStepId: 'codeql_raw',
    },
    collector: {
      id: collector[0].id, runId: id, attempt, source,
      key: reviewJobKey, name: collector[0].name,
      status: 'in_progress', conclusion: null,
    },
  };
}
async function observe(api, context) {
  const { source, id, attempt, artifactId, policy } = context;
  const [run, exact, artifact, jobs, runs] = await Promise.all([
    api('actions/runs/' + id),
    api('actions/runs/' + id + '/attempts/' + attempt),
    api('actions/artifacts/' + artifactId),
    pages(api, 'actions/runs/' + id + '/attempts/' + attempt +
      '/jobs?', 'jobs'),
    pages(api, 'actions/workflows/' + policy.workflow.split('/').pop() +
      '/runs?head_sha=' + source, 'workflow_runs'),
  ]);
  const current = projectRun(run, context);
  requireValue(canonical(projectRun(exact, context)) === canonical(current));
  const matching = runs.filter((item) => item.head_sha === source &&
    item.head_branch === branch && item.event === 'push' &&
    item.path === policy.workflow);
  requireValue(matching.length > 0 && matching.every((item) =>
    positive(item.run_number) && positive(item.run_attempt)));
  matching.sort((a, b) =>
    b.run_number - a.run_number || b.run_attempt - a.run_attempt);
  requireValue(canonical(projectRun(matching[0], context)) === canonical(current));
  return {
    run: current,
    artifact: projectArtifact(artifact, context),
    jobs: projectJobs(jobs, context),
  };
}
function git(...args) {
  return execFileSync('git', [
    '--no-replace-objects', '-c', 'core.fsmonitor=false', ...args,
  ], {
    encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...Object.fromEntries(Object.entries(process.env)
        .filter(([name]) => !name.startsWith('GIT_'))),
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0',
      GIT_NO_LAZY_FETCH: '1',
    },
  });
}
function sourceFiles(source, policy) {
  const result = {};
  for (const [key, filename] of [
    ['workflow', policy.workflow], ['collector', helperPath],
  ]) {
    const blob = git('rev-parse', source + ':' + filename).trim();
    const bytes = Buffer.from(git('show', source + ':' + filename));
    requireValue(identity(blob) && bytes.length > 0 &&
      hash(fs.readFileSync(filename)) === hash(bytes));
    result[key] = { path: filename, blob, sha256: hash(bytes) };
  }
  return result;
}
function rawFiles(zip, language) {
  const expected = [
    policies[language].rawFile, 'source-extraction.json',
    'source-scope-after.json', 'source-scope-before.json',
  ].sort();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agijobs-codeql-review-'));
  fs.chmodSync(directory, 0o700);
  const filename = path.join(directory, 'original.zip');
  let fd;
  try {
    fs.writeFileSync(filename, zip, { flag: 'wx', mode: 0o600 });
    fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    requireValue(fs.fstatSync(fd).isFile() && fs.fstatSync(fd).size === zip.length);
    fs.unlinkSync(filename);
    const unzip = (...args) => execFileSync('/usr/bin/unzip', args, {
      maxBuffer: maxFileBytes, timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe', fd],
    });
    const listing = unzip('-Z1', '/proc/self/fd/3');
    const text = listing.toString('utf8');
    requireValue(listing.length <= 1024 * 1024 &&
      Buffer.from(text).equals(listing));
    const names = text.split('\n').filter(Boolean).sort();
    requireValue(canonical(names) === canonical(expected));
    const result = [];
    let total = 0;
    for (const name of expected) {
      const bytes = unzip('-p', '/proc/self/fd/3', name);
      total += bytes.length;
      requireValue(bytes.length > 0 && bytes.length <= maxFileBytes &&
        total <= maxTotalRawBytes);
      result.push({ name, bytes });
    }
    const retained = Buffer.alloc(zip.length);
    let read = 0;
    while (read < retained.length) {
      const count = fs.readSync(fd, retained, read, retained.length - read, read);
      requireValue(count > 0);
      read += count;
    }
    requireValue(hash(retained) === hash(zip) &&
      fs.fstatSync(fd).size === zip.length);
    return result;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
function emit(value) {
  console.log(prefix + JSON.stringify({ schema, ...value }));
}
async function main() {
  const args = process.argv.slice(2), env = process.env;
  requireValue(args.length === 2 && args[0] === '--language' &&
    Object.hasOwn(policies, args[1]));
  const language = args[1], policy = policies[language];
  const source = env.GITHUB_SHA;
  const id = integer(env.GITHUB_RUN_ID), attempt = integer(env.GITHUB_RUN_ATTEMPT);
  const artifactId = integer(env.CODEQL_REVIEW_ARTIFACT_ID);
  requireValue(identity(source) && env.GITHUB_REPOSITORY === repository &&
    env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === ref &&
    env.GITHUB_REF_NAME === branch && env.GITHUB_JOB === reviewJobKey &&
    env.GITHUB_WORKFLOW_REF === repository + '/' + policy.workflow + '@' + ref &&
    typeof env.GH_TOKEN === 'string' && env.GH_TOKEN.length > 0);
  requireValue(git('rev-parse', 'HEAD').trim() === source);
  const tree = git('rev-parse', source + '^{tree}').trim();
  requireValue(identity(tree));
  const context = { source, id, attempt, artifactId, policy };
  const headers = {
    Authorization: 'Bearer ' + env.GH_TOKEN,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const api = async (resource) => {
    requireValue(apiResource(resource, source, id, attempt, artifactId, policy.workflow));
    const response = await fetch(apiRoot + resource, {
      method: 'GET', headers, redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    const bytes = await boundedResponse(response, 4 * 1024 * 1024);
    return JSON.parse(bytes.toString('utf8'));
  };
  const commit = await api('git/commits/' + source);
  requireValue(commit?.sha === source && commit.tree?.sha === tree);
  const sources = sourceFiles(source, policy);
  const before = await observe(api, context);
  let acquisitions = 0;
  const acquireOnce = async () => {
    requireValue(acquisitions === 0);
    acquisitions++;
    const response = await fetch(apiRoot + 'actions/artifacts/' + artifactId + '/zip', {
      method: 'GET', headers, redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });
    requireValue(response.status === 302);
    const location = new URL(response.headers.get('location'));
    requireValue(location.protocol === 'https:' && !location.username &&
      !location.password && !location.hash);
    // The credential is sent only to the authenticated GitHub API. The signed
    // transfer URL is neither logged nor supplied an Authorization header.
    const transfer = await fetch(location, {
      method: 'GET', redirect: 'error',
      signal: AbortSignal.timeout(120000),
    });
    return boundedResponse(transfer, maxZipBytes);
  };
  const zip = await acquireOnce();
  requireValue(zip.length === before.artifact.bytes &&
    'sha256:' + hash(zip) === before.artifact.githubDigest);
  const files = rawFiles(zip, language);
  const after = await observe(api, context);
  requireValue(canonical(after) === canonical(before) && acquisitions === 1);
  const streams = [{ name: 'original.zip', bytes: zip }, ...files];
  const manifest = {
    type: 'manifest', repository, language, source, tree, ref,
    workflow: policy.workflow, sourceFiles: sources,
    run: after.run, producerJob: after.jobs.producer,
    collectorJob: after.jobs.collector, artifact: after.artifact,
    acquisitionCount: acquisitions, chunkBytes,
    reviewStatus: 'UNAPPROVED_REQUIRES_FULL_REVIEW_AND_FINAL_PRODUCER_SUCCESS',
    streams: streams.map((stream) => ({
      name: stream.name, bytes: stream.bytes.length,
      sha256: hash(stream.bytes),
      chunks: Math.ceil(stream.bytes.length / chunkBytes),
    })),
  };
  const manifestSha256 = hash(Buffer.from(JSON.stringify({ schema, ...manifest })));
  emit(manifest);
  for (const stream of streams) {
    const total = Math.ceil(stream.bytes.length / chunkBytes);
    for (let index = 0; index < total; index++) {
      const bytes = stream.bytes.subarray(index * chunkBytes, (index + 1) * chunkBytes);
      emit({
        type: 'chunk', name: stream.name, index, total,
        bytes: bytes.length, base64: bytes.toString('base64'),
      });
    }
  }
  emit({
    type: 'complete', repository, language, source, tree, ref,
    manifestSha256, streamCount: streams.length,
    rawFileCount: files.length, acquisitionCount: acquisitions,
    reviewStatus: manifest.reviewStatus,
  });
}
if (require.main === module)
  main().catch(() => {
    console.error('CodeQL original review byte retention failed; no approval or qualification');
    process.exitCode = 1;
  });
