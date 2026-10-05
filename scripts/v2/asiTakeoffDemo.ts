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
  timeoutMs?: number;
  maxOutputBytes?: number;
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
const REPORT_ROOT = path.resolve(
  ROOT,
  process.env.ASI_TAKEOFF_REPORT_ROOT || 'reports/asi-takeoff'
);
const LOG_ROOT = path.join(REPORT_ROOT, 'logs');
const PLAN_OVERRIDE = process.env.ASI_TAKEOFF_PLAN_PATH;
const PLAN_PATH = PLAN_OVERRIDE
  ? path.isAbsolute(PLAN_OVERRIDE)
    ? PLAN_OVERRIDE
    : path.resolve(ROOT, PLAN_OVERRIDE)
  : path.join(ROOT, 'demo', 'asi-takeoff', 'project-plan.json');
const DRY_RUN_PATH = path.join(REPORT_ROOT, 'dry-run.json');
const THERMODYNAMICS_PATH = path.join(REPORT_ROOT, 'thermodynamics.json');
const MISSION_CONTROL_PATH = path.join(REPORT_ROOT, 'mission-control.md');
const SUMMARY_MD_PATH = path.join(REPORT_ROOT, 'summary.md');
const SUMMARY_JSON_PATH = path.join(REPORT_ROOT, 'summary.json');
const BUNDLE_ROOT = path.join(REPORT_ROOT, 'mission-bundle');
const SKIP_FLAGSHIP_ONCHAIN =
  process.env.AGIJOBS_FLAGSHIP_SKIP_ONCHAIN === 'true';
const HARDHAT_ENV = { HARDHAT_DISABLE_TELEMETRY: '1' };

function prefixedWrite(prefix: string, data: Buffer): void {
  const text = data.toString();
  text.split(/\r?\n/).forEach((line) => {
    if (line.trim().length === 0) {
      return;
    }
    process.stdout.write(`[${prefix}] ${line}\n`);
  });
}

export async function runCommand(
  step: CommandStep,
  logRoot = LOG_ROOT
): Promise<RunResult> {
  await fs.mkdir(logRoot, { recursive: true });
  const logFile = path.join(logRoot, `${step.key}.log`);
  const start = Date.now();
  const child = spawn(step.command[0], step.command.slice(1), {
    cwd: ROOT,
    env: { ...process.env, ...step.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  let stdout = '';
  let stderr = '';
  let failure: string | undefined;
  let received = 0;
  const stop = () => {
    try {
      if (process.platform !== 'win32' && child.pid)
        process.kill(-child.pid, 'SIGKILL');
      else child.kill('SIGKILL');
    } catch {
      /* The child may have already exited. */
    }
  };
  const timer = setTimeout(() => {
    failure = 'timed out';
    stop();
  }, step.timeoutMs ?? 900000);
  const interrupt = () => {
    failure = 'interrupted';
    stop();
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const capture = (data: Buffer) => {
    received += data.length;
    if (received > (step.maxOutputBytes ?? 16 * 1024 * 1024)) {
      failure = 'exceeded the output limit';
      stop();
      return false;
    }
    return true;
  };

  child.stdout.on('data', (data) => {
    if (!capture(data)) return;
    stdout += data.toString();
    prefixedWrite(step.key, data);
  });

  child.stderr.on('data', (data) => {
    if (!capture(data)) return;
    stderr += data.toString();
    prefixedWrite(`${step.key}:err`, data);
  });

  const exitCode: number = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal && !failure) failure = `terminated by ${signal}`;
      resolve(code ?? 1);
    });
  }).finally(() => {
    clearTimeout(timer);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  });
  const durationMs = Date.now() - start;
  await fs.writeFile(
    logFile,
    `# ${step.title}\n\nExit code: ${exitCode}\nDuration: ${durationMs}ms\n\n## stdout\n\n${stdout}\n\n## stderr\n\n${stderr}\n`
  );

  if (exitCode !== 0 || failure) {
    throw new Error(
      `Step ${step.title} ${failure || `failed with exit code ${exitCode}`}`
    );
  }

  if (step.parseJson) {
    const json = extractJson(stdout);
    await fs.writeFile(step.outputPath!, `${JSON.stringify(json, null, 2)}\n`);
  }

  return {
    key: step.key,
    title: step.title,
    exitCode,
    stdout,
    stderr,
    durationMs,
  };
}

