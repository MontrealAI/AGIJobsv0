#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MIN = Number(process.env.COVERAGE_MIN ?? '90');

async function readLcovPct(lcovPath) {
  const raw = await readFile(lcovPath, 'utf8');
  let totalFound = 0;
  let totalHit = 0;
  let blockFound = 0;
  let blockHit = 0;
  let seenBlock = false;
  let currentFile = '';
  let include = false;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      currentFile = line.slice(3);
      include =
        currentFile.includes('/contracts/') &&
        !currentFile.includes('/contracts/test/') &&
        !currentFile.includes('/node_modules/');
      continue;
    }
    if (line.startsWith('LF:')) {
      blockFound = Number(line.slice(3));
      continue;
    }
    if (line.startsWith('LH:')) {
      blockHit = Number(line.slice(3));
      continue;
    }
    if (line.startsWith('DA:')) {
      if (!include) {
        seenBlock = true; // prevent block fallback
        continue;
      }
      const [, hits] = line.slice(3).split(',');
      const hit = Number(hits);
      if (Number.isFinite(hit)) {
        totalFound += 1;
        if (hit > 0) totalHit += 1;
        seenBlock = true;
      }
      continue;
    }
    if (line === 'end_of_record') {
      if (!seenBlock && blockFound > 0) {
        if (include) {
          totalFound += blockFound;
          totalHit += blockHit;
        }
      }
      blockFound = 0;
      blockHit = 0;
      seenBlock = false;
      currentFile = '';
      include = false;
    }
  }
  if (totalFound === 0) return 0;
  return (totalHit / totalFound) * 100;
}

async function readSummaryPct(summaryPath) {
  const raw = await readFile(summaryPath, 'utf8');
  const json = JSON.parse(raw);
  const total = json.total ?? {};
  const pct = total.lines?.pct ?? total.lines?.pct ?? total.lines;
  if (typeof pct === 'number') {
    return pct;
  }
  if (typeof total.lines === 'object' && typeof total.lines.pct === 'number') {
    return total.lines.pct;
  }
  throw new Error(`Unable to read coverage percentage from ${summaryPath}`);
}

async function main() {
  const root = path.resolve(process.cwd());
  const foundryCoveragePath = await (async () => {
    const preferred = path.join(root, 'coverage/lcov.info');
    try {
      await readFile(preferred, 'utf8');
      return preferred;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return path.join(root, 'lcov.info');
      }
      throw error;
    }
  })();

  const definitions = [
    ['Foundry lcov', foundryCoveragePath, readLcovPct],
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

  const checks = [];
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
