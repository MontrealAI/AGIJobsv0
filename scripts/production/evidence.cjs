'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const namespace = 'agijobs-rehearsal';
const principal = 'rehearsal@localhost';
const excluded = new Set(['manifest.json', 'manifest.json.sig']);
const requiredChecks = [
  'toolchain',
  'release-defenses',
  'gateway-build',
  'provider-contracts',
  'compile',
  'contract-size',
  'adversarial-controls',
  'execution-gates',
  'gateway-settlement',
  'local-commissioning',
  'commissioning-evidence',
];
function filesIn(root, dir = root) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink())
        throw new Error('Evidence must not contain symlinks');
      if (entry.isDirectory()) return filesIn(root, file);
      if (!entry.isFile())
        throw new Error('Evidence must contain ordinary files');
      return [path.relative(root, file).split(path.sep).join('/')];
    })
    .sort();
}
function digest(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}
function assertSimulation(report) {
  if (
    report.schemaVersion !== 1 ||
    report.kind !== 'production-rehearsal' ||
    report.evidenceClass !== 'simulation' ||
    report.productionApproved !== false ||
    report.independentReview !== false ||
    !['passed', 'failed'].includes(report.status)
  )
    throw new Error(
      'Rehearsal evidence must not claim production approval or independent review'
    );
  if (
    !/^[a-f0-9]{40}$/.test(report.source?.commit || '') ||
    !/^[a-f0-9]{40}$/.test(report.source?.tree || '')
  )
    throw new Error('Evidence must identify the exact source commit and tree');
  if (
    !Array.isArray(report.checks) ||
    !report.checks.length ||
    (report.status === 'passed' &&
      report.checks.some(
        (check) => check.status !== 'passed' || check.exitCode !== 0
      ))
  )
    throw new Error('Passing evidence must contain successful checks');
  if (
    report.status === 'passed' &&
    JSON.stringify(report.checks.map((check) => check.id).sort()) !==
      JSON.stringify([...requiredChecks].sort())
  )
    throw new Error(
      'Passing evidence must contain every required rehearsal check exactly once'
    );
}
function sealBundle(root, keyDirectory) {
  const report = JSON.parse(
    fs.readFileSync(path.join(root, 'report.json'), 'utf8')
  );
  assertSimulation(report);
  const key = path.join(keyDirectory, 'rehearsal-key');
  execFileSync(
    'ssh-keygen',
    ['-q', '-t', 'ed25519', '-N', '', '-C', principal, '-f', key],
    { stdio: 'pipe' }
  );
  const publicKey = fs.readFileSync(`${key}.pub`, 'utf8');
  fs.writeFileSync(path.join(root, 'rehearsal-key.pub'), publicKey);
  fs.writeFileSync(
    path.join(root, 'allowed_signers'),
    `${principal} namespaces="${namespace}" ${publicKey}`
  );
  const entries = filesIn(root)
    .filter((name) => !excluded.has(name))
    .map((name) => ({
      path: name,
      bytes: fs.statSync(path.join(root, name)).size,
      sha256: digest(path.join(root, name)),
    }));
  const manifest = {
    schemaVersion: 1,
    kind: 'simulation-integrity-manifest',
    namespace,
    files: entries,
  };
  const file = path.join(root, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  execFileSync('ssh-keygen', ['-Y', 'sign', '-f', key, '-n', namespace, file], {
    stdio: 'pipe',
  });
  return verifyBundle(root);
}
function verifyBundle(root) {
  root = fs.realpathSync(root);
  const actual = filesIn(root).filter((name) => !excluded.has(name));
  const raw = fs.readFileSync(path.join(root, 'manifest.json'));
  const manifest = JSON.parse(raw);
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== 'simulation-integrity-manifest' ||
    manifest.namespace !== namespace ||
    !Array.isArray(manifest.files)
  )
    throw new Error('Invalid simulation manifest');
  const names = manifest.files.map((entry) => entry.path);
  if (
    JSON.stringify([...names].sort()) !== JSON.stringify(actual) ||
    new Set(names).size !== names.length
  )
    throw new Error('Evidence file inventory changed');
  for (const entry of manifest.files) {
    if (
      typeof entry.path !== 'string' ||
      path.isAbsolute(entry.path) ||
      entry.path
        .split('/')
        .some((part) => !part || part === '..' || part === '.') ||
      entry.path.includes('\\')
    )
      throw new Error('Unsafe evidence path');
    const file = path.join(root, entry.path);
    if (fs.statSync(file).size !== entry.bytes || digest(file) !== entry.sha256)
      throw new Error(`Evidence hash mismatch: ${entry.path}`);
  }
  execFileSync(
    'ssh-keygen',
    [
      '-Y',
      'verify',
      '-f',
      path.join(root, 'allowed_signers'),
      '-I',
      principal,
      '-n',
      namespace,
      '-s',
      path.join(root, 'manifest.json.sig'),
    ],
    { input: raw, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const report = JSON.parse(
    fs.readFileSync(path.join(root, 'report.json'), 'utf8')
  );
  assertSimulation(report);
  return report;
}
if (require.main === module) {
  try {
    if (process.argv.length !== 3)
      throw new Error(
        'Usage: npm run production:verify-rehearsal -- <report-directory>'
      );
    const report = verifyBundle(process.argv[2]);
    console.log(
      `Verified ephemeral rehearsal integrity; outcome: ${report.status}. Production approval: false. Independent review: false.`
    );
    if (report.status !== 'passed') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { sealBundle, verifyBundle, assertSimulation, requiredChecks };
