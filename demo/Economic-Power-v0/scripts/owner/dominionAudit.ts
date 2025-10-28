import { promises as fs } from 'node:fs';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  buildDominanceReport,
  loadScenarioFromFile,
  runScenario,
  type Summary,
} from '../runDemo';

const DEFAULT_SCENARIO = path.join(__dirname, '..', '..', 'scenario', 'baseline.json');

async function loadSummary({
  scenarioPath,
  summaryPath,
}: {
  scenarioPath: string;
  summaryPath?: string;
}): Promise<Summary> {
  if (summaryPath) {
    const raw = await fs.readFile(summaryPath, 'utf8');
    return JSON.parse(raw) as Summary;
  }
  const scenario = await loadScenarioFromFile(scenarioPath);
  return runScenario(scenario);
}

function printReport(summary: Summary): void {
  const report = summary.dominanceReport ?? buildDominanceReport(summary);
  const indexPercent = (report.index * 100).toFixed(2);
  console.log(`\nEconomic Dominance Index: ${indexPercent}%`);
  console.log(`Verdict: ${report.verdict}`);
  console.log('\nComponents:');
  for (const component of report.components) {
    console.log(
      `  • ${component.label.padEnd(28)} weight ${(component.weight * 100).toFixed(1)}% | value ${(component.value * 100).toFixed(
        1,
      )}% | contribution ${(component.contribution * 100).toFixed(2)}%`,
    );
  }
  console.log('\nCross-checks:');
  for (const check of report.crossChecks) {
    console.log(
      `  • ${check.label.padEnd(22)} ${(check.value * 100).toFixed(2)}% – ${check.methodology}. ${check.notes}`,
    );
  }
  console.log('\nMethodology notes:');
  for (const note of report.methodology) {
    console.log(`  - ${note}`);
  }
  if (report.integrity.length > 0) {
    console.log('\nIntegrity checks:');
    for (const entry of report.integrity) {
      console.log(`  • [${entry.outcome.toUpperCase()}] ${entry.details}`);
    }
  }
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('scenario', {
      type: 'string',
      describe: 'Path to the scenario JSON to evaluate',
      default: DEFAULT_SCENARIO,
    })
    .option('summary', {
      type: 'string',
      describe: 'Existing summary.json to analyse instead of running the simulator',
    })
    .option('threshold', {
      type: 'number',
      describe: 'Minimum dominance index required to pass',
      default: 0.92,
    })
    .option('ci', {
      type: 'boolean',
      describe: 'Reduce console output for CI contexts',
      default: false,
    })
    .help()
    .parse();

  const summary = await loadSummary({
    scenarioPath: argv.scenario,
    summaryPath: argv.summary,
  });
  const report = summary.dominanceReport ?? buildDominanceReport(summary);

  if (!argv.ci) {
    printReport(summary);
  } else {
    console.log(`Dominance index: ${(report.index * 100).toFixed(2)}%`);
    console.log(`Verdict: ${report.verdict}`);
  }

  const threshold = typeof argv.threshold === 'number' ? argv.threshold : 0.92;
  let exitCode = 0;
  if (report.index < threshold) {
    console.error(
      `\nDominance index ${(report.index * 100).toFixed(2)}% below threshold ${(threshold * 100).toFixed(2)}%.`,
    );
    exitCode = 1;
  }
  const warnings = report.integrity.filter((entry) => entry.outcome !== 'pass');
  if (warnings.length > 0) {
    console.error('\nDominance integrity warnings detected:');
    for (const warning of warnings) {
      console.error(`  - ${warning.details}`);
    }
    exitCode = 1;
  }
  if (exitCode !== 0 && argv.ci) {
    console.error('Dominance audit failed in CI mode.');
  }
  process.exitCode = exitCode;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Dominance audit failed:', error);
    process.exitCode = 1;
  });
}
