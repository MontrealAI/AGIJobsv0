'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const {
  assertTag,
  publish,
  producerId,
  validateCompilerArtifact,
  verifyCompilerArchive,
} = require('./publish-source-release.cjs');
const {
  assertPinnedAlphaCheckout,
} = require('../../integrations/alpha-agent/pinned-alpha-checkout.cjs');
const {
  profile,
  verifyPublicationReview,
} = require('./source-profile-rc16.cjs');
const {
  validateProducer,
  verifyScannerArchive,
  authenticCodeQL,
  readPages,
  canonical,
  sha256,
} = require('./qualify-source-release-rc16.cjs');
const {
  compilerSourceBaseline,
  evidenceBaseline,
  deployedSourceBaseline,
  preservedEvidencePaths,
  reviewedCompilerPaths,
  deploymentSnapshot,
  verifyDeploymentSnapshot,
} = require('./qualify-source-release-rc16.cjs');

const { verifyPythonScannerArchive } = require('./python-scanner-rc16.cjs');

function expectedAssets(tag) {
  return [
    'SHA256SUMS.txt',
    'provenance.json',
    `${tag}-source.zip`,
    'ethereum-mainnet-2026-10-12.json',
    deploymentSnapshot.asset,
    'configuration-readback-2026-10-13.json',
    'mainnet-deployment-2026-10-12.md',
    'mainnet-deployment-2026-10-18.md',
    'mainnet-deployment-receipts-2026-10-18.json',
    'RELEASE_NOTES_SOURCE_RC16.md',
    'compiler-warnings-2026-10-13.md',
    'solidity-compiler.json',
    'deployment-addresses.mainnet.json',
    'compiler-evidence.zip',
    'compiler-provenance.json',
    'codeql-evidence.zip',
    'codeql-provenance.json',
    'python-codeql-evidence.zip',
    'python-codeql-provenance.json',
    'native-compatibility.zip',
    'native-provenance.json',
    'source-profile-rc16.json',
  ].sort();
}

