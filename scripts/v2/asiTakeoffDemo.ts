#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

interface CommandStep {
  key: string;
  title: string;
  command: string[];
  parseJson?: boolean;
  outputPath?: string;
  env?: NodeJS.ProcessEnv;
}

interface RunResult {
  key: string;
  title: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

interface DryRunReport {
  status: string;
  network: string;
  timestamp: string;
  scenarios: Array<{
    id: string;
    label: string;
    status: string;
    summary?: string[];
  }>;
}

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_ROOT = path.join(ROOT, 'reports', 'asi-takeoff');
const LOG_ROOT = path.join(REPORT_ROOT, 'logs');
const PLAN_PATH = path.join(ROOT, 'demo', 'asi-takeoff', 'project-plan.json');
const DRY_RUN_PATH = path.join(REPORT_ROOT, 'dry-run.json');
const THERMODYNAMICS_PATH = path.join(REPORT_ROOT, 'thermodynamics.json');
const MISSION_CONTROL_PATH = path.join(REPORT_ROOT, 'mission-control.md');
const SUMMARY_MD_PATH = path.join(REPORT_ROOT, 'summary.md');
const SUMMARY_JSON_PATH = path.join(REPORT_ROOT, 'summary.json');
const BUNDLE_ROOT = path.join(REPORT_ROOT, 'mission-bundle');

function prefixedWrite(prefix: string, data: Buffer): void {
  const text = data.toString();
  text.split(/\r?\n/).forEach((line) => {
    if (line.trim().length === 0) {
      return;
    }
    process.stdout.write(`[${prefix}] ${line}\n`);
  });
}

async function runCommand(step: CommandStep): Promise<RunResult> {
  await fs.mkdir(LOG_ROOT, { recursive: true });
  const logFile = path.join(LOG_ROOT, `${step.key}.log`);
  const start = Date.now();
  const child = spawn(step.command[0], step.command.slice(1), {
    cwd: ROOT,
    env: { ...process.env, ...step.env },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
    prefixedWrite(step.key, data);
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
    prefixedWrite(`${step.key}:err`, data);
  });

  const exitCode: number = await new Promise((resolve, reject) => {
    child.on('error', (err) => reject(err));
    child.on('close', resolve);
  });
  const durationMs = Date.now() - start;
  await fs.writeFile(logFile, `# ${step.title}\n\nExit code: ${exitCode}\nDuration: ${durationMs}ms\n\n## stdout\n\n${stdout}\n\n## stderr\n\n${stderr}\n`);

  if (exitCode !== 0) {
    throw new Error(`Step ${step.title} failed with exit code ${exitCode}`);
  }

  if (step.parseJson) {
    const json = extractJson(stdout);
    await fs.writeFile(step.outputPath!, `${JSON.stringify(json, null, 2)}\n`);
  }

  return { key: step.key, title: step.title, exitCode, stdout, stderr, durationMs };
}

function extractJson(raw: string): unknown {
  const newlineBrace = raw.indexOf('\n{');
  const first = newlineBrace >= 0 ? newlineBrace + 1 : raw.indexOf('{');
  const reversedNewlineBrace = raw.lastIndexOf('}\n');
  const last = reversedNewlineBrace >= 0 ? reversedNewlineBrace : raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) {
    throw new Error('Unable to locate JSON payload in command output');
  }
  const snippet = raw.slice(first, last + 1);
  return JSON.parse(snippet);
}

async function ensureWorkspace(): Promise<void> {
  await fs.mkdir(REPORT_ROOT, { recursive: true });
  await fs.mkdir(BUNDLE_ROOT, { recursive: true });
}

async function loadPlan(): Promise<any> {
  const raw = await fs.readFile(PLAN_PATH, 'utf8');
  return JSON.parse(raw);
}

