#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

import { generateAsiTakeoffKit } from './lib/asiTakeoffKit';

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

function resolveFromRoot(relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) {
    return relativeOrAbsolute;
  }
  return path.join(ROOT, relativeOrAbsolute);
}

function resolvePathFromEnv(envKey: string, defaultPath: string): string {
  const override = process.env[envKey];
  if (!override || override.trim().length === 0) {
    return defaultPath;
  }
  return resolveFromRoot(override.trim());
}

function resolveWithin(base: string, envKey: string, fallback: string): string {
  const override = process.env[envKey];
  if (!override || override.trim().length === 0) {
    return path.join(base, fallback);
  }
  const trimmed = override.trim();
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return resolveFromRoot(trimmed);
  }
  return path.join(base, trimmed);
}

const REPORT_ROOT = resolvePathFromEnv('ASI_GLOBAL_REPORT_ROOT', path.join(ROOT, 'reports', 'asi-global'));
const LOG_ROOT = resolveWithin(REPORT_ROOT, 'ASI_GLOBAL_LOG_DIR', 'logs');
const PLAN_PATH = resolvePathFromEnv('ASI_GLOBAL_PLAN_PATH', path.join(ROOT, 'demo', 'asi-global', 'project-plan.json'));
const DRY_RUN_PATH = resolveWithin(REPORT_ROOT, 'ASI_GLOBAL_DRY_RUN_PATH', 'dry-run.json');
const THERMODYNAMICS_PATH = resolveWithin(REPORT_ROOT, 'ASI_GLOBAL_THERMODYNAMICS_PATH', 'thermodynamics.json');
const MISSION_CONTROL_PATH = resolveWithin(REPORT_ROOT, 'ASI_GLOBAL_MISSION_CONTROL_PATH', 'mission-control.md');
const SUMMARY_MD_PATH = resolveWithin(REPORT_ROOT, 'ASI_GLOBAL_SUMMARY_MD_PATH', 'summary.md');
const SUMMARY_JSON_PATH = resolveWithin(REPORT_ROOT, 'ASI_GLOBAL_SUMMARY_JSON_PATH', 'summary.json');
const BUNDLE_ROOT = resolveWithin(REPORT_ROOT, 'ASI_GLOBAL_BUNDLE_DIR', 'mission-bundle');
const COMMAND_CENTER_PATH = resolveWithin(REPORT_ROOT, 'ASI_GLOBAL_COMMAND_CENTER_PATH', 'command-center.md');
const PARAMETER_MATRIX_PATH = resolveWithin(REPORT_ROOT, 'ASI_GLOBAL_PARAMETER_MATRIX_PATH', 'parameter-matrix.md');
const MERMAID_PATH = resolveWithin(REPORT_ROOT, 'ASI_GLOBAL_MERMAID_PATH', 'governance.mmd');
const MERMAID_MARKDOWN_PATH = resolveWithin(REPORT_ROOT, 'ASI_GLOBAL_MERMAID_MARKDOWN_PATH', 'governance.md');
const MERMAID_TITLE = process.env.ASI_GLOBAL_MERMAID_TITLE?.trim() || 'Global Autonomous Economic Orchestrator';
const BUNDLE_NAME = process.env.ASI_GLOBAL_BUNDLE_NAME?.trim() || 'asi-takeoff';
const KIT_BASENAME = process.env.ASI_GLOBAL_OUTPUT_BASENAME?.trim() || 'asi-global-governance-kit';

type ReferenceDoc = { path: string; description: string };
type AdditionalArtifact = { key: string; path: string; description: string };

function parseJsonList<T>(envKey: string): T[] {
  const raw = process.env[envKey];
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('value is not an array');
    }
    return parsed as T[];
  } catch (error) {
    throw new Error(`Failed to parse ${envKey}: ${(error as Error).message}`);
  }
}

