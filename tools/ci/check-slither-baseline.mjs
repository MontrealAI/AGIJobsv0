#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { exit } from 'node:process';

const sarifPath = process.argv[2] ?? 'reports/security/slither.sarif';
const baselinePath = process.argv[3] ?? 'reports/security/slither-baseline.json';

function readJson(path) {
  try {
    const data = readFileSync(path, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to read JSON from ${path}:`, error);
    exit(1);
  }
}

function normaliseText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim();
}

function buildKey(entry) {
  if (entry?.fingerprint) {
    return `fp:${entry.fingerprint}`;
  }
  const { ruleId = '', uri = '', startLine = 0, message = '' } = entry ?? {};
  return `legacy:${[ruleId, uri, startLine, normaliseText(message)].join('|')}`;
}

function extractResults(sarif) {
  const runs = Array.isArray(sarif?.runs) ? sarif.runs : [];
  const results = [];
  for (const run of runs) {
    if (!Array.isArray(run?.results)) continue;
    for (const result of run.results) {
      const loc = Array.isArray(result?.locations) ? result.locations[0] : undefined;
      const physical = loc?.physicalLocation ?? {};
      const artifact = physical.artifactLocation ?? {};
      const region = physical.region ?? {};
      const fingerprint =
        result?.partialFingerprints?.id ??
        result?.partialFingerprints?.primaryLocationLineHash ??
        '';
      results.push({
        ruleId: result?.ruleId ?? '',
        message: result?.message?.text ?? '',
        uri: artifact?.uri ?? '',
        startLine: typeof region?.startLine === 'number' ? region.startLine : 0,
        fingerprint: fingerprint || undefined,
      });
    }
  }
  return results;
}

const sarif = readJson(sarifPath);
const baselineEntries = readJson(baselinePath);

if (!Array.isArray(baselineEntries)) {
  console.error(`Baseline at ${baselinePath} is not an array`);
  exit(1);
}

const baselineSet = new Set(baselineEntries.map(buildKey));
const findings = extractResults(sarif);

const newFindings = [];
const keyCounts = new Map();

for (const finding of findings) {
  const key = buildKey(finding);
  keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  if (!baselineSet.has(key)) {
    newFindings.push(finding);
  }
}

const duplicateKeys = [...keyCounts.entries()].filter(([, count]) => count > 1);
if (duplicateKeys.length > 0) {
  console.warn('Detected duplicate findings in SARIF output:');
  for (const [key, count] of duplicateKeys) {
    console.warn(`  ${key} (x${count})`);
  }
}

if (newFindings.length > 0) {
  console.error('New Slither findings detected that are not in the baseline:');
  for (const finding of newFindings) {
    console.error(`  [${finding.ruleId}] ${finding.uri}:${finding.startLine} :: ${normaliseText(finding.message)}`);
  }
  exit(1);
}

console.log(`Slither findings match baseline (${baselineEntries.length} entries).`);
