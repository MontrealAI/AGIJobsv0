const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const {
  parseOptions,
  validateInputs,
  readinessFailures,
  dashboardArtifacts,
} = require('../scripts/runtime.cjs');
const { createServer } = require('../scripts/serve-dashboard.cjs');
const root = path.resolve(__dirname, '..');
const read = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const inputs = () => ({
  manifest: read('config/kardashev-ii.manifest.json'),
  energy: read('config/energy-feeds.json'),
  fabric: read('config/fabric.json'),
  lattice: read('config/task-lattice.json'),
});
const run = (args) =>
  spawnSync(
    process.execPath,
    [
      require.resolve('ts-node/dist/bin.js'),
      '--compiler-options',
      '{"module":"commonjs"}',
      path.join(root, 'scripts/run-kardashev-demo.ts'),
      ...args,
    ],
    { encoding: 'utf8', timeout: 60000 }
  );
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kardashev-test-'));

test('portable decks carry shared computer-work assets and valid documentation targets without touching source', () => {
  const output = path.join(os.tmpdir(), 'k2-portable-contract');
  for (const profile of [
    '',
    'stellar-civilization-lattice',
    'k2-stellar-demo',
  ]) {
    const assets = dashboardArtifacts(path.join(root, profile), output);
    assert.ok(
      assets.every((asset) => asset.path.startsWith(output + path.sep))
    );
    const files = new Map(
      assets.map((asset) => [path.relative(output, asset.path), asset.content])
    );
    for (const file of [
      'computer-work.mjs',
      'computer-work-model.mjs',
      'computer-work.css',
    ])
      assert.equal(
        files.get(path.join('ui', file)),
        fs.readFileSync(path.join(root, 'ui', file), 'utf8')
      );
    assert.match(files.get('index.html'), /src="\.\/ui\/computer-work\.mjs"/);
    assert.ok(files.has('COMPUTER-WORK.md'));
    for (const file of ['README.md', 'COMPUTER-WORK.md']) {
      for (const [, target] of files.get(file).matchAll(/\]\(([^)]+)\)/g))
        assert.ok(
          /^https?:/.test(target) || target === 'COMPUTER-WORK.md',
          `${profile}/${file}: ${target}`
        );
    }
  }
});

