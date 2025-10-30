#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { performTriangulation } from '../src/triangulation';

interface CliArgs {
  scenario: string;
  reward?: string;
  jobs?: number;
  seeds: number[];
  output?: string;
  noReports?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    scenario: 'demo/Era-Of-Experience-v0/config/scenarios/baseline.json',
    seeds: [1337, 1776, 2025]
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--scenario' && argv[i + 1]) {
      args.scenario = argv[i + 1];
      i += 1;
    } else if (value === '--reward' && argv[i + 1]) {
      args.reward = argv[i + 1];
      i += 1;
    } else if (value === '--jobs' && argv[i + 1]) {
      args.jobs = Number(argv[i + 1]);
      i += 1;
    } else if (value === '--seeds' && argv[i + 1]) {
      args.seeds = parseSeeds(argv[i + 1]);
      i += 1;
    } else if (value === '--output' && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    } else if (value === '--no-reports') {
      args.noReports = true;
    } else if (value === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function parseSeeds(raw: string): number[] {
  return raw
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
}

function printHelp(): void {
  console.log(`Era of Experience Triangulation
Usage: npm run demo:era-of-experience:triangulate -- [options]

Options:
  --scenario <path>   Scenario JSON (default baseline)
  --reward <path>     Optional reward override JSON
  --jobs <number>     Override number of jobs per run
  --seeds <a,b,c>     Comma separated list of deterministic seeds
  --output <dir>      Output directory for reports (default reports/)
  --no-reports        Disable writing triangulation artifacts
  --help              Show this help message
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.seeds.length) {
    console.error('At least one seed is required.');
    process.exit(1);
    return;
  }

  const result = await performTriangulation({
    scenarioPath: path.resolve(args.scenario),
    rewardPath: args.reward ? path.resolve(args.reward) : undefined,
    jobCountOverride: args.jobs,
    seeds: args.seeds,
    outputDir: args.output ? path.resolve(args.output) : undefined,
    writeReports: !args.noReports
  });

  console.log('\n🎯 Era of Experience – Triangulation Summary');
  console.log(`Scenario: ${result.scenarioName}`);
  console.log(`Seeds analysed: ${result.runs.map((run) => run.seed).join(', ')}`);
  console.log('---');
  console.table(
    result.runs.map((run) => ({
      Seed: run.seed,
      'GMV Lift': run.gmvLift.toFixed(3),
      'ROI Lift': run.roiLift.toFixed(3),
      'Autonomy Lift': run.autonomyLift.toFixed(3),
      'Dominance %': (run.dominanceRatio * 100).toFixed(1)
    }))
  );
  console.log('---');
  console.log(`GMV Lift – min ${result.aggregate.gmv.min.toFixed(3)}x | mean ${result.aggregate.gmv.mean.toFixed(3)}x`);
  console.log(`ROI Lift – min ${result.aggregate.roi.min.toFixed(3)}x | mean ${result.aggregate.roi.mean.toFixed(3)}x`);
  console.log(`Autonomy Lift – min ${result.aggregate.autonomy.min.toFixed(3)}x | mean ${result.aggregate.autonomy.mean.toFixed(3)}x`);
  console.log(`Trajectory dominance mean: ${(result.aggregate.dominanceMean * 100).toFixed(1)}%`);
  console.log(`Consensus ratio: ${(result.aggregate.successRatio * 100).toFixed(1)}%`);
  console.log(`Confidence score: ${(result.verdict.confidenceScore * 100).toFixed(1)}%`);
  if (result.verdict.flaggedSeeds.length) {
    console.log('Flagged seeds:', result.verdict.flaggedSeeds.join(', '));
  }
  console.log('Notes:');
  result.verdict.notes.forEach((note) => console.log(` - ${note}`));

  if (!result.verdict.gmvPositive || !result.verdict.roiPositive) {
    console.error('\n⚠️  Triangulation detected a regression. Inspect reports for details.');
    process.exitCode = 1;
  } else {
    console.log('\n✅ Triangulation confirms compounding performance across evaluated seeds.');
  }
}

main().catch((error) => {
  console.error('❌ Era of Experience triangulation failed');
  console.error(error);
  process.exitCode = 1;
});

