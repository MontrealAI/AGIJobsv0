#!/usr/bin/env ts-node
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';

export interface NationScenario {
  name: string;
  wallet: string;
  ensSubdomain: string;
  mission: string;
  specCid: string;
  resultCid: string;
  rewardTokens: string;
  deadlineHours: number;
}

export interface ValidatorScenario {
  name: string;
  wallet: string;
  ensSubdomain: string;
  mission: string;
}

export interface TreasuryScenario {
  name: string;
  wallet: string;
  ensSubdomain: string;
  mission: string;
}

export interface OmegaScenario {
  reportLabel: string;
  ipfsGateway: string;
  ensRoot: string;
  nations: NationScenario[];
  validators: ValidatorScenario[];
  treasury: TreasuryScenario;
}

interface PhaseResult {
  id: string;
  label: string;
  status: 'success' | 'failed';
  exitCode: number;
  durationMs: number;
}

interface PhaseDefinition {
  id: string;
  label: string;
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export function sanitizeScope(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'mission';
  const safe = trimmed.replace(/[^A-Za-z0-9_.-]/g, '-');
  if (safe === '.' || safe === '..') {
    return 'mission';
  }
  return safe;
}

export function computeSha256(filePath: string): string | null {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }
  const data = fs.readFileSync(filePath);
  return createHash('sha256').update(data).digest('hex');
}

export function writeLedger(scenario: OmegaScenario, ledgerPath: string): void {
  const lines: string[] = [];
  scenario.nations.forEach((nation, index) => {
    const employerEns = `${nation.ensSubdomain}.${scenario.ensRoot}`;
    lines.push(
      JSON.stringify({
        type: 'nation-mission',
        jobId: index + 1,
        employer: nation.name,
        employerEns,
        mission: nation.mission,
        specCid: nation.specCid,
        resultCid: nation.resultCid,
        rewardTokens: nation.rewardTokens,
        deadlineHours: nation.deadlineHours,
        validatorPool: scenario.validators.map((validator) => ({
          name: validator.name,
          ens: `${validator.ensSubdomain}.${scenario.ensRoot}`,
          mission: validator.mission,
        })),
      })
    );
  });
  fs.writeFileSync(ledgerPath, `${lines.join('\n')}\n`, 'utf8');
}