async function verifyDownloadedAssets({
  downloaded,
  directory,
  draft,
  sha,
  tree,
  tag,
  repository,
  compilerArtifact,
  compilerRun,
  scannerArtifact,
  scannerRun,
  pythonScannerArtifact,
  pythonScannerRun,
  nativeArtifact,
  nativeRun,
  codeqlChecks,
}) {
  const expected = expectedAssets(tag);
  const digest = (file) =>
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (
    JSON.stringify(fs.readdirSync(downloaded).sort()) !==
    JSON.stringify(expected)
  )
    throw Error('Remote asset inventory mismatch');
  const sums = fs
    .readFileSync(path.join(downloaded, 'SHA256SUMS.txt'), 'utf8')
    .trim()
    .split('\n');
  const seen = new Set();
  for (const line of sums) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    if (
      !match ||
      match[2] === 'SHA256SUMS.txt' ||
      !expected.includes(match[2]) ||
      seen.has(match[2])
    )
      throw Error('Malformed remote checksum inventory');
    seen.add(match[2]);
    if (digest(path.join(downloaded, match[2])) !== match[1])
      throw Error(`Remote checksum mismatch: ${match[2]}`);
  }
  if (seen.size !== expected.length - 1)
    throw Error('Incomplete remote checksums');
  verifyDeploymentSnapshot(
    fs.readFileSync(path.join(downloaded, deploymentSnapshot.asset))
  );
  for (const name of expected) {
    if (
      !draft &&
      [
        'provenance.json',
        'SHA256SUMS.txt',
        'compiler-evidence.zip',
        'compiler-provenance.json',
        'codeql-evidence.zip',
        'codeql-provenance.json',
        'python-codeql-evidence.zip',
        'python-codeql-provenance.json',
        'native-compatibility.zip',
        'native-provenance.json',
      ].includes(name)
    )
      continue;
    if (
      digest(path.join(downloaded, name)) !== digest(path.join(directory, name))
    )
      throw Error(`Producer/readback mismatch: ${name}`);
  }
  const provenance = JSON.parse(
    fs.readFileSync(path.join(downloaded, 'provenance.json'), 'utf8')
  );
  if (
    provenance.sha !== sha ||
    provenance.tree !== tree ||
    provenance.tag !== tag ||
    provenance.repository !== repository ||
    provenance.productionApproved !== false ||
    provenance.producer?.workflow !==
      '.github/workflows/source-release-rc16.yml' ||
    provenance.sourceScope?.compilerSourceBaseline !== compilerSourceBaseline ||
    provenance.sourceScope?.evidenceBaseline !== evidenceBaseline ||
    provenance.sourceScope?.deployedSourceBaseline !== deployedSourceBaseline ||
    provenance.sourceScope?.compiler !== '0.8.37+commit.f401782d' ||
    JSON.stringify(provenance.deploymentSnapshots) !==
      JSON.stringify([deploymentSnapshot]) ||
    JSON.stringify(provenance.sourceScope?.preservedEvidencePaths) !==
      JSON.stringify(preservedEvidencePaths) ||
    JSON.stringify(provenance.sourceScope?.reviewedCompilerPaths) !==
      JSON.stringify(reviewedCompilerPaths) ||
    provenance.sourceScope?.implementationBaseline !==
      profile.implementationBaseline ||
    provenance.sourceScope?.implementationTree !== profile.implementationTree ||
    canonical(provenance.sourceScope?.protectedTransitions) !==
      canonical(profile.transitions) ||
    provenance.sourceScope?.integrationBaseline !==
      profile.integrationBaseline ||
    provenance.sourceScope?.integrationTree !== profile.integrationTree ||
    canonical(provenance.sourceScope?.integrationTransitions) !==
      canonical(profile.integrationTransitions) ||
    provenance.sourceScope?.nativePinBaseline !== profile.nativePinBaseline ||
    provenance.sourceScope?.nativePinTree !== profile.nativePinTree ||
    canonical(provenance.sourceScope?.nativePinTransitions) !==
      canonical(profile.nativePinTransitions) ||
    provenance.sourceScope?.sourceConvergenceBaseline !==
      profile.sourceConvergenceBaseline ||
    provenance.sourceScope?.sourceConvergenceTree !==
      profile.sourceConvergenceTree ||
    canonical(provenance.sourceScope?.sourceConvergenceTransitions) !==
      canonical(profile.sourceConvergenceTransitions) ||
    provenance.sourceScope?.pythonScannerBaseline !==
      profile.pythonScannerBaseline ||
    provenance.sourceScope?.pythonScannerTree !== profile.pythonScannerTree ||
    canonical(provenance.sourceScope?.pythonScannerTransitions) !==
      canonical(profile.pythonScannerTransitions) ||
    provenance.sourceScope?.javascriptExtractorBaseline !==
      profile.javascriptExtractorBaseline ||
    provenance.sourceScope?.javascriptExtractorTree !==
      profile.javascriptExtractorTree ||
    canonical(provenance.sourceScope?.javascriptExtractorTransitions) !==
      canonical(profile.javascriptExtractorTransitions) ||
    canonical(provenance.sourceScope?.pythonScannerPolicy) !==
      canonical(profile.pythonScannerPolicy) ||
    canonical(provenance.sourceScope?.pythonScannerRequiredPaths) !==
      canonical(profile.pythonScannerRequiredPaths) ||
    canonical(provenance.sourceScope?.pythonScannerReview) !==
      canonical(profile.pythonScannerReview) ||
    canonical(provenance.sourceScope?.scannerPolicy) !==
      canonical(profile.scannerPolicy) ||
    canonical(provenance.sourceScope?.scannerRequiredPaths) !==
      canonical(profile.scannerRequiredPaths) ||
    canonical(provenance.sourceScope?.nativeCompatibility) !==
      canonical(profile.nativeCompatibility) ||
    canonical(provenance.sourceScope?.scannerReview) !==
      canonical(profile.scannerReview) ||
    canonical(
      JSON.parse(
        fs.readFileSync(path.join(downloaded, 'source-profile-rc16.json'))
      )
    ) !== canonical(profile)
  )
    throw Error('Remote provenance identity mismatch');
  const compiler = JSON.parse(
    fs.readFileSync(path.join(downloaded, 'compiler-provenance.json'))
  );
  const producer = provenance.workflows?.find(
    (item) => item.path === '.github/workflows/contracts.yml'
  );
  const zip = path.join(downloaded, 'compiler-evidence.zip');
  validateCompilerArtifact(provenance, compilerArtifact);
  if (
    compiler.schema !== 'agijobsv0/compiler-artifact-provenance/1' ||
    compiler.repository !== repository ||
    compiler.sha !== sha ||
    compiler.workflow !== producer?.path ||
    compiler.runId !== producer?.id ||
    compiler.runAttempt !== producer?.run_attempt ||
    compiler.artifactId !== compilerArtifact.id ||
    compiler.artifactName !== compilerArtifact.name ||
    compiler.githubDigest !== compilerArtifact.digest ||
    compiler.downloadedSha256 !== digest(zip) ||
    compiler.githubDigest !== `sha256:${digest(zip)}` ||
    compilerRun?.id !== producer?.id ||
    compilerRun?.run_attempt !== producer?.run_attempt ||
    compilerRun?.head_sha !== sha ||
    compilerRun?.path !== producer?.path ||
    compilerRun?.repository?.full_name !== repository ||
    compilerRun?.event !== 'push' ||
    compilerRun?.head_branch !== 'main' ||
    compilerRun?.status !== 'completed' ||
    compilerRun?.conclusion !== 'success'
  )
    throw Error('Remote compiler producer provenance mismatch');
  const files = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((name) => !name.endsWith('/'));
  const summary = verifyCompilerArchive(files, (name) =>
    execFileSync('unzip', ['-p', zip, name], {
      maxBuffer: 128 * 1024 * 1024,
    })
  );
  if (
    compiler.compiler !== summary.compiler ||
    compiler.contracts !== summary.contracts
  )
    throw Error('Remote compiler summary mismatch');
  const scanner = verifyRetainedProducer(
    downloaded,
    'codeql',
    scannerArtifact,
    scannerRun,
    sha,
    provenance
  );
  const scannerSummary = verifyScannerArchive(
    zipFiles(path.join(downloaded, 'codeql-evidence.zip')),
    (name) => zipRead(path.join(downloaded, 'codeql-evidence.zip'), name),
    {
      baseline: scannerBaseline(),
      sha,
      tree: provenance.tree,
      producerRun: scannerRun,
      git: gitSource,
    }
  );
  assert.equal(
    canonical(scanner.summary),
    canonical(scannerSummary),
    'Remote scanner summary mismatch'
  );
  assert(
    Array.isArray(codeqlChecks) &&
      codeqlChecks.some((check) => authenticCodeQL(check, sha)) &&
      codeqlChecks
        .filter((check) => authenticCodeQL(check, sha))
        .every(
          (check) =>
            check.status === 'completed' && check.conclusion === 'success'
        ),
    'Actual current CodeQL result is missing or failing'
  );
  const pythonScanner = verifyRetainedProducer(
    downloaded,
    'python-codeql',
    pythonScannerArtifact,
    pythonScannerRun,
    sha,
    provenance
  );
  const pythonZip = path.join(downloaded, 'python-codeql-evidence.zip');
  const pythonSummary = verifyPythonScannerArchive(
    zipFiles(pythonZip),
    (name) => zipRead(pythonZip, name),
    {
      sha,
      tree: provenance.tree,
      producerRun: pythonScannerRun,
      git: gitSource,
      artifact: pythonScannerArtifact,
      archiveSha256: digest(pythonZip),
    }
  );
  assert.equal(
    canonical(pythonScanner.summary),
    canonical(pythonSummary),
    'Remote Python scanner summary mismatch'
  );
  const native = verifyRetainedProducer(
    downloaded,
    'native',
    nativeArtifact,
    nativeRun,
    sha,
    provenance
  );
  const nativeZip = path.join(downloaded, 'native-compatibility.zip');
  assert.deepEqual(
    zipFiles(nativeZip),
    ['native-compatibility.json'],
    'Native archive inventory mismatch'
  );
  const { validateNativeReport } = await import(
    './verify-transformational-compatibility.mjs'
  );
  const nativeSummary = validateNativeReport(
    JSON.parse(zipRead(nativeZip, 'native-compatibility.json')),
    { jobsCommit: sha, jobsTree: tree }
  );
  assert.equal(
    canonical(native.summary),
    canonical(nativeSummary),
    'Remote native summary mismatch'
  );
}

