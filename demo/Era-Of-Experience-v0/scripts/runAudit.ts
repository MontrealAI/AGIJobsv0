#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { loadScenario, runExperienceDemo } from './simulation';
import { OwnerControlState, SimulationConfig, SimulationReport } from './types';

type CliArgs = {
  scenario: string;
  config: string;
  controls: string;
  output: string;
};

const DEFAULT_SCENARIO = 'demo/Era-Of-Experience-v0/scenario/experience-stream.json';
const DEFAULT_CONFIG = 'demo/Era-Of-Experience-v0/config/simulation-config.json';
const DEFAULT_CONTROLS = 'demo/Era-Of-Experience-v0/config/owner-controls.json';
const DEFAULT_OUTPUT = 'demo/Era-Of-Experience-v0/reports';

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args) {
    printHelp();
    process.exit(0);
    return;
  }

  const scenarioPath = path.resolve(args.scenario);
  const configPath = path.resolve(args.config);
  const controlsPath = path.resolve(args.controls);
  const outputDir = path.resolve(args.output);

  const scenario = await loadScenario(scenarioPath);
  const config = await loadJson<SimulationConfig>(configPath, 'simulation config');
  const ownerControls = await loadJson<OwnerControlState>(controlsPath, 'owner controls');

  const report = await runExperienceDemo(scenario, config, ownerControls);
  await emitReportArtifacts(report, outputDir);
  renderConsoleSummary(report, outputDir);
}

function parseArgs(argv: string[]): CliArgs | null {
  const args: CliArgs = {
    scenario: DEFAULT_SCENARIO,
    config: DEFAULT_CONFIG,
    controls: DEFAULT_CONTROLS,
    output: DEFAULT_OUTPUT,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--scenario' && argv[i + 1]) {
      args.scenario = argv[i + 1];
      i += 1;
    } else if (token === '--config' && argv[i + 1]) {
      args.config = argv[i + 1];
      i += 1;
    } else if (token === '--controls' && argv[i + 1]) {
      args.controls = argv[i + 1];
      i += 1;
    } else if (token === '--output' && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    } else if (token === '--help' || token === '-h') {
      return null;
    }
  }

  return args;
}

function printHelp(): void {
  console.log(
    `Era of Experience Audit\n` +
      `Usage: npm run demo:era-of-experience:audit -- [options]\n\n` +
      `Options:\n` +
      `  --scenario <path>   Scenario JSON describing agents and streams\n` +
      `  --config <path>     Simulation configuration JSON\n` +
      `  --controls <path>   Owner control state JSON\n` +
      `  --output <dir>      Directory for generated audit artifacts\n` +
      `  -h, --help          Show this message\n`,
  );
}

async function loadJson<T>(filePath: string, label: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`Failed to parse ${label} at ${filePath}: ${(error as Error).message}`);
  }
}

async function emitReportArtifacts(report: SimulationReport, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  const auditPath = path.join(outputDir, 'audit-report.json');
  const experiencePath = path.join(outputDir, 'audit-experiences.json');
  const flowPath = path.join(outputDir, 'audit-flow.mmd');
  const valuePath = path.join(outputDir, 'audit-value-stream.mmd');

  const payload = {
    generatedAt: report.audit.generatedAt,
    status: report.audit.status,
    improvement: report.improvement,
    baseline: report.baseline,
    rlEnhanced: report.rlEnhanced,
    audit: report.audit,
  };

  await fs.writeFile(auditPath, JSON.stringify(payload, null, 2));
  await fs.writeFile(experiencePath, JSON.stringify(report.experienceLogSample, null, 2));
  await fs.writeFile(flowPath, report.mermaidFlow);
  await fs.writeFile(valuePath, report.mermaidValueStream);
}

function renderConsoleSummary(report: SimulationReport, outputDir: string): void {
  const baselineGMV = report.baseline.grossMerchandiseValue;
  const rlGMV = report.rlEnhanced.grossMerchandiseValue;
  const gmvLiftPct = report.improvement.gmvLiftPct * 100;
  const roiDelta = report.improvement.roiDelta;
  const successDelta = report.improvement.successRateDelta * 100;

  console.log('');
  console.log('🧾 Era of Experience Audit Complete');
  console.log(`Scenario: ${report.baseline.label} vs ${report.rlEnhanced.label}`);
  console.log(`Baseline GMV: ${baselineGMV.toFixed(2)}`);
  console.log(`Experience-Native GMV: ${rlGMV.toFixed(2)}`);
  console.log(`GMV Lift: ${gmvLiftPct.toFixed(2)}%`);
  console.log(`ROI Delta: ${roiDelta.toFixed(3)}`);
  console.log(`Success Rate Delta: ${successDelta.toFixed(2)}%`);
  console.log(`Audit Status: ${report.audit.status.toUpperCase()}`);
  console.log(`Artifacts written to ${outputDir}`);
  console.log('');
}

main().catch((error) => {
  console.error('❌ Era of Experience audit failed');
  console.error(error);
  process.exitCode = 1;
});
