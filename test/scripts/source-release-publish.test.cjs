const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const {
  publish,
  expectedAssets,
  verifyDownloadedAssets,
} = require('../../scripts/release/publish-source-release.cjs');
const {
  compilerSourceBaseline,
  evidenceBaseline,
  deployedSourceBaseline,
  preservedEvidencePaths,
  reviewedCompilerPaths,
} = require('../../scripts/release/qualify-source-release.cjs');
const sha = 'a'.repeat(40),
  tag = 'source-v2.1.0-rc.8';
function compilerArchiveFixture(contents = {}) {
  const compiler = require('../../config/solidity-compiler.json').longVersion;
  const payloads = {
    'artifact.json': JSON.stringify({ contractName: 'C', abi: [] }),
    'input.json': JSON.stringify({ language: 'Solidity', sources: {} }),
    'build-info.json': JSON.stringify({ solcLongVersion: compiler }),
    ...contents,
  };
  const contract = {
    contract: 'C',
    source: 'contracts/v2/C.sol',
    artifact: 'artifact.json',
    standardInput: 'input.json',
    buildInfo: 'build-info.json',
  };
  return {
    'verification/index.json': JSON.stringify({
      schema: 'agijobsv0/verification-inputs/1',
      compiler,
      contracts: [contract],
      files: Object.fromEntries(
        Object.entries(payloads).map(([name, bytes]) => [
          name,
          crypto.createHash('sha256').update(bytes).digest('hex'),
        ])
      ),
    }),
    'build.json': JSON.stringify({
      compiler,
      projectSourceWarnings: 0,
      sizeGatePassed: true,
      contracts: [contract],
    }),
    ...Object.fromEntries(
      Object.entries(payloads).map(([name, bytes]) => [
        `verification/${name}`,
        bytes,
      ])
    ),
  };
}
function assetFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'producer');
  const downloaded = path.join(root, 'downloaded');
  fs.mkdirSync(directory);
  fs.mkdirSync(downloaded);
  const provenance = {
    sha,
    tree: 'c'.repeat(40),
    tag,
    repository: 'MontrealAI/AGIJobsv0',
    productionApproved: false,
    producer: { workflow: '.github/workflows/source-release.yml' },
    workflows: [
      {
        path: '.github/workflows/contracts.yml',
        id: 7,
        run_attempt: 2,
        head_sha: sha,
        conclusion: 'success',
      },
    ],
    sourceScope: {
      compilerSourceBaseline,
      evidenceBaseline,
      deployedSourceBaseline,
      preservedEvidencePaths,
      reviewedCompilerPaths,
      compiler: '0.8.37+commit.f401782d',
    },
  };
  const checksums = (dir) =>
    fs.writeFileSync(
      path.join(dir, 'SHA256SUMS.txt'),
      expectedAssets(tag)
        .filter((name) => name !== 'SHA256SUMS.txt')
        .map(
          (name) =>
            `${crypto
              .createHash('sha256')
              .update(fs.readFileSync(path.join(dir, name)))
              .digest('hex')}  ${name}`
        )
        .join('\n') + '\n'
    );
  for (const name of expectedAssets(tag)) {
    if (name === 'SHA256SUMS.txt') continue;
    fs.writeFileSync(
      path.join(directory, name),
      name === 'provenance.json'
        ? JSON.stringify(provenance)
        : `fixture:${name}`
    );
  }
  const writeCompilerZip = (target, contents = compilerArchiveFixture()) => {
    const staging = fs.mkdtempSync(path.join(root, 'compiler-files-'));
    for (const [name, bytes] of Object.entries(contents)) {
      fs.mkdirSync(path.dirname(path.join(staging, name)), { recursive: true });
      fs.writeFileSync(path.join(staging, name), bytes);
    }
    fs.rmSync(target, { force: true });
    execFileSync('zip', ['-q', '-r', target, '.'], { cwd: staging });
    return crypto
      .createHash('sha256')
      .update(fs.readFileSync(target))
      .digest('hex');
  };
  const compilerDigest = writeCompilerZip(
    path.join(directory, 'compiler-evidence.zip')
  );
  const compilerArtifact = {
    id: 8,
    name: `compiler-evidence-${sha}-7-2`,
    expired: false,
    digest: `sha256:${compilerDigest}`,
    workflow_run: { id: 7, head_sha: sha },
  };
  const compilerRun = {
    id: 7,
    run_attempt: 2,
    path: '.github/workflows/contracts.yml',
    head_sha: sha,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    repository: { full_name: provenance.repository },
  };
  const compilerProvenance = {
    schema: 'agijobsv0/compiler-artifact-provenance/1',
    repository: provenance.repository,
    sha,
    workflow: compilerRun.path,
    runId: compilerRun.id,
    runAttempt: compilerRun.run_attempt,
    artifactId: compilerArtifact.id,
    artifactName: compilerArtifact.name,
    githubDigest: compilerArtifact.digest,
    downloadedSha256: compilerDigest,
    compiler: '0.8.37+commit.f401782d',
    contracts: 1,
  };
  fs.writeFileSync(
    path.join(directory, 'compiler-provenance.json'),
    JSON.stringify(compilerProvenance)
  );
  checksums(directory);
  for (const name of expectedAssets(tag))
    fs.copyFileSync(path.join(directory, name), path.join(downloaded, name));
  const verify = (draft = true, overrides = {}) =>
    verifyDownloadedAssets({
      directory,
      downloaded,
      draft,
      ...provenance,
      compilerArtifact,
      compilerRun,
      ...overrides,
    });
  return {
    directory,
    downloaded,
    provenance,
    verify,
    checksums,
    compilerArtifact,
    compilerRun,
    compilerProvenance,
    writeCompilerZip,
  };
}
test('compiler and evidence assets must match the complete checksum inventory and producer', (t) => {
  const fixture = assetFixture(t);
  assert.equal(expectedAssets(tag).length, 12);
  assert.equal(
    fs
      .readFileSync(path.join(fixture.downloaded, 'SHA256SUMS.txt'), 'utf8')
      .trim()
      .split('\n').length,
    11
  );
  fixture.verify();
  fs.appendFileSync(
    path.join(fixture.downloaded, 'solidity-compiler.json'),
    'altered'
  );
  assert.throws(() => fixture.verify(), /checksum mismatch/);
  fixture.checksums(fixture.downloaded);
  assert.throws(() => fixture.verify(), /Producer\/readback mismatch/);
  fs.unlinkSync(
    path.join(fixture.downloaded, 'compiler-warnings-2026-10-13.md')
  );
  assert.throws(() => fixture.verify(), /inventory mismatch/);
});
test('incomplete checksums, extra assets and changed published provenance fail closed', (t) => {
  const fixture = assetFixture(t);
  const sumsPath = path.join(fixture.downloaded, 'SHA256SUMS.txt');
  fs.writeFileSync(
    sumsPath,
    fs.readFileSync(sumsPath, 'utf8').split('\n').slice(1).join('\n')
  );
  assert.throws(() => fixture.verify(), /Incomplete remote checksums/);
  fixture.checksums(fixture.downloaded);
  fs.writeFileSync(path.join(fixture.downloaded, 'unexpected.txt'), 'extra');
  assert.throws(() => fixture.verify(), /inventory mismatch/);
  fs.unlinkSync(path.join(fixture.downloaded, 'unexpected.txt'));
  fixture.provenance.sourceScope.compilerSourceBaseline = 'd'.repeat(40);
  fs.writeFileSync(
    path.join(fixture.downloaded, 'provenance.json'),
    JSON.stringify(fixture.provenance)
  );
  fixture.checksums(fixture.downloaded);
  assert.throws(() => fixture.verify(false), /provenance identity mismatch/);
});
test('same-SHA published retries accept the original producer evidence without changing assets', (t) => {
  const fixture = assetFixture(t);
  fs.writeFileSync(
    path.join(fixture.directory, 'provenance.json'),
    JSON.stringify({ ...fixture.provenance, recordedAt: 'later retry' })
  );
  fixture.checksums(fixture.directory);
  assert.throws(() => fixture.verify(), /Producer\/readback mismatch/);
  fixture.verify(false);
});
test('published compiler provenance requires the authentic artifact and successful exact run attempt', (t) => {
  const fixture = assetFixture(t);
  fixture.verify(false);
  for (const changed of [
    { schema: 'untrusted/schema' },
    { artifactId: 9 },
    { runAttempt: 3 },
    { artifactName: `compiler-evidence-${sha}-7-1` },
  ]) {
    fs.writeFileSync(
      path.join(fixture.downloaded, 'compiler-provenance.json'),
      JSON.stringify({ ...fixture.compilerProvenance, ...changed })
    );
    fixture.checksums(fixture.downloaded);
    assert.throws(() => fixture.verify(false), /compiler producer provenance/);
  }
  fs.writeFileSync(
    path.join(fixture.downloaded, 'compiler-provenance.json'),
    JSON.stringify(fixture.compilerProvenance)
  );
  fixture.checksums(fixture.downloaded);
  for (const changed of [
    { run_attempt: 1 },
    { head_sha: 'b'.repeat(40) },
    { repository: { full_name: 'another/repository' } },
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
  ])
    assert.throws(
      () =>
        fixture.verify(false, {
          compilerRun: { ...fixture.compilerRun, ...changed },
        }),
      /compiler producer provenance/
    );
  assert.throws(
    () =>
      fixture.verify(false, {
        compilerArtifact: { ...fixture.compilerArtifact, id: 9 },
      }),
    /compiler producer provenance/
  );
  assert.throws(
    () => fixture.verify(false, { compilerArtifact: undefined }),
    /qualified exact-SHA producer/
  );
});
test('self-consistent replacement compiler ZIP and release checksums cannot replace GitHub producer bytes', (t) => {
  const fixture = assetFixture(t);
  const replacement = compilerArchiveFixture({
    'input.json': JSON.stringify({
      language: 'Solidity',
      sources: { forged: {} },
    }),
  });
  const {
    verifyCompilerArchive,
  } = require('../../scripts/release/publish-source-release.cjs');
  assert.doesNotThrow(() =>
    verifyCompilerArchive(Object.keys(replacement), (name) =>
      Buffer.from(replacement[name])
    )
  );
  const digest = fixture.writeCompilerZip(
    path.join(fixture.downloaded, 'compiler-evidence.zip'),
    replacement
  );
  fs.writeFileSync(
    path.join(fixture.downloaded, 'compiler-provenance.json'),
    JSON.stringify({
      ...fixture.compilerProvenance,
      downloadedSha256: digest,
      githubDigest: `sha256:${digest}`,
    })
  );
  fixture.checksums(fixture.downloaded);
  assert.throws(() => fixture.verify(false), /compiler producer provenance/);
});
test('producer archive readback checks its internal file checksums', (t) => {
  const fixture = assetFixture(t);
  const malformed = compilerArchiveFixture();
  malformed['verification/input.json'] = 'tampered after indexing';
  const digest = fixture.writeCompilerZip(
    path.join(fixture.downloaded, 'compiler-evidence.zip'),
    malformed
  );
  const githubDigest = `sha256:${digest}`;
  fs.writeFileSync(
    path.join(fixture.downloaded, 'compiler-provenance.json'),
    JSON.stringify({
      ...fixture.compilerProvenance,
      downloadedSha256: digest,
      githubDigest,
    })
  );
  fixture.checksums(fixture.downloaded);
  assert.throws(
    () =>
      fixture.verify(false, {
        compilerArtifact: { ...fixture.compilerArtifact, digest: githubDigest },
      }),
    /Compiler archive checksum mismatch/
  );
});
test('workflow packages every declared immutable release asset', () => {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/source-release.yml'),
    'utf8'
  );
  assert.ok(workflow.includes(`TAG: ${tag}`));
  assert.ok(workflow.includes('group: source-release-rc8-${{ github.ref }}'));
  assert.ok(workflow.includes('name: source-rc8-${{ github.sha }}'));
  assert.ok(expectedAssets(tag).includes('RELEASE_NOTES_SOURCE_RC8.md'));
  assert.ok(!expectedAssets(tag).includes('RELEASE_NOTES_SOURCE_RC7.md'));
  const notes = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../docs/production/RELEASE_NOTES_SOURCE_RC8.md'
    ),
    'utf8'
  );
  assert.ok(notes.startsWith(`# ${tag}`));
  assert.ok(
    fs.existsSync(
      path.resolve(
        __dirname,
        '../../docs/production/RELEASE_NOTES_SOURCE_RC7.md'
      )
    )
  );
  assert.ok(!workflow.includes('source-v2.1.0-rc.7'));
  for (const name of expectedAssets(tag)) {
    if (
      [
        'SHA256SUMS.txt',
        'provenance.json',
        `${tag}-source.zip`,
        'compiler-evidence.zip',
        'compiler-provenance.json',
      ].includes(name)
    )
      continue;
    assert.ok(
      workflow.includes(`${name} "$out/"`),
      `${name} missing from producer`
    );
  }
  assert.ok(
    workflow.includes('sha256sum -- *.json *.md *.zip > SHA256SUMS.txt')
  );
  assert.ok(
    workflow.includes(
      'node scripts/release/publish-source-release.cjs --collect-compiler-evidence'
    )
  );
});
function fixture() {
  const state = {
    main: sha,
    ref: null,
    release: null,
    uploads: 0,
    verifies: 0,
    mutations: 0,
    failAfter: 0,
  };
  const api = async (method, resource, body) => {
    if (method === 'GET') {
      if (resource === 'git/ref/heads/main')
        return { object: { sha: state.main } };
      if (resource.startsWith('git/ref/tags/')) return state.ref;
      if (resource.startsWith('releases/tags/')) return state.release;
    }
    state.mutations++;
    if (resource === 'git/refs')
      state.ref = { object: { type: 'commit', sha: body.sha } };
    else if (resource === 'releases') state.release = { id: 1, ...body };
    else if (method === 'PATCH') Object.assign(state.release, body);
    else throw Error('Unexpected API operation');
    if (state.failAfter === state.mutations)
      throw Error('Simulated interrupted response');
    return resource === 'git/refs' ? state.ref : state.release;
  };
  const run = (overrides = {}) =>
    publish({
      sha,
      tag,
      notes: 'Reviewed notes',
      api,
      upload: async () => {
        state.uploads++;
      },
      verify: async () => {
        state.verifies++;
      },
      ...overrides,
    });
  return { state, run };
}
test('fresh publication verifies assets before publishing; public retries do not mutate', async () => {
  const { state, run } = fixture();
  await run();
  assert.equal(state.release.draft, false);
  assert.equal(state.verifies, 1);
  const mutations = state.mutations,
    uploads = state.uploads;
  await run();
  assert.equal(state.mutations, mutations);
  assert.equal(state.uploads, uploads);
  assert.equal(state.verifies, 2);
});
test('interrupted tag, draft, publication responses and upload/download failures can resume at the same SHA', async () => {
  for (const failAfter of [1, 2, 3]) {
    const { state, run } = fixture();
    state.failAfter = failAfter;
    await assert.rejects(run(), /interrupted/);
    state.failAfter = 0;
    state.main = 'b'.repeat(40);
    await run();
    assert.equal(state.release.draft, false);
    assert.equal(state.ref.object.sha, sha);
  }
  for (const stage of ['upload', 'verify']) {
    const { state, run } = fixture();
    await assert.rejects(
      run({
        [stage]: async () => {
          throw Error('transfer interrupted');
        },
      }),
      /interrupted/
    );
    assert.equal(state.release.draft, true);
    await run();
    assert.equal(state.release.draft, false);
  }
});
test('different commits, unrelated releases and pre-reservation main movement fail without mutation', async () => {
  for (const setup of [
    (s) => (s.main = 'b'.repeat(40)),
    (s) => (s.ref = { object: { type: 'commit', sha: 'b'.repeat(40) } }),
    (s) => {
      s.ref = { object: { type: 'commit', sha } };
      s.release = {
        tag_name: tag,
        prerelease: true,
        draft: true,
        body: 'someone else',
      };
    },
  ]) {
    const { state, run } = fixture();
    setup(state);
    await assert.rejects(run());
    assert.equal(state.mutations, 0);
    assert.equal(state.uploads, 0);
  }
});
test('verification failure never publishes and public verification failure never edits assets', async () => {
  const { state, run } = fixture();
  await assert.rejects(
    run({
      verify: async () => {
        throw Error('checksum mismatch');
      },
    }),
    /checksum/
  );
  assert.equal(state.release.draft, true);
  await run();
  const mutations = state.mutations,
    uploads = state.uploads;
  await assert.rejects(
    run({
      verify: async () => {
        throw Error('checksum mismatch');
      },
    }),
    /checksum/
  );
  assert.equal(state.mutations, mutations);
  assert.equal(state.uploads, uploads);
});

