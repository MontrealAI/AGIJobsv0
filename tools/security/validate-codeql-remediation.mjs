import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const directory = path.join(root, 'docs/security/remediation-2026-10-19');
const ledger = JSON.parse(fs.readFileSync(path.join(directory, 'findings.json'), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const key = result => {
  const loc = result.locations[0].physicalLocation;
  return JSON.stringify([result.ruleId, loc.artifactLocation.uri, loc.region]);
};
const results = [];
for (const [filename, expected] of [['original-codeql.zip', ledger.baseline.original.sha256], ['fresh-codeql.zip', ledger.baseline.fresh.sha256]]) {
  const file = path.join(directory, 'baseline', filename);
  assert.equal(sha256(fs.readFileSync(file)), expected, filename);
  results.push(JSON.parse(execFileSync('unzip', ['-p', file, 'javascript.sarif'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).runs[0].results);
}
assert.deepEqual(results[0].map(key).sort(), results[1].map(key).sort(), 'fresh baseline must retain every result including duplicates');
assert.equal(results[0].length, 96);
assert.equal(ledger.findings.length, 96);
const allowed = new Set(['Fixed', 'Already fixed on selected baseline', 'Demonstrably false positive', 'Unresolved']);
const counts = {}, ids = new Set();
for (const [index, finding] of ledger.findings.entries()) {
  assert.equal(finding.id, `F${String(index + 1).padStart(3, '0')}`);
  assert.ok(!ids.has(finding.id)); ids.add(finding.id);
  assert.equal(finding.rule, results[0][index].ruleId);
  assert.equal(finding.location.path, results[0][index].locations[0].physicalLocation.artifactLocation.uri);
  assert.deepEqual(finding.location.region, results[0][index].locations[0].physicalLocation.region);
  assert.ok(allowed.has(finding.disposition), finding.id);
  assert.ok(finding.owner && finding.exposure && finding.fixOrJustification && finding.dataflow, finding.id);
  if (finding.disposition === 'Unresolved') {
    assert.ok(finding.blocker && finding.nextAction, finding.id);
    if (process.argv.includes('--require-closed')) throw new Error(`${finding.id}: ${finding.blocker}`);
  } else {
    assert.ok(finding.regressionEvidence.length, finding.id);
    for (const evidence of finding.regressionEvidence) assert.ok(fs.existsSync(path.resolve(root, evidence.path)), `${finding.id}: missing ${evidence.path}`);
  }
  counts[finding.severity] ??= {};
  counts[finding.severity][finding.disposition] = (counts[finding.severity][finding.disposition] ?? 0) + 1;
}
assert.equal(ledger.riskAcceptance.length, 0, 'risk acceptance requires a separate explicit owner decision');
assert.equal(ledger.baseline.deployedJobsSource, '818b3a246871e4cd4dde86558dbb91ef82b15eef');
assert.equal(git('show', `${ledger.baseline.commit}:.github/codeql/config.yml`), fs.readFileSync(path.join(root, '.github/codeql/config.yml'), 'utf8').trim(), 'scanner query/path policy changed');
const protectedPath = file => /^(contracts\/|config\/|deployment-config\/|deployment\/|deployments\/)/.test(file) || /(?:compiler-evidence|compiler-provenance|mainnet-deployment|deployment-addresses|configuration-readback|solidity-compiler|ethereum-mainnet)/.test(file) || (/receipts/i.test(file) && /\.json$/.test(file));
const protectedFiles = git('ls-tree', '-r', '--name-only', ledger.baseline.commit).split('\n').filter(protectedPath);
const changes = git('diff', '--name-only', ledger.baseline.commit, 'HEAD').split('\n').filter(Boolean);
assert.deepEqual(changes.filter(protectedPath), [], 'protected source or deployment evidence changed');
assert.equal(git('diff', '--name-only', 'HEAD'), '', 'uncommitted tracked changes cannot be bound to HEAD qualification');
assert.equal(ledger.qualification.productionApproved, false);
const result = { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), baselineResults: 96, counts, protectedFiles: protectedFiles.length, unchangedQueryConfiguration: true, productionApproved: false };
const out = path.join(root, 'reports/security/remediation'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'ledger-validation.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