function validateUnique(label: string, value: string, registry: Set<string>): void {
function validateUnique(label: string, value: unknown, registry: Set<string>): void {
  if (value === null || value === undefined) {
    throw new Error(`${label} must be provided`);
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} must be provided`);
  }
  if (registry.has(trimmed)) {
    throw new Error(`Duplicate ${label} detected: ${trimmed}`);
  }
  registry.add(trimmed);
}

function parsePositiveInteger(label: string, value: number | string): void {
  const normalized = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
}

function assertBigIntish(label: string, raw: string): bigint {
  try {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new Error(`${label} cannot be empty`);
    }
    return BigInt(trimmed);
function assertBigIntish(label: string, raw: string): void {
  try {
    if (raw.trim().length === 0) {
      throw new Error(`${label} cannot be empty`);
    }
    BigInt(raw);
  } catch (error) {
    throw new Error(`${label} must be an integer string`);
  }
}

export function validateScenario(scenario: OmegaScenario): void {
  if (!scenario || typeof scenario !== 'object') {
    throw new Error('Scenario configuration is required');
  }
  if (!scenario.reportLabel?.trim()) {
    throw new Error('Scenario reportLabel must be provided');
  }
  if (!scenario.ipfsGateway?.trim()) {
    throw new Error('Scenario ipfsGateway must be provided');
  }
  if (!scenario.ensRoot?.trim()) {
    throw new Error('Scenario ensRoot must be provided');
  }

  if (!Array.isArray(scenario.nations) || scenario.nations.length === 0) {
    throw new Error('Scenario must include at least one nation');
  }
  if (!Array.isArray(scenario.validators) || scenario.validators.length === 0) {
    throw new Error('Scenario must include at least one validator');
  }
  if (!scenario.treasury) {
    throw new Error('Scenario must include a treasury configuration');
  }

  const walletLabels = new Set<string>();
  const ensLabels = new Set<string>();

  scenario.nations.forEach((nation, index) => {
    if (!nation.name?.trim()) {
      throw new Error(`Nation at index ${index} requires a name`);
    }
    validateUnique('nation wallet label', nation.wallet, walletLabels);
    validateUnique('nation ENS subdomain', nation.ensSubdomain, ensLabels);
    if (!nation.mission?.trim()) {
      throw new Error(`Nation ${nation.name} mission must be provided`);
    }
    if (!nation.specCid?.trim()) {
      throw new Error(`Nation ${nation.name} specCid must be provided`);
    }
    if (!nation.resultCid?.trim()) {
      throw new Error(`Nation ${nation.name} resultCid must be provided`);
    }
    const rewardTokens = assertBigIntish(
      `Nation ${nation.name} rewardTokens`,
      nation.rewardTokens
    );
    if (rewardTokens <= 0n) {
      throw new Error(`Nation ${nation.name} rewardTokens must be greater than zero`);
    }
    assertBigIntish(`Nation ${nation.name} rewardTokens`, nation.rewardTokens);
    parsePositiveInteger(`Nation ${nation.name} deadlineHours`, nation.deadlineHours);
  });

  scenario.validators.forEach((validator, index) => {
    if (!validator.name?.trim()) {
      throw new Error(`Validator at index ${index} requires a name`);
    }
    validateUnique('validator wallet label', validator.wallet, walletLabels);
    validateUnique('validator ENS subdomain', validator.ensSubdomain, ensLabels);
    if (!validator.mission?.trim()) {
      throw new Error(`Validator ${validator.name} mission must be provided`);
    }
  });

  const treasury = scenario.treasury;
  if (!treasury.name?.trim()) {
    throw new Error('Treasury requires a name');
  }
  validateUnique('treasury wallet label', treasury.wallet, walletLabels);
  validateUnique('treasury ENS subdomain', treasury.ensSubdomain, ensLabels);
  if (!treasury.mission?.trim()) {
    throw new Error('Treasury mission must be provided');
  }
}

export async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const scenarioPath = path.join(__dirname, 'config', 'omega.simulation.json');
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8')) as OmegaScenario;

  validateScenario(scenario);

  const network = process.env.OMEGA_NETWORK?.trim() || 'sepolia';
  const scope = sanitizeScope(process.env.OMEGA_REPORT_SCOPE || 'mission');
  const reportRoot = path.join(repoRoot, 'reports', 'omega-business-3', scope);
  fs.mkdirSync(reportRoot, { recursive: true });

  const phases: PhaseDefinition[] = [
    {
      id: 'owner-quickstart',
      label: 'Owner control quickstart',
      command: 'npm',
      args: [
        'run',
        'owner:quickstart',
        '--',
        '--network',
        network,
        '--format',
        'markdown',
        '--out',
        path.join(reportRoot, 'owner-quickstart.md'),
      ],
    },
    {
      id: 'owner-command-center',
      label: 'Owner command centre atlas',
      command: 'npm',
      args: [
        'run',
        'owner:command-center',
        '--',
        '--network',
        network,
        '--format',
        'markdown',
        '--output',
        path.join(reportRoot, 'owner-command-center.md'),
      ],
    },
    {
      id: 'owner-parameter-matrix',
      label: 'Owner parameter matrix',
      command: 'npm',
      args: [
        'run',
        'owner:parameters',
        '--',
        '--network',
        network,
        '--out',
        path.join(reportRoot, 'parameter-matrix.json'),
      ],
    },
    {
      id: 'owner-control-surface',
      label: 'Owner control surface snapshot',
      command: 'npm',
      args: [
        'run',
        'owner:surface',
        '--',
        '--network',
        network,
        '--format',
        'markdown',
        '--out',
        path.join(reportRoot, 'owner-control-surface.md'),
      ],
    },
    {
      id: 'omega-simulation',
      label: 'Omega-grade sovereign wallet simulation',
      command: 'npx',
      args: [
        'hardhat',
        'test',
        'test/demo/omegaBusinessSimulation.test.ts',
      ],
    },
  ];

  const results: PhaseResult[] = [];

  for (const phase of phases) {
    console.log(`
🏛️  ${phase.label}`);
    const started = performance.now();
    const spawnEnv = { ...process.env, ...(phase.env || {}) };
    spawnEnv.OMEGA_NETWORK = network;
    spawnEnv.OMEGA_REPORT_SCOPE = scope;
    const outcome = spawnSync(phase.command, phase.args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: spawnEnv,
    });
    const finished = performance.now();
    const status = outcome.status === 0 ? 'success' : 'failed';
    results.push({
      id: phase.id,
      label: phase.label,
      status,
      exitCode: outcome.status ?? -1,
      durationMs: finished - started,
    });
    if (status === 'failed') {
      throw new Error(`Phase "${phase.label}" failed with exit code ${outcome.status}`);
    }
  }

  const ledgerPath = path.join(reportRoot, 'simulation-ledger.ndjson');
  writeLedger(scenario, ledgerPath);

  const summaryPath = path.join(reportRoot, 'mission-summary.md');
  const lines: string[] = [];
  lines.push('# Large-Scale α-AGI Business 3 Mission Summary');
  lines.push('');
  lines.push(`- Network: \`${network}\``);
  lines.push(`- ENS root: \`${scenario.ensRoot}\``);
  lines.push(`- Report scope: \`${scope}\``);
  lines.push(`- Nations: ${scenario.nations.map((nation) => `**${nation.name}**`).join(', ')}`);
  lines.push(`- Validators: ${scenario.validators.map((v) => `**${v.name}**`).join(', ')}`);
  lines.push('');
  lines.push('## Execution Timeline');
  lines.push('');
  results.forEach((result) => {
    const duration = (result.durationMs / 1000).toFixed(2);
    lines.push(`- ${result.status === 'success' ? '✅' : '❌'} **${result.label}** — ${duration}s (exit ${result.exitCode})`);
  });
  lines.push('');
  lines.push('## Scenario Ledger');
  lines.push('');
  scenario.nations.forEach((nation, index) => {
    const employerEns = `${nation.ensSubdomain}.${scenario.ensRoot}`;
    const reward = Number(nation.rewardTokens).toLocaleString();
    lines.push(`### Job ${index + 1}: ${nation.name}`);
    lines.push('');
    lines.push(`- Employer ENS: \`${employerEns}\``);
    lines.push(`- Mission: ${nation.mission}`);
    lines.push(`- Reward: ${reward} tokens`);
    lines.push(`- Deadline: ${nation.deadlineHours} hours`);
    lines.push(`- Spec CID: \`${nation.specCid}\``);
    lines.push(`- Expected Result CID: \`${nation.resultCid}\``);
    lines.push('');
  });
  lines.push('## Artefact Integrity');
  lines.push('');
  const artefacts = [
    'owner-quickstart.md',
    'owner-command-center.md',
    'parameter-matrix.json',
    'owner-control-surface.md',
    'simulation-ledger.ndjson',
  ];
  artefacts.forEach((fileName) => {
    const filePath = path.join(reportRoot, fileName);
    const digest = computeSha256(filePath);
    if (digest) {
      lines.push(`- \`${fileName}\` → \`${digest}\``);
    }
  });
  fs.writeFileSync(summaryPath, `${lines.join(os.EOL)}${os.EOL}`, 'utf8');

  console.log(`
✅ Large-Scale α-AGI Business 3 orchestration complete. Summary written to ${summaryPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Large-Scale α-AGI Business 3 orchestration failed:', error);
    process.exit(1);
  });
}
