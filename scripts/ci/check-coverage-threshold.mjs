import fs from 'fs';

const threshold = parseInt(process.argv[2] || '90', 10);
if (Number.isNaN(threshold)) {
  console.error(`Invalid threshold value: ${process.argv[2]}`);
  process.exit(1);
}

const summaryPath = new URL(
  '../../coverage/coverage-summary.json',
  import.meta.url
);
let summary;
try {
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
} catch (err) {
  console.error(
    'Unable to read coverage summary at coverage/coverage-summary.json'
  );
  console.error(err.message);
  process.exit(1);
}

const linesPct = summary?.total?.lines?.pct;
if (typeof linesPct !== 'number') {
  console.error('Coverage summary missing total lines percentage.');
  process.exit(1);
}

if (linesPct < threshold) {
  console.error(`Coverage ${linesPct}% < ${threshold}% minimum.`);
  process.exit(1);
}

console.log(`Coverage OK: ${linesPct}% >= ${threshold}%`);
