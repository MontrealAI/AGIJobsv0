#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const COLORS = {
  reset: '\u001b[0m',
  bright: '\u001b[1m',
  cyan: '\u001b[36m',
  magenta: '\u001b[35m',
  yellow: '\u001b[33m',
  green: '\u001b[32m',
  red: '\u001b[31m',
  gray: '\u001b[90m'
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const demoRoot = path.resolve(__dirname, '..');
const scenarioPath = path.join(demoRoot, 'scenario.json');
const jobRegistryConfigPath = path.join(demoRoot, 'config', 'job-registry-redenominated.json');
const stakeManagerConfigPath = path.join(demoRoot, 'config', 'stake-manager-redenominated.json');

function loadJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`${COLORS.red}${COLORS.bright}[FATAL]${COLORS.reset} Unable to parse ${label} at ${filePath}`);
    console.error(error);
    process.exit(1);
  }
}

const scenario = loadJson(scenarioPath, 'scenario.json');
const jobRegistryConfig = loadJson(jobRegistryConfigPath, 'job-registry-redenominated.json');
const stakeManagerConfig = loadJson(stakeManagerConfigPath, 'stake-manager-redenominated.json');

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatCheck(label, condition) {
  const icon = condition ? `${COLORS.green}✔${COLORS.reset}` : `${COLORS.red}✘${COLORS.reset}`;
  console.log(` ${icon} ${label}`);
  if (!condition) {
    console.log(`   ${COLORS.gray}Review configuration in demo/REDENOMINATION/config to restore invariant.${COLORS.reset}`);
  }
}

function printBanner() {
  const title = 'Guardian Drill – Sovereign Control Validation';
  const line = '═'.repeat(Math.max(32, title.length + 6));
  console.log(`\n${COLORS.cyan}${line}${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}  🎖️  ${title}  🎖️${COLORS.reset}`);
  console.log(`${COLORS.cyan}${line}${COLORS.reset}\n`);
  console.log(`${COLORS.gray}Exercise emergency, governance, and dispute powers without touching production infrastructure.${COLORS.reset}\n`);
}

function summarizeInvariants() {
  const agentStake = toNumber(stakeManagerConfig.roleMinimums?.agentTokens);
  const validatorStake = toNumber(stakeManagerConfig.roleMinimums?.validatorTokens);
  const jobBond = toNumber(jobRegistryConfig.jobStakeTokens);
  const rewardCap = toNumber(jobRegistryConfig.maxJobRewardTokens);
  const unbonding = toNumber(stakeManagerConfig.unbondingPeriodSeconds);

  console.log(`${COLORS.bright}${COLORS.magenta}Critical Invariants${COLORS.reset}`);
  formatCheck('Agent minimum stake covers job bond', agentStake >= jobBond && !Number.isNaN(agentStake) && !Number.isNaN(jobBond));
  formatCheck('Validator stake exceeds agent minimum', validatorStake >= agentStake && !Number.isNaN(validatorStake) && !Number.isNaN(agentStake));
  formatCheck('Reward cap exceeds bond and is positive', rewardCap >= jobBond && rewardCap > 0);
  formatCheck('Unbonding period enforces cooldown (> 0)', unbonding > 0);
  console.log();
}

