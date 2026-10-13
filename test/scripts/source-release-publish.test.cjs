const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publish } = require('../../scripts/release/publish-source-release.cjs');
const sha = 'a'.repeat(40),
  tag = 'source-v2.1.0-rc.5';
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
