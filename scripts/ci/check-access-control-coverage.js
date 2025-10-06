#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const coverageSummaryPath = path.resolve(__dirname, '../../coverage/coverage-summary.json');
let summary;
try {
  summary = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
} catch (err) {
  console.error('Unable to read coverage summary at coverage/coverage-summary.json');
  console.error(err.message);
  process.exit(1);
}

const rawPaths = process.env.ACCESS_CONTROL_PATHS || '';
const accessControlPaths = rawPaths
  .split(',')
  .map((p) => p.trim().replace(/\/$/, ''))
  .filter(Boolean);

if (accessControlPaths.length === 0) {
  console.error('ACCESS_CONTROL_PATHS env var is required (comma separated).');
  process.exit(1);
}

const minStr = process.env.ACCESS_CONTROL_COVERAGE_MIN || '100';
const threshold = Number(minStr);
if (!Number.isFinite(threshold)) {
  console.error(`Invalid ACCESS_CONTROL_COVERAGE_MIN value: ${minStr}`);
  process.exit(1);
}

const entries = Object.entries(summary).filter(([key]) => key !== 'total');
if (entries.length === 0) {
  console.error('Coverage summary does not contain any file entries.');
  process.exit(1);
}

let failures = 0;
for (const prefix of accessControlPaths) {
  let covered = 0;
  let total = 0;
  for (const [filename, metrics] of entries) {
    if (!filename.startsWith(prefix)) {
      continue;
    }
    const lines = metrics && metrics.lines;
    if (!lines || typeof lines.covered !== 'number' || typeof lines.total !== 'number') {
      continue;
    }
    covered += lines.covered;
    total += lines.total;
  }

  if (total === 0) {
    console.error(`No coverage data found for access control path: ${prefix}`);
    failures += 1;
    continue;
  }

  const pct = (covered / total) * 100;
  const pctDisplay = pct.toFixed(2).replace(/\.00$/, '');
  if (pct + 1e-9 < threshold) {
    console.error(
      `Access control coverage for ${prefix} is ${pctDisplay}% (< ${threshold}%).`
    );
    failures += 1;
  } else {
    console.log(`Access control coverage OK for ${prefix}: ${pctDisplay}% >= ${threshold}%.`);
  }
}

if (failures > 0) {
  process.exit(1);
}
