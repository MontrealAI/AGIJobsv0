#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

import { generateAsiTakeoffKit } from './lib/asiTakeoffKit';
import { loadOwnerControlConfig } from '../config';

type CommandStep = {
  key: string;
  title: string;
  command: string[];
  env?: NodeJS.ProcessEnv;
};

type RunResult = {
  key: string;
  title: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

type DryRunScenario = {
  id: string;
  label: string;
  status: string;
  summary?: string[];
};

type DryRunReport = {
  status: string;
  network: string;
  timestamp: string;
  scenarios: DryRunScenario[];
};

type TakeoffSummary = {
  initiative: string;
  objective: string;
  budget?: { total?: string; currency?: string };
  dryRun: DryRunReport;
  artifacts: Record<string, string>;
};

type OwnerControlModuleType = 'governable' | 'ownable' | 'ownable2step';

type ControlSurfaceStatus = 'ready' | 'needs-config' | 'missing-surface';

type ControlSurfaceDefinition = {
  key: string;
  label: string;
  dedicatedCommand?: string;
  fallbackCommand?: string;
  scriptPath?: string;
  configPaths: string[];
  docs: string[];
  capabilities: string[];
};

type ControlMatrixEntry = {
  key: string;
  label: string;
  type: OwnerControlModuleType;
  status: ControlSurfaceStatus;
  command: string;
  scriptPath?: string;
  configPaths: string[];
  missingConfigPaths: string[];
  docs: string[];
  capabilities: string[];
  notes: string[];
};

type ControlMatrix = {
  generatedAt: string;
  owner?: string;
  governance?: string;
  modules: ControlMatrixEntry[];
  summary: {
    total: number;
    ready: number;
    needsConfig: number;
    missingSurface: number;
  };
};

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_ROOT = path.join(ROOT, 'reports', 'agi-os');
const LOG_ROOT = path.join(REPORT_ROOT, 'logs');
const TAKEOFF_REPORT_ROOT = path.join(ROOT, 'reports', 'asi-takeoff');
const PLAN_PATH = path.join(ROOT, 'demo', 'asi-takeoff', 'project-plan.json');
const SUMMARY_PATH = path.join(TAKEOFF_REPORT_ROOT, 'summary.json');
const DRY_RUN_PATH = path.join(TAKEOFF_REPORT_ROOT, 'dry-run.json');
const THERMODYNAMICS_PATH = path.join(TAKEOFF_REPORT_ROOT, 'thermodynamics.json');
const MISSION_CONTROL_PATH = path.join(TAKEOFF_REPORT_ROOT, 'mission-control.md');
const SUMMARY_MD_PATH = path.join(TAKEOFF_REPORT_ROOT, 'summary.md');
const SUMMARY_JSON_PATH = SUMMARY_PATH;
const GRAND_SUMMARY_MD_PATH = path.join(REPORT_ROOT, 'grand-summary.md');
const GRAND_SUMMARY_JSON_PATH = path.join(REPORT_ROOT, 'grand-summary.json');
const CONTROL_MATRIX_PATH = path.join(REPORT_ROOT, 'owner-control-matrix.json');
const BUNDLE_ROOT = path.join(REPORT_ROOT, 'mission-bundle');

const CONTROL_SURFACES: ControlSurfaceDefinition[] = [
  {
    key: 'stakeManager',
    label: 'Stake Manager',
    dedicatedCommand:
      'npx hardhat run --no-compile scripts/v2/updateStakeManager.ts --network hardhat',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only stakeManager --network hardhat',
    scriptPath: 'scripts/v2/updateStakeManager.ts',
    configPaths: ['config/stake-manager.json'],
    docs: ['docs/owner-control-command-center.md', 'docs/owner-control-blueprint.md'],
    capabilities: [
      'Configure staking thresholds',
      'Rotate treasury routing',
      'Refresh validator quorum parameters',
    ],
  },
  {
    key: 'jobRegistry',
    label: 'Job Registry',
    dedicatedCommand:
      'npx hardhat run --no-compile scripts/v2/updateJobRegistry.ts --network hardhat',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only jobRegistry --network hardhat',
    scriptPath: 'scripts/v2/updateJobRegistry.ts',
    configPaths: ['config/job-registry.json'],
    docs: ['docs/owner-control-command-center.md'],
    capabilities: [
      'Update job lifecycle configuration',
      'Refresh treasury destinations',
      'Sync employer fee settings',
    ],
  },
  {
    key: 'rewardEngine',
    label: 'Reward Engine',
    dedicatedCommand:
      'npx hardhat run --no-compile scripts/v2/updateRewardEngine.ts --network hardhat',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only rewardEngine --network hardhat',
    scriptPath: 'scripts/v2/updateRewardEngine.ts',
    configPaths: ['config/reward-engine.json', 'config/thermodynamics.json'],
    docs: ['docs/thermodynamics-operations.md'],
    capabilities: [
      'Rebalance epoch reward weights',
      'Update energy oracle binding',
      'Refresh operator allocations',
    ],
  },
  {
    key: 'thermostat',
    label: 'Thermostat',
    dedicatedCommand:
      'npx hardhat run --no-compile scripts/v2/updateThermostat.ts --network hardhat',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only thermostat --network hardhat',
    scriptPath: 'scripts/v2/updateThermostat.ts',
    configPaths: ['config/thermodynamics.json'],
    docs: ['docs/thermostat-operations.md', 'docs/thermodynamics-operations.md'],
    capabilities: [
      'Retune thermal PID controller',
      'Adjust entropy dampening bands',
      'Swap reward engine thermostat binding',
    ],
  },
  {
    key: 'systemPause',
    label: 'System Pause',
    dedicatedCommand:
      'npx hardhat run --no-compile scripts/v2/updateSystemPause.ts --network hardhat',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateSystemPause.ts --network hardhat',
    scriptPath: 'scripts/v2/updateSystemPause.ts',
    configPaths: ['config/stake-manager.json'],
    docs: ['docs/owner-emergency-runbook.md'],
    capabilities: [
      'Pause or resume core modules',
      'Refresh authorized pausers',
      'Repoint module proxies to safe defaults',
    ],
  },
  {
    key: 'feePool',
    label: 'Fee Pool',
    dedicatedCommand:
      'npx hardhat run --no-compile scripts/v2/updateFeePool.ts --network hardhat',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only feePool --network hardhat',
    scriptPath: 'scripts/v2/updateFeePool.ts',
    configPaths: ['config/fee-pool.json'],
    docs: ['docs/owner-control-command-center.md'],
    capabilities: [
      'Adjust burn percentages',
      'Manage treasury allowlist',
      'Redirect staking rewards',
    ],
  },
  {
    key: 'platformRegistry',
    label: 'Platform Registry',
    dedicatedCommand:
      'npx hardhat run --no-compile scripts/v2/updatePlatformRegistry.ts --network hardhat',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only platformRegistry --network hardhat',
    scriptPath: 'scripts/v2/updatePlatformRegistry.ts',
    configPaths: ['config/platform-registry.json'],
    docs: ['docs/owner-control-command-center.md'],
    capabilities: [
      'Approve or sunset operator platforms',
      'Align registry metadata with ENS records',
    ],
  },
  {
    key: 'platformIncentives',
    label: 'Platform Incentives',
    dedicatedCommand:
      'npx hardhat run --no-compile scripts/v2/updatePlatformIncentives.ts --network hardhat',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only platformIncentives --network hardhat',
    scriptPath: 'scripts/v2/updatePlatformIncentives.ts',
    configPaths: ['config/platform-incentives.json'],
    docs: ['docs/owner-control-command-center.md'],
    capabilities: [
      'Synchronise operator reward multipliers',
      'Update incentive cliffs and unlocks',
    ],
  },
  {
    key: 'jobRouter',
    label: 'Job Router',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only jobRegistry --network hardhat',
    scriptPath: 'scripts/v2/updateAllModules.ts',
    configPaths: ['config/job-registry.json'],
    docs: ['docs/owner-control-command-center.md'],
    capabilities: [
      'Sync router endpoints with registry defaults',
      'Rotate off-chain job settlement hooks',
    ],
  },
  {
    key: 'validationModule',
    label: 'Validation Module',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only disputeModule --network hardhat',
    scriptPath: 'scripts/v2/updateAllModules.ts',
    configPaths: ['config/dispute-module.json'],
    docs: ['docs/owner-control-command-center.md'],
    capabilities: [
      'Refresh validator committee binding',
      'Update validation stake requirements',
    ],
  },
  {
    key: 'reputationEngine',
    label: 'Reputation Engine',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only platformRegistry --network hardhat',
    scriptPath: 'scripts/v2/updateAllModules.ts',
    configPaths: ['config/platform-registry.json'],
    docs: ['docs/owner-control-command-center.md'],
    capabilities: [
      'Recompute scoring weights',
      'Rotate audit trail backing store',
    ],
  },
  {
    key: 'disputeModule',
    label: 'Dispute Module',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only disputeModule --network hardhat',
    scriptPath: 'scripts/v2/updateAllModules.ts',
    configPaths: ['config/dispute-module.json'],
    docs: ['docs/owner-control-command-center.md'],
    capabilities: [
      'Adjust dispute fee schedule',
      'Rotate arbitrator cohorts',
    ],
  },
  {
    key: 'arbitratorCommittee',
    label: 'Arbitrator Committee',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only disputeModule --network hardhat',
    scriptPath: 'scripts/v2/updateAllModules.ts',
    configPaths: ['config/dispute-module.json'],
    docs: ['docs/owner-control-command-center.md'],
    capabilities: [
      'Refresh committee membership',
      'Escalate emergency overrides',
    ],
  },
  {
    key: 'certificateNFT',
    label: 'Certificate NFT',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only platformRegistry --network hardhat',
    scriptPath: 'scripts/v2/updateAllModules.ts',
    configPaths: ['config/platform-registry.json'],
    docs: ['docs/owner-control-command-center.md'],
    capabilities: [
      'Rotate credential signer',
      'Refresh tokenURI renderer',
    ],
  },
  {
    key: 'taxPolicy',
    label: 'Tax Policy',
    dedicatedCommand:
      'npx hardhat run --no-compile scripts/v2/updateTaxPolicy.ts --network hardhat',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only taxPolicy --network hardhat',
    scriptPath: 'scripts/v2/updateTaxPolicy.ts',
    configPaths: ['config/tax-policy.json'],
    docs: ['docs/owner-control-command-center.md'],
    capabilities: [
      'Modify protocol tax brackets',
      'Sync jurisdiction overrides',
    ],
  },
  {
    key: 'identityRegistry',
    label: 'Identity Registry',
    dedicatedCommand:
      'npx hardhat run --no-compile scripts/v2/updateIdentityRegistry.ts --network hardhat',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only identityRegistry --network hardhat',
    scriptPath: 'scripts/v2/updateIdentityRegistry.ts',
    configPaths: [
      'config/identity-registry.json',
      'config/identity-registry.mainnet.json',
      'config/identity-registry.sepolia.json',
    ],
    docs: ['docs/ens-identity-policy.md'],
    capabilities: [
      'Synchronise ENS proofs',
      'Whitelist emergency operator addresses',
    ],
  },
  {
    key: 'attestationRegistry',
    label: 'Attestation Registry',
    fallbackCommand:
      'npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only identityRegistry --network hardhat',
    scriptPath: 'scripts/v2/updateAllModules.ts',
    configPaths: ['config/attestation.eas.json'],
    docs: ['docs/owner-control-command-center.md'],
    capabilities: [
      'Swap attestation resolver',
      'Retire compromised schemas',
    ],
  },
];

async function prefixedLog(prefix: string, data: Buffer): Promise<void> {
  data
    .toString()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .forEach((line) => process.stdout.write(`[${prefix}] ${line}\n`));
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

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    void prefixedLog(step.key, chunk as Buffer);
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    void prefixedLog(`${step.key}:err`, chunk as Buffer);
  });

  const { exitCode, signal } = await new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.on('error', (error) => reject(error));
    child.on('close', (code, receivedSignal) =>
      resolve({ exitCode: code, signal: receivedSignal }),
    );
  });

  const durationMs = Date.now() - start;
  await fs.writeFile(
    logFile,
    [
      `# ${step.title}`,
      '',
      `Command: ${step.command.join(' ')}`,
      `Exit code: ${exitCode ?? 'null'}`,
      `Signal: ${signal ?? 'none'}`,
      `Duration: ${durationMs}ms`,
      '',
      '## stdout',
      stdout,
      '',
      '## stderr',
      stderr,
      '',
    ].join('\n'),
  );

  if (signal !== null) {
    throw new Error(`${step.title} terminated by signal ${signal}`);
  }

  if (exitCode === null) {
    throw new Error(`${step.title} ended without exit code or signal`);
  }

  if (exitCode !== 0) {
    throw new Error(`${step.title} failed with exit code ${exitCode}`);
  }

  return { key: step.key, title: step.title, exitCode, stdout, stderr, durationMs };
}

