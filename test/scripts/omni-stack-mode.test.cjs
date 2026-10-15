'use strict';
// Run the real TypeScript wrapper, but only with an inert npm executable.
// No inherited credentials, real package manager, RPC, or deployment is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const script = path.join(root, 'scripts/v2/oneclick-stack.ts');
const tsNode = require.resolve('ts-node/dist/bin.js');

function runStack(t, args, npmExitCode) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-stack-mode-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const bin = path.join(cwd, 'bin');
  fs.mkdirSync(bin);
  const marker = path.join(cwd, 'npm-args');
  fs.writeFileSync(
    path.join(bin, 'npm'),
    `#!/bin/sh\nprintf '%s\\n' "$@" > "$OMNI_TEST_MARKER"\nexit ${npmExitCode}\n`,
    { mode: 0o755 }
  );
  const result = spawnSync(
    process.execPath,
    [
      tsNode,
      '--transpile-only',
      '--skip-project',
      '--compiler-options',
      JSON.stringify({
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
      }),
      script,
      ...args,
    ],
    {
      cwd,
      env: { PATH: bin, HOME: cwd, OMNI_TEST_MARKER: marker },
      encoding: 'utf8',
      timeout: 15000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
    }
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.ok(!fs.existsSync(path.join(cwd, 'reports')));
  return { result, marker };
}

for (const flag of ['--dry-run', '--dry-run=true', '--dry-run=false']) {
  test(
    `direct stack rejects ${flag} before spawning npm`,
    { timeout: 20000 },
    (t) => {
      const { result, marker } = runStack(
        t,
        [flag, '--network', 'localhost'],
        91
      );
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /--dry-run is unsupported/);
      assert.ok(
        !fs.existsSync(marker),
        'npm must not be invoked for any dry-run spelling'
      );
    }
  );
}

test(
  'explicit operational forwarding invokes only the npm stub',
  { timeout: 20000 },
  (t) => {
    const { result, marker } = runStack(
      t,
      ['--network', 'localhost', '--no-compose'],
      0
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readFileSync(marker, 'utf8').trimEnd().split('\n'), [
      'run',
      'deploy:oneclick:wizard',
      '--',
      '--yes',
      '--no-compose',
      '--network',
      'localhost',
    ]);
  }
);
