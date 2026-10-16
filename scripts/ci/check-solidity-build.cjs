#!/usr/bin/env node
'use strict';

const { policy } = require('./solidity-policy.cjs');

function inspectBuild(root = process.cwd()) {
  const inventory =
    require('../verification/source-inventory.cjs').inspectSources(root);
  if (!inventory.sizeGatePassed)
    throw new Error('Production contract bytecode exceeds chain limits');
  const size = {
    runtimeLimitBytes: 24576,
    initcodeLimitBytes: 49152,
    ...inventory,
  };
  const results = inventory.builds;
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
