#!/usr/bin/env ts-node

import path from 'path';

import { generateAsiTakeoffKit } from './lib/asiTakeoffKit';

const ROOT = path.resolve(__dirname, '..', '..');

interface CliOptions {
  reportRoot: string;
  planPath: string;
  dryRunPath?: string;
  thermodynamicsPath?: string;
  missionControlPath?: string;
  summaryJsonPath?: string;
  summaryMarkdownPath?: string;
  bundleDir?: string;
  logDir?: string;
  outputBasename?: string;
  networkHint?: string;
}

function resolveFromRoot(target: string | undefined): string | undefined {
  if (!target) {
    return undefined;
  }
  return path.isAbsolute(target) ? target : path.join(ROOT, target);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    reportRoot: path.join(ROOT, 'reports', 'asi-takeoff'),
    planPath: path.join(ROOT, 'demo', 'asi-takeoff', 'project-plan.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--report-root':
        if (!next) throw new Error('Missing value for --report-root');
        options.reportRoot = resolveFromRoot(next)!;
        i += 1;
        break;
      case '--plan':
        if (!next) throw new Error('Missing value for --plan');
        options.planPath = resolveFromRoot(next)!;
        i += 1;
        break;
      case '--dry-run':
        if (!next) throw new Error('Missing value for --dry-run');
        options.dryRunPath = resolveFromRoot(next);
        i += 1;
        break;
      case '--thermodynamics':
        if (!next) throw new Error('Missing value for --thermodynamics');
        options.thermodynamicsPath = resolveFromRoot(next);
        i += 1;
        break;
      case '--mission-control':
        if (!next) throw new Error('Missing value for --mission-control');
        options.missionControlPath = resolveFromRoot(next);
        i += 1;
        break;
      case '--summary-json':
        if (!next) throw new Error('Missing value for --summary-json');
        options.summaryJsonPath = resolveFromRoot(next);
        i += 1;
        break;
      case '--summary-md':
        if (!next) throw new Error('Missing value for --summary-md');
        options.summaryMarkdownPath = resolveFromRoot(next);
        i += 1;
        break;
      case '--bundle':
        if (!next) throw new Error('Missing value for --bundle');
        options.bundleDir = resolveFromRoot(next);
        i += 1;
        break;
      case '--logs':
        if (!next) throw new Error('Missing value for --logs');
        options.logDir = resolveFromRoot(next);
        i += 1;
        break;
      case '--output-name':
        if (!next) throw new Error('Missing value for --output-name');
        options.outputBasename = next;
        i += 1;
        break;
      case '--network':
        if (!next) throw new Error('Missing value for --network');
        options.networkHint = next;
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await generateAsiTakeoffKit({
    planPath: options.planPath,
    reportRoot: options.reportRoot,
    dryRunPath: options.dryRunPath,
    thermodynamicsPath: options.thermodynamicsPath,
    missionControlPath: options.missionControlPath,
    summaryJsonPath: options.summaryJsonPath,
    summaryMarkdownPath: options.summaryMarkdownPath,
    bundleDir: options.bundleDir,
    logDir: options.logDir,
    outputBasename: options.outputBasename,
    networkHint: options.networkHint,
  });

  process.stdout.write(
    `Governance kit generated:\n- ${result.manifestPath}\n- ${result.markdownPath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`ASI take-off governance kit failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});

