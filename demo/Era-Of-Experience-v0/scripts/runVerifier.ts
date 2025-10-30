#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { verifyExperienceLift, writeVerificationReports } from '../src/verification';

interface CliArgs {
  scenario: string;
  runs: number;
  baseSeed: number;
  jobs?: number;
  bootstrap?: number;
  alpha?: number;
  output?: string;
  uiData?: string;
}

const DEFAULT_SCENARIO = 'demo/Era-Of-Experience-v0/config/scenarios/baseline.json';
const DEFAULT_OUTPUT = 'demo/Era-Of-Experience-v0/reports';
const DEFAULT_UI_DATA = 'demo/Era-Of-Experience-v0/ui/data/verification.json';

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    scenario: DEFAULT_SCENARIO,
    runs: 8,
    baseSeed: 424242
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--scenario' && argv[i + 1]) {
      args.scenario = argv[i + 1];
      i += 1;
    } else if (value === '--runs' && argv[i + 1]) {
      args.runs = Number(argv[i + 1]);
      i += 1;
    } else if (value === '--base-seed' && argv[i + 1]) {
      args.baseSeed = Number(argv[i + 1]);
      i += 1;
    } else if (value === '--jobs' && argv[i + 1]) {
      args.jobs = Number(argv[i + 1]);
      i += 1;
    } else if (value === '--bootstrap' && argv[i + 1]) {
      args.bootstrap = Number(argv[i + 1]);
      i += 1;
    } else if (value === '--alpha' && argv[i + 1]) {
      args.alpha = Number(argv[i + 1]);
      i += 1;
    } else if (value === '--output' && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    } else if (value === '--ui-data' && argv[i + 1]) {
      args.uiData = argv[i + 1];
      i += 1;
    } else if (value === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Era of Experience Verification Harness
Usage: npm run demo:era-of-experience:verify -- [options]

Options:
  --scenario <path>    Scenario JSON path (default baseline)
  --runs <number>      Number of deterministic runs (default 8)
  --base-seed <number> Base seed for deterministic replay (default 424242)
  --jobs <number>      Override job count per run
  --bootstrap <number> Bootstrap samples (default 512)
  --alpha <number>     Confidence alpha (default 0.05)
  --output <dir>       Output directory for reports
  --ui-data <path>     Path for UI verification JSON
  --help               Show this message
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const scenarioPath = path.resolve(args.scenario);
  const outputDir = path.resolve(args.output ?? DEFAULT_OUTPUT);
  const uiDataPath = path.resolve(args.uiData ?? DEFAULT_UI_DATA);
  const result = await verifyExperienceLift({
    scenarioPath,
    runs: args.runs,
    baseSeed: args.baseSeed,
    jobCountOverride: args.jobs,
    bootstrapSamples: args.bootstrap,
    alpha: args.alpha
  });
  await writeVerificationReports(result, {
    outputDir,
    uiDataPath
  });
  console.log('\n✅ Era of Experience verification complete');
  console.log(`Scenario: ${result.scenario}`);
  console.log(`Runs: ${result.runs}`);
  console.log(`GMV mean lift: ${result.metrics.gmv.difference.mean.toFixed(2)} (p=${
    result.metrics.gmv.pValue.toExponential(3)
  })`);
  console.log(
    `ROI mean lift: ${result.metrics.roi.difference.mean.toFixed(2)} (p=${result.metrics.roi.pValue.toExponential(3)})`
  );
  console.log(
    `Autonomy lift: ${result.metrics.autonomy.difference.mean.toFixed(2)} (p=${
      result.metrics.autonomy.pValue.toExponential(3)
    })`
  );
  console.log(
    `Bootstrap GMV interval: [${result.metrics.gmv.bootstrapInterval.lower.toFixed(2)}, ${
      result.metrics.gmv.bootstrapInterval.upper.toFixed(2)
    }]`
  );
  console.log(`Reports written to ${outputDir}`);
  console.log(`UI data updated at ${uiDataPath}`);
}

main().catch((error) => {
  console.error('❌ Era of Experience verification failed');
  console.error(error);
  process.exitCode = 1;
});
