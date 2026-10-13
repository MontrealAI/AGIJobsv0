const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publish } = require('../../scripts/release/publish-source-release.cjs');
const sha = 'a'.repeat(40),
  tag = 'source-v2.1.0-rc.6';
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
        head_sha: sha,
        conclusion: 'success',
      },
    ],
  };
  const artifact = {
    id: 8,
    name: `compiler-evidence-${sha}`,
    expired: false,
    digest: `sha256:${'b'.repeat(64)}`,
    workflow_run: { id: 7, head_sha: sha },
  };
  assert.equal(validateCompilerArtifact(provenance, artifact).id, 7);
  for (const changed of [
    { ...artifact, expired: true },
    { ...artifact, name: 'other' },
    { ...artifact, digest: null },
    { ...artifact, workflow_run: { id: 9, head_sha: sha } },
    { ...artifact, workflow_run: { id: 7, head_sha: 'c'.repeat(40) } },
  ])
    assert.throws(
      () => validateCompilerArtifact(provenance, changed),
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