test('compiler evidence rejects another head, producer, name, expiration or missing digest', () => {
  const {
    validateCompilerArtifact,
  } = require('../../scripts/release/publish-source-release.cjs');
  const provenance = {
    sha,
    workflows: [
      {
        path: '.github/workflows/contracts.yml',
        id: 7,
        run_attempt: 2,
        head_sha: sha,
        conclusion: 'success',
      },
    ],
  };
  const artifact = {
    id: 8,
    name: `compiler-evidence-${sha}-7-2`,
    expired: false,
    digest: `sha256:${'b'.repeat(64)}`,
    workflow_run: { id: 7, head_sha: sha },
  };
  assert.equal(validateCompilerArtifact(provenance, artifact).id, 7);
  for (const changed of [
    { ...artifact, expired: true },
    { ...artifact, name: 'other' },
    { ...artifact, digest: null },
    { ...artifact, id: 0 },
    { ...artifact, id: 1.5 },
    { ...artifact, name: `compiler-evidence-${sha}-7-1` },
    { ...artifact, workflow_run: { id: 9, head_sha: sha } },
    { ...artifact, workflow_run: { id: 7, head_sha: 'c'.repeat(40) } },
  ])
    assert.throws(
      () => validateCompilerArtifact(provenance, changed),
      /producer/
    );
  for (const changed of [
    { id: 0 },
    { run_attempt: 0 },
    { run_attempt: undefined },
  ])
    assert.throws(
      () =>
        validateCompilerArtifact(
          {
            ...provenance,
            workflows: [{ ...provenance.workflows[0], ...changed }],
          },
          artifact
        ),
      /producer/
    );
});

