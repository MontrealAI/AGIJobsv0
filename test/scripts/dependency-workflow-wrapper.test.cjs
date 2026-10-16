'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');
const workflow = yaml.load(
  fs.readFileSync(
    path.join(root, '.github/workflows/dependency-repair.yml'),
    'utf8'
  )
);
const step = workflow.jobs.compatibility.steps.find(
  (entry) =>
    entry.name === 'Run compatibility checks and retain every actual result'
).run;
const prefix = step.slice(0, step.indexOf('\nrun_check source-preservation'));

test('actual workflow wrapper preserves labels, statuses and later checks across nested calls', () => {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), 'jobs-preservation-wrapper-')
  );
  try {
    // Only external tools are replaced. The workflow's actual two shell functions
    // and their variable scopes execute together, including the extraction loop.
    const script = `${prefix}\n
      git() { if [ \"$2\" = show ]; then printf 'fixture policy bytes'; elif [ \"$2\" = remote ]; then printf 'https://github.com/MontrealAI/AGIJobsv0'; fi; }
      sha256sum() { cat >/dev/null; }
      node() { printf 'checker mode=%s\\n' "$2"; [ "$2" = source ]; }
      run_check source-preservation run_preservation source
      run_check generated-preservation run_preservation generated
      run_check after-failure printf '%s\\n' 'later check executed'
      printf '%s\\n' "$failed" > failed.txt
    `;
    const result = spawnSync('bash', ['-c', script], {
      cwd: temp,
      env: {
        PATH: process.env.PATH,
        SURFACE: 'fixture',
        RUNNER_TEMP: temp,
        GITHUB_WORKSPACE: temp,
        GITHUB_SHA: 'a'.repeat(40),
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const evidence = path.join(temp, 'reports/dependency-repair-fixture');
    assert.equal(
      fs.readFileSync(path.join(evidence, 'exits.txt'), 'utf8'),
      'source-preservation 0\ngenerated-preservation 1\nafter-failure 0\n'
    );
    assert.equal(
      fs.readFileSync(path.join(evidence, 'source-preservation.log'), 'utf8'),
      'checker mode=source\n'
    );
    assert.equal(
      fs.readFileSync(
        path.join(evidence, 'generated-preservation.log'),
        'utf8'
      ),
      'checker mode=generated\n'
    );
    assert.equal(
      fs.readFileSync(path.join(evidence, 'after-failure.log'), 'utf8'),
      'later check executed\n'
    );
    assert.equal(fs.readFileSync(path.join(temp, 'failed.txt'), 'utf8'), '1\n');
    assert(
      !fs.existsSync(path.join(evidence, 'unreleased-source-policy.json.log'))
    );
    assert(!result.stderr.includes('No such file'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('preservation has a direct shell call and keeps immutable policy and record pins', () => {
  assert.match(prefix, /run_preservation "\$@" > "\$evidence\/\$name\.log"/);
  assert.match(prefix, /local name="\$1"/);
  assert.match(prefix, /local bundle name/);
  assert.match(
    prefix,
    /git --no-replace-objects merge-base --is-ancestor "\$policy_commit" HEAD/
  );
  assert.match(prefix, /sha256sum --check --status \|\| return 1/);
});

test('actual wrapper fetches only a missing immutable event SHA and rejects untrusted inputs', () => {
  const { execFileSync } = require('node:child_process');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-event-object-'));
  const server = path.join(temp, 'server');
  const client = path.join(temp, 'client');
  const git = (cwd, ...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'Fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      },
    }).trim();
  try {
    fs.mkdirSync(server);
    fs.mkdirSync(client);
    git(server, 'init', '-q');
    fs.writeFileSync(path.join(server, 'source'), 'base');
    git(server, 'add', 'source');
    git(server, 'commit', '-qm', 'base');
    const base = git(server, 'rev-parse', 'HEAD');
    fs.writeFileSync(path.join(server, 'source'), 'head');
    git(server, 'commit', '-qam', 'head');
    const head = git(server, 'rev-parse', 'HEAD');
    const tree = git(server, 'rev-parse', 'HEAD^{tree}');
    const merge = git(
      server,
      'commit-tree',
      tree,
      '-p',
      base,
      '-p',
      head,
      '-m',
      'synthetic'
    );
    git(client, 'init', '-q');
    git(client, 'remote', 'add', 'origin', server);
    git(client, 'fetch', '-q', 'origin', head);
    git(client, 'checkout', '-q', '--detach', head);
    assert.notEqual(
      spawnSync('git', ['cat-file', '-e', `${merge}^{commit}`], { cwd: client })
        .status,
      0
    );
    const script = `${prefix}\n
      git() {
        if [ "$2" = remote ]; then printf '%s' "$TEST_ORIGIN";
        elif [ "$2" = show ]; then printf 'policy fixture bytes';
        elif [ "$2" = cat-file ] && [ "$4" != "$GITHUB_SHA^{commit}" ]; then return 0;
        elif [ "$2" = merge-base ]; then return 0;
        else command git "$@"; fi
      }
      sha256sum() { cat >/dev/null; }
      node() {
        [ "$(command git show -s --format=%P "$GITHUB_SHA")" = "$TEST_BASE $TEST_HEAD" ] &&
        [ "$(command git show -s --format=%T "$GITHUB_SHA")" = "$TEST_TREE" ]
      }
      run_preservation source
    `;
    const env = {
      PATH: process.env.PATH,
      SURFACE: 'fixture',
      RUNNER_TEMP: temp,
      GITHUB_WORKSPACE: client,
      GITHUB_SHA: merge,
      TEST_ORIGIN: 'https://github.com/MontrealAI/AGIJobsv0',
      TEST_BASE: base,
      TEST_HEAD: head,
      TEST_TREE: tree,
    };
    const run = (extra = {}) =>
      spawnSync('bash', ['-c', script], {
        cwd: client,
        env: { ...env, ...extra },
        encoding: 'utf8',
      });
    const passed = run();
    assert.equal(passed.status, 0, passed.stderr);
    assert.equal(
      git(client, 'show', '-s', '--format=%P', merge),
      `${base} ${head}`
    );
    assert.equal(git(client, 'rev-parse', 'HEAD'), head);
    assert.notEqual(
      run({ TEST_ORIGIN: 'https://example.invalid/wrong/repo' }).status,
      0
    );
    assert.notEqual(run({ GITHUB_SHA: 'refs/pull/3976/merge' }).status, 0);
    assert.notEqual(run({ TEST_HEAD: base }).status, 0);
    assert.notEqual(
      run({ TEST_TREE: git(server, 'rev-parse', `${base}^{tree}`) }).status,
      0
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
