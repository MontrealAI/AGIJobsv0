import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { stdout } from 'node:process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadScenarioFromFile, runScenario } from './runDemo';
import { buildEmergencyConsoleReport, renderEmergencyConsoleReport } from './ownerEmergencyReport';

export const DEFAULT_SCENARIO_PATH = path.join(
  __dirname,
  '..',
  'scenario',
  'baseline.json',
);

export const DEFAULT_EMERGENCY_BRIEF_PATH = path.join(
  __dirname,
  '..',
  'reports',
  'owner-emergency-authority.md',
);

type EmergencyConsoleResult = {
  report: ReturnType<typeof buildEmergencyConsoleReport>;
};

export async function generateEmergencyConsole(
  scenarioPath: string = DEFAULT_SCENARIO_PATH,
): Promise<EmergencyConsoleResult> {
  const scenario = await loadScenarioFromFile(scenarioPath);
  const summary = await runScenario(scenario);
  const report = buildEmergencyConsoleReport(summary);
  return { report };
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('scenario', {
      type: 'string',
      default: DEFAULT_SCENARIO_PATH,
      describe: 'Scenario JSON file to simulate',
    })
    .option('json', {
      type: 'boolean',
      default: false,
      describe: 'Emit machine-readable JSON report',
    })
    .option('save', {
      type: 'string',
      describe: 'Write the rendered briefing to a file',
    })
    .option('save-json', {
      type: 'string',
      describe: 'Write the JSON report to a file',
    })
    .help()
    .parse();

  const scenarioPath = path.resolve(String(argv.scenario));
  const { report } = await generateEmergencyConsole(scenarioPath);

  if (argv.json) {
    const payload = JSON.stringify({ report }, null, 2);
    stdout.write(`${payload}\n`);
    if (argv.saveJson) {
      const jsonPath = path.resolve(String(argv.saveJson));
      await fs.mkdir(path.dirname(jsonPath), { recursive: true });
      await fs.writeFile(jsonPath, payload);
    }
    return;
  }

  const rendered = renderEmergencyConsoleReport(report);
  stdout.write(rendered);
  if (argv.save) {
    const outputPath = path.resolve(String(argv.save));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, rendered);
  }
  if (argv.saveJson) {
    const jsonPath = path.resolve(String(argv.saveJson));
    await fs.mkdir(path.dirname(jsonPath), { recursive: true });
    await fs.writeFile(jsonPath, JSON.stringify({ report }, null, 2));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Owner emergency console execution failed:', error);
    process.exitCode = 1;
  });
}
