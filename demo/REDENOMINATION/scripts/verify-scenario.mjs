#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const COLOR = {
  reset: '\u001b[0m',
  bright: '\u001b[1m',
  green: '\u001b[32m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
  magenta: '\u001b[35m'
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const demoRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const scenarioPath = path.join(demoRoot, 'scenario.json');
const packagePath = path.join(repoRoot, 'package.json');
const storyboardPath = path.join(demoRoot, 'index.html');
const uiStoryboardPath = path.join(demoRoot, 'ui', 'index.html');
const exportPath = path.join(demoRoot, 'ui', 'export', 'latest.json');

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`${COLOR.red}${COLOR.bright}✗${COLOR.reset} Failed to parse ${label} (${filePath})`);
    console.error(error);
    process.exit(1);
  }
}

const scenario = readJson(scenarioPath, 'scenario.json');
const packageJson = readJson(packagePath, 'package.json');
const exportData = readJson(exportPath, 'ui/export/latest.json');

const results = [];

function record(status, message) {
  results.push({ status, message });
}

function expect(condition, successMessage, failureMessage) {
  if (condition) {
    record('pass', successMessage);
  } else {
    record('fail', failureMessage);
  }
}

function expectWarn(condition, successMessage, warningMessage) {
  if (condition) {
    record('pass', successMessage);
  } else {
    record('warn', warningMessage);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

expect(isNonEmptyString(scenario.name), 'Scenario name present', 'Scenario name missing or empty');
expect(isNonEmptyString(scenario.description), 'Scenario description present', 'Scenario description missing or empty');

expect(Array.isArray(scenario.actors) && scenario.actors.length >= 3, 'Actors list populated', 'Actors list missing or too small');
if (Array.isArray(scenario.actors)) {
  scenario.actors.forEach((actor, index) => {
    expect(
      isNonEmptyString(actor.role) && isNonEmptyString(actor.label) && isNonEmptyString(actor.goal),
      `Actor ${index + 1} complete`,
      `Actor ${index + 1} missing required fields`
    );
  });
}

const expectedMetrics = [
  'validationCommitteeSize',
  'stakeRequirementAgent',
  'stakeRequirementValidator',
  'auditSampleRate',
  'governanceTimelock'
];

expect(typeof scenario.metrics === 'object' && scenario.metrics !== null, 'Metrics block present', 'Metrics block missing');
if (scenario.metrics) {
  expectedMetrics.forEach((metricKey) => {
    expect(
      metricKey in scenario.metrics && isNonEmptyString(String(scenario.metrics[metricKey])),
      `Metric “${metricKey}” provided`,
      `Metric “${metricKey}” missing or empty`
    );
  });
}

expect(Array.isArray(scenario.flow) && scenario.flow.length > 0, 'Lifecycle phases defined', 'Lifecycle phases missing');
if (Array.isArray(scenario.flow)) {
  scenario.flow.forEach((phase, index) => {
    expect(
      isNonEmptyString(phase.phase),
      `Phase ${index + 1} has a title`,
      `Phase ${index + 1} missing title`
    );
    expect(
      Array.isArray(phase.steps) && phase.steps.every(isNonEmptyString) && phase.steps.length > 0,
      `Phase ${index + 1} steps populated`,
      `Phase ${index + 1} steps missing`
    );
  });
}

expect(
  Array.isArray(scenario.resources?.docs) && scenario.resources.docs.length > 0,
  'Documentation references listed',
  'Documentation references missing'
);
if (Array.isArray(scenario.resources?.docs)) {
  scenario.resources.docs.forEach((docPath) => {
    expect(
      existsSync(path.join(repoRoot, docPath)),
      `Doc available → ${docPath}`,
      `Doc missing → ${docPath}`
    );
  });
}

expect(
  Array.isArray(scenario.resources?.scripts) && scenario.resources.scripts.length > 0,
  'Automation commands listed',
  'Automation commands missing'
);

const packageScripts = packageJson.scripts ?? {};
if (Array.isArray(scenario.resources?.scripts)) {
  scenario.resources.scripts.forEach((command) => {
    const match = /^npm run ([^\s]+)/.exec(command.trim());
    if (match) {
      const scriptName = match[1];
      expect(
        Object.prototype.hasOwnProperty.call(packageScripts, scriptName),
        `Script registered → ${scriptName}`,
        `Missing npm script → ${scriptName}`
      );
    } else {
      expectWarn(false, '', `Unable to verify non-npm command: ${command}`);
    }
  });
}

const storyboard = readFileSync(storyboardPath, 'utf8');
expect(
  storyboard.includes('mermaid') && storyboard.includes('graph TD'),
  'Storyboard contains Mermaid orchestration diagram',
  'Storyboard missing Mermaid orchestration diagram'
);

const uiStoryboard = readFileSync(uiStoryboardPath, 'utf8');
expect(
  uiStoryboard.includes('export/latest.json'),
  'UI control room references generated playbook',
  'UI control room missing playbook reference'
);

expect(
  Array.isArray(exportData.timeline) && exportData.timeline.length > 0,
  'Exported playbook timeline populated',
  'Exported playbook timeline missing or empty'
);

expect(
  Array.isArray(exportData.invariants) && exportData.invariants.length > 0,
  'Exported invariants recorded',
  'Exported invariants missing or empty'
);

const failures = results.filter((entry) => entry.status === 'fail');
const warnings = results.filter((entry) => entry.status === 'warn');
const passes = results.filter((entry) => entry.status === 'pass');

passes.forEach((entry) => {
  console.log(`${COLOR.green}${COLOR.bright}✓${COLOR.reset} ${entry.message}`);
});
warnings.forEach((entry) => {
  console.log(`${COLOR.yellow}${COLOR.bright}!${COLOR.reset} ${entry.message}`);
});
failures.forEach((entry) => {
  console.log(`${COLOR.red}${COLOR.bright}✗${COLOR.reset} ${entry.message}`);
});

const summary = `${passes.length} pass${passes.length === 1 ? '' : 'es'}, ${warnings.length} warning${
  warnings.length === 1 ? '' : 's'
}, ${failures.length} failure${failures.length === 1 ? '' : 's'}`;

if (failures.length > 0) {
  console.log(`\n${COLOR.red}${COLOR.bright}Scenario verification failed${COLOR.reset} — ${summary}`);
  process.exit(1);
}

console.log(`\n${COLOR.cyan}${COLOR.bright}Scenario verification succeeded${COLOR.reset} — ${summary}`);
if (warnings.length > 0) {
  console.log(
    `${COLOR.magenta}Review warnings to decide if manual confirmation is required before production activation.${COLOR.reset}`,
  );
}