test('compiler archive rejects tampered bytes, omitted files and mismatched inventories', () => {
  const {
    verifyCompilerArchive,
  } = require('../../scripts/release/publish-source-release.cjs');
  const { createHash } = require('node:crypto');
  const compiler = require('../../config/solidity-compiler.json').longVersion;
  const contents = {
    'artifact.json': '{}',
    'input.json': '{"language":"Solidity"}',
    'build-info.json': '{}',
  };
  const contract = {
    contract: 'C',
    source: 'contracts/v2/C.sol',
    artifact: 'artifact.json',
    standardInput: 'input.json',
    buildInfo: 'build-info.json',
  };
  const index = {
    schema: 'agijobsv0/verification-inputs/1',
    compiler,
    contracts: [contract],
    files: Object.fromEntries(
      Object.entries(contents).map(([name, bytes]) => [
        name,
        createHash('sha256').update(bytes).digest('hex'),
      ])
    ),
  };
  const report = {
    compiler,
    projectSourceWarnings: 0,
    sizeGatePassed: true,
    contracts: [contract],
  };
  const archive = {
    'verification/index.json': JSON.stringify(index),
    'build.json': JSON.stringify(report),
    ...Object.fromEntries(
      Object.entries(contents).map(([name, bytes]) => [
        'verification/' + name,
        bytes,
      ])
    ),
  };
  const inspect = (files = archive) =>
    verifyCompilerArchive(Object.keys(files), (name) =>
      Buffer.from(files[name])
    );
  assert.deepEqual(inspect(), { compiler, contracts: 1 });
  assert.throws(
    () => inspect({ ...archive, 'verification/input.json': 'changed' }),
    /checksum/
  );
  assert.throws(() => inspect({ ...archive, extra: '{}' }), /inventory/);
  assert.throws(
    () =>
      inspect({
        ...archive,
        'build.json': JSON.stringify({ ...report, projectSourceWarnings: 1 }),
      }),
    /policy/
  );
  assert.throws(
    () =>
      inspect({
        ...archive,
        'build.json': JSON.stringify({
          ...report,
          contracts: [{ ...contract, contract: 'Other' }],
        }),
      }),
    /identities/
  );
});
