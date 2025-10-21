#!/usr/bin/env node
import { readFileSync, existsSync, statSync } from 'node:fs';
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
const translationsPath = path.join(demoRoot, 'i18n', 'strings.json');
const missionControlPath = path.join(demoRoot, 'scripts', 'mission-control.mjs');
const ownerConsolePath = path.join(demoRoot, 'scripts', 'owner-console.mjs');
const guardianDrillPath = path.join(demoRoot, 'scripts', 'guardian-drill.mjs');
const jobRegistryConfigPath = path.join(demoRoot, 'config', 'job-registry-redenominated.json');
const stakeManagerConfigPath = path.join(demoRoot, 'config', 'stake-manager-redenominated.json');

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
const translations = readJson(translationsPath, 'i18n/strings.json');
const jobRegistryConfig = readJson(jobRegistryConfigPath, 'config/job-registry-redenominated.json');
const stakeManagerConfig = readJson(stakeManagerConfigPath, 'config/stake-manager-redenominated.json');

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
expect(
  typeof scenario.mermaid === 'string' && scenario.mermaid.includes('graph TD'),
  'Scenario Mermaid diagram provided',
  'Scenario Mermaid diagram missing or invalid',
);

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

expect(
  Array.isArray(translations.languages) && translations.languages.length > 0,
  'Translations languages declared',
  'Translations languages missing',
);

const requiredLanguages = ['en', 'fr'];
requiredLanguages.forEach((lang) => {
  expect(
    translations.languages?.includes(lang),
    `Language available → ${lang}`,
    `Language missing from catalogue → ${lang}`,
  );
});

const requiredTranslationKeys = [
  'title',
  'subtitle',
  'ctaRun',
  'ctaArchitecture',
  'sectionActors',
  'sectionMermaid',
  'sectionTimeline',
  'sectionGuardrails',
  'sectionRunbook',
  'sectionAssurance',
  'phaseNavigator',
  'missionWizardTitle',
  'phaseNavigatorHint',
  'missionWizardEmpty',
  'runbookIntro',
  'runbookFollow',
  'runbookDocs',
  'assuranceGovernance',
  'assuranceCompute',
  'assuranceObservability',
  'assuranceUX',
  'languageLabel',
  'sectionOwner',
  'ownerConsolePill',
  'ownerStakeTitle',
  'ownerJobTitle',
  'ownerCommandsHint',
  'ownerPrimaryCommandTitle',
  'ownerCommandsEmpty',
];

requiredLanguages.forEach((lang) => {
  const dictionary = translations.strings?.[lang];
  expect(
    dictionary && typeof dictionary === 'object',
    `Translation map available → ${lang}`,
    `Translation map missing → ${lang}`,
  );
  if (dictionary) {
    requiredTranslationKeys.forEach((key) => {
      expect(
        isNonEmptyString(dictionary[key]),
        `Key “${key}” provided for ${lang}`,
        `Missing key “${key}” for ${lang}`,
      );
    });
  }
});

const storyboard = readFileSync(storyboardPath, 'utf8');
expect(
  storyboard.includes('id="flow-content"') && storyboard.includes('id="phase-navigator"'),
  'Storyboard exposes enhanced flow + navigator anchors',
  'Storyboard missing flow or navigator anchors',
);
expect(
  storyboard.includes('data-i18n="title"') && storyboard.includes('data-i18n="missionWizardTitle"'),
  'Storyboard wired for multilingual content',
  'Storyboard missing multilingual hooks',
);
expect(
  storyboard.includes('id="mermaid-diagram"'),
  'Storyboard provides Mermaid container anchor',
  'Storyboard missing Mermaid container anchor',
);
expect(
  storyboard.includes('renderMermaidDiagram'),
  'Storyboard renders Mermaid diagram from scenario',
  'Storyboard missing dynamic Mermaid renderer',
);
expect(
  storyboard.includes('id="owner-console"') &&
    storyboard.includes('id="owner-stake-params"') &&
    storyboard.includes('id="owner-primary-command"'),
  'Storyboard includes owner console section anchors',
  'Storyboard missing owner console anchors',
);

expect(
  typeof jobRegistryConfig === 'object' && jobRegistryConfig !== null,
  'Job registry config loaded',
  'Job registry config missing or invalid',
);
const jobRegistryKeys = [
  'jobStakeTokens',
  'minAgentStakeTokens',
  'maxJobRewardTokens',
  'jobDurationLimitSeconds',
  'maxActiveJobsPerAgent',
  'feePct',
  'validatorRewardPct'
];
jobRegistryKeys.forEach((key) => {
  expect(
    jobRegistryConfig && key in jobRegistryConfig && jobRegistryConfig[key] !== undefined,
    `Job registry config includes “${key}”`,
    `Job registry config missing “${key}”`,
  );
});

