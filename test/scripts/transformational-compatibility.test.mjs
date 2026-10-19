import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import {
  NATIVE_FIXTURE_MAX_BYTES,
  readPinnedNativeFixture,
  resolvePinnedNativeRoot,
  validateNativeReport,
} from '../../scripts/release/verify-transformational-compatibility.mjs';
const require = createRequire(import.meta.url);
const { profile } = require('../../scripts/release/source-profile-rc16.cjs');
const jobsCommit = 'a'.repeat(40),
  jobsTree = 'b'.repeat(40);

function fixtureRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-native-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
  );
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Bounded fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Bounded fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  });
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '--no-replace-objects',
        '-c',
        'core.hooksPath=/dev/null',
        '-C',
        root,
        ...args,
      ],
      { encoding: 'utf8', env, maxBuffer: 1024 * 1024 }
    ).trim();
  git('init', '--quiet');
  const commit = (bytes) => {
    const file = path.join(
      root,
      'examples/transformational-intelligence/campaign.json'
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    git('add', '.');
    git('commit', '--quiet', '-m', 'Benign public fixture input');
    return git('rev-parse', 'HEAD');
  };
  return { root, git, commit };
}

test('native fixture intake returns the exact selected Git bytes independently of later revisions', (t) => {
  const repository = fixtureRepository(t);
  const selected = Buffer.from('{"public":"première version"}\n\n');
  const commit = repository.commit(selected);
  repository.commit('{"public":"later version"}\n');
  const bytes = readPinnedNativeFixture(repository.root, commit);
  assert(Buffer.isBuffer(bytes));
  assert.deepEqual(bytes, selected);
  assert.notEqual(commit, repository.git('rev-parse', 'HEAD'));
});

test('native fixture intake accepts the exact byte limit and refuses larger committed objects', (t) => {
  const repository = fixtureRepository(t);
  assert.equal(NATIVE_FIXTURE_MAX_BYTES, 2_000_000);
  const prefix = Buffer.from('{"public":"');
  const suffix = Buffer.from('"}\n');
  for (const length of [2_000_000, 2_000_001, 2_008_192]) {
    const bytes = Buffer.concat([
      prefix,
      Buffer.alloc(length - prefix.length - suffix.length, 'x'),
      suffix,
    ]);
    const commit = repository.commit(bytes);
    if (length === 2_000_000)
      assert.deepEqual(readPinnedNativeFixture(repository.root, commit), bytes);
    else
      assert.throws(
        () => readPinnedNativeFixture(repository.root, commit),
        /Native fixture exceeds intake bound/
      );
  }
});

test('native fixture intake requires an exact commit and an existing selected fixture', (t) => {
  const repository = fixtureRepository(t);
  fs.writeFileSync(path.join(repository.root, 'README.md'), 'Public fixture\n');
  repository.git('add', '.');
  repository.git('commit', '--quiet', '-m', 'No campaign fixture yet');
  const commit = repository.git('rev-parse', 'HEAD');
  assert.throws(() => readPinnedNativeFixture(repository.root, commit));
  for (const ref of ['HEAD', commit + '^', '0'.repeat(39), undefined])
    assert.throws(
      () => readPinnedNativeFixture(repository.root, ref),
      /exact Git commit/
    );
  assert.throws(
    () => readPinnedNativeFixture('.', commit),
    /absolute checkout/
  );
});

