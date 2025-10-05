#!/usr/bin/env node

const { existsSync, readFileSync } = require('fs');
const { resolve } = require('path');

const COVERAGE_FILE = resolve(process.cwd(), 'coverage', 'lcov.info');
const min = Number(process.argv[2] || process.env.COVERAGE_MIN || 90);

if (!Number.isFinite(min) || min <= 0) {
  console.error(`Invalid coverage threshold: "${min}".`);
  process.exit(1);
}

if (!existsSync(COVERAGE_FILE)) {
  console.error(`Coverage artefact missing at ${COVERAGE_FILE}. Run "npm run coverage" first.`);
  process.exit(1);
}

const content = readFileSync(COVERAGE_FILE, 'utf8');
if (!content.trim()) {
  console.error(`Coverage artefact at ${COVERAGE_FILE} is empty.`);
  process.exit(1);
}

let coveredLines = 0;
let totalLines = 0;

for (const line of content.split(/\r?\n/)) {
  if (!line.startsWith('DA:')) continue;

  const [, data] = line.split(':');
  const [lineNumber, hits] = data.split(',');

  if (!lineNumber || hits === undefined) {
    console.error(`Malformed DA entry in lcov: "${line}".`);
    process.exit(1);
  }

  totalLines += 1;
  if (Number(hits) > 0) {
    coveredLines += 1;
  }
}

if (!totalLines) {
  console.error(`No executable line data found in ${COVERAGE_FILE}.`);
  process.exit(1);
}

const coverage = (coveredLines / totalLines) * 100;
const rounded = coverage.toFixed(2);
const statusMessage = `Coverage: ${rounded}% (min=${min}%)`;
console.log(statusMessage);

if (coverage + 1e-9 < min) {
  console.error(`Coverage threshold not met. ${statusMessage}`);
  process.exit(1);
}