async function ensureBaseDemo(): Promise<void> {
  const step: CommandStep = {
    key: 'asi-takeoff',
    title: 'Run ASI take-off orchestration',
    command: [
      'npx',
      'ts-node',
      '--compiler-options',
      '{"module":"commonjs"}',
      'scripts/v2/asiTakeoffDemo.ts',
    ],
  };
  process.stdout.write('\n>>> Executing ASI take-off demo to refresh artefacts...\n');
  await runCommand(step);
}

async function readJson<T>(filePath: string, label: string): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${path.relative(ROOT, filePath)}: ${(error as Error).message}`);
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function pickDefinition(key: string): ControlSurfaceDefinition {
  const match = CONTROL_SURFACES.find((surface) => surface.key === key);
  if (match) {
    return match;
  }
  return {
    key,
    label: key,
    fallbackCommand:
      `npx hardhat run --no-compile scripts/v2/updateAllModules.ts --only ${key} --network hardhat`,
    configPaths: [],
    docs: [],
    capabilities: [],
  };
}

async function buildControlMatrix(): Promise<ControlMatrix> {
  const { config: ownerConfig } = loadOwnerControlConfig({});
  const modules = ownerConfig.modules ?? {};

  const matrixEntries: ControlMatrixEntry[] = [];

  const moduleKeys = Object.keys(modules).sort((a, b) => a.localeCompare(b));

  for (const key of moduleKeys) {
    const moduleConfig = modules[key];
    const type = (moduleConfig?.type ?? 'governable') as OwnerControlModuleType;
    const definition = pickDefinition(key);
    const configPaths = definition.configPaths.map((entry) => path.join(ROOT, entry));

    const missing: string[] = [];
    for (const candidate of configPaths) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await fileExists(candidate);
      if (!exists) {
        missing.push(path.relative(ROOT, candidate));
      }
    }

    const notes: string[] = [];
    const status: ControlSurfaceStatus = missing.length > 0
      ? 'needs-config'
      : definition.dedicatedCommand || definition.fallbackCommand
      ? 'ready'
      : 'missing-surface';

    if (missing.length > 0) {
      notes.push(`Missing configuration files: ${missing.join(', ')}`);
    }

    if (!definition.dedicatedCommand && !definition.fallbackCommand) {
      notes.push('No scripted control surface registered; use governance tooling directly.');
    }

    const command = definition.dedicatedCommand ?? definition.fallbackCommand ?? 'manual-governance-required';

    matrixEntries.push({
      key,
      label: definition.label,
      type,
      status,
      command,
      scriptPath: definition.scriptPath,
      configPaths: definition.configPaths,
      missingConfigPaths: missing,
      docs: definition.docs,
      capabilities: definition.capabilities,
      notes,
    });
  }

  const summary = matrixEntries.reduce(
    (acc, entry) => {
      acc.total += 1;
      if (entry.status === 'ready') {
        acc.ready += 1;
      } else if (entry.status === 'needs-config') {
        acc.needsConfig += 1;
      } else {
        acc.missingSurface += 1;
      }
      return acc;
    },
    { total: 0, ready: 0, needsConfig: 0, missingSurface: 0 },
  );

  return {
    generatedAt: new Date().toISOString(),
    owner: ownerConfig.owner,
    governance: ownerConfig.governance,
    modules: matrixEntries,
    summary,
  };
}

function renderScenarioList(dryRun: DryRunReport): string {
  if (!Array.isArray(dryRun.scenarios) || dryRun.scenarios.length === 0) {
    return 'No dry-run scenarios recorded.';
  }
  const lines: string[] = [];
  dryRun.scenarios.forEach((scenario) => {
    lines.push(`- **${scenario.label}** (${scenario.id}) — ${scenario.status}`);
    if (scenario.summary && scenario.summary.length > 0) {
      scenario.summary.forEach((detail) => {
        lines.push(`  - ${detail}`);
      });
    }
  });
  return lines.join('\n');
}

function renderControlMatrixMarkdown(matrix: ControlMatrix): string {
  const lines: string[] = [];
  lines.push('| Module | Type | Status | Command | Config artefacts |');
  lines.push('| --- | --- | --- | --- | --- |');
  matrix.modules.forEach((entry) => {
    const statusIcon = entry.status === 'ready' ? '✅ Ready' : entry.status === 'needs-config' ? '⚠️ Needs config' : '❌ Missing script';
    const configList = entry.configPaths.length > 0 ? entry.configPaths.join('<br/>') : 'n/a';
    const commandCell = ['`', entry.command, '`'].join('');
    lines.push(
      `| ${entry.label} | ${entry.type} | ${statusIcon} | ${commandCell} | ${configList} |`,
    );
  });
  return lines.join('\n');
}

async function writeGrandSummary(
  plan: Record<string, any>,
  takeoffSummary: TakeoffSummary,
  matrix: ControlMatrix,
): Promise<void> {
  const lines: string[] = [];
  lines.push('# AGI Jobs v0 (v2) — Operating System Demonstration');
  lines.push('');
  lines.push('## Mission Profile');
  lines.push('');
  lines.push(`- **Initiative:** ${takeoffSummary.initiative}`);
  lines.push(`- **Objective:** ${takeoffSummary.objective}`);
  const budgetText = takeoffSummary.budget?.total
    ? `${takeoffSummary.budget.total} ${takeoffSummary.budget.currency ?? ''}`.trim()
    : plan?.budget?.total
    ? `${plan.budget.total} ${plan.budget.currency ?? ''}`.trim()
    : 'Unspecified';
  lines.push(`- **Budget envelope:** ${budgetText}`);
  lines.push(`- **Dry-run status:** ${takeoffSummary.dryRun.status}`);
  lines.push(`- **Dry-run timestamp:** ${takeoffSummary.dryRun.timestamp}`);
  lines.push(`- **Scenarios executed:** ${takeoffSummary.dryRun.scenarios?.length ?? 0}`);
  lines.push('');
  lines.push('### Dry-Run Scenarios');
  lines.push('');
  lines.push(renderScenarioList(takeoffSummary.dryRun));
  lines.push('');
  lines.push('## Owner Control Authority Matrix');
  lines.push('');
  lines.push(`- **Configured owner:** ${matrix.owner ?? 'not set'}`);
  lines.push(`- **Configured governance:** ${matrix.governance ?? 'not set'}`);
  lines.push(`- **Control surfaces ready:** ${matrix.summary.ready}/${matrix.summary.total}`);
  lines.push(`- **Surfaces needing configuration:** ${matrix.summary.needsConfig}`);
  lines.push(`- **Surfaces requiring manual intervention:** ${matrix.summary.missingSurface}`);
  lines.push('');
  lines.push(renderControlMatrixMarkdown(matrix));
  lines.push('');
  lines.push('### Module Capabilities');
  lines.push('');
  matrix.modules.forEach((entry) => {
    lines.push(`#### ${entry.label}`);
    lines.push('');
    lines.push(`- **Type:** ${entry.type}`);
    const primaryCommand = ['`', entry.command, '`'].join('');
    lines.push(`- **Primary command:** ${primaryCommand}`);
    if (entry.docs.length > 0) {
      lines.push(`- **Reference docs:** ${entry.docs.map((doc) => `[${doc}](${doc})`).join(', ')}`);
    }
    if (entry.capabilities.length > 0) {
      lines.push('- **Capabilities:**');
      entry.capabilities.forEach((capability) => {
        lines.push(`  - ${capability}`);
      });
    }
    if (entry.notes.length > 0) {
      lines.push('- **Notes:**');
      entry.notes.forEach((note) => {
        lines.push(`  - ${note}`);
      });
    }
    lines.push('');
  });

  await fs.mkdir(REPORT_ROOT, { recursive: true });
  await fs.writeFile(GRAND_SUMMARY_MD_PATH, `${lines.join('\n')}\n`);

  const summaryJson = {
    generatedAt: new Date().toISOString(),
    mission: {
      initiative: takeoffSummary.initiative,
      objective: takeoffSummary.objective,
      budget: budgetText,
    },
    dryRun: takeoffSummary.dryRun,
    control: matrix,
    artefacts: takeoffSummary.artifacts,
  };

  await fs.writeFile(
    GRAND_SUMMARY_JSON_PATH,
    `${JSON.stringify(summaryJson, null, 2)}\n`,
  );
}

