#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const desk = require('./index.cjs');
const DEFAULT_PLAN = path.resolve(
  __dirname,
  '../project-plan.hyperstructure.json'
);
function readBounded(file, cap) {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw Error('Input must be a regular file');
    if (stat.size > cap) throw Error(`Input exceeds ${cap} bytes`);
    const buffer = Buffer.alloc(cap + 1);
    let size = 0,
      n;
    do {
      n = fs.readSync(fd, buffer, size, buffer.length - size, null);
      size += n;
    } while (n && size < buffer.length);
    if (size > cap) throw Error(`Input exceeds ${cap} bytes`);
    return buffer.subarray(0, size);
  } finally {
    fs.closeSync(fd);
  }
}
function writeNewDirectory(destination, recovery) {
  const directory = path.resolve(destination),
    parent = path.dirname(directory);
  if (fs.realpathSync(parent) !== parent)
    throw Error(
      'Output directory parent must not contain symbolic-link aliases'
    );
  if (fs.existsSync(directory))
    throw Error(
      'Output directory must be new; existing paths are never overwritten'
    );
  const report = JSON.stringify(recovery.report) + '\n';
  // Compact recovery is intentionally bounded by the same cap enforced in the core.
  const payload = JSON.stringify(recovery);
  fs.mkdirSync(directory, { mode: 0o700 });
  const ownedDirectory = fs.lstatSync(directory),
    ownedFiles = [];
  const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
  function writeOwned(name, content) {
    const file = path.join(directory, name);
    const fd = fs.openSync(file, 'wx', 0o600);
    try {
      ownedFiles.push({ file, stat: fs.fstatSync(fd) });
      fs.writeFileSync(fd, content);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  try {
    writeOwned('report.json', report);
    writeOwned('recovery.json', payload);
    // This marker is deliberately last. It is not an atomic-directory publication guarantee.
    writeOwned(
      'completion.json',
      JSON.stringify({
        schemaVersion: 1,
        kind: 'omniphoenix-complete-export',
        reportFileSha256: hash(report),
        recoveryFileSha256: hash(payload),
      })
    );
  } catch (error) {
    const cleanupErrors = [];
    try {
      if (!same(fs.lstatSync(directory), ownedDirectory))
        throw Error('output directory changed');
      for (const { file, stat } of [...ownedFiles].reverse()) {
        try {
          const current = fs.lstatSync(file);
          if (!same(current, stat) || !current.isFile())
            throw Error('file ownership changed');
          fs.unlinkSync(file);
        } catch (cleanupError) {
          if (cleanupError.code !== 'ENOENT')
            cleanupErrors.push(
              `${path.basename(file)}: ${cleanupError.message}`
            );
        }
      }
      try {
        fs.rmdirSync(directory);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError.message);
      }
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError.message);
    }
    throw Error(
      `Export incomplete: ${error.message}. ${
        cleanupErrors.length
          ? 'Cleanup could not remove all owned output; choose a new directory or inspect incomplete output: ' +
            cleanupErrors.join('; ')
          : 'Owned partial output removed; retry is safe.'
      }`
    );
  }
}
function readExportDirectory(directory) {
  const marker = desk.parseStrict(
    desk.bytesOf(
      readBounded(path.join(directory, 'completion.json'), 1024),
      1024
    ).text
  );
  if (
    Object.keys(marker).sort().join(',') !==
      'kind,recoveryFileSha256,reportFileSha256,schemaVersion' ||
    marker.schemaVersion !== 1 ||
    marker.kind !== 'omniphoenix-complete-export'
  )
    throw Error('Invalid export completion marker');
  const reportBytes = readBounded(
    path.join(directory, 'report.json'),
    desk.LIMITS.recoveryBytes
  );
  const recoveryBytes = readBounded(
    path.join(directory, 'recovery.json'),
    desk.LIMITS.recoveryBytes
  );
  if (
    hash(reportBytes) !== marker.reportFileSha256 ||
    hash(recoveryBytes) !== marker.recoveryFileSha256
  )
    throw Error('Export files do not match completion marker');
  const recovery = desk.importRecovery(recoveryBytes);
  const report = desk.parseStrict(
    desk.bytesOf(reportBytes, desk.LIMITS.recoveryBytes).text
  );
  if (desk.canonical(report) !== desk.canonical(recovery.report))
    throw Error('Export report differs from recomputed recovery');
  return recovery;
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === '--help') {
    console.log(
      'Usage: node demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/disruption/cli.cjs [--plan FILE] [--controls FILE] [--json] [--output-dir NEW_DIRECTORY]\n       ... --import RECOVERY_FILE [--json] [--output-dir NEW_DIRECTORY]\nDefault: read-only supplied-plan analysis. No provider, identity, transaction or network action.\nControls: {"delays":[{"id":"JOB","days":1}],"blockedJobIds":[],"horizonDays":211}\nOutput is opt-in and requires a new directory in an existing real parent. No overwrite.'
    );
    return;
  }
  const options = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (
      !['--plan', '--controls', '--import', '--output-dir', '--json'].includes(
        key
      )
    )
      throw Error(`Unknown option ${key}; use --help`);
    if (Object.hasOwn(options, key)) throw Error(`Duplicate option ${key}`);
    if (key === '--json') options[key] = true;
    else {
      const value = argv[++i];
      if (!value || value.startsWith('--'))
        throw Error(`Missing value for ${key}`);
      options[key] = value;
    }
  }
  if (options['--import'] && (options['--plan'] || options['--controls']))
    throw Error('--import cannot be combined with --plan or --controls');
  let recovery;
  if (options['--import']) {
    const r = desk.importRecovery(
      readBounded(options['--import'], desk.LIMITS.recoveryBytes)
    );
    recovery = desk.exportRecovery(r.sourceText, r.controls);
  } else {
    const controls = options['--controls']
      ? desk.parseStrict(
          desk.bytesOf(
            readBounded(options['--controls'], desk.LIMITS.planBytes),
            desk.LIMITS.planBytes
          ).text
        )
      : {};
    recovery = desk.exportRecovery(
      readBounded(options['--plan'] || DEFAULT_PLAN, desk.LIMITS.planBytes),
      controls
    );
  }
  if (options['--output-dir'])
    writeNewDirectory(options['--output-dir'], recovery);
  const r = recovery.report;
  console.log(
    options['--json']
      ? JSON.stringify(r, null, 2)
      : [
          'Omniphoenix dependency disruption desk — planning only',
          `Allocated ${r.baseline.allocatedRewards} ${r.baseline.currency}; unallocated ${r.baseline.unallocatedBudget}; baseline ${r.baseline.criticalPathDays} days.`,
          r.scenario.completionPossible
            ? `Scenario ${r.scenario.criticalPathDays} days; delta +${r.scenario.criticalPathDeltaDays} days.`
            : `Full completion blocked. Schedulable subgraph: ${r.scenario.finiteSubgraphCriticalPathDays} days.`,
          `Blocked reward exposure: ${r.scenario.blockedRewardExposure} (planning total, never lost or earned money).`,
          ...r.assumptions,
          `Source SHA-256: ${r.sourceSha256}`,
          `Canonical report SHA-256: ${r.reportSha256}`,
          ...(options['--output-dir']
            ? [
                `Saved complete report.json, recovery.json and completion.json to ${path.resolve(
                  options['--output-dir']
                )}`,
              ]
            : []),
        ].join('\n')
  );
}
module.exports = { main, readBounded, writeNewDirectory, readExportDirectory };
if (require.main === module)
  try {
    main();
  } catch (error) {
    console.error(`Disruption planning failed: ${error.message}`);
    process.exitCode = 1;
  }
