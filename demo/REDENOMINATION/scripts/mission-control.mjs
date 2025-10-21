#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const COLOR = {
  reset: '\u001b[0m',
  bright: '\u001b[1m',
  cyan: '\u001b[36m',
  magenta: '\u001b[35m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  gray: '\u001b[90m',
  red: '\u001b[31m'
};

const demoRoot = path.resolve(process.cwd(), 'demo', 'REDENOMINATION');
const scenarioPath = path.join(demoRoot, 'scenario.json');
const exportPath = path.join(demoRoot, 'ui', 'export', 'latest.json');

function readJson(filePath, optional = false) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (optional && (error.code === 'ENOENT' || error.code === 'MODULE_NOT_FOUND')) {
      return null;
    }
    console.error(`${COLOR.red}${COLOR.bright}[FATAL]${COLOR.reset} Unable to read ${filePath}`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const scenario = readJson(scenarioPath);
const exportData = readJson(exportPath, true) ?? {};

const rl = readline.createInterface({ input, output });

function divider(char = '═', length = 64) {
  return char.repeat(length);
}

function printHeading(title) {
  console.log(`\n${COLOR.cyan}${COLOR.bright}${divider()}${COLOR.reset}`);
  console.log(`${COLOR.cyan}${COLOR.bright}${title}${COLOR.reset}`);
  console.log(`${COLOR.cyan}${divider()}${COLOR.reset}`);
}

function printSummary() {
  printHeading('Mission Summary');
  console.log(`${COLOR.gray}${scenario.description}${COLOR.reset}\n`);
  console.log(`${COLOR.bright}${COLOR.green}Actors:${COLOR.reset}`);
  scenario.actors.forEach((actor, index) => {
    console.log(` ${COLOR.green}${String(index + 1).padStart(2, '0')}.${COLOR.reset} ${actor.label} — ${actor.role}`);
    console.log(`    ${COLOR.gray}${actor.goal}${COLOR.reset}`);
  });
  console.log();
  console.log(`${COLOR.bright}${COLOR.blue}Operational metrics:${COLOR.reset}`);
  Object.entries(scenario.metrics).forEach(([key, value]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    console.log(` • ${label}: ${COLOR.bright}${value}${COLOR.reset}`);
  });
  console.log();
}

function printPhases() {
  printHeading('Lifecycle Phases');
  scenario.flow.forEach((phase, index) => {
    console.log(`${COLOR.bright}${COLOR.magenta}${String(index + 1).padStart(2, '0')} — ${phase.phase}${COLOR.reset}`);
    phase.steps.forEach((step, stepIndex) => {
      console.log(`    ${COLOR.yellow}${String(stepIndex + 1).padStart(2, '0')}.${COLOR.reset} ${step}`);
    });
    console.log();
  });
}

function formatList(list = [], bullet = '•', indent = '  ') {
  return list
    .map((item) => `${indent}${bullet} ${item}`)
    .join('\n');
}

function printResources() {
  printHeading('Automation & Documentation');
  if (scenario.resources?.scripts?.length) {
    console.log(`${COLOR.bright}${COLOR.cyan}Launch scripts:${COLOR.reset}`);
    console.log(formatList(scenario.resources.scripts, '▶')); 
  }
  if (scenario.resources?.docs?.length) {
    console.log(`\n${COLOR.bright}${COLOR.cyan}Documentation:${COLOR.reset}`);
    console.log(formatList(scenario.resources.docs, '📘'));
  }
  console.log();
}

function printGovernance() {
  printHeading('Governance Surfaces');
  const surfaces = exportData.governance;
  if (!Array.isArray(surfaces) || surfaces.length === 0) {
    console.log(`${COLOR.yellow}No governance export data found. Run npm run demo:redenomination:export to regenerate playbook artefacts.${COLOR.reset}`);
    return;
  }
  surfaces.forEach((surface, index) => {
    console.log(`${COLOR.green}${String(index + 1).padStart(2, '0')} ${COLOR.reset}${surface.label}`);
    console.log(`    Role: ${surface.role}`);
    console.log(`    Address: ${surface.address ?? 'Not configured'}`);
    if (surface.actions?.length) {
      console.log(`    Actions:\n${formatList(surface.actions, '-', '      ')}`);
    }
    console.log();
  });
}

function printTimeline() {
  printHeading('Operational Timeline');
  const timeline = exportData.timeline;
  if (!Array.isArray(timeline) || timeline.length === 0) {
    console.log(`${COLOR.yellow}Timeline export unavailable. Run npm run demo:redenomination:export to refresh playbook data.${COLOR.reset}`);
    return;
  }
  timeline.forEach((step, index) => {
    console.log(`${COLOR.bright}${COLOR.blue}Phase ${String(index + 1).padStart(2, '0')} — ${step.title}${COLOR.reset}`);
    console.log(`   ${COLOR.gray}${step.description}${COLOR.reset}`);
    if (Array.isArray(step.checkpoints) && step.checkpoints.length > 0) {
      console.log(`   ${COLOR.cyan}Checkpoints:${COLOR.reset}`);
      console.log(formatList(step.checkpoints, '▹', '     '));
    }
    if (Array.isArray(step.commands) && step.commands.length > 0) {
      console.log(`   ${COLOR.cyan}Automation:${COLOR.reset}`);
      step.commands.forEach((command) => {
        console.log(`     ${COLOR.gray}${command}${COLOR.reset}`);
      });
    }
    console.log();
  });
}

function printInvariants() {
  printHeading('Assurance Invariants');
  const invariants = exportData.invariants;
  if (!Array.isArray(invariants) || invariants.length === 0) {
    console.log(`${COLOR.yellow}Invariant set missing. Regenerate the playbook export to restore assurance references.${COLOR.reset}`);
    return;
  }
  invariants.forEach((invariant, index) => {
    console.log(`${COLOR.magenta}${String(index + 1).padStart(2, '0')} ${COLOR.reset}${invariant.title}`);
    console.log(`    ${COLOR.gray}${invariant.summary}${COLOR.reset}`);
    if (invariant.links?.length) {
      console.log(`    Links:`);
      invariant.links.forEach((link) => {
        console.log(`      ${COLOR.blue}${link}${COLOR.reset}`);
      });
    }
    console.log();
  });
}

function printMermaid() {
  printHeading('Mermaid Orchestration Graph');
  if (typeof scenario.mermaid !== 'string' || scenario.mermaid.trim().length === 0) {
    console.log(`${COLOR.yellow}Mermaid diagram missing from scenario. Run npm run demo:redenomination:verify to diagnose.${COLOR.reset}`);
    return;
  }
  console.log(`${COLOR.gray}Copy the snippet below into Notion, Confluence, GitHub, or Grafana to visualise the flow:${COLOR.reset}`);
  console.log(`${COLOR.cyan}\n\`\`\`mermaid${COLOR.reset}`);
  console.log(scenario.mermaid.trim());
  console.log(`${COLOR.cyan}\`\`\`${COLOR.reset}\n`);
}

function printVerification() {
  printHeading('Verification Checklist');
  const verification = exportData.verification;
  if (!verification || typeof verification !== 'object') {
    console.log(`${COLOR.yellow}Verification payload missing. Regenerate the control room export for formal assurances.${COLOR.reset}`);
    return;
  }
  Object.entries(verification).forEach(([key, value]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    if (Array.isArray(value)) {
      console.log(`${COLOR.green}${label}:${COLOR.reset}`);
      console.log(formatList(value, '✓', '    '));
    } else {
      console.log(`${COLOR.green}${label}:${COLOR.reset} ${value}`);
    }
  });
  console.log();
}

const actions = [
  { key: '1', label: 'Mission summary', handler: printSummary },
  { key: '2', label: 'Lifecycle phases', handler: printPhases },
  { key: '3', label: 'Automation & documentation', handler: printResources },
  { key: '4', label: 'Governance surfaces', handler: printGovernance },
  { key: '5', label: 'Operational timeline', handler: printTimeline },
  { key: '6', label: 'Assurance invariants', handler: printInvariants },
  { key: '7', label: 'Mermaid orchestration', handler: printMermaid },
  { key: '8', label: 'Verification checklist', handler: printVerification },
  { key: 'x', label: 'Exit mission control', handler: null }
];

function printMenu() {
  console.log(`${COLOR.bright}${COLOR.cyan}Select a mission control surface:${COLOR.reset}`);
  actions.forEach((action) => {
    console.log(` ${COLOR.cyan}${action.key}${COLOR.reset} — ${action.label}`);
  });
}

async function main() {
  console.log(`${COLOR.bright}${COLOR.green}\n🎖️  REDENOMINATION Mission Control${COLOR.reset}`);
  console.log(`${COLOR.gray}Empower governance, validators, agents, and observers through a guided console.${COLOR.reset}\n`);
  let active = true;
  while (active) {
    printMenu();
    const answer = await rl.question(`${COLOR.bright}${COLOR.cyan}> ${COLOR.reset}`);
    const choice = answer.trim().toLowerCase();
    const action = actions.find((entry) => entry.key === choice);
    if (!action) {
      console.log(`${COLOR.yellow}Unrecognised option. Choose one of the listed keys.${COLOR.reset}\n`);
      continue;
    }
    if (action.key === 'x') {
      active = false;
      break;
    }
    try {
      action.handler();
    } catch (error) {
      console.log(`${COLOR.red}Handler failed: ${error instanceof Error ? error.message : error}${COLOR.reset}`);
    }
    console.log();
  }
  console.log(`${COLOR.bright}${COLOR.green}Mission control session complete. Review above artefacts before initiating production actions.${COLOR.reset}`);
  rl.close();
}

process.on('SIGINT', () => {
  console.log(`\n${COLOR.yellow}Mission control interrupted by operator.${COLOR.reset}`);
  rl.close();
  process.exit(0);
});

main().catch((error) => {
  console.error(`${COLOR.red}${COLOR.bright}Mission control terminated unexpectedly${COLOR.reset}`);
  console.error(error);
  rl.close();
  process.exit(1);
});