async function main(): Promise<void> {
  await fs.mkdir(REPORT_ROOT, { recursive: true });
  await fs.mkdir(BUNDLE_ROOT, { recursive: true });

  await ensureBaseDemo();

  const planRaw = await readJson<Record<string, any>>(PLAN_PATH, 'project plan');
  const takeoffSummary = await readJson<TakeoffSummary>(SUMMARY_PATH, 'ASI take-off summary');

  const controlMatrix = await buildControlMatrix();
  await fs.writeFile(
    CONTROL_MATRIX_PATH,
    `${JSON.stringify(controlMatrix, null, 2)}\n`,
  );

  await writeGrandSummary(planRaw, takeoffSummary, controlMatrix);

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
    outputBasename: 'agi-os-grand-demo',
    additionalArtifacts: [
      {
        key: 'agiOsGrandSummary',
        path: GRAND_SUMMARY_MD_PATH,
        description: 'Aggregated AGI operating system demonstration summary (markdown).',
      },
      {
        key: 'agiOsGrandSummaryJson',
        path: GRAND_SUMMARY_JSON_PATH,
        description: 'Aggregated AGI operating system demonstration summary (JSON).',
      },
      {
        key: 'ownerControlMatrix',
        path: CONTROL_MATRIX_PATH,
        description: 'Owner control command matrix covering every module.',
      },
    ],
    referenceDocs: [
      { path: 'README.md', description: 'Platform overview and control surface map.' },
      { path: 'docs/owner-control-command-center.md', description: 'Owner command centre field guide.' },
      { path: 'docs/v2-ci-operations.md', description: 'Continuous integration operations playbook.' },
    ],
  });

  process.stdout.write(
    '\nAGI operating system demonstration bundle available at reports/agi-os.\n',
  );
}

main().catch((error) => {
  process.stderr.write(`\nAGI operating system demo failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});

