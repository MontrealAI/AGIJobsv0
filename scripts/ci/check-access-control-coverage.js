#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const coverageFile = process.argv[2] || 'coverage/lcov.info';
if (!fs.existsSync(coverageFile)) {
  console.error(`Coverage file not found: ${coverageFile}`);
  process.exit(1);
}

const rawTargets = process.env.ACCESS_CONTROL_PATHS || '';
const targets = rawTargets
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => entry.replace(/\\/g, '/'));

if (targets.length === 0) {
  console.error('ACCESS_CONTROL_PATHS environment variable is required.');
  process.exit(1);
}

const normalise = (inputPath) => inputPath.replace(/\\/g, '/');

const coverageText = fs.readFileSync(coverageFile, 'utf8');
const records = coverageText.split('end_of_record');

const uncovered = [];
let matchedFiles = 0;

for (const record of records) {
  const lines = record
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    continue;
  }

  const sourceLine = lines.find((line) => line.startsWith('SF:'));
  if (!sourceLine) {
    continue;
  }

  const sourcePath = sourceLine.slice(3);
  const relativePath = normalise(path.relative(process.cwd(), sourcePath));

  const target = targets.find((targetPath) => {
    if (targetPath.endsWith('/')) {
      return relativePath.startsWith(targetPath);
    }
    return relativePath === targetPath || relativePath.startsWith(`${targetPath}/`);
  });

  if (!target) {
    continue;
  }

  matchedFiles += 1;

  for (const line of lines) {
    if (!line.startsWith('DA:')) {
      continue;
    }
    const [, data] = line.split(':');
    const [lineNumberRaw, hitsRaw] = data.split(',');
    const hits = Number(hitsRaw);
    if (Number.isNaN(hits)) {
      continue;
    }
    if (hits <= 0) {
      const lineNumber = Number(lineNumberRaw);
      uncovered.push({
        file: relativePath,
        line: lineNumber,
      });
    }
  }
}

if (matchedFiles === 0) {
  console.error(
    `No coverage data matched the specified access control paths (${targets.join(', ')}).`
  );
  process.exit(1);
}

if (uncovered.length > 0) {
  console.error('Access control paths must have 100% line coverage. The following lines are uncovered:');
  for (const { file, line } of uncovered) {
    console.error(` - ${file}:${line}`);
  }
  process.exit(1);
}

console.log('Access control coverage check passed (100% coverage).');
