'use strict';
// Integration test: a fresh checkout must report its missing deployment addresses.
// This is an expected rejection test, never a production-readiness approval.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run, parseArgs } = require('../lib/mission.cjs');
const { runPhase } = require('../lib/processes.cjs');
const { ROOT } = require('../lib/scenario.cjs');
const { verifyReport } = require('../lib/verify.cjs');
async function main() {
  const directory = process.argv[2];
  if (!directory) throw new Error('Supply a new diagnostics output directory');
  const result = await run(
    parseArgs(['--full', '--network', 'sepolia', '--out', directory])
  );
  verifyReport(result.out);
  assert.equal(
    result.exitCode,
    1,
    'Fresh checkout must not approve incomplete owner configuration'
  );
  assert.deepEqual(
    result.report.phases.map((p) => [p.id, p.status]),
    [
      ['owner-quickstart', 'success'],
      ['owner-command-center', 'success'],
      ['owner-parameter-matrix', 'failed'],
    ]
  );
  assert.equal(result.report.phases[2].exitCode, 1);
  assert.equal(result.report.phases[2].timedOut, false);
  const matrix = JSON.parse(
    fs.readFileSync(path.join(result.out, 'parameter-matrix.json'))
  );
  const errors = matrix.subsystems.flatMap((s) =>
    s.rows
      .filter((r) => r.path === '<error>')
      .map((r) => ({ id: s.id, error: r.value }))
  );
  assert.deepEqual(errors, [
    {
      id: 'jobRegistry',
      error: 'JobRegistry tax policy cannot be the zero address',
    },
    {
      id: 'thermodynamics',
      error: 'RewardEngine address cannot be the zero address',
    },
  ]);
  const surfaceFile = path.join(result.out, '../owner-control-surface.json');
  const surface = await runPhase(
    {
      id: 'surface',
      command: 'npm',
      args: [
        'run',
        'owner:surface',
        '--',
        '--network',
        'sepolia',
        '--json',
        '--out',
        surfaceFile,
      ],
    },
    { cwd: ROOT, timeoutMs: 300000 }
  );
  assert.equal(surface.exitCode, 1);
  assert.equal(surface.timedOut, false);
  const owner = JSON.parse(fs.readFileSync(surfaceFile));
  const failedModules = owner.reports
    .filter((r) => r.status === 'error')
    .map((r) => r.key)
    .sort();
  assert.deepEqual(failedModules, [
    'jobRegistry',
    'platformRegistry',
    'rewardEngine',
    'thermostat',
  ]);
  console.log(
    'Expected rejection verified: missing TaxPolicy and RewardEngine addresses block the full workflow. No production approval.'
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
