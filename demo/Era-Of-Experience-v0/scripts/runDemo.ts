#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { runEraOfExperienceDemo } from '../src/demoRunner';

interface CliArgs {
  scenario: string;
  reward?: string;
  output?: string;
  uiData?: string;
  jobs?: number;
  seed?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { scenario: 'demo/Era-Of-Experience-v0/config/scenarios/baseline.json' };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--scenario' && argv[i + 1]) {
      args.scenario = argv[i + 1];
      i += 1;
    } else if (value === '--reward' && argv[i + 1]) {
      args.reward = argv[i + 1];
      i += 1;
    } else if (value === '--output' && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    } else if (value === '--ui-data' && argv[i + 1]) {
      args.uiData = argv[i + 1];
      i += 1;
    } else if (value === '--jobs' && argv[i + 1]) {
      args.jobs = Number(argv[i + 1]);
      i += 1;
    } else if (value === '--seed' && argv[i + 1]) {
      args.seed = Number(argv[i + 1]);
      i += 1;
    } else if (value === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Era of Experience Demo
Usage: npm run demo:era-of-experience -- [options]

Options:
  --scenario <path>    Path to scenario JSON (default baseline)
  --reward <path>      Optional reward override JSON
  --output <dir>       Directory for generated reports
  --ui-data <path>     Path for UI summary JSON
  --jobs <number>      Override number of jobs in run
  --seed <number>      Override deterministic seed
  --help               Show this message
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const scenarioPath = path.resolve(args.scenario);
  const rewardPath = args.reward ? path.resolve(args.reward) : undefined;
  const outputDir = args.output ? path.resolve(args.output) : undefined;
  const uiData = args.uiData ? path.resolve(args.uiData) : undefined;

  const result = await runEraOfExperienceDemo({
    scenarioPath,
    rewardPath,
    outputDir,
    uiDataPath: uiData,
    writeReports: true,
    jobCountOverride: args.jobs,
    seedOverride: args.seed
  });

  const lift = (result.delta.gmvDelta ?? 1).toFixed(3);
  console.log('\n✅ Era of Experience Demo complete');
  console.log(`Scenario: ${result.scenario.name}`);
  console.log(`Baseline GMV: ${result.baseline.metrics.gmv.toFixed(2)}`);
  console.log(`Learning GMV: ${result.learning.metrics.gmv.toFixed(2)}`);
  console.log(`GMV Lift: ${lift}x`);
  console.log(`ROI Lift: ${(result.delta.roiDelta ?? 1).toFixed(3)}x`);
  console.log('Reports written to', outputDir ?? 'demo/Era-Of-Experience-v0/reports');
}

main().catch((error) => {
  console.error('❌ Era of Experience Demo failed');
  console.error(error);
  process.exitCode = 1;
});
