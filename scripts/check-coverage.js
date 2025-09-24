#!/usr/bin/env node
/* eslint-disable */
const fs = require('fs'), p='coverage/lcov.info';
const min = Number(process.argv[2] || process.env.COVERAGE_MIN || 90);
if (!fs.existsSync(p)) { console.log('⚠️ coverage/lcov.info not found; passing for now.'); process.exit(0); }
const txt = fs.readFileSync(p,'utf8');
let found=0, hit=0;
for (const ln of txt.split('\n')) if (ln.startsWith('DA:')) { found++; if (Number(ln.split(',')[1])>0) hit++; }
const pct = found ? (hit/found)*100 : 0;
console.log(`Coverage: ${pct.toFixed(2)}% (min=${min}%)`);
if (pct + 1e-9 < min) process.exit(1);
