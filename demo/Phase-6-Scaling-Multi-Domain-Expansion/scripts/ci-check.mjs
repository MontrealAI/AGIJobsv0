#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const root = join(__dirname, '..');
const configPath = join(root, 'config', 'domains.phase6.json');
const abiPath = join(__dirname, '..', '..', '..', 'subgraph', 'abis', 'Phase6ExpansionManager.json');
const htmlPath = join(root, 'index.html');

function fail(message) {
  console.error(`\x1b[31m✖ ${message}\x1b[0m`);
  process.exit(1);
}

if (!existsSync(configPath)) {
  fail(`Config file missing: ${configPath}`);
}
if (!existsSync(abiPath)) {
  fail(`ABI file missing: ${abiPath}`);
}
if (!existsSync(htmlPath)) {
  fail(`UI file missing: ${htmlPath}`);
}

const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const abi = JSON.parse(readFileSync(abiPath, 'utf-8'));
const html = readFileSync(htmlPath, 'utf-8');

if (!Array.isArray(abi) || !abi.length) {
  fail('ABI file is empty or invalid.');
}

if (!config.global || !config.global.manifestURI) {
  fail('Global manifestURI must be defined.');
}

if (!Array.isArray(config.domains) || config.domains.length === 0) {
  fail('At least one domain must be configured.');
}

const seen = new Set();
const addressPattern = /^0x[0-9a-fA-F]{40}$/;

config.domains.forEach((domain, idx) => {
  const context = `domain[${idx}] (${domain.slug})`;
  if (!domain.slug || typeof domain.slug !== 'string') {
    fail(`${context}: slug is required.`);
  }
  if (seen.has(domain.slug.toLowerCase())) {
    fail(`${context}: slug is duplicated.`);
  }
  seen.add(domain.slug.toLowerCase());
  ['name', 'manifestURI', 'subgraph'].forEach((key) => {
    if (!domain[key] || typeof domain[key] !== 'string') {
      fail(`${context}: ${key} must be a non-empty string.`);
    }
  });
  ['validationModule', 'oracle', 'l2Gateway', 'executionRouter'].forEach((key) => {
    const value = domain[key];
    if (value && !addressPattern.test(value)) {
      fail(`${context}: ${key} must be a 0x-prefixed address when provided.`);
    }
  });
  if (typeof domain.heartbeatSeconds !== 'number' || domain.heartbeatSeconds < 30) {
    fail(`${context}: heartbeatSeconds must be >= 30 seconds.`);
  }
  if (!Array.isArray(domain.skillTags) || domain.skillTags.length === 0) {
    fail(`${context}: skillTags must include at least one entry.`);
  }
  const metadata = domain.metadata;
  if (!metadata || typeof metadata !== 'object') {
    fail(`${context}: metadata object is required.`);
  }
  ['domain', 'l2', 'sentinel', 'uptime'].forEach((key) => {
    if (!metadata[key] || typeof metadata[key] !== 'string') {
      fail(`${context}: metadata.${key} must be a non-empty string.`);
    }
  });
  const resilienceIndex = Number.parseFloat(metadata.resilienceIndex);
  if (!Number.isFinite(resilienceIndex) || resilienceIndex <= 0 || resilienceIndex > 1) {
    fail(`${context}: metadata.resilienceIndex must be a number between 0 and 1.`);
  }
  const valueFlow = metadata.valueFlowMonthlyUSD;
  if (typeof valueFlow !== 'number' || !Number.isFinite(valueFlow) || valueFlow < 0) {
    fail(`${context}: metadata.valueFlowMonthlyUSD must be a positive number.`);
  }
  if (metadata.valueFlowDisplay && typeof metadata.valueFlowDisplay !== 'string') {
    fail(`${context}: metadata.valueFlowDisplay must be a string when provided.`);
  }
});

if (!html.includes('mermaid')) {
  fail('index.html must embed a mermaid diagram.');
}

console.log('\x1b[32mPhase 6 demo configuration validated successfully.\x1b[0m');
console.log(`• Config domains: ${config.domains.length}`);
console.log(`• Global manifest: ${config.global.manifestURI}`);
