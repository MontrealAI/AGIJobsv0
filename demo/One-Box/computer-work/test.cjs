'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

for (const injected of [false, true])
  test(
    injected
      ? 'independent reviewer rejects the late supplier'
      : 'browser worker creates an accepted comparison',
    () => {
      const run = spawnSync(
        process.execPath,
        [
          path.join(__dirname, 'run.cjs'),
          ...(injected ? ['--inject-error'] : []),
        ],
        { encoding: 'utf8', timeout: 60_000 }
      );
      assert.equal(run.error, undefined);
      assert.equal(run.status, injected ? 1 : 0, run.stderr);
      const output = JSON.parse(run.stdout);
      assert.equal(output.accepted, !injected);
      assert.equal(output.passedChecks, injected ? 9 : 11);
      assert.equal(output.totalChecks, 11);
      assert.equal(output.browserExecuted, true);
      assert.equal(output.liveProvider, false);
      assert.equal(output.settlementApproved, false);
      const read = (file) =>
        JSON.parse(
          fs.readFileSync(path.join(output.evidenceDirectory, file), 'utf8')
        );
      const evidence = read('browser-evidence.json');
      assert.equal(evidence.calls, 1);
      assert.equal(evidence.actualBrowser, true);
      assert.equal(evidence.actualChain, false);
      assert.deepEqual(evidence.pageErrors, []);
      assert.equal(read('accessibility.json').violations.length, 0);
      assert.equal(read('receipt.json').simulated, true);
    }
  );
