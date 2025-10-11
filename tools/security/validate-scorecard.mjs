#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'process';

function loadScorecard(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Scorecard results not found at ${resolvedPath}`);
  }
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse Scorecard JSON: ${error.message}`);
  }
}

function formatStatus(passed) {
  return passed ? '✅' : '❌';
}

function appendSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

function main() {
  const [, , inputFile = 'reports/security/scorecard.json'] = process.argv;
  const data = loadScorecard(inputFile);

  if (!data || typeof data !== 'object') {
    throw new Error('Scorecard payload is empty.');
  }

  const overallScore = Number.isFinite(Number(data.score)) ? Number(data.score) : NaN;
  const thresholds = [
    { name: 'Binary-Artifacts', minimum: 8 },
    { name: 'Code-Review', minimum: 8 },
    { name: 'Maintained', minimum: 8 },
    { name: 'Signed-Releases', minimum: 8 },
    { name: 'Token-Permissions', minimum: 7 },
    { name: 'Vulnerabilities', minimum: 7 },
    { name: 'Dependency-Update-Tool', minimum: 7 },
    { name: 'Security-Policy', minimum: 7 },
  ];

  const checks = Array.isArray(data.checks) ? data.checks : [];
  const checkMap = new Map(checks.map((entry) => [entry.name, entry]));

  const summaryLines = [
    '## OpenSSF Scorecard policy results',
    '',
    '| Check | Score | Threshold | Status |',
    '| --- | --- | --- | --- |',
  ];
  const failures = [];

  for (const { name, minimum } of thresholds) {
    const details = checkMap.get(name);
    const score = details && Number.isFinite(Number(details.score)) ? Number(details.score) : NaN;
    const passed = Number.isFinite(score) && score >= minimum;
    summaryLines.push(`| ${name} | ${Number.isFinite(score) ? score.toFixed(1) : 'n/a'} | ${minimum.toFixed(1)} | ${formatStatus(passed)} |`);
    if (!passed) {
      failures.push(`Scorecard check "${name}" scored ${Number.isFinite(score) ? score.toFixed(1) : 'n/a'}, below minimum ${minimum.toFixed(1)}.`);
    }
  }

  if (!Number.isFinite(overallScore)) {
    failures.push('Overall Scorecard score is missing or invalid.');
  } else {
    summaryLines.push(`| Overall | ${overallScore.toFixed(1)} | 8.0 | ${formatStatus(overallScore >= 8)} |`);
    if (overallScore < 8) {
      failures.push(`Overall Scorecard score ${overallScore.toFixed(1)} fell below minimum 8.0.`);
    }
  }

  if (checkMap.size === 0) {
    failures.push('Scorecard report did not include any individual checks.');
  }

  appendSummary(summaryLines);

  if (failures.length > 0) {
    const message = failures.join('\n');
    console.error(message);
    process.exit(1);
  }

  console.log('Scorecard policy checks passed.');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