function fixture() {
  return {
    schema: 'agijobsv0/native-ti-compatibility/1',
    jobsCommit,
    jobsTree,
    alphaCommit: profile.nativeCompatibility.commit,
    alphaTree: profile.nativeCompatibility.tree,
    sources: structuredClone(profile.nativeCompatibility.files),
    currencyCaps: { AGIALPHABaseUnits: '0', USDCBaseUnits: '0' },
    nativeFreeInspection: true,
    positiveAGIALPHARefused: true,
    staleBindingsRefused: true,
    authorityExpansionRefused: true,
    credentialFieldsRefused: true,
    privateURLsRefused: true,
    sourceCheckedBeforeAndAfter: true,
    currencySpend: '0',
    chainOperations: 0,
    independentProof: false,
    executionAuthority: false,
  };
}
test('native imports retain the verified physical checkout when its configured alias changes', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-native-root-'));
  try {
    const reviewed = path.join(temporary, 'reviewed');
    const replacement = path.join(temporary, 'replacement');
    const alias = path.join(temporary, 'configured');
    fs.mkdirSync(reviewed);
    fs.mkdirSync(replacement);
    fs.writeFileSync(
      path.join(reviewed, 'inspector.mjs'),
      'export const approved = true;\n'
    );
    fs.writeFileSync(
      path.join(replacement, 'inspector.mjs'),
      'export const approved = false;\n'
    );
    const git = (...args) =>
      execFileSync('git', ['-C', reviewed, ...args], {
        encoding: 'utf8',
      }).trim();
    git('init', '--quiet');
    git('add', 'inspector.mjs');
    git(
      '-c',
      'user.name=Native fixture',
      '-c',
      'user.email=native@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'reviewed native fixture'
    );
    fs.symlinkSync(reviewed, alias, 'dir');
    const physical = resolvePinnedNativeRoot(alias, git('rev-parse', 'HEAD'));
    assert.equal(physical, fs.realpathSync(reviewed));
    fs.unlinkSync(alias);
    fs.symlinkSync(replacement, alias, 'dir');
    const actual = await import(
      pathToFileURL(path.join(physical, 'inspector.mjs')).href
    );
    assert.equal(actual.approved, true);
    assert.throws(() =>
      resolvePinnedNativeRoot(alias, git('rev-parse', 'HEAD'))
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
test('native archive must retain the complete pinned free-inspection and refusal result', () => {
  assert.deepEqual(
    validateNativeReport(fixture(), { jobsCommit, jobsTree }),
    fixture()
  );
  assert.throws(() => validateNativeReport(fixture()), /exact expected Jobs/);
  const absent = fixture();
  delete absent.jobsCommit;
  delete absent.jobsTree;
  assert.throws(() => validateNativeReport(absent), /exact expected Jobs/);
  for (const mutate of [
    (x) => {
      x.alphaCommit = '0'.repeat(40);
    },
    (x) => {
      x.jobsTree = '0'.repeat(40);
    },
    (x) => {
      delete x.sources['docs/assets/successor/engine.mjs'];
    },
    (x) => {
      x.sources['examples/transformational-intelligence/inspector.mjs'] =
        '0'.repeat(64);
    },
    (x) => {
      x.currencyCaps.AGIALPHABaseUnits = '1';
    },
    (x) => {
      x.currencyCaps.USDCBaseUnits = '1';
    },
    (x) => {
      x.currencySpend = '1';
    },
    (x) => {
      x.chainOperations = 1;
    },
    (x) => {
      x.executionAuthority = true;
    },
    (x) => {
      x.independentProof = true;
    },
    (x) => {
      x.sourceCheckedBeforeAndAfter = false;
    },
    (x) => {
      x.nativeFreeInspection = false;
    },
    (x) => {
      x.positiveAGIALPHARefused = false;
    },
    (x) => {
      delete x.staleBindingsRefused;
    },
    (x) => {
      delete x.credentialFieldsRefused;
    },
    (x) => {
      x.privateURLsRefused = false;
    },
    (x) => {
      x.authorityExpansionRefused = false;
    },
  ]) {
    const report = fixture();
    mutate(report);
    assert.throws(() => validateNativeReport(report, { jobsCommit, jobsTree }));
  }
});
test('CI selects the same exact native source and emits retained real-parser evidence', () => {
  const workflow = fs.readFileSync(
    new URL(
      '../../.github/workflows/transformational-compatibility.yml',
      import.meta.url
    ),
    'utf8'
  );
  assert(workflow.includes('ref: ' + profile.nativeCompatibility.commit));
  assert(
    workflow.includes(
      'node scripts/release/verify-transformational-compatibility.mjs'
    )
  );
  assert(
    workflow.includes(
      'native-ti-compatibility-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}'
    )
  );
  assert(workflow.includes('persist-credentials: false'));
  assert(
    !workflow.includes('continue-on-error') &&
      !workflow.includes('inspectWorkRequest:async')
  );
});
