#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { checkArtifacts } = require('../release/check-contract-size.js');
const {
  createVerifiedArtifactReader,
} = require('../deploy/verified-artifact.cjs');
const {
  policy,
  checkCompiler,
  checkDiagnostics,
} = require('./solidity-policy.cjs');

function inspectBuild(root = process.cwd()) {
  const artifactsRoot = path.join(root, 'artifacts');
  const size = checkArtifacts(artifactsRoot);
  if (!size.sizeGatePassed)
    throw new Error('Production contract bytecode exceeds chain limits');
  const readArtifact = createVerifiedArtifactReader(root);
  const builds = new Map();
  for (const contract of size.contracts) {
    readArtifact({ name: contract.contract, source: contract.source });
    const debugPath = path.join(
      artifactsRoot,
      contract.source,
      `${contract.contract}.dbg.json`
    );
    const debug = JSON.parse(fs.readFileSync(debugPath, 'utf8'));
    const buildPath = path.resolve(path.dirname(debugPath), debug.buildInfo);
    if (!builds.has(buildPath)) {
      const build = JSON.parse(fs.readFileSync(buildPath, 'utf8'));
      checkCompiler(build);
      builds.set(buildPath, {
        buildInfo: path.relative(root, buildPath),
        compiler: build.solcLongVersion,
        reviewedUpstreamWarnings: checkDiagnostics(build),
      });
    }
  }
  const results = [...builds.values()];
  return {
    compiler: policy.longVersion,
    knownAdvisoryReviewDate: policy.reviewedAt,
    projectSourceWarnings: 0,
    reviewedUpstreamWarningCount: results.reduce(
      (n, item) => n + item.reviewedUpstreamWarnings.length,
      0
    ),
    fullyWarningFree: results.every(
      (item) => item.reviewedUpstreamWarnings.length === 0
    ),
    scope:
      'New source builds only. Existing mainnet bytecode and explorer advisories are unchanged.',
    builds: results,
    ...size,
  };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(inspectBuild(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { inspectBuild };