const REFERENCE_DOCS_APPEND = parseJsonList<ReferenceDoc>('ASI_GLOBAL_REFERENCE_DOCS_APPEND');
const ADDITIONAL_ARTIFACTS_APPEND = parseJsonList<AdditionalArtifact>('ASI_GLOBAL_ADDITIONAL_ARTIFACTS_APPEND');

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
  await fs.mkdir(path.dirname(DRY_RUN_PATH), { recursive: true });
  await fs.mkdir(path.dirname(THERMODYNAMICS_PATH), { recursive: true });
  await fs.mkdir(path.dirname(MISSION_CONTROL_PATH), { recursive: true });
  await fs.mkdir(path.dirname(SUMMARY_MD_PATH), { recursive: true });
  await fs.mkdir(path.dirname(SUMMARY_JSON_PATH), { recursive: true });
  await fs.mkdir(path.dirname(COMMAND_CENTER_PATH), { recursive: true });
  await fs.mkdir(path.dirname(PARAMETER_MATRIX_PATH), { recursive: true });
  await fs.mkdir(path.dirname(MERMAID_PATH), { recursive: true });
  await fs.mkdir(path.dirname(MERMAID_MARKDOWN_PATH), { recursive: true });
}

async function loadPlan(): Promise<any> {
  const raw = await fs.readFile(PLAN_PATH, 'utf8');
  return JSON.parse(raw);
}

