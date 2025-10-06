#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const configuredPaths = (process.env.ACCESS_CONTROL_PATHS || '')
  .split(',')
  .map((entry) => entry.trim().replace(/\/+$/, ''))
  .filter(Boolean);

if (configuredPaths.length === 0) {
  console.log('No access control paths configured; skipping coverage check.');
  process.exit(0);
}

const coverageFile = path.join(__dirname, '../../coverage/lcov.info');
if (!fs.existsSync(coverageFile)) {
  console.warn(
    '⚠️  coverage/lcov.info not found; skipping access control coverage enforcement.'
  );
  process.exit(0);
}

const thresholdRaw =
  process.env.ACCESS_CONTROL_COVERAGE_MIN || process.env.COVERAGE_MIN || '90';
const threshold = Number(thresholdRaw);
if (!Number.isFinite(threshold) || threshold < 0) {
  console.error(`Invalid coverage threshold: ${thresholdRaw}`);
  process.exit(1);
}

const stats = new Map(
  configuredPaths.map((p) => [p, { covered: 0, total: 0 }])
);

const lcov = fs.readFileSync(coverageFile, 'utf8');
let current = null;

const flushCurrent = () => {
  if (!current) {
    return;
  }
  let { file, total, covered, lf, lh, hadLineData } = current;
  if (!hadLineData && Number.isFinite(lf) && Number.isFinite(lh)) {
    total = lf;
    covered = lh;
  }
  if (!Number.isFinite(total) || total <= 0) {
    current = null;
    return;
  }

  for (const [target, bucket] of stats) {
    if (file.includes(target)) {
      bucket.total += total;
      bucket.covered += covered;
    }
  }

  current = null;
};

for (const line of lcov.split(/\r?\n/)) {
  if (line.startsWith('SF:')) {
    flushCurrent();
    current = {
      file: line.slice(3).trim().replace(/\\/g, '/'),
      total: 0,
      covered: 0,
      lf: Number.NaN,
      lh: Number.NaN,
      hadLineData: false,
    };
    continue;
  }
  if (!current) {
    continue;
  }

  if (line.startsWith('DA:')) {
    const parts = line.slice(3).split(',');
    if (parts.length >= 2) {
      const hitCount = Number(parts[1]);
      if (Number.isFinite(hitCount)) {
        current.total += 1;
        if (hitCount > 0) {
          current.covered += 1;
        }
        current.hadLineData = true;
      }
    }
    continue;
  }

  if (line.startsWith('LF:')) {
    const value = Number(line.slice(3));
    if (Number.isFinite(value)) {
      current.lf = value;
    }
    continue;
  }

  if (line.startsWith('LH:')) {
    const value = Number(line.slice(3));
    if (Number.isFinite(value)) {
      current.lh = value;
    }
    continue;
  }

  if (line === 'end_of_record') {
    flushCurrent();
  }
}

flushCurrent();

const failures = [];
for (const [target, bucket] of stats) {
  if (bucket.total === 0) {
    failures.push(`No coverage data found for ${target}.`);
    continue;
  }
  const pct = (bucket.covered / bucket.total) * 100;
  if (pct + 1e-9 < threshold) {
    failures.push(`Coverage ${pct.toFixed(2)}% < ${threshold}% for ${target}.`);
  } else {
    console.log(
      `✔ ${target}: ${pct.toFixed(2)}% lines covered (min ${threshold}%).`
    );
  }
}

if (failures.length > 0) {
  console.error('Access control coverage check failed:');
  for (const failure of failures) {
    console.error(` - ${failure}`);
  }
  process.exit(1);
}

console.log(`Access control coverage OK (threshold ${threshold}%).`);
