import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const cli = fileURLToPath(new URL('../bin/successor.mjs', import.meta.url));
function run(args, cwd) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}
test('One-command rehearsal runs all missions and restores unprivileged knowledge in a clean directory', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'successor-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = run(['verify', '--out', join(dir, 'evidence')], dir);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.valid, true);
  const report = JSON.parse(readFileSync(summary.evidence, 'utf8'));
  assert.equal(report.invoice.sealedJobs, 10);
  assert.equal(report.world.alpha.status, 'ABSENT');
  assert.equal(report.resources.alpha.status, 'ABSENT');
  assert.equal(report.proof.independentAdmission.allowed, false);
  assert.equal(report.examination.verdict, 'FAIL');
  assert.equal(report.examination.caseCount, 60);
  const verified = run(
    [
      'proof',
      'verify',
      '--file',
      join(dir, 'evidence/world-examination.json'),
      '--trust',
      join(dir, 'evidence/world-examination-trust.json'),
    ],
    dir
  );
  assert.equal(verified.status, 0, verified.stderr);
  const proofSummary = JSON.parse(verified.stdout);
  assert.equal(proofSummary.verdict, 'FAIL');
  assert.equal(proofSummary.verificationClass, 'INTERNAL_FIXTURE_INTEGRITY');
  assert.equal(proofSummary.authorityCreated, 'NONE');
  const restored = run(
    ['pack', 'restore', '--file', join(dir, 'evidence/mission-pack.json')],
    dir
  );
  assert.equal(restored.status, 0, restored.stderr);
  assert.deepEqual(JSON.parse(restored.stdout).activeAuthority, []);
  const child = run(
    [
      'successor',
      'create',
      '--file',
      join(dir, 'evidence/mission-pack.json'),
      '--id',
      'new-candidate',
      '--supplier',
      'local-b',
    ],
    dir
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).proofCurrency, 'absent');
});
test('CLI produces reusable mission/compiler JSON, rejects unknown flags and never overwrites evidence', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'successor-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const mission = join(dir, 'mission.json');
  assert.equal(run(['mission', 'init', '--out', mission], dir).status, 0);
  assert.equal(run(['mission', 'validate', '--file', mission], dir).status, 0);
  const compile = run(['jobs', 'compile', '--file', mission], dir);
  assert.equal(compile.status, 0, compile.stderr);
  assert.equal(JSON.parse(compile.stdout).graph.nodes.length, 10);
  assert.equal(run(['mission', 'init', '--out', mission], dir).status, 1);
  assert.equal(run(['mission', 'init', '--production'], dir).status, 1);
  assert.equal(run(['proof', 'verify', '--file', mission], dir).status, 1);
});
