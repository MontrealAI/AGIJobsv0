#!/usr/bin/env node
import path from 'node:path';
import { readContractCoverage, readSummaryPct } from './coverage-utils.mjs';

const MIN = Number(process.env.COVERAGE_MIN ?? '90');

async function main() {
  const root = path.resolve(process.cwd());
  if (!Number.isFinite(MIN) || MIN < 0 || MIN > 100) {
    throw new Error('COVERAGE_MIN must be a finite percentage from 0 to 100');
  }
  // Foundry writes lcov.info; Hardhat's coverage/lcov.info is a separate report.
  const checks = await readContractCoverage(path.join(root, 'lcov.info'));
  const definitions = [
    [
      'Arena orchestrator',
      path.join(root, 'backend/arena-orchestrator/coverage/coverage-summary.json'),
      readSummaryPct
    ],
    [
      'Culture graph indexer',
      path.join(root, 'indexers/culture-graph-indexer/coverage/coverage-summary.json'),
      readSummaryPct
    ],
    [
      'Culture studio UI',
      path.join(root, 'apps/culture-studio/coverage/coverage-summary.json'),
      readSummaryPct
    ]
  ];

  for (const [name, file, reader] of definitions) {
    try {
      const pct = await reader(file);
      checks.push({ name, pct });
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        throw new Error(`Coverage artifact missing for ${name}: ${file}`);
      }
      throw error;
    }
  }

  let failures = 0;
  for (const { name, pct } of checks) {
    const display = pct.toFixed(2);
    if (pct + 1e-9 < MIN) {
      failures += 1;
      console.error(`✖ ${name} coverage ${display}% < ${MIN}%`);
    } else {
      console.log(`✔ ${name} coverage ${display}% >= ${MIN}%`);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