async function writeSummary(plan: any, dryRun: DryRunReport): Promise<void> {
  const totalJobs = Array.isArray(plan.jobs) ? plan.jobs.length : 0;
  const completedScenarios = dryRun.scenarios.filter((scenario) => scenario.status === 'pass').length;
  const regions = Array.isArray(plan.regions) ? plan.regions : [];

  const jobsByRegion = new Map<string, any[]>();
  if (Array.isArray(plan.jobs)) {
    for (const job of plan.jobs) {
      const regionKey = job.region ?? 'GLOBAL';
      if (!jobsByRegion.has(regionKey)) {
        jobsByRegion.set(regionKey, []);
      }
      jobsByRegion.get(regionKey)!.push(job);
    }
  }

  const mdLines: string[] = [];
  mdLines.push('# Global Autonomous Economic Orchestrator Summary');
  mdLines.push('');
  mdLines.push(`- **Initiative:** ${plan.initiative}`);
  mdLines.push(`- **Objective:** ${plan.objective}`);
  const budgetLine = plan.budget?.currency
    ? `${plan.budget.total ?? 'n/a'} ${plan.budget.currency}`
    : plan.budget?.total ?? 'n/a';
  mdLines.push(`- **Budget:** ${budgetLine}`);
  mdLines.push(`- **Regions:** ${regions.length}`);
  mdLines.push(`- **Defined Jobs:** ${totalJobs}`);
  mdLines.push(`- **Dry-Run Status:** ${dryRun.status}`);
  mdLines.push(`- **Dry-Run Timestamp:** ${dryRun.timestamp}`);
  mdLines.push(`- **Scenario Successes:** ${completedScenarios}/${dryRun.scenarios.length}`);
  if (plan.governance?.quadraticVoting?.executionDelayDays) {
    mdLines.push(`- **Governance Delay:** ${plan.governance.quadraticVoting.executionDelayDays} day timelock`);
  }
  if (plan.governance?.thermostat?.initialTemperature) {
    mdLines.push(
      `- **Thermostat Baseline:** ${plan.governance.thermostat.initialTemperature} (emergency ${plan.governance.thermostat.emergencyTemperature ?? 'n/a'})`,
    );
  }
  mdLines.push('');

  mdLines.push('## Dry-Run Scenario Breakdown');
  mdLines.push('');
  dryRun.scenarios.forEach((scenario) => {
    mdLines.push(`### ${scenario.label} (${scenario.id})`);
    mdLines.push(`- Status: ${scenario.status}`);
    if (scenario.summary && scenario.summary.length > 0) {
      scenario.summary.forEach((line) => mdLines.push(`  - ${line}`));
    }
    mdLines.push('');
  });

  if (regions.length > 0) {
    mdLines.push('## Regional Mandates');
    mdLines.push('');
    regions.forEach((region: any) => {
      mdLines.push(`### ${region.name ?? region.id}`);
      if (region.goal) {
        mdLines.push(`- Goal: ${region.goal}`);
      }
      const allocations = (plan.budget?.allocations ?? {}) as Record<string, unknown>;
      const allocationValue =
        allocations[String(region.name)] ?? allocations[String(region.id)];
      if (allocationValue !== undefined) {
        mdLines.push(`- Allocation: ${allocationValue} ${plan.budget?.currency ?? ''}`.trim());
      }
      if (Array.isArray(region.kpis) && region.kpis.length > 0) {
        mdLines.push('- KPIs:');
        region.kpis.forEach((kpi: string) => mdLines.push(`  - ${kpi}`));
      }
      const jobs = jobsByRegion.get(region.id) ?? jobsByRegion.get(region.name) ?? [];
      if (jobs.length > 0) {
        mdLines.push('- Jobs:');
        jobs.forEach((job: any) => {
          mdLines.push(`  - **${job.id}** — ${job.title}`);
          mdLines.push(`    - Reward: ${job.reward} ${plan.budget?.currency ?? ''}`.trim());
          mdLines.push(`    - Deadline: ${job.deadlineDays} days`);
          mdLines.push(
            `    - Dependencies: ${job.dependencies?.length ? job.dependencies.join(', ') : 'None'}`,
          );
          if (job.thermodynamicProfile?.adjustmentOnDelay) {
            mdLines.push(`    - Thermodynamic response: ${job.thermodynamicProfile.adjustmentOnDelay}`);
          }
        });
      }
      mdLines.push('');
    });
  }

  const globalJobs = jobsByRegion.get('GLOBAL') ?? jobsByRegion.get('Global') ?? [];
  if (globalJobs.length > 0) {
    mdLines.push('## Global Coordination Jobs');
    mdLines.push('');
    globalJobs.forEach((job: any) => {
      mdLines.push(`- **${job.id}** — ${job.title}`);
      mdLines.push(`  - Reward: ${job.reward} ${plan.budget?.currency ?? ''}`.trim());
      mdLines.push(`  - Deadline: ${job.deadlineDays} days`);
      mdLines.push(`  - Dependencies: ${job.dependencies?.length ? job.dependencies.join(', ') : 'None'}`);
      if (job.thermodynamicProfile?.adjustmentOnDelay) {
        mdLines.push(`  - Thermodynamic response: ${job.thermodynamicProfile.adjustmentOnDelay}`);
      }
    });
    mdLines.push('');
  }

  mdLines.push('## Artifact Index');
  mdLines.push('');
  mdLines.push(`- Dry-run report: ${path.relative(ROOT, DRY_RUN_PATH)}`);
  mdLines.push(`- Thermodynamics snapshot: ${path.relative(ROOT, THERMODYNAMICS_PATH)}`);
  mdLines.push(`- Mission control dossier: ${path.relative(ROOT, MISSION_CONTROL_PATH)}`);
  mdLines.push(`- Command center: ${path.relative(ROOT, COMMAND_CENTER_PATH)}`);
  mdLines.push(`- Parameter matrix: ${path.relative(ROOT, PARAMETER_MATRIX_PATH)}`);
  mdLines.push(`- Governance mermaid: ${path.relative(ROOT, MERMAID_PATH)}`);
  mdLines.push(`- Bundle directory: ${path.relative(ROOT, BUNDLE_ROOT)}`);

  await fs.writeFile(SUMMARY_MD_PATH, `${mdLines.join('\n')}\n`);
  const summaryPayload = {
    initiative: plan.initiative,
    objective: plan.objective,
    budget: plan.budget,
    governance: plan.governance,
    regions,
    jobs: plan.jobs,
    dryRun,
    artifacts: {
      dryRun: path.relative(ROOT, DRY_RUN_PATH),
      thermodynamics: path.relative(ROOT, THERMODYNAMICS_PATH),
      missionControl: path.relative(ROOT, MISSION_CONTROL_PATH),
      commandCenter: path.relative(ROOT, COMMAND_CENTER_PATH),
      parameterMatrix: path.relative(ROOT, PARAMETER_MATRIX_PATH),
      mermaid: path.relative(ROOT, MERMAID_PATH),
      bundle: path.relative(ROOT, BUNDLE_ROOT),
    },
  };
  await fs.writeFile(SUMMARY_JSON_PATH, `${JSON.stringify(summaryPayload, null, 2)}\n`);
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
        BUNDLE_NAME,
        '--skip-surface',
      ],
    },
    {
      key: 'command-center',
      title: 'Owner command center report',
      command: [
        'npx',
        'ts-node',
        '--compiler-options',
        '{"module":"commonjs"}',
        'scripts/v2/ownerCommandCenter.ts',
        '--network',
        'hardhat',
        '--format',
        'markdown',
        '--out',
        COMMAND_CENTER_PATH,
      ],
    },
    {
      key: 'parameter-matrix',
      title: 'Owner parameter matrix',
      command: [
        'npx',
        'ts-node',
        '--compiler-options',
        '{"module":"commonjs"}',
        'scripts/v2/ownerParameterMatrix.ts',
        '--network',
        'hardhat',
        '--format',
        'markdown',
        '--out',
        PARAMETER_MATRIX_PATH,
      ],
    },
    {
      key: 'governance-mermaid',
      title: 'Render governance mermaid diagram',
      command: [
        'npx',
        'hardhat',
        'run',
        '--no-compile',
        'scripts/v2/renderOwnerMermaid.ts',
        '--format',
        'mermaid',
        '--out',
        MERMAID_PATH,
        '--title',
        MERMAID_TITLE,
      ],
    },
    {
      key: 'governance-map',
      title: 'Render governance markdown map',
      command: [
        'npx',
        'hardhat',
        'run',
        '--no-compile',
        'scripts/v2/renderOwnerMermaid.ts',
        '--format',
        'markdown',
        '--out',
        MERMAID_MARKDOWN_PATH,
        '--title',
        MERMAID_TITLE,
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

  await generateAsiTakeoffKit({
    planPath: PLAN_PATH,
    reportRoot: REPORT_ROOT,
    dryRunPath: DRY_RUN_PATH,
    thermodynamicsPath: THERMODYNAMICS_PATH,
    missionControlPath: MISSION_CONTROL_PATH,
    summaryJsonPath: SUMMARY_JSON_PATH,
    summaryMarkdownPath: SUMMARY_MD_PATH,
    bundleDir: BUNDLE_ROOT,
    logDir: LOG_ROOT,
    outputBasename: KIT_BASENAME,
    referenceDocs: [
      {
        path: 'docs/asi-global-orchestrator-demo.md',
        description: 'Global ASI orchestration scenario guide.',
      },
      {
        path: 'demo/asi-global/RUNBOOK.md',
        description: 'Operator procedures for the global drill.',
      },
      {
        path: 'docs/thermodynamic-incentives.md',
        description: 'Thermodynamic incentive governance reference.',
      },
      ...REFERENCE_DOCS_APPEND,
    ],
    additionalArtifacts: [
      {
        key: 'commandCenter',
        path: COMMAND_CENTER_PATH,
        description: 'Owner command center report outlining adjustable controls.',
      },
      {
        key: 'parameterMatrix',
        path: PARAMETER_MATRIX_PATH,
        description: 'Parameter matrix enumerating update and verification commands.',
      },
      {
        key: 'mermaid',
        path: MERMAID_PATH,
        description: 'Mermaid source for live governance topology diagrams.',
      },
      {
        key: 'mermaidMarkdown',
        path: MERMAID_MARKDOWN_PATH,
        description: 'Markdown rendering of the governance topology.',
      },
      ...ADDITIONAL_ARTIFACTS_APPEND,
    ],
  });

  process.stdout.write(`\nDemo artefacts generated at ${path.relative(ROOT, REPORT_ROOT)}.\n`);
}

main().catch((error) => {
  process.stderr.write(`\nASI global demo failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
