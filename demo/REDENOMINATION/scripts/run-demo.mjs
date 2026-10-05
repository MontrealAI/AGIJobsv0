#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const COLOR = {
  reset: '\u001b[0m',
  bright: '\u001b[1m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  magenta: '\u001b[35m',
  yellow: '\u001b[33m',
  gray: '\u001b[90m',
  blue: '\u001b[34m',
};

const demoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const scenarioPath = path.join(demoRoot, 'scenario.json');

function readScenario() {
  try {
    const raw = fs.readFileSync(scenarioPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(
      `${COLOR.magenta}[FATAL]${COLOR.reset} Unable to read scenario file at ${scenarioPath}`
    );
    console.error(error);
    process.exit(1);
  }
}

function printHeader(title, description) {
  const line = '═'.repeat(Math.max(20, title.length + 8));
  console.log(`${COLOR.cyan}${line}${COLOR.reset}`);
  console.log(`${COLOR.bright}${COLOR.cyan}  🎖️  ${title}  🎖️${COLOR.reset}`);
  console.log(`${COLOR.cyan}${line}${COLOR.reset}\n`);
  console.log(`${COLOR.gray}${description}${COLOR.reset}\n`);
}

function printActors(actors) {
  console.log(`${COLOR.bright}${COLOR.green}Actors & Intent${COLOR.reset}`);
  actors.forEach((actor, index) => {
    const bullet = `${index + 1}`.padStart(2, '0');
    console.log(
      `${COLOR.green}[${bullet}]${COLOR.reset} ${COLOR.bright}${actor.role}${COLOR.reset} (${actor.label})`
    );
    console.log(`     ${COLOR.gray}${actor.goal}${COLOR.reset}`);
  });
  console.log();
}

function printFlow(flow) {
  flow.forEach((phase, idx) => {
    console.log(
      `${COLOR.bright}${COLOR.blue}Phase ${idx + 1}: ${phase.phase}${
        COLOR.reset
      }`
    );
    phase.steps.forEach((step, stepIdx) => {
      const icon =
        stepIdx === 0 ? '🚀' : stepIdx === phase.steps.length - 1 ? '✨' : '•';
      console.log(`   ${COLOR.yellow}${icon}${COLOR.reset} ${step}`);
    });
    console.log();
  });
}

function printMetrics(metrics) {
  console.log(
    `${COLOR.bright}${COLOR.magenta}Operational Controls${COLOR.reset}`
  );
  Object.entries(metrics).forEach(([key, value]) => {
    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase());
    console.log(
      `   ${COLOR.magenta}▸${COLOR.reset} ${label}: ${COLOR.bright}${value}${COLOR.reset}`
    );
  });
  console.log();
}

function printResources(resources) {
  console.log(
    `${COLOR.bright}${COLOR.cyan}Follow-up Commands & References${COLOR.reset}`
  );
  if (resources.scripts?.length) {
    console.log(` ${COLOR.cyan}•${COLOR.reset} Launch Scripts:`);
    resources.scripts.forEach((script) => {
      console.log(`     ${COLOR.gray}${script}${COLOR.reset}`);
    });
  }
  if (resources.docs?.length) {
    console.log(` ${COLOR.cyan}•${COLOR.reset} Documentation:`);
    resources.docs.forEach((doc) => {
      console.log(`     ${COLOR.gray}${doc}${COLOR.reset}`);
    });
  }
  console.log();
}

function printMermaid(diagram) {
  console.log(
    `${COLOR.bright}${COLOR.magenta}Mermaid Orchestration${COLOR.reset}`
  );
  if (typeof diagram !== 'string' || diagram.trim().length === 0) {
    console.log(
      `${COLOR.magenta}Diagram unavailable — run verification to regenerate scenario artefacts.${COLOR.reset}\n`
    );
    return;
  }
  console.log(
    `${COLOR.gray}Embed the following graph in any markdown or dashboard to narrate the governed flow:${COLOR.reset}`
  );
  console.log(`${COLOR.cyan}\n\`\`\`mermaid${COLOR.reset}`);
  console.log(diagram.trim());
  console.log(`${COLOR.cyan}\`\`\`${COLOR.reset}\n`);
}

function printCallToAction() {
  console.log(
    'This is a read-only transcript, not executed work. The original diagram is a conceptual vision.'
  );
  console.log('Next: npm run demo:redenomination:control-room');
  console.log(
    'Verify exact saved artifacts: npm run demo:redenomination:verify'
  );
  console.log(
    'Computer-work commissioning and production boundaries: demo/REDENOMINATION/README.md'
  );
}

const scenario = readScenario();
printHeader(`REDENOMINATION Demo`, scenario.description);
printActors(scenario.actors);
printFlow(scenario.flow);
printMetrics(scenario.metrics);
printResources(scenario.resources);
printMermaid(scenario.mermaid);
printCallToAction();
