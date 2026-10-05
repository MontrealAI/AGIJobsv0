#!/usr/bin/env node
import fs from 'node:fs';
import planner from './playbook.cjs';
import verifier from './verify-artifacts.cjs';
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
  gray: '\u001b[90m',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const demoRoot = path.resolve(__dirname, '..');
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

function loadJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(
      `${COLORS.red}${COLORS.bright}[FATAL]${COLORS.reset} Unable to parse ${label} at ${filePath}`
    );
    console.error(error);
    process.exit(1);
  }
}

const scenario = loadJson(scenarioPath, 'scenario.json');
const report = verifier.verifyArtifacts();
const jobRegistryConfig = report.configSnapshots.jobRegistry;
const stakeManagerConfig = report.configSnapshots.stakeManager;
const toNumber = (value) =>
  planner.parseUnits(value, report.token.targetDecimals);

function formatCheck(label, condition) {
  const icon = condition
    ? `${COLORS.green}✔${COLORS.reset}`
    : `${COLORS.red}✘${COLORS.reset}`;
  console.log(` ${icon} ${label}`);
  if (!condition) {
    process.exitCode = 1;
    console.log(
      `   ${COLORS.gray}Review configuration in demo/REDENOMINATION/config to restore invariant.${COLORS.reset}`
    );
  }
}

function printBanner() {
  const title = 'Guardian Drill – Sovereign Control Validation';
  const line = '═'.repeat(Math.max(32, title.length + 6));
  console.log(`\n${COLORS.cyan}${line}${COLORS.reset}`);
  console.log(
    `${COLORS.bright}${COLORS.cyan}  🎖️  ${title}  🎖️${COLORS.reset}`
  );
  console.log(`${COLORS.cyan}${line}${COLORS.reset}\n`);
  console.log(
    `${COLORS.gray}Exercise emergency, governance, and dispute powers without touching production infrastructure.${COLORS.reset}\n`
  );
}

function summarizeInvariants() {
  const agentStake = toNumber(stakeManagerConfig.roleMinimums?.agentTokens);
  const validatorStake = toNumber(
    stakeManagerConfig.roleMinimums?.validatorTokens
  );
  const jobBond = toNumber(jobRegistryConfig.jobStakeTokens);
  const rewardCap = toNumber(jobRegistryConfig.maxJobRewardTokens);
  const unbonding = planner.integer(
    stakeManagerConfig.unbondingPeriodSeconds,
    'unbonding seconds'
  );

  console.log(
    `${COLORS.bright}${COLORS.magenta}Critical Invariants${COLORS.reset}`
  );
  formatCheck('Agent minimum stake covers job bond', agentStake >= jobBond);
  formatCheck(
    'Validator stake exceeds agent minimum',
    validatorStake >= agentStake
  );
  formatCheck(
    'Reward cap is unlimited (zero) or covers the bond',
    rewardCap === 0n || rewardCap >= jobBond
  );
  formatCheck('Unbonding period enforces cooldown (> 0)', unbonding > 0);
  console.log();
}

const drillActions = [
  {
    key: 'pause',
    title: 'Emergency Pause & Recovery',
    description:
      'Review pause, worker stop and recovery on a separately prepared disposable deployment.',
    steps: [
      planner.pausePreview,
      'Stop in-flight workers using the commissioned gateway/host controls; a chain pause does not stop desktop actions.',
      'Reconcile actual chain state, pending claims and unknown worker outcomes. Preserve journals.',
      planner.unpausePreview,
    ],
    signals: [
      'Check actual paused state and transaction receipts after an authorized rehearsal.',
      'Independently verify worker cancellation and application state.',
      'Obtain deployment-specific approval before any live resumption.',
    ],
  },
  {
    key: 'parameters',
    title: 'Parameter Redenomination Vote',
    description:
      'Review a conversion proposal without applying it to old-token contracts.',
    steps: [
      'npm run demo:redenomination:export',
      'npm run demo:redenomination:verify',
      'npm run demo:redenomination:owner-console',
      'Review every converted threshold, token scale, residual liability and unchanged policy before preparing a separate migration.',
    ],
    signals: [
      'Every base-unit conversion reconciles to its source.',
      'Source hashes and embedded configuration agree.',
      'A separately reviewed migration and recovery plan are available before changing real balances.',
    ],
  },
  {
    key: 'dispute',
    title: 'Dispute Escalation & Slashing',
    description:
      'Tabletop review of rejected or disputed evidence; no dispute or slash is executed.',
    steps: [
      'Inject an incorrect conversion in a copy of the worker deliverable; run the independent computer-work/review.cjs checker.',
      'Preserve the original task digest, result, independent verdict and dispatch journal.',
      'Review the deployed dispute module and authorized governance procedure; do not infer moderator powers from the vision diagram.',
      'For confirmed fault, prepare deployment-specific actions through separate authorized signers and independently reconcile receipts.',
    ],
    signals: [
      'Incorrect work is rejected with a nonzero checker exit status.',
      'Provider completion does not imply acceptance or payout.',
      'Final settlement depends on the actual contract outcome and finality.',
    ],
  },
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
  console.log(
    `${COLORS.gray}This offline drill checks artifacts and prints a rehearsal; it does not prove live incident readiness.${COLORS.reset}`
  );
}

async function interactiveLoop() {
  const rl = readline.createInterface({ input, output });
  console.log(
    `${COLORS.bright}${COLORS.cyan}Select a drill to rehearse (type number, or q to quit).${COLORS.reset}`
  );
  while (true) {
    drillActions.forEach((action, index) => {
      console.log(
        ` ${COLORS.cyan}${index + 1}.${COLORS.reset} ${action.title}`
      );
    });
    let answer;
    try {
      answer = (await rl.question('> ')).trim().toLowerCase();
    } catch (error) {
      if (error.code === 'ERR_USE_AFTER_CLOSE' || error.code === 'ABORT_ERR')
        break;
      throw error;
    }
    if (answer === 'q' || answer === 'quit' || answer === 'exit') {
      break;
    }
    const selection = Number.parseInt(answer, 10);
    if (
      !Number.isFinite(selection) ||
      selection < 1 ||
      selection > drillActions.length
    ) {
      console.log(
        `${COLORS.red}Invalid selection. Choose a number from the list or q to exit.${COLORS.reset}`
      );
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
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    process.env.NON_INTERACTIVE === '1'
  ) {
    printAllActions();
    return;
  }
  interactiveLoop().catch((error) => {
    console.error(
      `${COLORS.red}Unexpected error during guardian drill:${COLORS.reset}`
    );
    console.error(error);
    process.exitCode = 1;
  });
}

main();
