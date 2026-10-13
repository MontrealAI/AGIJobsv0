#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { inspectBuild } = require('../ci/check-solidity-build.cjs');

function archiveVerification(directory, root = process.cwd()) {
  const report = inspectBuild(root);
  // Exclusive creation prevents a retry from replacing prior deployment evidence.
  fs.mkdirSync(directory, { mode: 0o700 });
  const files = {};
  function save(name, bytes) {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(file, 'wx', 0o400);
    try {
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    files[name] = createHash('sha256').update(bytes).digest('hex');
  }
  const builds = new Map();
  for (const item of report.builds) {
    const bytes = fs.readFileSync(path.join(root, item.buildInfo));
    const build = JSON.parse(bytes);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const buildInfo = `build-info/${hash}.json`;
    const standardInput = `standard-input/${hash}.json`;
    save(buildInfo, bytes);
    // Preserve every original source and setting, not a reconstructed closure.
    save(standardInput, JSON.stringify(build.input));
    builds.set(path.resolve(root, item.buildInfo), {
      buildInfo,
      standardInput,
    });
  }
  const contracts = report.contracts.map(({ contract, source }) => {
    const artifact = `artifacts/${source}/${contract}.json`;
    const debugFile = path.join(
      root,
      'artifacts',
      source,
      `${contract}.dbg.json`
    );
    const debug = JSON.parse(fs.readFileSync(debugFile, 'utf8'));
    const build = builds.get(
      path.resolve(path.dirname(debugFile), debug.buildInfo)
    );
    if (!build)
      throw Error(`Missing archived compiler input: ${source}:${contract}`);
    save(artifact, fs.readFileSync(path.join(root, artifact)));
    return {
      contract,
      source,
      fullyQualified: `${source}:${contract}`,
      artifact,
      ...build,
    };
  });
  const index = {
    schema: 'agijobsv0/verification-inputs/1',
    compiler: report.compiler,
    contracts,
    files,
    note: 'Compiler evidence only. Pair with the deployment journal for chain, addresses, transactions and original constructor arguments. Not explorer verification or production approval.',
  };
  const bytes = JSON.stringify(index, null, 2) + '\n';
  save('index.json', bytes);
  return {
    directory: path.resolve(directory),
    indexSha256: files['index.json'],
    contracts: contracts.length,
  };
}

if (require.main === module) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--output')
      throw Error(
        'Usage: node scripts/deploy/archive-verification.cjs --output NEW_DIRECTORY'
      );
    console.log(
      JSON.stringify(
        archiveVerification(path.resolve(process.argv[3])),
        null,
        2
      )
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { archiveVerification };
