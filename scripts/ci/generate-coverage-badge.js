#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const [,, lcovPathArg, outPathArg] = process.argv;
const lcovPath = path.resolve(lcovPathArg || 'coverage/lcov.info');
const outPath = path.resolve(outPathArg || 'coverage/badge.json');

if (!fs.existsSync(lcovPath)) {
  console.error(`Coverage file not found: ${lcovPath}`);
  process.exit(1);
}

const lcovData = fs.readFileSync(lcovPath, 'utf8');
let found = 0;
let hit = 0;
for (const line of lcovData.split('\n')) {
  if (line.startsWith('DA:')) {
    const [, count] = line.substring(3).split(',');
    found += 1;
    if (Number(count) > 0) {
      hit += 1;
    }
  }
}

const percentage = found === 0 ? 0 : (hit / found) * 100;

function coverageColor(pct) {
  if (pct >= 95) return 'brightgreen';
  if (pct >= 90) return 'green';
  if (pct >= 80) return 'yellowgreen';
  if (pct >= 70) return 'yellow';
  if (pct >= 60) return 'orange';
  return 'red';
}

const badge = {
  schemaVersion: 1,
  label: 'contracts coverage',
  message: `${percentage.toFixed(2)}%`,
  color: coverageColor(percentage),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(badge, null, 2));
console.log(`Coverage badge written to ${outPath}`);
