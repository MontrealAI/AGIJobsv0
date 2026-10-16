#!/usr/bin/env node
'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const {
  sha256,
  readJSON,
  exclusiveJSON,
  insist,
  safeError,
} = require('./evidence.cjs');
const { journalTransactions } = require('./reconcile.cjs');
function prepare(options) {
  const snapshots = [],
    journals = [];
  insist(
    options.journal?.length,
    'At least one retained journal is required; include every resumed attempt'
  );
  for (const file of options.journal) {
    const bytes = fs.readFileSync(file);
    journals.push({
      file: path.relative(
        path.dirname(path.resolve(options.output)),
        path.resolve(file)
      ),
      sha256: sha256(bytes),
    });
    for (const line of bytes.toString('utf8').trim().split('\n'))
      snapshots.push(JSON.parse(line));
  }
  const chains = new Set(snapshots.map((p) => String(p.chainId)));
  insist(chains.size === 1, 'Journals refer to different chains');
  const configurations = new Set(
    snapshots.map((p) => p.configurationHash).filter(Boolean)
  );
  insist(
    configurations.size <= 1,
    'Journals refer to different deployment configurations'
  );
  const recovered = journalTransactions(snapshots),
    latest = snapshots.at(-1);
  const dependencies = options.dependencies
    ? readJSON(options.dependencies)
    : { libraries: {}, reused: [] };
  insist(
    Object.keys(dependencies).every((key) =>
      ['libraries', 'reused', 'replacements'].includes(key)
    ),
    'Dependency file may only declare libraries, reused dependencies and replacements'
  );
  const manifest = {
    schema: 'agijobsv0/verification-manifest/1',
    chainId: [...chains][0],
    releaseId: options.release,
    archiveSha256: sha256(
      fs.readFileSync(path.join(options.archive, 'index.json'))
    ),
    journals,
    ...recovered,
    coordinators: [
      ...new Set(snapshots.map((p) => p.coordinator).filter(Boolean)),
    ],
    senders: [
      ...new Set(recovered.transactions.map((t) => t.from).filter(Boolean)),
    ],
    scanFromBlock: Number(options['scan-from-block']),
    minConfirmations: Number(options.confirmations),
    maxQualificationAgeBlocks: Number(options['max-age-blocks']),
    activation: {
      operation: 'unpauseAll',
      systemPause: options['system-pause'] || latest.contracts?.SystemPause,
      governance: options.governance || latest.governance,
    },
    ...dependencies,
  };
  insist(
    typeof manifest.releaseId === 'string' && manifest.releaseId.length >= 7,
    'Explicit release identity is required'
  );
  for (const key of [
    'scanFromBlock',
    'minConfirmations',
    'maxQualificationAgeBlocks',
  ])
    insist(
      Number.isSafeInteger(manifest[key]) &&
        manifest[key] >= (key === 'scanFromBlock' ? 0 : 1),
      `Explicit ${key} is required`
    );
  exclusiveJSON(options.output, manifest);
  return manifest;
}
function main(argv = process.argv.slice(2)) {
  const options = { journal: [] };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    insist(
      [
        'journal',
        'output',
        'archive',
        'release',
        'scan-from-block',
        'confirmations',
        'max-age-blocks',
        'system-pause',
        'governance',
        'dependencies',
      ].includes(key) && argv[i + 1],
      `Unknown or incomplete option ${argv[i]}`
    );
    if (key === 'journal') options.journal.push(argv[++i]);
    else {
      insist(!options[key], `Duplicate option ${key}`);
      options[key] = argv[++i];
    }
  }
  insist(
    options.output && options.archive,
    '--output NEW_FILE and --archive DIRECTORY are required'
  );
  return prepare(options);
}
if (require.main === module) {
  try {
    const result = main();
    console.log(
      JSON.stringify({
        transactions: result.transactions.length,
        journals: result.journals.length,
        qualified: false,
      })
    );
  } catch (error) {
    console.error(JSON.stringify(safeError(error)));
    process.exitCode = 1;
  }
}
module.exports = { prepare, main };
