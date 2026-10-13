const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
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
  tag = 'source-v2.1.0-rc.6';
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
  checksums(directory);
  for (const name of expectedAssets(tag))
    fs.copyFileSync(path.join(directory, name), path.join(downloaded, name));
  const verify = (draft = true) =>
    verifyDownloadedAssets({ directory, downloaded, draft, ...provenance });
  return { directory, downloaded, provenance, verify, checksums };
}
test('compiler and evidence assets must match the complete checksum inventory and producer', (t) => {
  const fixture = assetFixture(t);
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
test('workflow packages every declared immutable release asset', () => {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/source-release.yml'),
    'utf8'
  );
  for (const name of expectedAssets(tag)) {
    if (
      ['SHA256SUMS.txt', 'provenance.json', `${tag}-source.zip`].includes(name)
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