test('CLI rejects typos, missing values and duplicate options', () => {
  for (const args of [
    ['--chek'],
    ['--output-dir'],
    ['--profile', '--check'],
    ['--check', '--check'],
  ])
    assert.throws(() => parseOptions(args));
  assert.deepEqual(parseOptions(['--check', '--output-dir=path with spaces']), {
    check: true,
    'output-dir': 'path with spaces',
  });
});
test('baseline references are valid; duplicate IDs, dangling references and non-finite inputs fail', () => {
  const sample = inputs();
  validateInputs(sample.manifest, sample);
  const cases = [
    (x) => {
      x.manifest.federations[1].slug = x.manifest.federations[0].slug;
    },
    (x) => {
      x.fabric.shards[0].domains[0] = 'missing';
    },
    (x) => {
      x.energy.feeds.pop();
    },
    (x) => {
      x.manifest.energyProtocols.thermostat.targetKelvin = 100;
    },
    (x) => {
      x.manifest.generatedAt = 'not a date';
    },
    (x) => {
      x.manifest.federations[0].compute.exaflops = Infinity;
    },
    (x) => {
      x.lattice.programmes[0].dependencies = [x.lattice.programmes[1].id];
    },
    (x) => {
      x.lattice.programmes[0].rootTask.dependencies = [
        x.lattice.programmes[0].rootTask.id,
      ];
    },
  ];
  for (const mutate of cases) {
    const x = inputs();
    mutate(x);
    assert.throws(() => validateInputs(x.manifest, x));
  }
});
test('critical failures block readiness while medium scenario advisories remain visible', () => {
  const telemetry = read('output/kardashev-telemetry.json'),
    ledger = read('output/kardashev-stability-ledger.json');
  assert.equal(readinessFailures(telemetry, ledger).length, 0);
  assert.ok(ledger.checks.some((c) => !c.status && c.severity === 'medium'));
  ledger.checks.push({
    title: 'Injected critical failure',
    status: false,
    severity: 'critical',
  });
  assert.ok(
    readinessFailures(telemetry, ledger).includes('Injected critical failure')
  );
  telemetry.manifest.planHashMatches = false;
  assert.ok(readinessFailures(telemetry, ledger).includes('Plan hash'));
});
test('check mode leaves an absent output directory absent and rejects malformed flags', () => {
  const parent = temp(),
    output = path.join(parent, 'absent');
  try {
    const result = run(['--check', '--output-dir', output]);
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(output), false);
    assert.match(result.stderr, /Missing artefact|Missing artifact/);
    const typo = run(['--chek', '--output-dir', output]);
    assert.notEqual(typo.status, 0);
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
test('a regenerated failing scenario cannot turn a failed model into passing CI', () => {
  const directory = temp(),
    output = path.join(directory, 'result');
  try {
    fs.cpSync(path.join(root, 'config'), path.join(directory, 'config'), {
      recursive: true,
    });
    const file = path.join(directory, 'config/kardashev-ii.manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file));
    manifest.interstellarCouncil.manifestoHash = '0x' + '00'.repeat(32);
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    const args = ['--config-root', directory, '--output-dir', output];
    const generated = run(args);
    assert.notEqual(generated.status, 0);
    assert.match(generated.stderr, /Model readiness failed/);
    assert.ok(fs.existsSync(path.join(output, 'kardashev-telemetry.json')));
    const before = fs.statSync(
      path.join(output, 'kardashev-telemetry.json')
    ).mtimeMs;
    const check = run([...args, '--check']);
    assert.notEqual(check.status, 0);
    assert.match(check.stderr, /Model readiness failed/);
    assert.doesNotMatch(check.stderr, /Drift detected/);
    assert.equal(
      fs.statSync(path.join(output, 'kardashev-telemetry.json')).mtimeMs,
      before
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test('capacity model accepts spare capacity without inventing extra regional demand', () => {
  const telemetry = read(
    'stellar-civilization-lattice/output/lattice-telemetry.json'
  );
  assert.equal(
    telemetry.verification.energyModels.comparison,
    'capacity-envelope'
  );
  assert.equal(telemetry.verification.energyModels.withinMargin, true);
  assert.ok(
    telemetry.energy.models.dysonProjectionGw >
      telemetry.energy.models.regionalSumGw * 2
  );
});
test('server contains paths and symlinks, supports HEAD, rejects writes and disables caching', async () => {
  const directory = temp(),
    publicDir = path.join(directory, 'public');
  fs.mkdirSync(publicDir);
  fs.writeFileSync(path.join(publicDir, 'index.html'), 'safe');
  fs.writeFileSync(path.join(directory, 'private.txt'), 'private');
  fs.symlinkSync(
    path.join(directory, 'private.txt'),
    path.join(publicDir, 'escape.txt')
  );
  fs.writeFileSync(path.join(publicDir, '.secret'), 'private');
  const server = await createServer(publicDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const request = (target, method = 'GET') =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: server.address().port,
          path: target,
          method,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () =>
            resolve({ status: res.statusCode, body, headers: res.headers })
          );
        }
      );
      req.on('error', reject);
      req.end();
    });
  try {
    const ok = await request('/');
    assert.equal(ok.body, 'safe');
    assert.equal(ok.headers['cache-control'], 'no-store');
    assert.equal((await request('/', 'HEAD')).body, '');
    assert.equal((await request('/', 'POST')).status, 405);
    for (const target of [
      '/escape.txt',
      '/.secret',
      '/%2e%2e%2fprivate.txt',
      '/%00',
      '/%zz',
    ])
      assert.equal((await request(target)).status, 404, target);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
