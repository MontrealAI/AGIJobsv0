#!/usr/bin/env ts-node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePhase6Args } from './phase6-cli';

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

function parseArgs(argv: string[] = process.argv.slice(2)): CliOptions {
  return parsePhase6Args(argv, DEFAULT_CONFIG, ['output'], printUsage);
}

function printUsage(): void {
  console.log(
    `Generate a Markdown runbook for Phase 6 rollout\n\n` +
      `Usage: npm run demo:phase6:runbook -- [options]\n\n` +
      `Options:\n` +
      `  --config <path>   Custom configuration file (default: ${DEFAULT_CONFIG})\n` +
      `  --output <path>   Write Markdown to <path> instead of stdout\n` +
      `  -h, --help        Show this message\n`
  );
}

function generateRunbook(blueprint: Phase6Blueprint): string {
  return createPhase6Runbook(blueprint);
}

(function main() {
  const options = parseArgs();
  const config = loadPhase6Config(options.configPath);
  const blueprint = buildPhase6Blueprint(config, {
    configPath: options.configPath,
  });
  const markdown = generateRunbook(blueprint);

  if (options.outputPath && options.outputPath !== '-') {
    writeFileSync(options.outputPath, markdown);
    console.log(`Phase 6 runbook written to ${options.outputPath}`);
    return;
  }

  console.log(markdown);
})();
