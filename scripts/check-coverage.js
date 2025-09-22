#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const COVERAGE_DIR = path.resolve(__dirname, '..', 'coverage');
const SUMMARY_PATH = path.join(COVERAGE_DIR, 'coverage-summary.json');
const CONFIG_PATH = path.resolve(__dirname, '..', 'config', 'coverage-thresholds.json');

function loadJson(filePath) {
  const contents = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(contents);
  } catch (err) {
    const error = new Error(`Failed to parse JSON from ${filePath}: ${err.message}`);
    error.cause = err;
    throw error;
  }
}

function resolveThresholds() {
  const envOverrides = {
    statements: process.env.COVERAGE_MIN_STATEMENTS,
    branches: process.env.COVERAGE_MIN_BRANCHES,
    functions: process.env.COVERAGE_MIN_FUNCTIONS,
    lines: process.env.COVERAGE_MIN_LINES,
  };

  const defaults = {
    statements: 90,
    branches: 80,
    functions: 90,
    lines: 90,
  };

  let thresholds = { ...defaults };

  if (fs.existsSync(CONFIG_PATH)) {
    const config = loadJson(CONFIG_PATH);
    thresholds = { ...thresholds, ...config };
  }

  for (const [metric, value] of Object.entries(envOverrides)) {
    if (value !== undefined && value !== '') {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        throw new Error(`Environment override ${metric} must be numeric; received "${value}"`);
      }
      thresholds[metric] = parsed;
    }
  }

  return thresholds;
}

function validateSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    throw new Error('Coverage summary JSON is malformed or empty.');
  }

  if (!('total' in summary) || typeof summary.total !== 'object') {
    throw new Error('Coverage summary JSON does not include aggregate totals.');
  }
}

function ensureReportsExist() {
  if (!fs.existsSync(COVERAGE_DIR)) {
    throw new Error(
      'Coverage artifacts not found. Run "npm run coverage:report" before executing coverage checks.'
    );
  }

  if (!fs.existsSync(SUMMARY_PATH)) {
    throw new Error(
      'coverage-summary.json is missing. Ensure solidity-coverage completed successfully.'
    );
  }
}

function main() {
  ensureReportsExist();
  const summary = loadJson(SUMMARY_PATH);
  validateSummary(summary);
  const thresholds = resolveThresholds();

  const totals = summary.total;
  const failures = [];

  for (const [metric, minimum] of Object.entries(thresholds)) {
    const totalEntry = totals[metric];
    if (!totalEntry || typeof totalEntry.pct !== 'number') {
      failures.push(`Coverage summary missing ${metric} percentage.`);
      continue;
    }

    if (totalEntry.pct < minimum) {
      failures.push(
        `${metric} coverage ${totalEntry.pct.toFixed(2)}% fell below required ${minimum}%`
      );
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`✖ ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('✓ Coverage thresholds satisfied.');
  for (const metric of Object.keys(thresholds)) {
    const pct = totals[metric]?.pct;
    if (typeof pct === 'number') {
      console.log(`  ${metric.padEnd(10)} ${pct.toFixed(2)}% (minimum ${thresholds[metric]}%)`);
    }
  }
}

try {
  main();
} catch (err) {
  console.error(err.message);
  if (err.cause) {
    console.error(err.cause);
  }
  process.exit(1);
}
