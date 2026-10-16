'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const {
  compilerSourceBaseline,
  evidenceBaseline,
  deployedSourceBaseline,
  preservedEvidencePaths,
  reviewedCompilerPaths,
} = require('./qualify-source-release.cjs');

function expectedAssets(tag) {
  return [
    'SHA256SUMS.txt',
    'provenance.json',
    `${tag}-source.zip`,
    'ethereum-mainnet-2026-10-12.json',
    'configuration-readback-2026-10-13.json',
    'mainnet-deployment-2026-10-12.md',
    'RELEASE_NOTES_SOURCE_RC9.md',
    'compiler-warnings-2026-10-13.md',
    'solidity-compiler.json',
    'deployment-addresses.mainnet.json',
    'compiler-evidence.zip',
    'compiler-provenance.json',
  ].sort();
}

function verifyDownloadedAssets({
  downloaded,
  directory,
  draft,
  sha,
  tree,
  tag,
  repository,
  compilerArtifact,
  compilerRun,
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
  for (const name of expected) {
    if (
      !draft &&
      [
        'provenance.json',
        'SHA256SUMS.txt',
        'compiler-evidence.zip',
        'compiler-provenance.json',
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
    provenance.producer?.workflow !== '.github/workflows/source-release.yml' ||
    provenance.sourceScope?.compilerSourceBaseline !== compilerSourceBaseline ||
    provenance.sourceScope?.evidenceBaseline !== evidenceBaseline ||
    provenance.sourceScope?.deployedSourceBaseline !== deployedSourceBaseline ||
    provenance.sourceScope?.compiler !== '0.8.37+commit.f401782d' ||
    JSON.stringify(provenance.sourceScope?.preservedEvidencePaths) !==
      JSON.stringify(preservedEvidencePaths) ||
    JSON.stringify(provenance.sourceScope?.reviewedCompilerPaths) !==
      JSON.stringify(reviewedCompilerPaths)
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
}

function validateCompilerArtifact(provenance, artifact) {
  const run = provenance.workflows?.find(
    (item) => item.path === '.github/workflows/contracts.yml'
  );
  if (
    !/^[a-f0-9]{40}$/.test(provenance.sha || '') ||
    !run ||
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1 ||
    run.conclusion !== 'success' ||
    run.head_sha !== provenance.sha ||
    !Number.isSafeInteger(artifact?.id) ||
    artifact.id < 1 ||
    artifact?.name !==
      `compiler-evidence-${provenance.sha}-${run.id}-${run.run_attempt}` ||
    artifact.expired !== false ||
    artifact.workflow_run?.id !== run.id ||
    artifact.workflow_run?.head_sha !== provenance.sha ||
    !/^sha256:[a-f0-9]{64}$/.test(artifact.digest || '')
  )
    throw Error(
      'Compiler artifact does not match the qualified exact-SHA producer'
    );
  return run;
}

function verifyCompilerArchive(files, read) {
  const index = JSON.parse(read('verification/index.json'));
  const report = JSON.parse(read('build.json'));
  const policy = require('../../config/solidity-compiler.json');
  if (
    index.schema !== 'agijobsv0/verification-inputs/1' ||
    index.compiler !== policy.longVersion ||
    report.compiler !== policy.longVersion ||
    report.projectSourceWarnings !== 0 ||
    report.sizeGatePassed !== true ||
    !Array.isArray(index.contracts) ||
    !index.contracts.length ||
    index.contracts.length !== report.contracts?.length
  )
    throw Error('Compiler archive policy or inventory mismatch');
  const entries = Object.entries(index.files || {});
  const expected = ['build.json', 'verification/index.json'];
  for (const [name, digest] of entries) {
    if (
      !/^[A-Za-z0-9_./@-]+$/.test(name) ||
      name.startsWith('/') ||
      name.split('/').includes('..') ||
      !/^[a-f0-9]{64}$/.test(digest)
    )
      throw Error('Malformed compiler archive checksum entry');
    const file = `verification/${name}`;
    expected.push(file);
    if (crypto.createHash('sha256').update(read(file)).digest('hex') !== digest)
      throw Error(`Compiler archive checksum mismatch: ${file}`);
  }
  if (JSON.stringify([...files].sort()) !== JSON.stringify(expected.sort()))
    throw Error('Compiler archive file inventory mismatch');
  for (const item of index.contracts) {
    for (const file of [item.artifact, item.buildInfo, item.standardInput])
      if (!Object.hasOwn(index.files, file))
        throw Error('Missing contract compiler evidence');
  }
  const identities = (items) =>
    items.map((item) => `${item.source}:${item.contract}`).sort();
  if (
    JSON.stringify(identities(index.contracts)) !==
    JSON.stringify(identities(report.contracts))
  )
    throw Error('Compiler report and archive contract identities differ');
  return { compiler: index.compiler, contracts: index.contracts.length };
}

function collectCompilerEvidence() {
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const directory = path.resolve('reports/source-release');
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

function assertTag(ref, sha) {
  if (ref?.object?.type !== 'commit' || ref.object.sha !== sha)
    throw Error('Release tag belongs to a different commit or object type');
}

async function publish({ sha, tag, notes, api, upload, verify }) {
  const marker = `<!-- agijobs-source-release:${sha} -->`;
  const refPath = `git/ref/tags/${tag}`;
  let ref = await api('GET', refPath, undefined, true);
  if (!ref) {
    const main = await api('GET', 'git/ref/heads/main');
    if (main?.object?.sha !== sha)
      throw Error('Main moved before tag reservation');
    ref = await api('POST', 'git/refs', { ref: `refs/tags/${tag}`, sha });
  }
  assertTag(ref, sha);
  let release = await api('GET', `releases/tags/${tag}`, undefined, true);
  if (!release) {
    release = await api('POST', 'releases', {
      tag_name: tag,
      target_commitish: sha,
      draft: true,
      prerelease: true,
      name: `${tag} — bounded Alpha interoperability and preserved deployment evidence`,
      body: `${notes.trim()}\n\n${marker}\n`,
    });
  }
  if (
    release.tag_name !== tag ||
    release.prerelease !== true ||
    !release.body?.includes(marker)
  )
    throw Error('Existing release is not the owned source snapshot');
  if (!release.draft) {
    await verify(false);
    assertTag(await api('GET', refPath), sha);
    return release;
  }
  await upload();
  await verify(true);
  assertTag(await api('GET', refPath), sha);
  // Once reserved, the tag defines the qualified snapshot. Same-SHA retries
  // remain valid if main advances; an existing tag is never moved or deleted.
  await api('PATCH', `releases/${release.id}`, {
    draft: false,
    prerelease: true,
    make_latest: 'false',
  });
  release = await api('GET', `releases/tags/${tag}`);
  if (
    release.draft ||
    release.tag_name !== tag ||
    !release.prerelease ||
    !release.body?.includes(marker)
  )
    throw Error(
      'Publication readback does not match the qualified source release'
    );
  assertTag(await api('GET', refPath), sha);
  return release;
}

async function main() {
  const {
    GITHUB_SHA: sha,
    GITHUB_REPOSITORY: repository,
    GH_TOKEN: token,
    TAG: tag,
  } = process.env;
  if (
    repository !== 'MontrealAI/AGIJobsv0' ||
    !/^[a-f0-9]{40}$/.test(sha || '') ||
    tag !== 'source-v2.1.0-rc.9' ||
    !token
  )
    throw Error('Invalid source publication identity or authorization');
  const cli = (...args) =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim();
  if (git('rev-parse', 'HEAD') !== sha)
    throw Error('Checkout identity mismatch');
  const tree = git('rev-parse', 'HEAD^{tree}');
  const directory = path.resolve('reports/source-release');
  const files = fs.readdirSync(directory).sort();
  const expected = expectedAssets(tag);
  if (JSON.stringify(files) !== JSON.stringify(expected))
    throw Error('Unexpected or missing source assets');
  const api = async (method, resource, body, optional = false) => {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/${resource}`,
      {
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
      }
    );
    if (optional && response.status === 404) return null;
    if (!response.ok)
      throw Error(`GitHub ${method} ${resource}: HTTP ${response.status}`);
    return response.json();
  };
  const verify = async (draft) => {
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
      for (const id of [
        compiler.artifactId,
        compiler.runId,
        compiler.runAttempt,
      ])
        if (!Number.isSafeInteger(id) || id < 1)
          throw Error('Malformed remote compiler producer identity');
      const [compilerArtifact, compilerRun] = await Promise.all([
        api('GET', `actions/artifacts/${compiler.artifactId}`),
        api(
          'GET',
          `actions/runs/${compiler.runId}/attempts/${compiler.runAttempt}`
        ),
      ]);
      verifyDownloadedAssets({
        downloaded,
        directory,
        draft,
        sha,
        tree,
        tag,
        repository,
        compilerArtifact,
        compilerRun,
      });
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
      'docs/production/RELEASE_NOTES_SOURCE_RC9.md',
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
  publish,
  assertTag,
  expectedAssets,
  verifyDownloadedAssets,
  validateCompilerArtifact,
  verifyCompilerArchive,
};
if (require.main === module)
  Promise.resolve()
    .then(() => {
      if (process.argv[2] === '--collect-compiler-evidence')
        return collectCompilerEvidence();
      if (process.argv.length !== 2)
        throw Error('Unknown source publication argument');
      return main();
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
