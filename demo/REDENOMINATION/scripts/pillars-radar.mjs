#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const COLOR = {
  reset: '\u001b[0m',
  bright: '\u001b[1m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  magenta: '\u001b[35m',
  red: '\u001b[31m',
  gray: '\u001b[90m'
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const demoRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`${COLOR.red}${COLOR.bright}[FATAL]${COLOR.reset} Unable to parse ${label} (${filePath})`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const scenarioPath = path.join(demoRoot, 'scenario.json');
const packageJsonPath = path.join(repoRoot, 'package.json');

const scenario = readJson(scenarioPath, 'scenario.json');
const packageJson = readJson(packageJsonPath, 'package.json');

const packageScripts = packageJson.scripts ?? {};

function logHeader() {
  const title = 'REDENOMINATION Pillar Readiness Scan';
  const line = '═'.repeat(Math.max(40, title.length + 12));
  console.log(`${COLOR.cyan}${line}${COLOR.reset}`);
  console.log(`${COLOR.cyan}${COLOR.bright}  🎖️  ${title}  🎖️${COLOR.reset}`);
  console.log(`${COLOR.cyan}${line}${COLOR.reset}\n`);
  console.log(
    `${COLOR.gray}Triangulating governed autonomy, verifiable compute, observability, and operational empowerment artefacts.${COLOR.reset}\n`
  );
}

function ensureArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
}

function checkFiles(label, items) {
  const results = [];
  for (const relPath of ensureArray(items)) {
    const resolved = path.isAbsolute(relPath) ? relPath : path.join(repoRoot, relPath);
    const ok = existsSync(resolved);
    results.push({
      label,
      item: relPath,
      status: ok ? 'pass' : 'fail',
      message: ok ? 'available' : 'missing'
    });
  }
  return results;
}

function checkScripts(items) {
  const results = [];
  for (const command of ensureArray(items)) {
    const match = /^npm run ([^\s]+)/.exec(command);
    if (!match) {
      results.push({ label: 'script', item: command, status: 'warn', message: 'non-npm command (manual review)' });
      continue;
    }
    const scriptName = match[1];
    const ok = Object.prototype.hasOwnProperty.call(packageScripts, scriptName);
    results.push({ label: 'script', item: command, status: ok ? 'pass' : 'fail', message: ok ? 'registered' : 'missing' });
  }
  return results;
}

function summarise(results) {
  const pass = results.filter((entry) => entry.status === 'pass').length;
  const warn = results.filter((entry) => entry.status === 'warn').length;
  const fail = results.filter((entry) => entry.status === 'fail').length;
  return { pass, warn, fail, total: results.length };
}

function formatStatus(status, item, message) {
  if (status === 'pass') {
    return `${COLOR.green}${COLOR.bright}✓${COLOR.reset} ${item} ${COLOR.gray}(${message})${COLOR.reset}`;
  }
  if (status === 'warn') {
    return `${COLOR.yellow}${COLOR.bright}!${COLOR.reset} ${item} ${COLOR.gray}(${message})${COLOR.reset}`;
  }
  return `${COLOR.red}${COLOR.bright}✗${COLOR.reset} ${item} ${COLOR.gray}(${message})${COLOR.reset}`;
}

function overallBadge(summary) {
  if (summary.fail === 0 && summary.warn === 0) {
    return `${COLOR.green}${COLOR.bright}READY${COLOR.reset}`;
  }
  if (summary.fail === 0) {
    return `${COLOR.yellow}${COLOR.bright}ACTIONABLE${COLOR.reset}`;
  }
  return `${COLOR.red}${COLOR.bright}BLOCKED${COLOR.reset}`;
}

function analysePillar(pillar) {
  const evidence = pillar.evidence ?? {};
  const results = [
    ...checkFiles('doc', evidence.docs),
    ...checkScripts(evidence.scripts),
    ...checkFiles('config', evidence.configs),
    ...checkFiles('dashboard', evidence.dashboards)
  ];
  const summary = summarise(results);
  console.log(`${COLOR.magenta}${COLOR.bright}${pillar.title}${COLOR.reset}`);
  console.log(`${COLOR.gray}${pillar.outcome}${COLOR.reset}`);
  console.log(`${COLOR.cyan}Status:${COLOR.reset} ${overallBadge(summary)} — ${summary.pass}/${summary.total} confirmed, ${summary.warn} warning(s), ${summary.fail} gap(s)`);
  if (results.length === 0) {
    console.log(`${COLOR.yellow}${COLOR.bright}!${COLOR.reset} No evidence declared — update scenario.json to map artefacts.`);
  }
  results.forEach((entry) => {
    console.log(`  ${formatStatus(entry.status, entry.item, entry.message)}`);
  });
  console.log();
  return summary;
}

function aggregateSummaries(summaries) {
  return summaries.reduce(
    (acc, current) => ({
      pass: acc.pass + current.pass,
      warn: acc.warn + current.warn,
      fail: acc.fail + current.fail,
      total: acc.total + current.total
    }),
    { pass: 0, warn: 0, fail: 0, total: 0 }
  );
}

function main() {
  if (!Array.isArray(scenario.pillars) || scenario.pillars.length === 0) {
    console.error(
      `${COLOR.red}${COLOR.bright}[FATAL]${COLOR.reset} Scenario is missing pillar definitions. Run npm run demo:redenomination:verify.`,
    );
    process.exit(1);
  }

  logHeader();
  const pillarSummaries = scenario.pillars.map(analysePillar);
  const aggregate = aggregateSummaries(pillarSummaries);
  console.log(`${COLOR.cyan}${'─'.repeat(60)}${COLOR.reset}`);
  console.log(
    `${COLOR.bright}${COLOR.cyan}Global readiness:${COLOR.reset} ${overallBadge(aggregate)} — ${aggregate.pass}/${aggregate.total} artefacts confirmed, ${aggregate.warn} warning(s), ${aggregate.fail} gap(s)`
  );
  if (aggregate.fail === 0) {
    console.log(
      `${COLOR.green}Every pillar has verifiable artefacts. Proceed to npm run demo:redenomination:mission-control for rehearsals.${COLOR.reset}`,
    );
  } else {
    console.log(
      `${COLOR.red}Resolve missing artefacts before mainnet activation. Update scenario.json once gaps are closed.${COLOR.reset}`,
    );
  }
}

main();
