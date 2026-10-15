const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const helios = path.join(root, 'demo/helios-omniversal-symphony/Makefile');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-launchers-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['npm', 'npx'])
    fs.writeFileSync(
      path.join(bin, name),
      '#!/bin/sh\nprintf "%s|%s\\n" "$PWD" "$*" >> "$COMMAND_LOG"\n',
      { mode: 0o755 }
    );
  return {
    dir,
    log: path.join(dir, 'commands'),
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      COMMAND_LOG: path.join(dir, 'commands'),
    },
  };
}

test('Helios governance runs every documented report from repository root when launched elsewhere', (t) => {
  const f = fixture(t);
  execFileSync(
    'make',
    [
      '-f',
      helios,
      'governance',
      'NETWORK=hardhat',
      `REPORT_ROOT=${f.dir}/reports`,
    ],
    { cwd: f.dir, env: f.env }
  );
  const lines = fs.readFileSync(f.log, 'utf8').trim().split('\n');
  assert.equal(lines.length, 5);
  for (const line of lines) assert.ok(line.startsWith(`${root}|`));
  for (const command of [
    'owner:mission-control',
    'owner:command-center',
    'owner:parameters',
    'owner:emergency',
    'thermodynamicsReport.ts',
  ])
    assert.equal(
      lines.filter((line) => line.includes(command)).length,
      1,
      command
    );
  for (const line of lines) assert.ok(line.includes('--network hardhat'));
});

test('Helios digest excludes itself and remains verifiable on repeat generation', (t) => {
  const f = fixture(t);
  const reports = path.join(f.dir, 'reports');
  fs.mkdirSync(reports);
  fs.writeFileSync(
    path.join(reports, 'result with spaces.json'),
    '{"local":true}\n'
  );
  let previous;
  for (let i = 0; i < 2; i++) {
    execFileSync(
      'make',
      ['-f', helios, '-o', 'kits', 'digest', `REPORT_ROOT=${reports}`],
      { cwd: f.dir, env: f.env }
    );
    const digest = fs.readFileSync(path.join(reports, 'SHA256SUMS'), 'utf8');
    assert.ok(!digest.includes('SHA256SUMS'));
    execFileSync('sha256sum', ['--check', 'SHA256SUMS'], { cwd: reports });
    if (previous) assert.equal(digest, previous);
    previous = digest;
  }
});

test('Cosmic launcher resolves repository root and forwards arguments without running a provider', (t) => {
  const f = fixture(t);
  execFileSync(
    'bash',
    [
      path.join(
        root,
        'demo/cosmic-omniversal-grand-symphony/bin/grand-symphony.sh'
      ),
      '--help',
    ],
    { cwd: f.dir, env: f.env }
  );
  assert.equal(
    fs.readFileSync(f.log, 'utf8').trim(),
    `${root}|run demo:agi-os:first-class -- --help`
  );
});

test('all tracked demo shell entrypoints parse without executing them', () => {
  const files = execFileSync('git', ['ls-files', '-z', '--', 'demo'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file.endsWith('.sh'));
  assert.ok(files.length >= 48);
  for (const file of files) execFileSync('bash', ['-n', path.join(root, file)]);
});

test('Phase 8 browser installer skips an existing browser and invokes installation only on cache miss', (t) => {
  const f = fixture(t);
  const installer = path.join(
    root,
    'demo/Phase-8-Universal-Value-Dominance/scripts/install_playwright_browsers.sh'
  );
  const node = path.join(f.dir, 'bin/node');
  for (const status of [0, 1]) {
    fs.writeFileSync(node, `#!/bin/sh\nexit ${status}\n`, { mode: 0o755 });
    execFileSync('bash', [installer], {
      cwd: f.dir,
      env: {
        ...f.env,
        PLAYWRIGHT_BROWSERS_PATH: path.join(f.dir, 'browser-cache'),
      },
    });
    if (status === 0) assert.ok(!fs.existsSync(f.log));
    else
      assert.equal(
        fs.readFileSync(f.log, 'utf8').trim(),
        `${f.dir}|playwright install --with-deps chromium`
      );
  }
});

test('Helios ignores ambient NETWORK but honors explicit make network selection', (t) => {
  const f = fixture(t);
  for (const args of [[], ['NETWORK=localhost']]) {
    const output = execFileSync(
      'make',
      ['-n', '-f', helios, 'governance', ...args],
      { cwd: f.dir, env: { ...f.env, NETWORK: 'mainnet' }, encoding: 'utf8' }
    );
    assert.ok(!output.includes('--network "mainnet"'));
    assert.equal(
      (
        output.match(
          new RegExp(
            `--network "${args.length ? 'localhost' : 'hardhat'}"`,
            'g'
          )
        ) || []
      ).length,
      5
    );
  }
});

test('Helios mission serializes cleanup before production even under make -j', (t) => {
  const f = fixture(t);
  const harness = path.join(f.dir, 'Makefile');
  const stages = ['clean', 'prep', 'plan', 'governance', 'kits', 'digest'];
  fs.writeFileSync(
    harness,
    `include ${helios}\n` +
      stages
        .map(
          (stage) =>
            `${stage}:\n\t@printf '${stage}:start\\n' >> '${f.log}'; sleep 0.02; printf '${stage}:end\\n' >> '${f.log}'\n`
        )
        .join('')
  );
  execFileSync('make', ['-s', '-j8', '-f', harness, 'mission'], {
    cwd: f.dir,
    env: f.env,
    stdio: 'pipe',
  });
  assert.deepEqual(
    fs.readFileSync(f.log, 'utf8').trim().split('\n'),
    stages.flatMap((stage) => [`${stage}:start`, `${stage}:end`])
  );
});

test('Helios cleanup only removes a named reports subtree and rejects linked or unsafe paths', (t) => {
  const { cleanupReportRoot } = require('../../scripts/demo/helios-clean.cjs');
  const f = fixture(t);
  const reports = path.join(f.dir, 'reports');
  fs.mkdirSync(reports);
  fs.writeFileSync(path.join(f.dir, 'keep'), 'untouched');
  for (const value of [
    '',
    ' ',
    '/',
    '.',
    'reports',
    '../outside',
    '/tmp',
    'reports/../../outside',
  ])
    assert.throws(
      () => cleanupReportRoot(f.dir, value),
      /REPORT_ROOT|Refusing/
    );
  const target = path.join(reports, 'mission with spaces');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'old'), 'old');
  assert.equal(cleanupReportRoot(f.dir, target), target);
  assert.ok(!fs.existsSync(target));
  const outside = path.join(f.dir, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'keep'), 'untouched');
  fs.symlinkSync(outside, path.join(reports, 'linked'));
  for (const value of ['reports/linked', 'reports/linked/child'])
    assert.throws(() => cleanupReportRoot(f.dir, value), /symbolic link/);
  assert.equal(
    fs.readFileSync(path.join(outside, 'keep'), 'utf8'),
    'untouched'
  );
  assert.equal(fs.readFileSync(path.join(f.dir, 'keep'), 'utf8'), 'untouched');
});