const drillActions = [
  {
    key: 'pause',
    title: 'Emergency Pause & Recovery',
    description: 'Rehearse the end-to-end kill-switch, moderator escalation, and safe resumption.',
    steps: [
      'Execute: npm run owner:system-pause to engage the Pausable circuit breakers.',
      `Notify moderators via npm run owner:command-center and record approvals in the governance dashboard.`,
      `After ${scenario.metrics?.governanceTimelock ?? 'the timelock delay'}, execute npm run owner:system-unpause to resume operations.`,
      'Run npm run monitoring:validate to confirm observability pipelines acknowledge the pause & resume events.'
    ],
    signals: [
      'JobRegistry paused() returns true.',
      'StakeManager pause emits Pause event captured by observability indexer.',
      'Grafana timeline displays synchronized pause markers.'
    ]
  },
  {
    key: 'parameters',
    title: 'Parameter Redenomination Vote',
    description: 'Walk through adjusting stake ratios and validator weights through the governance timelock.',
    steps: [
      'Draft proposal: npm run governance:propose -- --target JobRegistry --method setValidatorRewardPct --value 12.',
      `Queue via timelock: npm run governance:queue -- --timelock ${scenario.metrics?.governanceTimelock ?? '24 hours'}.`,
      'Execute after delay: npm run governance:execute -- --proposal <id>.',
      'Re-run npm run demo:redenomination:verify to confirm artefacts reflect the updated economics.'
    ],
    signals: [
      `StakeManager minimum validator stake remains ≥ ${stakeManagerConfig.roleMinimums?.validatorTokens ?? 'configured threshold'} tokens.`,
      'CertificateNFT metadata references updated reward ratio.',
      'Monitoring dashboards display refreshed validator APR projections.'
    ]
  },
  {
    key: 'dispute',
    title: 'Dispute Escalation & Slashing',
    description: 'Simulate a contested result escalated to the Sentinel moderator council.',
    steps: [
      'Trigger dispute: npm run disputes:raise -- --job-id <id> --reason "suspicious redenomination vector".',
      'Moderators convene: npm run disputes:moderate -- --job-id <id> --quorum 3.',
      'If fraud confirmed, execute npm run staking:slash -- --agent <address> --validators <addresses>.',
      'Archive evidence hash via npm run observability:record -- --job-id <id> --uri ipfs://<cid>.'
    ],
    signals: [
      'DisputeModule emits ModeratorOverride event.',
      'Stake ledger shows proportional slashing aligned with config.treasurySlashPct.',
      'ReputationEngine downgrade visible in mission-control transcript.'
    ]
  }
];

function printAction(action) {
  console.log(`${COLORS.bright}${COLORS.green}${action.title}${COLORS.reset}`);
  console.log(`${COLORS.gray}${action.description}${COLORS.reset}`);
  console.log(`${COLORS.yellow}Playbook:${COLORS.reset}`);
  action.steps.forEach((step, index) => {
    console.log(`  ${COLORS.yellow}${index + 1}. ${COLORS.reset}${step}`);
  });
  console.log(`${COLORS.cyan}Success signals:${COLORS.reset}`);
  action.signals.forEach((signal) => {
    console.log(`  ${COLORS.cyan}•${COLORS.reset} ${signal}`);
  });
  console.log();
}

function printAllActions() {
  drillActions.forEach((action) => printAction(action));
  console.log(`${COLORS.gray}Run this drill whenever parameters change to guarantee governance muscle memory stays sharp.${COLORS.reset}`);
}

async function interactiveLoop() {
  const rl = readline.createInterface({ input, output });
  console.log(`${COLORS.bright}${COLORS.cyan}Select a drill to rehearse (type number, or q to quit).${COLORS.reset}`);
  while (true) {
    drillActions.forEach((action, index) => {
      console.log(` ${COLORS.cyan}${index + 1}.${COLORS.reset} ${action.title}`);
    });
    const answer = (await rl.question('> ')).trim().toLowerCase();
    if (answer === 'q' || answer === 'quit' || answer === 'exit') {
      break;
    }
    const selection = Number.parseInt(answer, 10);
    if (!Number.isFinite(selection) || selection < 1 || selection > drillActions.length) {
      console.log(`${COLORS.red}Invalid selection. Choose a number from the list or q to exit.${COLORS.reset}`);
      continue;
    }
    console.log();
    printAction(drillActions[selection - 1]);
  }
  rl.close();
}

function main() {
  printBanner();
  summarizeInvariants();
  if (!process.stdout.isTTY || process.env.NON_INTERACTIVE === '1') {
    printAllActions();
    return;
  }
  interactiveLoop().catch((error) => {
    console.error(`${COLORS.red}Unexpected error during guardian drill:${COLORS.reset}`);
    console.error(error);
    process.exitCode = 1;
  });
}

main();
