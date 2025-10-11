#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error('Usage: node validate-slither.mjs <sarif-file> <allowlist-file>');
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
const allowlist = Array.isArray(allowlistData) ? allowlistData : [];

const normalizedAllowlist = allowlist.map((entry) => ({
  ruleId: entry.ruleId ?? null,
  relativeUri: entry.relativeUri ?? null,
  messageContains: entry.messageContains ?? null,
}));

function isAllowed(result) {
  const ruleId = result.ruleId || result?.rule?.id || '';
  const locations = result.locations || [];
  const message = result?.message?.text || '';
  const uri = locations.length > 0
    ? locations[0]?.physicalLocation?.artifactLocation?.uri || ''
    : '';
  return normalizedAllowlist.some((entry) => {
    if (entry.ruleId && entry.ruleId !== ruleId) {
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
  const uri = primary?.physicalLocation?.artifactLocation?.uri || 'unknown-file';
  const startLine = primary?.physicalLocation?.region?.startLine || 'unknown-line';
  return `${ruleId} :: ${uri}:${startLine} :: ${message}`;
}

const runs = Array.isArray(sarif?.runs) ? sarif.runs : [];
const offending = [];

for (const run of runs) {
  const results = Array.isArray(run?.results) ? run.results : [];
  for (const result of results) {
    const level = result.level || result?.properties?.severity || '';
    const normalizedLevel = typeof level === 'string' ? level.toLowerCase() : '';
    if (normalizedLevel !== 'error' && normalizedLevel !== 'high') {
      continue;
    }
    if (isAllowed(result)) {
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

console.log('Slither high-severity findings are either absent or approved.');