async function writeSummary(plan: any, dryRun: DryRunReport): Promise<void> {
  const totalJobs = Array.isArray(plan.jobs) ? plan.jobs.length : 0;
  const completedScenarios = dryRun.scenarios.filter((scenario) => scenario.status === 'pass').length;

  const mdLines: string[] = [];
  mdLines.push(`# ASI Take-Off Demonstration Summary`);
  mdLines.push('');
  mdLines.push(`- **Initiative:** ${plan.initiative}`);
  mdLines.push(`- **Objective:** ${plan.objective}`);
  mdLines.push(`- **Budget:** ${plan.budget?.total ?? 'n/a'} ${plan.budget?.currency ?? ''}`.trim());
  mdLines.push(`- **Dry-Run Status:** ${dryRun.status}`);
  mdLines.push(`- **Dry-Run Timestamp:** ${dryRun.timestamp}`);
  mdLines.push(`- **Scenario Successes:** ${completedScenarios}/${dryRun.scenarios.length}`);
  mdLines.push(`- **Defined Jobs:** ${totalJobs}`);
  mdLines.push('');
  mdLines.push('## Scenario Breakdown');
  mdLines.push('');
  dryRun.scenarios.forEach((scenario) => {
    mdLines.push(`### ${scenario.label} (${scenario.id})`);
    mdLines.push(`- Status: ${scenario.status}`);
    if (scenario.summary && scenario.summary.length > 0) {
      scenario.summary.forEach((line) => mdLines.push(`  - ${line}`));
    }
    mdLines.push('');
  });
  mdLines.push('## Planned High-Speed Rail Jobs');
  mdLines.push('');
  plan.jobs.forEach((job: any) => {
    mdLines.push(`- **${job.id}** – ${job.title}`);
    mdLines.push(`  - Reward: ${job.reward} ${plan.budget?.currency ?? ''}`.trim());
    mdLines.push(`  - Deadline: ${job.deadlineDays} days`);
    mdLines.push(`  - Dependencies: ${job.dependencies?.length ? job.dependencies.join(', ') : 'None'}`);
    mdLines.push(`  - Thermodynamic response: ${job.thermodynamicProfile?.adjustmentOnDelay ?? 'n/a'}`);
  });
  mdLines.push('');
  mdLines.push('## Artifact Index');
  mdLines.push('');
  mdLines.push(`- Dry-run report: ${path.relative(ROOT, DRY_RUN_PATH)}`);
  mdLines.push(`- Thermodynamics snapshot: ${path.relative(ROOT, THERMODYNAMICS_PATH)}`);
  mdLines.push(`- Mission control dossier: ${path.relative(ROOT, MISSION_CONTROL_PATH)}`);
  mdLines.push(`- Bundle directory: ${path.relative(ROOT, BUNDLE_ROOT)}`);

  await fs.writeFile(SUMMARY_MD_PATH, `${mdLines.join('\n')}\n`);
  await fs.writeFile(
    SUMMARY_JSON_PATH,
    `${JSON.stringify(
      {
        initiative: plan.initiative,
        objective: plan.objective,
        budget: plan.budget,
        dryRun: dryRun,
        artifacts: {
          dryRun: path.relative(ROOT, DRY_RUN_PATH),
          thermodynamics: path.relative(ROOT, THERMODYNAMICS_PATH),
          missionControl: path.relative(ROOT, MISSION_CONTROL_PATH),
          bundle: path.relative(ROOT, BUNDLE_ROOT),
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function main(): Promise<void> {
  await ensureWorkspace();

  const steps: CommandStep[] = [
    {
      key: 'constants',
      title: 'Regenerate protocol constants',
      command: [
        'npx',
        'ts-node',
        '--compiler-options',
        '{"module":"commonjs"}',
        'scripts/generate-constants.ts',
      ],
    },
    {
      key: 'compile',
      title: 'Compile protocol',
      command: ['npx', 'hardhat', 'compile'],
    },
    {
      key: 'dry-run',
      title: 'Owner testnet dry-run',
      command: [
        'npx',
        'ts-node',
        '--compiler-options',
        '{"module":"commonjs"}',
        'scripts/v2/testnetDryRun.ts',
        '--json',
      ],
      parseJson: true,
      outputPath: DRY_RUN_PATH,
    },
    {
      key: 'thermodynamics',
      title: 'Thermodynamics report',
      command: [
        'npx',
        'hardhat',
        'run',
        '--no-compile',
        'scripts/v2/thermodynamicsReport.ts',
        '--network',
        'hardhat',
      ],
      env: {
        THERMODYNAMICS_REPORT_FORMAT: 'json',
        THERMODYNAMICS_REPORT_OUT: THERMODYNAMICS_PATH,
      },
    },
    {
      key: 'mission-control',
      title: 'Owner mission control dossier',
      command: [
        'npx',
        'ts-node',
        '--compiler-options',
        '{"module":"commonjs"}',
        'scripts/v2/ownerMissionControl.ts',
        '--network',
        'hardhat',
        '--format',
        'markdown',
        '--out',
        MISSION_CONTROL_PATH,
        '--bundle',
        BUNDLE_ROOT,
        '--bundle-name',
        'asi-takeoff',
        '--skip-surface',
      ],
    },
    {
      key: 'verify-control',
      title: 'Verify owner control wiring',
      command: [
        'npx',
        'hardhat',
        'run',
        '--no-compile',
        'scripts/v2/verifyOwnerControl.ts',
        '--network',
        'hardhat',
      ],
    },
  ];

  const results: Record<string, RunResult> = {};

  for (const step of steps) {
    process.stdout.write(`\n=== ${step.title} ===\n`);
    results[step.key] = await runCommand(step);
  }

  const dryRunRaw = await fs.readFile(DRY_RUN_PATH, 'utf8');
  const dryRunReport = JSON.parse(dryRunRaw) as DryRunReport;
  const plan = await loadPlan();
  await writeSummary(plan, dryRunReport);

  process.stdout.write('\nDemo artefacts generated at reports/asi-takeoff.\n');
}

main().catch((error) => {
  process.stderr.write(`\nASI take-off demo failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
