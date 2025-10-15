#!/usr/bin/env ts-node
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';

interface NationScenario {
  name: string;
  wallet: string;
  ensSubdomain: string;
  mission: string;
  specCid: string;
  resultCid: string;
  rewardTokens: string;
  deadlineHours: number;
}

interface ValidatorScenario {
  name: string;
  wallet: string;
  ensSubdomain: string;
  mission: string;
}

interface TreasuryScenario {
  name: string;
  wallet: string;
  ensSubdomain: string;
  mission: string;
}

interface TridentScenario {
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

function sanitizeScope(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'mission';
  const safe = trimmed.replace(/[^A-Za-z0-9_.-]/g, '-');
  if (safe === '.' || safe === '..') {
    return 'mission';
  }
  return safe;
}

function computeSha256(filePath: string): string | null {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }
  const data = fs.readFileSync(filePath);
  return createHash('sha256').update(data).digest('hex');
}

function writeLedger(scenario: TridentScenario, ledgerPath: string): void {
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

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const scenarioPath = path.join(__dirname, 'config', 'trident.simulation.json');
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8')) as TridentScenario;

  const network = process.env.TRIDENT_NETWORK?.trim() || 'sepolia';
  const scope = sanitizeScope(process.env.TRIDENT_REPORT_SCOPE || 'mission');
  const reportRoot = path.join(repoRoot, 'reports', 'trident-sovereign', scope);
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
      id: 'trident-simulation',
      label: 'Trident sovereign wallet simulation',
      command: 'npx',
      args: [
        'hardhat',
        'test',
        'test/demo/tridentSovereignSimulation.test.ts',
      ],
    },
  ];

  const results: PhaseResult[] = [];

  for (const phase of phases) {
    console.log(`
🔱  ${phase.label}`);
    const started = performance.now();
    const spawnEnv = { ...process.env, ...(phase.env || {}) };
    spawnEnv.TRIDENT_NETWORK = network;
    spawnEnv.TRIDENT_REPORT_SCOPE = scope;
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
  lines.push('# Trident Sovereign Mission Summary');
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
✅ Trident Sovereign orchestration complete. Summary written to ${summaryPath}`);
}

main().catch((error) => {
  console.error('Trident Sovereign orchestration failed:', error);
  process.exit(1);
});
