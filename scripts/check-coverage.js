#!/usr/bin/env node
/* eslint-disable */
const fs = require('fs'), p = 'coverage/lcov.info';
const min = Number(process.argv[2] || process.env.COVERAGE_MIN || 90);
if (!fs.existsSync(p)) {
  console.error('❌ coverage/lcov.info not found; did coverage generation run?');
  process.exit(1);
}
const txt = fs.readFileSync(p, 'utf8').trim();
if (!txt) {
  console.error('❌ coverage report is empty; run npm run coverage before enforcing thresholds.');
  process.exit(1);
}
let totalFound = 0,
  totalHit = 0,
  blockFound = 0,
  blockHit = 0,
  seenBlock = false;
for (const ln of txt.split(/\r?\n/)) {
  if (ln.startsWith('LF:')) {
    blockFound = Number(ln.slice(3));
    if (!Number.isFinite(blockFound)) blockFound = 0;
    continue;
  }
  if (ln.startsWith('LH:')) {
    blockHit = Number(ln.slice(3));
    if (!Number.isFinite(blockHit)) blockHit = 0;
    continue;
  }
  if (ln.startsWith('DA:')) {
    const parts = ln.slice(3).split(',');
    if (parts.length >= 2) {
      const hit = Number(parts[1]);
      if (Number.isFinite(hit)) {
        totalFound += 1;
        if (hit > 0) totalHit += 1;
        seenBlock = true;
      }
    }
    continue;
  }
  if (ln === 'end_of_record') {
    if (!seenBlock && blockFound > 0) {
      totalFound += blockFound;
      totalHit += blockHit;
    }
    blockFound = 0;
    blockHit = 0;
    seenBlock = false;
  }
}
if (totalFound === 0) {
  console.error('❌ coverage report contains no executable lines; refusing to skip threshold enforcement.');
  process.exit(1);
}
const pct = (totalHit / totalFound) * 100;
console.log(`Coverage: ${pct.toFixed(2)}% (min=${min}%)`);
if (pct + 1e-9 < min) process.exit(1);
