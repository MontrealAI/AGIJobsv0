#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error(
    'Usage: node validate-slither.mjs <sarif-file> <allowlist-file>'
  );
  process.exit(1);
}

if (process.argv.length < 4) {
  usage();
}

const [sarifPath, allowlistPath] = process.argv.slice(2, 4);

function readJson(filePath) {
  const resolved = path.resolve(filePath);
  try {
    const data = fs.readFileSync(resolved, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to read JSON from ${resolved}:`, error.message);
    process.exit(2);
  }
}

const sarif = readJson(sarifPath);
const allowlistData = readJson(allowlistPath);
if (
  !Array.isArray(allowlistData) ||
  allowlistData.some(
    (entry) =>
      !entry ||
      ['ruleId', 'relativeUri', 'messageContains'].some(
        (key) => typeof entry[key] !== 'string' || !entry[key].trim()
      )
  )
) {
  console.error(
    'Slither allowlist must contain narrowly scoped rule, file, and message entries.'
  );
  process.exit(2);
}
const allowlist = allowlistData;

const normalizedAllowlist = allowlist.map((entry) => ({
  ruleId: entry.ruleId ?? null,
  relativeUri: entry.relativeUri ?? null,
  messageContains: entry.messageContains ?? null,
}));

function isAllowed(result, rule) {
  const ruleId = result.ruleId || result?.rule?.id || '';
  const locations = result.locations || [];
  const message = result?.message?.text || '';
  const uri =
    locations.length > 0
      ? locations[0]?.physicalLocation?.artifactLocation?.uri || ''
      : '';
  return normalizedAllowlist.some((entry) => {
    // Slither SARIF IDs include impact/confidence prefixes; the rule name is
    // the stable detector identifier used in the reviewed allowlist.
    if (entry.ruleId !== ruleId && entry.ruleId !== rule?.name) {
      return false;
    }
    if (entry.relativeUri && !uri.endsWith(entry.relativeUri)) {
      return false;
    }
    if (entry.messageContains && !message.includes(entry.messageContains)) {
      return false;
    }
    return true;
  });
}

function formatResult(result) {
  const ruleId = result.ruleId || result?.rule?.id || 'unknown-rule';
  const message = result?.message?.text || 'no message';
  const locations = result.locations || [];
  const primary = locations[0] || {};
  const uri =
    primary?.physicalLocation?.artifactLocation?.uri || 'unknown-file';
  const startLine =
    primary?.physicalLocation?.region?.startLine || 'unknown-line';
  return `${ruleId} :: ${uri}:${startLine} :: ${message}`;
}

if (!Array.isArray(sarif?.runs) || sarif.runs.length === 0) {
  console.error('Slither SARIF must contain at least one analysis run.');
  process.exit(2);
}
const runs = sarif.runs;
const offending = [];
let reviewed = 0;

for (const run of runs) {
  if (!Array.isArray(run?.results)) {
    console.error('Slither SARIF run is missing its results array.');
    process.exit(2);
  }
  const rules = run.tool?.driver?.rules || [];
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  for (const result of run.results) {
    const rule =
      byId.get(result.ruleId || result.rule?.id) ||
      rules[result.ruleIndex ?? result.rule?.index];
    const level =
      result.level ||
      result?.properties?.severity ||
      rule?.defaultConfiguration?.level ||
      '';
    const normalizedLevel =
      typeof level === 'string' ? level.toLowerCase() : '';
    // Slither 0.10.4 emits level=warning even for high-impact detectors.
    // Read the actual security severity from SARIF rule metadata as well.
    const rawSeverity =
      result.properties?.['security-severity'] ??
      rule?.properties?.['security-severity'];
    const severity =
      rawSeverity === undefined ? undefined : Number(rawSeverity);
    if (
      rawSeverity !== undefined &&
      (String(rawSeverity).trim() === '' ||
        !Number.isFinite(severity) ||
        severity < 0 ||
        severity > 10)
    ) {
      console.error(
        `Invalid SARIF security severity for ${
          result.ruleId || 'unknown rule'
        }.`
      );
      process.exit(2);
    }
    if (!normalizedLevel && severity === undefined) {
      console.error('Slither SARIF finding is missing severity information.');
      process.exit(2);
    }
    if (
      !['error', 'high', 'critical'].includes(normalizedLevel) &&
      !(severity >= 7)
    ) {
      continue;
    }
    if (isAllowed(result, rule)) {
      reviewed += 1;
      continue;
    }
    offending.push(result);
  }
}

if (offending.length > 0) {
  console.error('Slither reported unapproved high-severity findings:');
  for (const result of offending) {
    console.error(`  - ${formatResult(result)}`);
  }
  console.error(`Total unapproved findings: ${offending.length}`);
  process.exit(3);
}

console.log(
  `Slither: no unapproved high-severity findings (${reviewed} match reviewed exceptions).`
);
