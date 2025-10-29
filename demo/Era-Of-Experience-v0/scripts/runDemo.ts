import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadScenario, runExperienceDemo } from './simulation';
import { loadOwnerControls } from './rewardComposer';
import { SimulationConfig, SimulationReport } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadSimulationConfig(relativePath: string): Promise<SimulationConfig> {
  const absolute = path.isAbsolute(relativePath) ? relativePath : path.join(__dirname, '..', relativePath);
  const raw = await import('node:fs/promises').then(({ readFile }) => readFile(absolute, 'utf8'));
  return JSON.parse(raw) as SimulationConfig;
}

function renderMarkdown(report: SimulationReport): string {
  const gmvLiftPct = (report.improvement.gmvLiftPct * 100).toFixed(2);
  const roiDelta = report.improvement.roiDelta.toFixed(3);
  const latencyDelta = report.improvement.avgLatencyDelta.toFixed(2);
  return `# Era of Experience Demo Report\n\n` +
    `## Headline Results\n\n` +
    `- **Baseline GMV:** ${report.baseline.grossMerchandiseValue.toFixed(2)} tokens\n` +
    `- **Experience-Native GMV:** ${report.rlEnhanced.grossMerchandiseValue.toFixed(2)} tokens\n` +
    `- **GMV Lift:** ${gmvLiftPct}%\n` +
    `- **ROI Delta:** ${roiDelta}\n` +
    `- **Latency Delta:** ${latencyDelta} hours (negative is faster)\n` +
    `- **Success Rate Delta:** ${(report.improvement.successRateDelta * 100).toFixed(2)} percentage points\n\n` +
    `## Experience Flow\n\n` +
    '```mermaid\n' + report.mermaidFlow + '\n```\n\n' +
    `## Value Stream\n\n` +
    '```mermaid\n' + report.mermaidValueStream + '\n```\n\n' +
    `## Owner Console Snapshot\n\n` +
    `- Exploration: ${(report.ownerConsole.controls.exploration * 100).toFixed(1)}%\n` +
    `- Paused: ${report.ownerConsole.controls.paused ? 'Yes' : 'No'}\n` +
    `- Sentinel Activated: ${report.ownerConsole.safeguardStatus.sentinelActivated ? 'Yes' : 'No'}\n` +
    `- Recommended Actions:\n` +
    report.ownerConsole.recommendedActions.map((action) => `  - ${action}`).join('\n') + '\n\n' +
    '```mermaid\n' + report.ownerConsole.actionableMermaid + '\n```\n';
}

export interface DemoOptions {
  scenarioPath?: string;
  configPath?: string;
  ownerControlsPath?: string;
  outputDir?: string;
}

export async function runEraOfExperienceDemo(options: DemoOptions = {}): Promise<SimulationReport> {
  const scenarioPath = options.scenarioPath ?? 'scenario/experience-stream.json';
  const configPath = options.configPath ?? 'config/simulation-config.json';
  const ownerControlsPath = options.ownerControlsPath ?? 'config/owner-controls.json';
  const outputDir = options.outputDir ?? 'reports';

  const [scenario, config, ownerControls] = await Promise.all([
    loadScenario(scenarioPath),
    loadSimulationConfig(configPath),
    loadOwnerControls(ownerControlsPath),
  ]);

  const report = await runExperienceDemo(scenario, config, ownerControls);
  const absoluteOutput = path.isAbsolute(outputDir) ? outputDir : path.join(__dirname, '..', outputDir);
  await mkdir(absoluteOutput, { recursive: true });
  const jsonPath = path.join(absoluteOutput, 'era_of_experience_report.json');
  const markdownPath = path.join(absoluteOutput, 'era_of_experience_report.md');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderMarkdown(report), 'utf8');
  return report;
}

async function cli(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('scenario', {
      type: 'string',
      default: 'scenario/experience-stream.json',
      describe: 'Path to the scenario JSON file',
    })
    .option('config', {
      type: 'string',
      default: 'config/simulation-config.json',
      describe: 'Path to the simulation configuration JSON file',
    })
    .option('controls', {
      type: 'string',
      default: 'config/owner-controls.json',
      describe: 'Path to the owner controls JSON file',
    })
    .option('output', {
      type: 'string',
      default: 'reports',
      describe: 'Directory where reports will be written',
    })
    .help()
    .parse();

  const report = await runEraOfExperienceDemo({
    scenarioPath: argv.scenario,
    configPath: argv.config,
    ownerControlsPath: argv.controls,
    outputDir: argv.output,
  });

  console.log('Era of Experience Demo complete. Highlights:');
  console.table({
    baselineGMV: report.baseline.grossMerchandiseValue.toFixed(2),
    rlGMV: report.rlEnhanced.grossMerchandiseValue.toFixed(2),
    gmvLiftPct: (report.improvement.gmvLiftPct * 100).toFixed(2),
    roiDelta: report.improvement.roiDelta.toFixed(3),
    latencyDelta: report.improvement.avgLatencyDelta.toFixed(2),
  });
}

if (import.meta.url === `file://${__filename}`) {
  cli().catch((error) => {
    console.error('Era of Experience demo failed:', error);
    process.exitCode = 1;
  });
}