function extractJson(raw: string): unknown {
  const newlineBrace = raw.indexOf('\n{');
  const first = newlineBrace >= 0 ? newlineBrace + 1 : raw.indexOf('{');
  const reversedNewlineBrace = raw.lastIndexOf('}\n');
  const last =
    reversedNewlineBrace >= 0 ? reversedNewlineBrace : raw.lastIndexOf('}');
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
  const plan = JSON.parse(raw);
  require('../../demo/asi-takeoff/scripts/plan.cjs').analyze(plan);
  return plan;
}

async function writeSummary(plan: any, dryRun: DryRunReport): Promise<void> {
  const totalJobs = Array.isArray(plan.jobs) ? plan.jobs.length : 0;
  const completedScenarios = dryRun.scenarios.filter(
    (scenario) => scenario.status === 'pass'
  ).length;

  const mdLines: string[] = [];
  mdLines.push(`# ASI Take-Off Demonstration Summary`);
  mdLines.push('');
  mdLines.push(
    '**Evidence scope:** ' +
      (SKIP_FLAGSHIP_ONCHAIN
        ? 'Offline fixtures only. No ownership checks, transactions or provider work ran.'
        : 'Local contract rehearsal and separately bootstrapped report fixtures. Planned scenario jobs are context, not executed real-world work.')
  );
  mdLines.push('');
  mdLines.push(`- **Initiative:** ${plan.initiative}`);
  mdLines.push(`- **Objective:** ${plan.objective}`);
  mdLines.push(
    `- **Budget:** ${plan.budget?.total ?? 'n/a'} ${
      plan.budget?.currency ?? ''
    }`.trim()
  );
  mdLines.push(`- **Dry-Run Status:** ${dryRun.status}`);
  mdLines.push(`- **Dry-Run Timestamp:** ${dryRun.timestamp}`);
  mdLines.push(
    `- **Scenario Successes:** ${completedScenarios}/${dryRun.scenarios.length}`
  );
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
  mdLines.push('## Planned Scenario Jobs (not executed by this pipeline)');
  mdLines.push('');
  plan.jobs.forEach((job: any) => {
    mdLines.push(`- **${job.id}** – ${job.title}`);
    mdLines.push(
      `  - Reward: ${job.reward} ${plan.budget?.currency ?? ''}`.trim()
    );
    mdLines.push(`  - Deadline: ${job.deadlineDays} days`);
    mdLines.push(
      `  - Dependencies: ${
        job.dependencies?.length ? job.dependencies.join(', ') : 'None'
      }`
    );
    mdLines.push(
      `  - Thermodynamic response: ${
        job.thermodynamicProfile?.adjustmentOnDelay ?? 'n/a'
      }`
    );
  });
  mdLines.push('');
  mdLines.push('## Artifact Index');
  mdLines.push('');
  mdLines.push(`- Dry-run report: ${path.relative(ROOT, DRY_RUN_PATH)}`);
  mdLines.push(
    `- Thermodynamics snapshot: ${path.relative(ROOT, THERMODYNAMICS_PATH)}`
  );
  mdLines.push(
    `- Mission control dossier: ${path.relative(ROOT, MISSION_CONTROL_PATH)}`
  );
  mdLines.push(`- Bundle directory: ${path.relative(ROOT, BUNDLE_ROOT)}`);

  await fs.writeFile(SUMMARY_MD_PATH, `${mdLines.join('\n')}\n`);
  await fs.writeFile(
    SUMMARY_JSON_PATH,
    `${JSON.stringify(
      {
        evidence: {
          mode: SKIP_FLAGSHIP_ONCHAIN
            ? 'offline-fixture'
            : 'local-contract-rehearsal',
          liveProvider: false,
          productionApproved: false,
          settlementApproved: false,
        },
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
      2
    )}\n`
  );
}