expect(
  typeof stakeManagerConfig === 'object' && stakeManagerConfig !== null,
  'Stake manager config loaded',
  'Stake manager config missing or invalid',
);
const stakeManagerKeys = [
  'minStakeTokens',
  'roleMinimums',
  'stakeRecommendations',
  'feePct',
  'burnPct',
  'validatorRewardPct',
  'employerSlashPct',
  'treasurySlashPct',
  'unbondingPeriodSeconds'
];
stakeManagerKeys.forEach((key) => {
  expect(
    stakeManagerConfig && key in stakeManagerConfig && stakeManagerConfig[key] !== undefined,
    `Stake manager config includes “${key}”`,
    `Stake manager config missing “${key}”`,
  );
});
expect(
  typeof stakeManagerConfig.roleMinimums === 'object' && stakeManagerConfig.roleMinimums !== null,
  'Stake manager role minimums provided',
  'Stake manager role minimums missing',
);
if (stakeManagerConfig.roleMinimums) {
  ['agentTokens', 'validatorTokens', 'platformTokens'].forEach((roleKey) => {
    expect(
      stakeManagerConfig.roleMinimums && stakeManagerConfig.roleMinimums[roleKey] !== undefined,
      `Role minimum provided → ${roleKey}`,
      `Role minimum missing → ${roleKey}`,
    );
  });
}
expect(
  typeof stakeManagerConfig.stakeRecommendations === 'object' &&
    stakeManagerConfig.stakeRecommendations !== null,
  'Stake manager recommendations provided',
  'Stake manager recommendations missing',
);
if (stakeManagerConfig.stakeRecommendations) {
  ['minTokens', 'maxTokens'].forEach((recKey) => {
    expect(
      stakeManagerConfig.stakeRecommendations &&
        stakeManagerConfig.stakeRecommendations[recKey] !== undefined,
      `Stake recommendation provided → ${recKey}`,
      `Stake recommendation missing → ${recKey}`,
    );
  });
}

const jobStake = Number(jobRegistryConfig.jobStakeTokens);
const maxReward = Number(jobRegistryConfig.maxJobRewardTokens);
const minAgentStake = Number(stakeManagerConfig.roleMinimums?.agentTokens ?? NaN);
const minValidatorStake = Number(stakeManagerConfig.roleMinimums?.validatorTokens ?? NaN);
const unbondingPeriod = Number(stakeManagerConfig.unbondingPeriodSeconds);

expect(!Number.isNaN(jobStake) && jobStake > 0, 'Job bond numeric & positive', 'Job bond invalid or non-positive');
expect(!Number.isNaN(maxReward) && maxReward >= jobStake, 'Reward cap ≥ job bond', 'Reward cap missing or below bond');
expect(!Number.isNaN(minAgentStake) && minAgentStake >= jobStake, 'Agent stake ≥ job bond', 'Agent stake below job bond');
expect(
  !Number.isNaN(minValidatorStake) && minValidatorStake >= minAgentStake,
  'Validator stake ≥ agent stake',
  'Validator stake below agent stake',
);
expect(!Number.isNaN(unbondingPeriod) && unbondingPeriod > 0, 'Unbonding period > 0', 'Unbonding period invalid');

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

expect(
  existsSync(missionControlPath),
  'Mission control CLI present',
  'Mission control CLI missing',
);
if (existsSync(missionControlPath)) {
  const missionControlSource = readFileSync(missionControlPath, 'utf8');
  expect(
    missionControlSource.startsWith('#!/usr/bin/env node'),
    'Mission control CLI has executable shebang',
    'Mission control CLI missing Node shebang',
  );
  try {
    const stats = statSync(missionControlPath);
    expect((stats.mode & 0o111) !== 0, 'Mission control CLI marked executable', 'Mission control CLI not executable');
  } catch (error) {
    record('warn', `Unable to read mission control permissions (${error instanceof Error ? error.message : error})`);
  }
}

expect(
  existsSync(ownerConsolePath),
  'Owner command console present',
  'Owner command console missing',
);
if (existsSync(ownerConsolePath)) {
  const ownerConsoleSource = readFileSync(ownerConsolePath, 'utf8');
  expect(
    ownerConsoleSource.startsWith('#!/usr/bin/env node'),
    'Owner command console has executable shebang',
    'Owner command console missing Node shebang',
  );
  try {
    const stats = statSync(ownerConsolePath);
    expect((stats.mode & 0o111) !== 0, 'Owner command console marked executable', 'Owner command console not executable');
  } catch (error) {
    record('warn', `Unable to read owner console permissions (${error instanceof Error ? error.message : error})`);
  }
}

expect(
  existsSync(guardianDrillPath),
  'Guardian drill console present',
  'Guardian drill console missing',
);
if (existsSync(guardianDrillPath)) {
  const guardianSource = readFileSync(guardianDrillPath, 'utf8');
  expect(
    guardianSource.startsWith('#!/usr/bin/env node'),
    'Guardian drill console has executable shebang',
    'Guardian drill console missing Node shebang',
  );
  try {
    const stats = statSync(guardianDrillPath);
    expect((stats.mode & 0o111) !== 0, 'Guardian drill console marked executable', 'Guardian drill console not executable');
  } catch (error) {
    record('warn', `Unable to read guardian drill permissions (${error instanceof Error ? error.message : error})`);
  }
}

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
