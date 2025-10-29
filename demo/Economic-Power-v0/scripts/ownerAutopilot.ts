import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { stdout } from 'node:process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadScenarioFromFile, runScenario } from './runDemo';
import {
  AutopilotBrief,
  buildAutopilotBrief,
  renderAutopilotBrief,
} from './autopilotBrief';

export const DEFAULT_SCENARIO_PATH = path.join(
  __dirname,
  '..',
  'scenario',
  'baseline.json',
);

export const DEFAULT_AUTOPILOT_BRIEF_PATH = path.join(
  __dirname,
  '..',
  'reports',
  'owner-autopilot-brief.md',
);

type Summary = Awaited<ReturnType<typeof runScenario>>;

export async function generateAutopilotBrief(
  scenarioPath: string,
): Promise<{ summary: Summary; brief: AutopilotBrief }> {
  const scenario = await loadScenarioFromFile(scenarioPath);
  const summary = await runScenario(scenario);
  return { summary, brief: buildAutopilotBrief(summary) };
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
      describe: 'Emit machine-readable JSON instead of markdown',
    })
    .option('save', {
      type: 'string',
      describe: 'Write the rendered briefing to a file',
    })
    .help()
    .parse();

  const scenarioPath = String(argv.scenario);
  const { brief } = await generateAutopilotBrief(scenarioPath);

  if (argv.json) {
    stdout.write(JSON.stringify({ brief }, null, 2));
    stdout.write('\n');
  } else {
    const rendered = renderAutopilotBrief(brief);
    stdout.write(rendered);
    if (argv.save) {
      const outputPath = path.resolve(String(argv.save));
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, rendered);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Owner autopilot briefing failed:', error);
    process.exitCode = 1;
  });
}
