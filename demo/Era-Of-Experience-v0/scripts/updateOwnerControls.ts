#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

interface ControlCommand {
  type: 'exploration' | 'promote' | 'reward';
  value?: string | number;
}

async function main(): Promise<void> {
  const commands: ControlCommand[] = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--exploration' && args[i + 1]) {
      commands.push({ type: 'exploration', value: Number(args[i + 1]) });
      i += 1;
    } else if (token === '--promote-latest') {
      commands.push({ type: 'promote' });
    } else if (token === '--reward' && args[i + 1]) {
      commands.push({ type: 'reward', value: args[i + 1] });
      i += 1;
    } else if (token === '--help') {
      printHelp();
      return;
    }
  }

  if (commands.length === 0) {
    printHelp();
    return;
  }

  const summaryPath = path.resolve('demo/Era-Of-Experience-v0/reports/summary.json');
  const summaryContent = await fs.readFile(summaryPath, 'utf8');
  const summary = JSON.parse(summaryContent);

  const ledgerPath = path.resolve('demo/Era-Of-Experience-v0/reports/owner-control-actions.json');
  const existing = await loadExisting(ledgerPath);

  const now = new Date().toISOString();
  const entry = {
    timestamp: now,
    scenario: summary.scenario?.name ?? 'unknown',
    commands: commands.map((command) => describeCommand(command)),
    metrics: summary.learning?.metrics ?? null
  };

  existing.push(entry);
  await fs.writeFile(ledgerPath, JSON.stringify(existing, null, 2));
  console.log(`✅ Recorded ${commands.length} owner control command(s) at ${now}`);
}

function printHelp(): void {
  console.log(`Era of Experience Owner Control
Usage: npm run owner:era-of-experience:controls -- [options]

Options:
  --exploration <value>  Set exploration epsilon (0-1)
  --promote-latest       Promote latest policy snapshot
  --reward <file>        Apply reward weight override JSON
  --help                 Show this message
`);
}

async function loadExisting(filePath: string): Promise<any[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function describeCommand(command: ControlCommand) {
  switch (command.type) {
    case 'exploration':
      return {
        type: 'exploration',
        epsilon: command.value,
        rationale: 'Tuning exploration rate to balance discovery vs exploitation.'
      };
    case 'promote':
      return {
        type: 'policy-promote',
        target: 'latest',
        rationale: 'Promoting the latest checkpoint after validating ROI lift.'
      };
    case 'reward':
      return {
        type: 'reward-update',
        file: command.value,
        rationale: 'Switching reward weight profile to emphasise targeted KPIs.'
      };
    default:
      return command;
  }
}

main().catch((error) => {
  console.error('❌ Failed to update owner controls');
  console.error(error);
  process.exitCode = 1;
});
