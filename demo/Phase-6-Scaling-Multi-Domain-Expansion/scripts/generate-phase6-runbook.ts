#!/usr/bin/env ts-node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildPhase6Blueprint,
  loadPhase6Config,
  Phase6Blueprint,
} from './phase6-blueprint';
import { createPhase6Runbook } from './phase6-runbook';

interface CliOptions {
  configPath: string;
  outputPath?: string;
}

const DEFAULT_CONFIG = join(__dirname, '..', 'config', 'domains.phase6.json');

function parseArgs(): CliOptions {
  const argv = process.argv.slice(2);
  const options: CliOptions = { configPath: DEFAULT_CONFIG };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--config':
        if (!next) {
          throw new Error('--config requires a path');
        }
        options.configPath = next;
        i += 1;
        break;
      case '--config=':
        options.configPath = arg.split('=', 2)[1] ?? DEFAULT_CONFIG;
        break;
      case '--output':
        if (!next) {
          throw new Error('--output requires a path');
        }
        options.outputPath = next;
        i += 1;
        break;
      case '--output=':
        options.outputPath = arg.split('=', 2)[1];
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--config=')) {
          options.configPath = arg.split('=', 2)[1] ?? DEFAULT_CONFIG;
          break;
        }
        if (arg.startsWith('--output=')) {
          options.outputPath = arg.split('=', 2)[1];
          break;
        }
        console.warn(`Ignoring unknown option: ${arg}`);
        break;
    }
  }

  return options;
}

function printUsage(): void {
  console.log(
    `Generate a Markdown runbook for Phase 6 rollout\n\n` +
      `Usage: npm run demo:phase6:runbook -- [options]\n\n` +
      `Options:\n` +
      `  --config <path>   Custom configuration file (default: ${DEFAULT_CONFIG})\n` +
      `  --output <path>   Write Markdown to <path> instead of stdout\n` +
      `  -h, --help        Show this message\n`,
  );
}

function generateRunbook(blueprint: Phase6Blueprint): string {
  return createPhase6Runbook(blueprint);
}

(function main() {
  const options = parseArgs();
  const config = loadPhase6Config(options.configPath);
  const blueprint = buildPhase6Blueprint(config, { configPath: options.configPath });
  const markdown = generateRunbook(blueprint);

  if (options.outputPath && options.outputPath !== '-') {
    writeFileSync(options.outputPath, markdown);
    console.log(`Phase 6 runbook written to ${options.outputPath}`);
    return;
  }

  console.log(markdown);
})();