async function main(): Promise<void> {
  if (!REPORT_ROOT.startsWith(path.join(ROOT, 'reports') + path.sep))
    throw new Error(
      'ASI_TAKEOFF_REPORT_ROOT must be a subdirectory of reports/'
    );
  const plan = await loadPlan();
  await ensureWorkspace();
  await fs.writeFile(
    path.join(REPORT_ROOT, 'run-status.json'),
    JSON.stringify(
      {
        status: 'running',
        startedAt: new Date().toISOString(),
        planPath: path.relative(ROOT, PLAN_PATH),
        mode: SKIP_FLAGSHIP_ONCHAIN
          ? 'offline-fixture'
          : 'local-contract-rehearsal',
      },
      null,
      2
    ) + '\n'
  );

  if (SKIP_FLAGSHIP_ONCHAIN) {
    process.stdout.write(
      '\nOffline mode detected – seeding stub ASI take-off artefacts.\n'
    );
    await fs.mkdir(LOG_ROOT, { recursive: true });
    await fs.writeFile(
      path.join(LOG_ROOT, 'offline.log'),
      '# Offline orchestration\nSimulated outputs generated without blockchain access.\n'
    );

    const dryRunReport: DryRunReport = {
      status: 'simulated',
      network: 'hardhat-offline',
      timestamp: new Date().toISOString(),
      scenarios: [
        {
          id: 'offline-simulation',
          label: 'Offline governance rehearsal',
          status: 'not-run',
          summary: [
            'Illustrative report fixtures only; governance, treasury and thermostat pathways were not evaluated.',
          ],
        },
      ],
    };

    await fs.writeFile(
      DRY_RUN_PATH,
      `${JSON.stringify(dryRunReport, null, 2)}\n`
    );

    const thermodynamicsSnapshot = {
      generatedAt: new Date().toISOString(),
      metrics: {
        energyReserve: 42000,
        dampingFactor: 0.98,
        offline: true,
      },
    };
    await fs.writeFile(
      THERMODYNAMICS_PATH,
      `${JSON.stringify(thermodynamicsSnapshot, null, 2)}\n`
    );

    const missionControlLines = [
      '# Owner Mission Control (Offline Stub)',
      '',
      'This dossier was generated while AGIJOBS_FLAGSHIP_SKIP_ONCHAIN=true.',
      '',
      '## Summary',
      '- No ownership drills were executed or validated.',
      '- No blockchain transactions were broadcast.',
      '',
      '## Recommended Follow-ups',
      '- Re-run the full demo with on-chain connectivity for end-to-end assurance.',
    ];
    await fs.writeFile(
      MISSION_CONTROL_PATH,
      `${missionControlLines.join('\n')}\n`
    );

    await fs.writeFile(
      path.join(BUNDLE_ROOT, 'offline-readme.md'),
      '# Offline Mission Bundle\n\nGenerated without remote compiler downloads.\n'
    );

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
    });

    await fs.writeFile(
      path.join(REPORT_ROOT, 'run-status.json'),
      JSON.stringify(
        {
          status: 'completed',
          completedAt: new Date().toISOString(),
          mode: 'offline-fixture',
          productionApproved: false,
        },
        null,
        2
      ) + '\n'
    );
    process.stdout.write(
      `\nOffline fixture artefacts available at ${path.relative(
        ROOT,
        REPORT_ROOT
      )}.\n`
    );
    return;
  }

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
      command: ['npx', 'hardhat', 'compile', '--concurrency', '1'],
      env: HARDHAT_ENV,
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
        ...HARDHAT_ENV,
        THERMODYNAMICS_REPORT_FORMAT: 'json',
        THERMODYNAMICS_REPORT_OUT: THERMODYNAMICS_PATH,
        AGJ_DEMO_BOOTSTRAP_HARDHAT: '1',
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
      env: {
        ...HARDHAT_ENV,
        AGJ_DEMO_BOOTSTRAP_HARDHAT: '1',
      },
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
      env: HARDHAT_ENV,
    },
  ];

  const results: Record<string, RunResult> = {};

  for (const step of steps) {
    process.stdout.write(`\n=== ${step.title} ===\n`);
    results[step.key] = await runCommand(step);
  }

  const dryRunRaw = await fs.readFile(DRY_RUN_PATH, 'utf8');
  const dryRunReport = JSON.parse(dryRunRaw) as DryRunReport;
  if (
    dryRunReport.status !== 'pass' ||
    !dryRunReport.scenarios.length ||
    dryRunReport.scenarios.some((s) => s.status !== 'pass')
  )
    throw new Error(
      'Lifecycle report contains unsuccessful or missing scenarios'
    );
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
  });

  await fs.writeFile(
    path.join(REPORT_ROOT, 'run-status.json'),
    JSON.stringify(
      {
        status: 'completed',
        completedAt: new Date().toISOString(),
        mode: 'local-contract-rehearsal',
        productionApproved: false,
      },
      null,
      2
    ) + '\n'
  );
  process.stdout.write(
    `\nDemo artefacts generated at ${path.relative(ROOT, REPORT_ROOT)}.\n`
  );
}

if (require.main === module)
  main().catch((error) => {
    process.stderr.write(
      `\nASI take-off demo failed: ${(error as Error).message}\n`
    );
    process.exitCode = 1;
  });
