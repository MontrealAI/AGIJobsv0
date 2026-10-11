'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verify } = require('../verify-braces-patch.cjs');
const ROOT = path.resolve(__dirname, '../../..');

test('unmodified upstream compile, parse and regression suites pass against the installed patch', () => {
  verify();
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), 'agi-braces-upstream-')
  );
  try {
    fs.cpSync(
      path.join(ROOT, 'vendor/braces/upstream-tests'),
      path.join(fixture, 'test'),
      { recursive: true }
    );
    const installed = path.dirname(require.resolve('braces/package.json'));
    fs.symlinkSync(
      path.join(installed, 'index.js'),
      path.join(fixture, 'index.js'),
      'file'
    );
    fs.symlinkSync(
      path.join(installed, 'lib'),
      path.join(fixture, 'lib'),
      'dir'
    );
    fs.symlinkSync(
      path.join(ROOT, 'node_modules'),
      path.join(fixture, 'node_modules'),
      'dir'
    );
    const child = spawnSync(
      process.execPath,
      [
        require.resolve('mocha/bin/mocha'),
        '--no-config',
        '--no-package',
        '--reporter',
        'json',
        'test/*.js',
      ],
      {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1' },
      }
    );
    assert.equal(child.status, 0, child.stderr + child.stdout);
    const report = JSON.parse(child.stdout);
    assert.equal(report.stats.failures, 0);
    assert.equal(report.stats.pending, 0);
    assert(report.stats.passes > 100, 'Upstream suites did not execute');
    console.log('Upstream Braces regression cases:', report.stats.passes);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