const additional = Object.freeze({
  codeql: {
    workflow: '.github/workflows/static-analysis.yml',
    artifact: (sha, run) =>
      `codeql-security-report-${sha}-${run.id}-${run.run_attempt}`,
    file: 'codeql-evidence.zip',
  },
  'python-codeql': {
    workflow: '.github/workflows/static-analysis-python-integrations.yml',
    artifact: (sha, run) =>
      `python-codeql-security-report-${sha}-${run.id}-${run.run_attempt}`,
    file: 'python-codeql-evidence.zip',
  },
  native: {
    workflow: '.github/workflows/transformational-compatibility.yml',
    artifact: (sha, run) =>
      `native-ti-compatibility-${sha}-${run.id}-${run.run_attempt}`,
    file: 'native-compatibility.zip',
  },
});
const gitSource = (...args) =>
  execFileSync(
    'git',
    ['--no-replace-objects', '-c', 'core.fsmonitor=false', ...args],
    {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([name]) => !name.startsWith('GIT_')
          )
        ),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_OPTIONAL_LOCKS: '0',
      },
    }
  );
const zipFiles = (zip) =>
  execFileSync('unzip', ['-Z1', zip], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
    .trim()
    .split('\n')
    .filter((name) => !name.endsWith('/'))
    .sort();
const zipRead = (zip, name) =>
  execFileSync('unzip', ['-p', zip, name], { maxBuffer: 32 * 1024 * 1024 });
function scannerBaseline() {
  const file = path.resolve(
    'docs/security/remediation-2026-10-19/baseline/fresh-codeql.zip'
  );
  const ledger = JSON.parse(
    fs.readFileSync('docs/security/remediation-2026-10-19/findings.json')
  );
  assert.equal(
    sha256(fs.readFileSync(file)),
    ledger.baseline.fresh.sha256,
    'Historical scanner baseline bytes changed'
  );
  return JSON.parse(zipRead(file, 'javascript.sarif')).runs[0];
}
function verifyRetainedProducer(
  directory,
  kind,
  artifact,
  run,
  sha,
  provenance
) {
  const policy = additional[kind],
    record = JSON.parse(
      fs.readFileSync(path.join(directory, kind + '-provenance.json'))
    );
  assert(
    record.schema === 'agijobsv0/retained-producer/1' &&
      record.kind === kind &&
      record.repository === 'MontrealAI/AGIJobsv0' &&
      record.sha === sha,
    'Retained producer schema/source mismatch'
  );
  validateProducer({
    artifact,
    run,
    sha,
    workflow: policy.workflow,
    name: policy.artifact(sha, run),
  });
  const qualified = provenance?.workflows?.filter(
    (item) => item.path === policy.workflow
  );
  assert(
    qualified?.length === 1 &&
      qualified[0].id === run.id &&
      qualified[0].run_attempt === run.run_attempt &&
      qualified[0].head_sha === sha &&
      qualified[0].conclusion === 'success',
    'Retained producer differs from the qualified run/attempt'
  );
  const digest = sha256(fs.readFileSync(path.join(directory, policy.file)));
  assert(
    record.runId === run.id &&
      record.runAttempt === run.run_attempt &&
      record.workflow === run.path &&
      record.artifactId === artifact.id &&
      record.artifactName === artifact.name &&
      record.githubDigest === artifact.digest &&
      record.downloadedSha256 === digest &&
      artifact.digest === 'sha256:' + digest,
    'Retained producer provenance mismatch'
  );
  return record;
}

async function collectAdditionalEvidence() {
  const { GITHUB_SHA: sha, GITHUB_REPOSITORY: repository } = process.env;
  verifyPublicationReview(profile, { git: gitSource, target: sha });
  const directory = path.resolve('reports/source-release-rc16');
  const provenance = JSON.parse(
    fs.readFileSync(path.join(directory, 'provenance.json'))
  );
  assert(
    repository === 'MontrealAI/AGIJobsv0' &&
      provenance.sha === sha &&
      provenance.repository === repository &&
      provenance.tag === profile.tag,
    'Invalid retained evidence identity'
  );
  const cli = (...args) =>
    execFileSync('gh', args, { maxBuffer: 128 * 1024 * 1024 });
  for (const [kind, policy] of Object.entries(additional)) {
    const selected = provenance.workflows.filter(
      (run) => run.path === policy.workflow
    );
    assert.equal(
      selected.length,
      1,
      'Missing or ambiguous qualified evidence workflow'
    );
    const chosen = selected[0];
    const run = JSON.parse(
      cli(
        'api',
        `repos/${repository}/actions/runs/${producerId(
          chosen.id
        )}/attempts/${producerId(chosen.run_attempt)}`
      )
    );
    const inventory = JSON.parse(
      cli(
        'api',
        `repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`
      )
    );
    assert(
      inventory.total_count <= 100 && Array.isArray(inventory.artifacts),
      'Refusing truncated retained artifact inventory'
    );
    const artifacts = inventory.artifacts.filter(
      (item) => item.name === policy.artifact(sha, run)
    );
    assert.equal(artifacts.length, 1, 'Missing or ambiguous retained artifact');
    const artifact = artifacts[0];
    validateProducer({
      artifact,
      run,
      sha,
      workflow: policy.workflow,
      name: policy.artifact(sha, run),
    });
    const bytes = cli(
        'api',
        `repos/${repository}/actions/artifacts/${artifact.id}/zip`
      ),
      downloadedSha256 = sha256(bytes);
    assert.equal(
      artifact.digest,
      'sha256:' + downloadedSha256,
      'Downloaded retained artifact digest mismatch'
    );
    const zip = path.join(directory, policy.file);
    fs.writeFileSync(zip, bytes, { flag: 'wx' });
    let summary;
    if (kind === 'codeql')
      summary = verifyScannerArchive(
        zipFiles(zip),
        (name) => zipRead(zip, name),
        {
          baseline: scannerBaseline(),
          sha,
          tree: provenance.tree,
          producerRun: run,
          git: gitSource,
        }
      );
    else if (kind === 'python-codeql')
      summary = verifyPythonScannerArchive(
        zipFiles(zip),
        (name) => zipRead(zip, name),
        {
          sha,
          tree: provenance.tree,
          producerRun: run,
          git: gitSource,
          artifact,
          archiveSha256: downloadedSha256,
        }
      );
    else {
      assert.deepEqual(
        zipFiles(zip),
        ['native-compatibility.json'],
        'Native archive inventory mismatch'
      );
      const { validateNativeReport } = await import(
        './verify-transformational-compatibility.mjs'
      );
      summary = validateNativeReport(
        JSON.parse(zipRead(zip, 'native-compatibility.json')),
        { jobsCommit: sha, jobsTree: provenance.tree }
      );
    }
    fs.writeFileSync(
      path.join(directory, kind + '-provenance.json'),
      JSON.stringify(
        {
          schema: 'agijobsv0/retained-producer/1',
          kind,
          repository,
          sha,
          workflow: run.path,
          runId: run.id,
          runAttempt: run.run_attempt,
          artifactId: artifact.id,
          artifactName: artifact.name,
          githubDigest: artifact.digest,
          downloadedSha256,
          summary,
        },
        null,
        2
      ) + '\n',
      { flag: 'wx' }
    );
  }
  fs.copyFileSync(
    'scripts/release/source-profile-rc16.json',
    path.join(directory, 'source-profile-rc16.json'),
    fs.constants.COPYFILE_EXCL
  );
}

function collectCompilerEvidence() {
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const directory = path.resolve('reports/source-release-rc16');
  const provenance = JSON.parse(
    fs.readFileSync(path.join(directory, 'provenance.json'))
  );
  if (
    repository !== 'MontrealAI/AGIJobsv0' ||
    provenance.repository !== repository ||
    provenance.sha !== sha
  )
    throw Error('Invalid compiler evidence publication identity');
  const run = provenance.workflows.find(
    (item) => item.path === '.github/workflows/contracts.yml'
  );
  if (!run) throw Error('Missing qualified contracts workflow');
  const cli = (...args) =>
    execFileSync('gh', args, { maxBuffer: 128 * 1024 * 1024 });
  const response = JSON.parse(
    cli(
      'api',
      `repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`
    )
  );
  if (response.total_count > 100)
    throw Error('Refusing truncated compiler artifact inventory');
  const artifacts = response.artifacts.filter(
    (item) =>
      item.name === `compiler-evidence-${sha}-${run.id}-${run.run_attempt}`
  );
  if (artifacts.length !== 1)
    throw Error('Missing or ambiguous compiler evidence artifact');
  const artifact = artifacts[0];
  validateCompilerArtifact(provenance, artifact);
  const bytes = cli(
    'api',
    `repos/${repository}/actions/artifacts/${artifact.id}/zip`
  );
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (`sha256:${digest}` !== artifact.digest)
    throw Error('Downloaded compiler artifact digest mismatch');
  const zip = path.join(directory, 'compiler-evidence.zip');
  fs.writeFileSync(zip, bytes, { flag: 'wx' });
  const read = (name) =>
    execFileSync('unzip', ['-p', zip, name], { maxBuffer: 128 * 1024 * 1024 });
  const files = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((name) => !name.endsWith('/'));
  const summary = verifyCompilerArchive(files, read);
  fs.writeFileSync(
    path.join(directory, 'compiler-provenance.json'),
    JSON.stringify(
      {
        schema: 'agijobsv0/compiler-artifact-provenance/1',
        repository,
        sha,
        workflow: run.path,
        runId: run.id,
        runAttempt: run.run_attempt,
        artifactId: artifact.id,
        artifactName: artifact.name,
        githubDigest: artifact.digest,
        downloadedSha256: digest,
        ...summary,
      },
      null,
      2
    ) + '\n',
    { flag: 'wx' }
  );
}

function sourceApiUrl(method, resource) {
  const allowed = {
    GET: /^(?:git\/ref\/(?:heads\/main|tags\/source-v2\.1\.0-rc\.16)|releases\/tags\/source-v2\.1\.0-rc\.16|actions\/artifacts\/[1-9][0-9]*|actions\/runs\/[1-9][0-9]*\/attempts\/[1-9][0-9]*)$/,
    POST: /^(?:git\/refs|releases)$/,
    PATCH: /^releases\/[1-9][0-9]*$/,
  };
  if (
    typeof method !== 'string' ||
    typeof resource !== 'string' ||
    !Object.hasOwn(allowed, method) ||
    allowed[method].exec(resource)?.[0] !== resource
  )
    throw Error('Unsupported source publication API route');
  return `https://api.github.com/repos/MontrealAI/AGIJobsv0/${resource}`;
}

async function main() {
  const {
    GITHUB_SHA: sha,
    GITHUB_REPOSITORY: repository,
    GH_TOKEN: token,
    TAG: tag,
  } = process.env;
  verifyPublicationReview(profile, { git: gitSource, target: sha });
  if (
    repository !== 'MontrealAI/AGIJobsv0' ||
    !/^[a-f0-9]{40}$/.test(sha || '') ||
    tag !== 'source-v2.1.0-rc.16' ||
    !token
  )
    throw Error('Invalid source publication identity or authorization');
  const cli = (...args) =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  const git = (...args) => gitSource(...args).trim();
  if (git('rev-parse', 'HEAD') !== sha)
    throw Error('Checkout identity mismatch');
  const tree = git('rev-parse', 'HEAD^{tree}');
  assertPinnedAlphaCheckout(process.cwd(), sha);
  const directory = path.resolve('reports/source-release-rc16');
  const files = fs.readdirSync(directory).sort();
  const expected = expectedAssets(tag);
  if (JSON.stringify(files) !== JSON.stringify(expected))
    throw Error('Unexpected or missing source assets');
  const api = async (method, resource, body, optional = false) => {
    const response = await fetch(sourceApiUrl(method, resource), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (optional && response.status === 404) return null;
    if (!response.ok)
      throw Error(`GitHub ${method} ${resource}: HTTP ${response.status}`);
    return response.json();
  };
  const verify = async (draft) => {
    assertPinnedAlphaCheckout(process.cwd(), sha);
    const downloaded = fs.mkdtempSync(
      path.join(
        process.env.RUNNER_TEMP || os.tmpdir(),
        'source-release-readback-'
      )
    );
    try {
      cli('release', 'download', tag, '--dir', downloaded);
      const compiler = JSON.parse(
        fs.readFileSync(
          path.join(downloaded, 'compiler-provenance.json'),
          'utf8'
        )
      );
      const artifactId = producerId(compiler.artifactId);
      const runId = producerId(compiler.runId);
      const runAttempt = producerId(compiler.runAttempt);
      const scanner = JSON.parse(
        fs.readFileSync(path.join(downloaded, 'codeql-provenance.json'))
      );
      const native = JSON.parse(
        fs.readFileSync(path.join(downloaded, 'native-provenance.json'))
      );
      const pythonScanner = JSON.parse(
        fs.readFileSync(path.join(downloaded, 'python-codeql-provenance.json'))
      );
      const [
        compilerArtifact,
        compilerRun,
        scannerArtifact,
        scannerRun,
        pythonScannerArtifact,
        pythonScannerRun,
        nativeArtifact,
        nativeRun,
        codeqlChecks,
      ] = await Promise.all([
        api('GET', `actions/artifacts/${artifactId}`),
        api('GET', `actions/runs/${runId}/attempts/${runAttempt}`),
        api('GET', `actions/artifacts/${producerId(scanner.artifactId)}`),
        api(
          'GET',
          `actions/runs/${producerId(scanner.runId)}/attempts/${producerId(
            scanner.runAttempt
          )}`
        ),
        api('GET', `actions/artifacts/${producerId(pythonScanner.artifactId)}`),
        api(
          'GET',
          `actions/runs/${producerId(
            pythonScanner.runId
          )}/attempts/${producerId(pythonScanner.runAttempt)}`
        ),
        api('GET', `actions/artifacts/${producerId(native.artifactId)}`),
        api(
          'GET',
          `actions/runs/${producerId(native.runId)}/attempts/${producerId(
            native.runAttempt
          )}`
        ),
        readPages(
          `commits/${sha}/check-runs?filter=latest`,
          'check_runs',
          token
        ),
      ]);
      await verifyDownloadedAssets({
        downloaded,
        directory,
        draft,
        sha,
        tree,
        tag,
        repository,
        compilerArtifact,
        compilerRun,
        scannerArtifact,
        scannerRun,
        pythonScannerArtifact,
        pythonScannerRun,
        nativeArtifact,
        nativeRun,
        codeqlChecks,
      });
      assertPinnedAlphaCheckout(process.cwd(), sha);
    } finally {
      fs.rmSync(downloaded, { recursive: true, force: true });
    }
  };
  const release = await publish({
    sha,
    tag,
    api,
    verify,
    notes: fs.readFileSync(
      'docs/production/RELEASE_NOTES_SOURCE_RC16.md',
      'utf8'
    ),
    upload: async () =>
      cli(
        'release',
        'upload',
        tag,
        ...files.map((name) => path.join(directory, name)),
        '--clobber'
      ),
  });
  console.log(
    JSON.stringify({
      url: release.html_url,
      tag,
      sha,
      draft: release.draft,
      prerelease: release.prerelease,
      assetsVerified: true,
    })
  );
}

module.exports = {
  producerId,
  sourceApiUrl,
  publish,
  assertTag,
  expectedAssets,
  verifyDownloadedAssets,
  validateCompilerArtifact,
  verifyCompilerArchive,
  collectAdditionalEvidence,
  verifyRetainedProducer,
};
if (require.main === module)
  Promise.resolve()
    .then(() => {
      if (process.argv[2] === '--collect-compiler-evidence')
        return collectCompilerEvidence();
      if (process.argv[2] === '--collect-additional-evidence')
        return collectAdditionalEvidence();
      if (process.argv.length !== 2)
        throw Error('Unknown source publication argument');
      return main();
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
