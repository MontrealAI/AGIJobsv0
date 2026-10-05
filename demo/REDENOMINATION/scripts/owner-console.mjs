#!/usr/bin/env node
import fs from 'node:fs';
import planner from './playbook.cjs';
import verifier from './verify-artifacts.cjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const COLOR = {
  reset: '\u001b[0m',
  bright: '\u001b[1m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  magenta: '\u001b[35m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  gray: '\u001b[90m',
  red: '\u001b[31m',
};

const demoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const scenarioPath = path.join(demoRoot, 'scenario.json');
const jobRegistryConfigPath = path.join(
  demoRoot,
  'config',
  'job-registry-redenominated.json'
);
const stakeManagerConfigPath = path.join(
  demoRoot,
  'config',
  'stake-manager-redenominated.json'
);
const exportPath = path.join(demoRoot, 'ui', 'export', 'latest.json');

function readJson(filePath, { optional = false, label = filePath } = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (
      optional &&
      (error.code === 'ENOENT' || error.code === 'MODULE_NOT_FOUND')
    ) {
      return null;
    }
    console.error(
      `${COLOR.red}${COLOR.bright}[FATAL]${COLOR.reset} Unable to parse ${label}`
    );
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const scenario = readJson(scenarioPath, { label: 'scenario.json' });
const exportData = verifier.verifyArtifacts();
const jobRegistryConfig = exportData.configSnapshots.jobRegistry;
const stakeManagerConfig = exportData.configSnapshots.stakeManager;

const interactive =
  input.isTTY && output.isTTY && process.env.NON_INTERACTIVE !== '1';
const rl = interactive ? readline.createInterface({ input, output }) : null;

function divider(char = '═', length = 70) {
  return char.repeat(length);
}

function printHeading(title) {
  console.log(`\n${COLOR.cyan}${COLOR.bright}${divider()}${COLOR.reset}`);
  console.log(`${COLOR.cyan}${COLOR.bright}${title}${COLOR.reset}`);
  console.log(`${COLOR.cyan}${divider()}${COLOR.reset}`);
}

function formatTokens(value, unit = exportData.token.targetSymbol) {
  if (value === undefined || value === null) {
    return '—';
  }
  if (typeof value === 'number') {
    return `${value} ${unit}`;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return `${value} ${unit}`;
  }
  return `${value}`;
}

function formatSeconds(value) {
  if (value === undefined || value === null) {
    return '—';
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return String(value);
  }
  const days = seconds / 86400;
  if (days >= 1) {
    return `${seconds.toLocaleString()} s (${days.toFixed(2)} days)`;
  }
  const hours = seconds / 3600;
  if (hours >= 1) {
    return `${seconds.toLocaleString()} s (${hours.toFixed(2)} hours)`;
  }
  return `${seconds.toLocaleString()} s`;
}

function renderDefinitionList(items) {
  items.forEach(({ label, value }) => {
    console.log(
      ` ${COLOR.green}▸${COLOR.reset} ${COLOR.bright}${label}${COLOR.reset}`
    );
    console.log(`    ${COLOR.gray}${value}${COLOR.reset}`);
  });
}

function collectOwnerScripts() {
  const commands = new Set();
  for (const script of scenario.resources?.scripts ?? []) {
    if (typeof script === 'string' && script.includes('owner')) {
      commands.add(script);
    }
  }
  const timeline = exportData.timeline ?? [];
  for (const step of timeline) {
    if (!Array.isArray(step?.commands)) continue;
    const highlighted = [
      'pause',
      'resume',
      'update-parameters',
      'snapshot',
      'migrate-ledgers',
    ];
    if (highlighted.includes(step.id)) {
      step.commands.forEach((command) => commands.add(command));
    }
  }
  if (commands.size === 0) {
    return [
      'npm run owner:command-center',
      'npm run owner:parameters',
      'npm run owner:system-pause',
    ];
  }
  return Array.from(commands);
}

function printParameterSummary() {
  printHeading('Parameter guardrails (post-redenomination)');
  console.log(
    `${COLOR.gray}Review the verified local draft. No live configuration has been queried.${COLOR.reset}\n`
  );

  const stakeItems = [
    {
      label: 'Global minimum stake',
      value: formatTokens(stakeManagerConfig.minStakeTokens),
    },
    {
      label: 'Agent role minimum',
      value: formatTokens(stakeManagerConfig.roleMinimums?.agentTokens),
    },
    {
      label: 'Validator role minimum',
      value: formatTokens(stakeManagerConfig.roleMinimums?.validatorTokens),
    },
    {
      label: 'Platform role minimum',
      value: formatTokens(stakeManagerConfig.roleMinimums?.platformTokens),
    },
    {
      label: 'Recommended minimum stake',
      value: formatTokens(stakeManagerConfig.stakeRecommendations?.minTokens),
    },
    {
      label: 'Unbonding period',
      value: formatSeconds(stakeManagerConfig.unbondingPeriodSeconds),
    },
    {
      label: 'Validator reward (stake manager)',
      value: `${stakeManagerConfig.validatorRewardPct}%`,
    },
    {
      label: 'Slashing (employer / treasury)',
      value: `${stakeManagerConfig.employerSlashPct}% / ${stakeManagerConfig.treasurySlashPct}%`,
    },
  ];

  const registryItems = [
    {
      label: 'Job stake requirement',
      value: formatTokens(jobRegistryConfig.jobStakeTokens),
    },
    {
      label: 'Minimum agent stake',
      value: formatTokens(jobRegistryConfig.minAgentStakeTokens),
    },
    {
      label: 'Maximum job reward',
      value: formatTokens(jobRegistryConfig.maxJobRewardTokens),
    },
    {
      label: 'Job duration limit',
      value: formatSeconds(jobRegistryConfig.jobDurationLimitSeconds),
    },
    {
      label: 'Max active jobs per agent',
      value: jobRegistryConfig.maxActiveJobsPerAgent,
    },
    { label: 'Protocol fee', value: `${jobRegistryConfig.feePct}%` },
    {
      label: 'Validator reward (job registry)',
      value: `${jobRegistryConfig.validatorRewardPct}%`,
    },
  ];

  console.log(`${COLOR.bright}${COLOR.cyan}Stake Manager${COLOR.reset}`);
  renderDefinitionList(stakeItems);
  console.log();
  console.log(`${COLOR.bright}${COLOR.cyan}Job Registry${COLOR.reset}`);
  renderDefinitionList(registryItems);
}

function printGovernanceFlow() {
  printHeading('Governed execution flow');
  console.log(
    `${COLOR.gray}These stages describe the intended workflow; verify actual governance on the target deployment.${COLOR.reset}\n`
  );
  scenario.flow?.forEach((phase, index) => {
    console.log(
      `${COLOR.bright}${COLOR.blue}${String(index + 1).padStart(2, '0')} — ${
        phase.phase
      }${COLOR.reset}`
    );
    (phase.steps ?? []).forEach((step, stepIndex) => {
      console.log(
        `   ${COLOR.yellow}${String(stepIndex + 1).padStart(2, '0')}${
          COLOR.reset
        } ${step}`
      );
    });
    console.log();
  });
}

function printOwnerCommands() {
  printHeading('Automation commands for the contract owner');
  const commands = collectOwnerScripts();
  const [primary, ...rest] = commands;
  if (primary) {
    console.log(`${COLOR.green}${COLOR.bright}Primary playbook${COLOR.reset}`);
    console.log(`  ${COLOR.gray}${primary}${COLOR.reset}\n`);
  }
  if (rest.length > 0) {
    console.log(
      `${COLOR.green}${COLOR.bright}Additional commands${COLOR.reset}`
    );
    rest.forEach((command) => {
      console.log(`  ${COLOR.gray}${command}${COLOR.reset}`);
    });
    console.log();
  }
  if (!primary) {
    console.log(
      `${COLOR.yellow}Generate the redenomination playbook export to unlock full automation guidance.${COLOR.reset}\n`
    );
  }
}

function printEmergencyProcedures() {
  printHeading('Emergency playbook & moderation levers');
  console.log(
    `${COLOR.gray}Verify authorized pause, dispute and recovery procedures on a disposable deployment. Commands shown below are local previews.${COLOR.reset}\n`
  );

  const emergencyCommands = [
    planner.pausePreview,
    planner.unpausePreview,
    'npm run demo:redenomination:guardian-drill',
  ];

  emergencyCommands.forEach((command) => {
    console.log(
      ` ${COLOR.magenta}⚠${COLOR.reset} ${COLOR.gray}${command}${COLOR.reset}`
    );
  });
  console.log();
  console.log(
    `${COLOR.gray}Moderator council quorum: ${
      exportData?.invariants
        ? 'See invariants export for thresholds.'
        : 'Run mission control export to review current quorum requirements.'
    }${COLOR.reset}`
  );
}

function printAssuranceChecklist() {
  printHeading('Assurance invariants & verification');
  const invariants = exportData.invariants;
  if (Array.isArray(invariants) && invariants.length > 0) {
    invariants.forEach((item, index) => {
      console.log(
        `${COLOR.magenta}${String(index + 1).padStart(2, '0')}${
          COLOR.reset
        } ${item}`
      );
    });
  } else {
    console.log(
      `${COLOR.yellow}Invariant export missing. Run npm run demo:redenomination:verify and npm run demo:redenomination:mission-control first.${COLOR.reset}`
    );
  }
  console.log();
  console.log(
    `${COLOR.gray}Offline checks: npm run demo:redenomination:verify • node --test demo/REDENOMINATION/tests/*.test.cjs${COLOR.reset}`
  );
}

const actions = [
  { key: '1', label: 'Parameter guardrails', handler: printParameterSummary },
  { key: '2', label: 'Governed execution flow', handler: printGovernanceFlow },
  { key: '3', label: 'Owner automation commands', handler: printOwnerCommands },
  {
    key: '4',
    label: 'Emergency & moderation',
    handler: printEmergencyProcedures,
  },
  {
    key: '5',
    label: 'Assurance & verification',
    handler: printAssuranceChecklist,
  },
  { key: 'x', label: 'Exit owner console', handler: null },
];

function printMenu() {
  console.log(
    `${COLOR.bright}${COLOR.cyan}Select a contract owner surface:${COLOR.reset}`
  );
  actions.forEach((action) => {
    console.log(` ${COLOR.cyan}${action.key}${COLOR.reset} — ${action.label}`);
  });
}

async function main() {
  console.log(
    `${COLOR.bright}${COLOR.green}\n🎖️  REDENOMINATION Owner Command Console${COLOR.reset}`
  );
  console.log(
    `${COLOR.gray}Read-only planning console. No transactions, worker calls or production approval.${COLOR.reset}\n`
  );
  if (!interactive) {
    actions
      .filter((action) => action.handler)
      .forEach((action) => action.handler());
    return;
  }
  let active = true;
  while (active) {
    printMenu();
    let answer;
    try {
      answer = await rl.question(
        `${COLOR.bright}${COLOR.cyan}> ${COLOR.reset}`
      );
    } catch (error) {
      if (error.code === 'ERR_USE_AFTER_CLOSE' || error.code === 'ABORT_ERR')
        break;
      throw error;
    }
    const choice = answer.trim().toLowerCase();
    const action = actions.find((entry) => entry.key === choice);
    if (!action) {
      console.log(
        `${COLOR.yellow}Unrecognised option. Choose one of the listed keys.${COLOR.reset}\n`
      );
      continue;
    }
    if (action.key === 'x') {
      active = false;
      break;
    }
    try {
      action.handler();
    } catch (error) {
      console.log(
        `${COLOR.red}Handler failed: ${
          error instanceof Error ? error.message : error
        }${COLOR.reset}`
      );
    }
    console.log();
  }
  console.log(
    `${COLOR.bright}${COLOR.green}Owner console session complete. Independent review and deployment-specific authorization remain required.${COLOR.reset}`
  );
  rl?.close();
}

process.on('SIGINT', () => {
  console.log(
    `\n${COLOR.yellow}Owner console interrupted by operator.${COLOR.reset}`
  );
  rl?.close();
  process.exit(0);
});

main().catch((error) => {
  console.error(
    `${COLOR.red}${COLOR.bright}Owner console terminated unexpectedly${COLOR.reset}`
  );
  console.error(error);
  rl?.close();
  process.exit(1);
});
