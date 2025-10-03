#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const COVERAGE_PATH = path.resolve(process.env.LCOV_FILE || 'coverage/lcov.info');
const pathsArg = process.env.ACCESS_CONTROL_PATHS || '';

if (!pathsArg.trim()) {
  console.log('No access control paths configured; skipping dedicated coverage gate.');
  process.exit(0);
}

if (!fs.existsSync(COVERAGE_PATH)) {
  console.error(`Coverage file not found: ${COVERAGE_PATH}`);
  process.exit(1);
}

const requiredPrefixes = pathsArg
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => entry.replace(/\\/g, '/').replace(/\/$/, ''));

if (!requiredPrefixes.length) {
  console.log('Access control path list resolved to empty set; skipping.');
  process.exit(0);
}

const lcovRaw = fs.readFileSync(COVERAGE_PATH, 'utf8');

const records = [];
let current = null;
for (const line of lcovRaw.split('\n')) {
  if (line.startsWith('SF:')) {
    if (current) {
      records.push(current);
    }
    const filePath = line.substring(3).trim();
    current = { file: filePath, lines: [] };
    continue;
  }
  if (!current) {
    continue;
  }
  if (line.startsWith('DA:')) {
    const [lineNumber, hits] = line.substring(3).split(',');
    current.lines.push({
      line: Number(lineNumber),
      hits: Number(hits),
    });
    continue;
  }
  if (line.startsWith('end_of_record')) {
    records.push(current);
    current = null;
  }
}
if (current) {
  records.push(current);
}

const failures = [];
const observed = new Map();

for (const record of records) {
  const absolute = path.resolve(record.file);
  const relative = path.relative(process.cwd(), absolute).replace(/\\/g, '/');
  const hits = record.lines.filter((entry) => entry.hits > 0).length;
  const total = record.lines.length;
  const pct = total === 0 ? 100 : (hits / total) * 100;

  for (const prefix of requiredPrefixes) {
    if (relative.startsWith(prefix)) {
      const entry = observed.get(prefix) || [];
      entry.push({ file: relative, coverage: pct });
      observed.set(prefix, entry);
      if (pct < 100 - 1e-9) {
        failures.push({ prefix, file: relative, coverage: pct });
      }
    }
  }
}

let missing = false;
for (const prefix of requiredPrefixes) {
  if (!observed.has(prefix)) {
    console.error(`No coverage data found for access control path: ${prefix}`);
    missing = true;
  }
}

if (failures.length) {
  console.error('Access control coverage violations detected:');
  for (const failure of failures) {
    console.error(`  ${failure.file}: ${failure.coverage.toFixed(2)}% (required: 100%)`);
  }
}

if (failures.length || missing) {
  process.exit(1);
}

for (const [prefix, files] of observed.entries()) {
  console.log(`Access control coverage OK for ${prefix}`);
  for (const file of files) {
    console.log(`  ${file.file}: ${file.coverage.toFixed(2)}%`);
  }
}
