#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_ROOT = path.join(ROOT, 'reports');
const AGI_OS_REPORT_ROOT = path.join(REPORT_ROOT, 'agi-os');
const CELESTIAL_ROOT = path.join(REPORT_ROOT, 'celestial-sovereign');
const LOG_ROOT = path.join(CELESTIAL_ROOT, 'logs');
const TRANSCRIPT_PATH = path.join(CELESTIAL_ROOT, 'labor-market-transcript.json');
const OWNER_SURFACE_PATH = path.join(CELESTIAL_ROOT, 'owner-surface.json');
const OWNER_PLAN_PATH = path.join(CELESTIAL_ROOT, 'owner-plan.json');
const BRANCH_PROTECTION_PATH = path.join(CELESTIAL_ROOT, 'branch-protection.txt');
const RUN_REPORT_PATH = path.join(CELESTIAL_ROOT, 'run-report.json');
const BRIEFING_MD_PATH = path.join(CELESTIAL_ROOT, 'mission-briefing.md');
const BRIEFING_HTML_PATH = path.join(CELESTIAL_ROOT, 'mission-briefing.html');
const MANIFEST_PATH = path.join(CELESTIAL_ROOT, 'manifest.json');

const FIRST_CLASS_RUN_PATH = path.join(AGI_OS_REPORT_ROOT, 'first-class', 'first-class-run.json');
const OWNER_CONTROL_MATRIX_PATH = path.join(AGI_OS_REPORT_ROOT, 'owner-control-matrix.json');

const EOL = os.EOL;

const NETWORK_PRESETS = {
  localhost: {
    key: 'localhost',
    label: 'Local Hardhat (Anvil)',
    description: 'Deterministic rehearsal on the built-in Hardhat network.',
    hardhatNetwork: 'hardhat',
  },
  sepolia: {
    key: 'sepolia',
    label: 'Sepolia testnet',
    description: 'Requires funded governance signer and RPC credentials.',
    hardhatNetwork: 'sepolia',
  },
} as const;

type NetworkKey = keyof typeof NETWORK_PRESETS;

type CliArgs = Record<string, string | boolean>;

type StepStatus = 'success' | 'failed' | 'skipped';

type StepResult = {
  key: string;
  title: string;
  status: StepStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode?: number;
  logFile?: string;
  notes?: string[];
  details?: Record<string, unknown>;
  stdout?: string;
  stderr?: string;
};

type StepDefinition = {
  key: string;
  title: string;
  optional?: boolean;
  skip?: (ctx: DemoContext) => boolean;
  run: (ctx: DemoContext, results: StepResult[]) => Promise<StepResult>;
};

type DemoContext = {
  network: NetworkKey;
  hardhatNetwork: string;
  autoYes: boolean;
  launchCompose: boolean;
  skipOs: boolean;
  skipMarket: boolean;
  skipOwnerSurface: boolean;
  skipOwnerPlan: boolean;
  skipBranchProtection: boolean;
  reuseFirstClass: boolean;
  gitCommit?: string;
  gitBranch?: string;
  gitStatusClean?: boolean;
  dockerVersion?: string;
  composeVersion?: string;
  nodeVersion: string;
};

type CommandCapture = {
  success: boolean;
  stdout: string;
  stderr: string;
};

type CelestialSummary = {
  generatedAt: string;
  host: string;
  network: string;
  hardhatNetwork: string;
  autoYes: boolean;
  launchCompose: boolean;
  os?: {
    steps?: any[];
  };
  laborMarket?: {
    transcript?: string;
    scenarios?: number;
    agents?: number;
    validators?: number;
    certificates?: number;
    totalJobs?: string;
    totalBurned?: string;
    totalAgentStake?: string;
    totalValidatorStake?: string;
  };
  ownerSurface?: {
    modules: number;
    ready: number;
    warn: number;
    error: number;
    file: string;
  };
  ownerPlan?: {
    modules: number;
    totalActions: number;
    file: string;
  };
  branchProtection?: {
    enforced?: boolean;
    file?: string;
    note?: string;
  };
  issues: string[];
};

type ManifestEntry = {
  path: string;
  size: number;
  sha256: string;
};

type ManifestReport = {
  generatedAt: string;
  files: ManifestEntry[];
};

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const result: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function parseBool(value: string | boolean | undefined): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalised)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalised)) return false;
  }
  return undefined;
}

async function promptYesNo(question: string, defaultValue: boolean, autoYes: boolean): Promise<boolean> {
  if (autoYes) return defaultValue;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ' [Y/n] ' : ' [y/N] ';
  const answer: string = await new Promise((resolve) => rl.question(`${question}${suffix}`, resolve));
  rl.close();
  const normalised = answer.trim().toLowerCase();
  if (!normalised) return defaultValue;
  return ['y', 'yes'].includes(normalised);
}

async function promptSelect<T extends { key: string; label: string; description?: string }>(
  question: string,
  options: T[],
  defaultKey: string,
  autoYes: boolean
): Promise<T> {
  if (autoYes) {
    const fallback = options.find((option) => option.key === defaultKey);
    if (!fallback) throw new Error(`Default option ${defaultKey} not found`);
    return fallback;
  }
  console.log(question);
  options.forEach((option, index) => {
    const prefix = option.key === defaultKey ? '*' : ' ';
    const description = option.description ? ` — ${option.description}` : '';
    console.log(`  ${prefix} [${index + 1}] ${option.label}${description}`);
  });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer: string = await new Promise((resolve) => rl.question(`Select 1-${options.length} (default ${defaultKey}): `, resolve));
  rl.close();
  const trimmed = answer.trim();
  if (!trimmed) {
    const fallback = options.find((option) => option.key === defaultKey);
    if (!fallback) throw new Error(`Default option ${defaultKey} not found`);
    return fallback;
  }
  const index = Number.parseInt(trimmed, 10);
  if (Number.isInteger(index) && index >= 1 && index <= options.length) {
    return options[index - 1];
  }
  const direct = options.find((option) => option.key === trimmed || option.label.toLowerCase() === trimmed.toLowerCase());
  if (direct) return direct;
  throw new Error(`Invalid selection: ${answer}`);
}

function createPrefixedWriter(prefix: string) {
  let buffer = '';
  return {
    write(data: Buffer | string) {
      buffer += data.toString();
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        process.stdout.write(`${prefix}${line}${EOL}`);
        newlineIndex = buffer.indexOf('\n');
      }
    },
    flush() {
      if (buffer.length > 0) {
        process.stdout.write(`${prefix}${buffer}${EOL}`);
        buffer = '';
      }
    },
  };
}

async function runCommand(
  key: string,
  title: string,
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<StepResult> {
  const startedAt = new Date();
  const safeName = `${startedAt.toISOString().replace(/[:.]/g, '-')}-${key}.log`;
  const logPath = path.join(LOG_ROOT, safeName);
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  const prefixedStdout = createPrefixedWriter(`[${key}] `);
  const prefixedStderr = createPrefixedWriter(`[${key}! ] `);

  let stdoutBuffer = '';
  let stderrBuffer = '';
  const child = spawn(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...options.env },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    prefixedStdout.write(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    stderrBuffer += chunk.toString();
    prefixedStderr.write(chunk);
  });

  const exitCode: number = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 0));
  });

  prefixedStdout.flush();
  prefixedStderr.flush();

  const combinedLog = [
    `# ${title}`,
    `# Command: ${command} ${args.join(' ')}`,
    `# Started: ${startedAt.toISOString()}`,
    `# Exit code: ${exitCode}`,
    '',
    '## STDOUT',
    stdoutBuffer,
    '',
    '## STDERR',
    stderrBuffer,
    '',
  ];
  await fs.writeFile(logPath, combinedLog.join(EOL), 'utf8');

  const endedAt = new Date();
  const durationMs = endedAt.getTime() - startedAt.getTime();

  return {
    key,
    title,
    status: exitCode === 0 ? 'success' : 'failed',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs,
    exitCode,
    logFile: path.relative(ROOT, logPath),
    stdout: stdoutBuffer,
    stderr: stderrBuffer,
  };
}

async function tryCommandCapture(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<CommandCapture> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ success: false, stdout: '', stderr: String(error) });
    });
    child.on('exit', (code) => {
      resolve({ success: code === 0, stdout, stderr });
    });
  });
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function runPreflight(ctx: DemoContext): Promise<StepResult> {
  const startedAt = new Date();
  const notes: string[] = [];
  const details: Record<string, unknown> = {};

  await fs.mkdir(LOG_ROOT, { recursive: true });
  await fs.mkdir(CELESTIAL_ROOT, { recursive: true });

  const dockerCheck = await tryCommandCapture('docker', ['--version']);
  if (dockerCheck.success) {
    ctx.dockerVersion = dockerCheck.stdout.trim();
    details.dockerVersion = ctx.dockerVersion;
  } else {
    notes.push('Docker CLI not detected; launch scripts may rely on existing containers.');
  }

  const composeCheck = await tryCommandCapture('docker', ['compose', 'version']);
  if (composeCheck.success) {
    ctx.composeVersion = composeCheck.stdout.trim();
    details.composeVersion = ctx.composeVersion;
  } else {
    notes.push('Docker Compose v2 unavailable. Ensure the one-click stack is running if required.');
  }

  ctx.nodeVersion = process.version;
  details.nodeVersion = ctx.nodeVersion;

  const gitStatus = await tryCommandCapture('git', ['status', '--short'], { cwd: ROOT });
  const gitCommit = await tryCommandCapture('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
  const gitBranch = await tryCommandCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT });

  if (gitCommit.success) {
    ctx.gitCommit = gitCommit.stdout.trim();
    details.gitCommit = ctx.gitCommit;
  }
  if (gitBranch.success) {
    ctx.gitBranch = gitBranch.stdout.trim();
    details.gitBranch = ctx.gitBranch;
  }
  ctx.gitStatusClean = gitStatus.success ? gitStatus.stdout.trim().length === 0 : undefined;
  details.gitStatusClean = ctx.gitStatusClean ?? null;
  if (ctx.gitStatusClean === false) {
    notes.push('Working tree has uncommitted changes; artefacts will include local modifications.');
  }

  const nodeModulesExists = await pathExists(path.join(ROOT, 'node_modules'));
  details.nodeModulesPresent = nodeModulesExists;
  if (!nodeModulesExists) {
    notes.push('node_modules not found. Run npm install for optimal performance.');
  }

  const endedAt = new Date();
  return {
    key: 'preflight',
    title: 'Preflight diagnostics',
    status: 'success',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    notes: notes.length > 0 ? notes : undefined,
    details,
  };
}

async function summariseFirstClass(): Promise<{ steps?: any[]; warning?: string }> {
  if (!(await pathExists(FIRST_CLASS_RUN_PATH))) {
    return { warning: 'First-class OS artefacts missing. Run demo:agi-os:first-class first.' };
  }
  try {
    const report = await readJsonFile<any>(FIRST_CLASS_RUN_PATH);
    return { steps: Array.isArray(report.steps) ? report.steps : undefined };
  } catch (error) {
    return { warning: `Unable to parse first-class run report: ${String(error)}` };
  }
}

async function summariseTranscript(): Promise<{
  data?: any;
  warning?: string;
}> {
  if (!(await pathExists(TRANSCRIPT_PATH))) {
    return { warning: 'Labor market transcript not generated.' };
  }
  try {
    const data = await readJsonFile<any>(TRANSCRIPT_PATH);
    return { data };
  } catch (error) {
    return { warning: `Unable to parse labor market transcript: ${String(error)}` };
  }
}

async function summariseOwnerSurface(): Promise<{
  data?: any;
  warning?: string;
}> {
  if (!(await pathExists(OWNER_SURFACE_PATH))) {
    return { warning: 'Owner control surface JSON missing.' };
  }
  try {
    const data = await readJsonFile<any>(OWNER_SURFACE_PATH);
    return { data };
  } catch (error) {
    return { warning: `Unable to parse owner control surface JSON: ${String(error)}` };
  }
}

async function summariseOwnerPlan(result?: StepResult): Promise<{
  data?: any;
  warning?: string;
}> {
  if (!result) return { warning: 'Owner automation step did not execute.' };
  if (result.status !== 'success') return { warning: 'Owner automation step failed.' };
  const payload = result.stdout ? result.stdout.trim() : '';
  if (!payload) return { warning: 'Owner automation produced no JSON output.' };
  try {
    const data = JSON.parse(payload);
    await fs.writeFile(OWNER_PLAN_PATH, `${JSON.stringify(data, null, 2)}${EOL}`);
    return { data };
  } catch (error) {
    return { warning: `Unable to parse owner automation JSON: ${String(error)}` };
  }
}

async function summariseBranchProtection(result?: StepResult): Promise<{ note: string; enforced?: boolean }> {
  if (!result) return { note: 'Branch protection audit skipped by configuration.' };
  if (result.status === 'skipped') {
    const note = result.notes?.[0] ?? 'Branch protection audit skipped.';
    return { note };
  }
  if (result.status !== 'success') {
    const note = result.notes?.[0] ?? 'Branch protection audit failed.';
    return { note };
  }
  const stdout = result.stdout ?? '';
  await fs.writeFile(BRANCH_PROTECTION_PATH, stdout, 'utf8');
  const enforced = stdout.includes('✅');
  return { note: 'Branch protection audit completed.', enforced };
}

function summariseStatuses(reports: any[]): { modules: number; ready: number; warn: number; error: number } {
  return reports.reduce(
    (acc, entry) => {
      acc.modules += 1;
      const status = entry.status ?? entry.state ?? 'ok';
      if (status === 'ok' || status === 'ready') acc.ready += 1;
      else if (status === 'warn' || status === 'warning') acc.warn += 1;
      else acc.error += 1;
      return acc;
    },
    { modules: 0, ready: 0, warn: 0, error: 0 }
  );
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds.toFixed(1)}s`;
}

async function generateManifest(): Promise<ManifestReport> {
  const entries: ManifestEntry[] = [];
  async function walk(relative: string) {
    const absolute = path.join(CELESTIAL_ROOT, relative);
    const stat = await fs.stat(absolute);
    if (stat.isDirectory()) {
      const children = await fs.readdir(absolute);
      for (const child of children) {
        await walk(path.join(relative, child));
      }
      return;
    }
    const data = await fs.readFile(absolute);
    const hash = createHash('sha256').update(data).digest('hex');
    entries.push({ path: path.join('reports/celestial-sovereign', relative), size: stat.size, sha256: hash });
  }
  if (await pathExists(CELESTIAL_ROOT)) {
    const children = await fs.readdir(CELESTIAL_ROOT);
    for (const child of children) {
      await walk(child);
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const report: ManifestReport = { generatedAt: new Date().toISOString(), files: entries };
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(report, null, 2)}${EOL}`, 'utf8');
  return report;
}

async function renderMarkdown(summary: CelestialSummary): Promise<void> {
  const lines: string[] = [];
  lines.push('# Celestial Sovereign Orbital AGI-OS Grand Demonstration');
  lines.push('');
  lines.push(`Generated ${summary.generatedAt} on ${summary.host} for ${summary.network} (${summary.hardhatNetwork}).`);
  lines.push('');
  lines.push('## Operating System Rehearsal');
  if (summary.os?.steps && summary.os.steps.length > 0) {
    lines.push('');
    lines.push('| Step | Status | Duration |');
    lines.push('| --- | --- | --- |');
    summary.os.steps.forEach((step: any) => {
      const status = step.status === 'success' ? '✅ Success' : step.status === 'skipped' ? '⏭️ Skipped' : '❌ Failed';
      lines.push(`| ${step.title} | ${status} | ${formatDuration(step.durationMs ?? 0)} |`);
    });
    lines.push('');
  } else {
    lines.push('');
    lines.push('- ⚠️ First-class OS transcript not available.');
    lines.push('');
  }

  lines.push('## Labor Market Simulation');
  if (summary.laborMarket?.transcript) {
    lines.push('');
    lines.push(`Transcript: \`${summary.laborMarket.transcript}\``);
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('| --- | --- |');
    if (summary.laborMarket.totalJobs) lines.push(`| Jobs executed | ${summary.laborMarket.totalJobs} |`);
    if (summary.laborMarket.totalBurned) lines.push(`| Token burn | ${summary.laborMarket.totalBurned} |`);
    if (summary.laborMarket.totalAgentStake) lines.push(`| Agent stake locked | ${summary.laborMarket.totalAgentStake} |`);
    if (summary.laborMarket.totalValidatorStake) lines.push(`| Validator stake locked | ${summary.laborMarket.totalValidatorStake} |`);
    lines.push(`| Scenarios | ${summary.laborMarket.scenarios ?? 0} |`);
    lines.push(`| Agents | ${summary.laborMarket.agents ?? 0} |`);
    lines.push(`| Validators | ${summary.laborMarket.validators ?? 0} |`);
    lines.push(`| Credential NFTs minted | ${summary.laborMarket.certificates ?? 0} |`);
    lines.push('');
  } else {
    lines.push('');
    lines.push('- ⚠️ Labor market transcript missing.');
    lines.push('');
  }

  lines.push('## Owner Command Authority');
  if (summary.ownerSurface) {
    lines.push('');
    lines.push(`Owner control surface ready=${summary.ownerSurface.ready} warn=${summary.ownerSurface.warn} error=${summary.ownerSurface.error} (modules=${summary.ownerSurface.modules}).`);
    lines.push(`Report: \`${summary.ownerSurface.file}\``);
    lines.push('');
  } else {
    lines.push('');
    lines.push('- ⚠️ Owner control surface report unavailable.');
    lines.push('');
  }

  lines.push('## Owner Automation Plan');
  if (summary.ownerPlan) {
    lines.push('');
    lines.push(`Modules analysed: ${summary.ownerPlan.modules}, actions proposed: ${summary.ownerPlan.totalActions}.`);
    lines.push(`Plan: \`${summary.ownerPlan.file}\``);
    lines.push('');
  } else {
    lines.push('');
    lines.push('- ⚠️ Owner automation JSON missing.');
    lines.push('');
  }

  lines.push('## Branch Protection (CI v2)');
  if (summary.branchProtection) {
    lines.push('');
    if (summary.branchProtection.file) lines.push(`Transcript: \`${summary.branchProtection.file}\``);
    const statusLine = summary.branchProtection.enforced ? '- ✅ Required contexts enforced.' : '- ⚠️ Unable to confirm enforcement.';
    lines.push(statusLine);
    if (summary.branchProtection.note) lines.push(`- ${summary.branchProtection.note}`);
    lines.push('');
  } else {
    lines.push('');
    lines.push('- ⚠️ Branch protection audit skipped.');
    lines.push('');
  }

  lines.push('## Outstanding Issues');
  lines.push('');
  if (summary.issues.length === 0) {
    lines.push('- None. All systems nominal.');
  } else {
    summary.issues.forEach((issue) => lines.push(`- ${issue}`));
  }
  lines.push('');

  await fs.writeFile(BRIEFING_MD_PATH, lines.join(EOL), 'utf8');
}

async function renderHtml(summary: CelestialSummary): Promise<void> {
  const markdown = await fs.readFile(BRIEFING_MD_PATH, 'utf8');
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const htmlLines = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <title>Celestial Sovereign Orbital AGI-OS Demonstration</title>',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '    <style>',
    "      body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 2rem; background: #030712; color: #f9fafc; }",
    '      h1, h2 { color: #8fd3ff; }',
    '      pre { background: rgba(255, 255, 255, 0.08); padding: 1.5rem; border-radius: 12px; overflow-x: auto; }',
    '      table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; }',
    '      th, td { border: 1px solid rgba(255, 255, 255, 0.15); padding: 0.5rem 0.75rem; text-align: left; }',
    '      tr:nth-child(even) { background: rgba(255, 255, 255, 0.05); }',
    '      code { font-family: "JetBrains Mono", "Fira Code", monospace; }',
    '    </style>',
    '  </head>',
    '  <body>',
    '    <h1>Celestial Sovereign Orbital AGI-OS Grand Demonstration</h1>',
    `    <p><strong>Generated:</strong> ${summary.generatedAt} on ${summary.host}</p>`,
    `    <p><strong>Network:</strong> ${summary.network} (${summary.hardhatNetwork})</p>`,
    `    <pre>${escaped}</pre>`,
    '  </body>',
    '</html>',
  ];
  await fs.writeFile(BRIEFING_HTML_PATH, htmlLines.join(EOL), 'utf8');
}

async function synthesise(ctx: DemoContext, results: StepResult[]): Promise<StepResult> {
  const startedAt = new Date();
  const summary: CelestialSummary = {
    generatedAt: startedAt.toISOString(),
    host: os.hostname(),
    network: ctx.network,
    hardhatNetwork: ctx.hardhatNetwork,
    autoYes: ctx.autoYes,
    launchCompose: ctx.launchCompose,
    issues: [],
  };

  const firstClass = await summariseFirstClass();
  if (firstClass.warning) summary.issues.push(firstClass.warning);
  if (firstClass.steps) summary.os = { steps: firstClass.steps };

  const transcript = await summariseTranscript();
  if (transcript.warning) summary.issues.push(transcript.warning);
  if (transcript.data) {
    const data = transcript.data;
    const scenarios = Array.isArray(data.scenarios) ? data.scenarios.length : 0;
    const agents = Array.isArray(data.market?.agentPortfolios) ? data.market.agentPortfolios.length : 0;
    const validators = Array.isArray(data.market?.validatorCouncil) ? data.market.validatorCouncil.length : 0;
    const certificates = Array.isArray(data.market?.mintedCertificates) ? data.market.mintedCertificates.length : 0;
    summary.laborMarket = {
      transcript: path.relative(ROOT, TRANSCRIPT_PATH),
      scenarios,
      agents,
      validators,
      certificates,
      totalJobs: data.market?.totalJobs,
      totalBurned: data.market?.totalBurned,
      totalAgentStake: data.market?.totalAgentStake,
      totalValidatorStake: data.market?.totalValidatorStake,
    };
  }

  const ownerSurface = await summariseOwnerSurface();
  if (ownerSurface.warning) summary.issues.push(ownerSurface.warning);
  if (ownerSurface.data) {
    const counts = summariseStatuses(ownerSurface.data.reports ?? []);
    summary.ownerSurface = {
      modules: counts.modules,
      ready: counts.ready,
      warn: counts.warn,
      error: counts.error,
      file: path.relative(ROOT, OWNER_SURFACE_PATH),
    };
  }

  const ownerPlanResult = results.find((step) => step.key === 'owner-plan');
  const ownerPlanSummary = await summariseOwnerPlan(ownerPlanResult);
  if (ownerPlanSummary.warning) summary.issues.push(ownerPlanSummary.warning);
  if (ownerPlanSummary.data) {
    const modules = Array.isArray(ownerPlanSummary.data.modules) ? ownerPlanSummary.data.modules.length : 0;
    const totalActions = Array.isArray(ownerPlanSummary.data.modules)
      ? ownerPlanSummary.data.modules.reduce(
          (acc: number, module: any) => acc + (Array.isArray(module.actions) ? module.actions.length : 0),
          0
        )
      : 0;
    summary.ownerPlan = {
      modules,
      totalActions,
      file: path.relative(ROOT, OWNER_PLAN_PATH),
    };
  }

  const branchStep = results.find((step) => step.key === 'branch-protection');
  const branchSummary = await summariseBranchProtection(branchStep);
  summary.branchProtection = {
    enforced: branchSummary.enforced,
    file: (await pathExists(BRANCH_PROTECTION_PATH)) ? path.relative(ROOT, BRANCH_PROTECTION_PATH) : undefined,
    note: branchSummary.note,
  };

  if (summary.issues.length === 0) summary.issues = [];

  await fs.writeFile(RUN_REPORT_PATH, `${JSON.stringify(summary, null, 2)}${EOL}`, 'utf8');
  await renderMarkdown(summary);
  await renderHtml(summary);
  await generateManifest();

  const endedAt = new Date();
  return {
    key: 'synthesise',
    title: 'Synthesis and reporting',
    status: 'success',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    details: {
      report: path.relative(ROOT, RUN_REPORT_PATH),
      briefing: path.relative(ROOT, BRIEFING_MD_PATH),
      html: path.relative(ROOT, BRIEFING_HTML_PATH),
      manifest: path.relative(ROOT, MANIFEST_PATH),
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const autoYes = Boolean(parseBool((args['auto-yes'] as string) ?? (args.yes as string)) ?? args['auto-yes'] ?? args.yes);
  const skipOs = Boolean(parseBool(args['skip-os']) ?? false);
  const skipMarket = Boolean(parseBool(args['skip-market']) ?? false);
  const skipOwnerSurface = Boolean(parseBool(args['skip-owner-surface']) ?? false);
  const skipOwnerPlan = Boolean(parseBool(args['skip-owner-plan']) ?? false);
  const skipBranchProtection = Boolean(parseBool(args['skip-branch-protection']) ?? false);
  const reuseFirstClass = Boolean(parseBool(args['reuse-first-class']) ?? false);
  const launchComposeOverride = parseBool(args['launch-compose']);

  const networkOptions = Object.values(NETWORK_PRESETS);
  const selection = await promptSelect('Select network context:', networkOptions, 'localhost', autoYes);
  const launchCompose = launchComposeOverride ?? true;

  const context: DemoContext = {
    network: selection.key as NetworkKey,
    hardhatNetwork: selection.hardhatNetwork,
    autoYes,
    launchCompose,
    skipOs,
    skipMarket,
    skipOwnerSurface,
    skipOwnerPlan,
    skipBranchProtection,
    reuseFirstClass,
    nodeVersion: process.version,
  };

  const confirmed = await promptYesNo('Ready to launch the Celestial Sovereign Orbital AGI-OS demonstration?', true, autoYes);
  if (!confirmed) {
    console.log('Aborted by operator.');
    return;
  }

  const results: StepResult[] = [];
  const steps: StepDefinition[] = [
    {
      key: 'preflight',
      title: 'Preflight diagnostics',
      run: (ctx) => runPreflight(ctx),
    },
    {
      key: 'first-class',
      title: 'Astral Omnidominion first-class OS demo',
      skip: (ctx) => ctx.skipOs,
      run: async (ctx) => {
        if (ctx.reuseFirstClass && (await pathExists(FIRST_CLASS_RUN_PATH))) {
          const now = new Date();
          return {
            key: 'first-class',
            title: 'Astral Omnidominion first-class OS demo',
            status: 'skipped',
            startedAt: now.toISOString(),
            endedAt: now.toISOString(),
            durationMs: 0,
            notes: ['Reusing existing first-class artefacts.'],
          };
        }
        const cmdArgs = ['run', 'demo:agi-os:first-class', '--', '--network', ctx.hardhatNetwork];
        if (ctx.autoYes) cmdArgs.push('--auto-yes');
        cmdArgs.push(ctx.launchCompose ? '--launch-compose=true' : '--launch-compose=false');
        return runCommand('first-class', 'Astral Omnidominion first-class OS demo', 'npm', cmdArgs);
      },
    },
    {
      key: 'labor-market',
      title: 'AGI labor market grand simulation',
      skip: (ctx) => ctx.skipMarket,
      run: (ctx) =>
        runCommand(
          'labor-market',
          'AGI labor market grand simulation',
          'npx',
          ['hardhat', 'run', '--no-compile', 'scripts/v2/agiLaborMarketGrandDemo.ts', '--network', ctx.hardhatNetwork],
          { env: { AGI_JOBS_DEMO_EXPORT: TRANSCRIPT_PATH } }
        ),
    },
    {
      key: 'owner-surface',
      title: 'Owner control surface audit',
      skip: (ctx) => ctx.skipOwnerSurface,
      run: (ctx) =>
        runCommand(
          'owner-surface',
          'Owner control surface audit',
          'npm',
          ['run', 'owner:surface', '--', '--network', ctx.hardhatNetwork, '--json', '--out', OWNER_SURFACE_PATH]
        ),
    },
    {
      key: 'owner-plan',
      title: 'Owner automation bundle synthesis',
      skip: (ctx) => ctx.skipOwnerPlan,
      run: (ctx) =>
        runCommand('owner-plan', 'Owner automation bundle synthesis', 'npm', ['run', 'owner:update-all', '--', '--network', ctx.hardhatNetwork, '--json']),
    },
    {
      key: 'branch-protection',
      title: 'Branch protection enforcement audit',
      skip: (ctx) => ctx.skipBranchProtection,
      run: async () => {
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.PAT;
        if (!token) {
          const now = new Date();
          return {
            key: 'branch-protection',
            title: 'Branch protection enforcement audit',
            status: 'skipped',
            startedAt: now.toISOString(),
            endedAt: now.toISOString(),
            durationMs: 0,
            notes: ['GitHub token not provided – skipping branch protection audit.'],
          };
        }
        return runCommand(
          'branch-protection',
          'Branch protection enforcement audit',
          'npm',
          ['run', 'ci:verify-branch-protection', '--', '--branch', 'main'],
          { env: { GITHUB_TOKEN: token } }
        );
      },
    },
    {
      key: 'synthesise',
      title: 'Synthesis and reporting',
      run: (ctx, stepResults) => synthesise(ctx, stepResults),
    },
  ];

  for (const step of steps) {
    if (step.skip?.(context)) {
      const now = new Date();
      const skipped: StepResult = {
        key: step.key,
        title: step.title,
        status: 'skipped',
        startedAt: now.toISOString(),
        endedAt: now.toISOString(),
        durationMs: 0,
        notes: ['Step skipped by operator'],
      };
      results.push(skipped);
      console.log(`⏭️  ${step.title} (skipped)`);
      continue;
    }

    console.log(`⚙️  ${step.title}`);
    try {
      const result = await step.run(context, results);
      results.push(result);
      if (result.status === 'failed' && !step.optional) {
        console.error(`❌ ${step.title} failed. Inspect ${result.logFile ?? 'logs'} for details.`);
        break;
      }
      if (result.status === 'success') {
        console.log(`✅ ${step.title}`);
      } else if (result.status === 'skipped') {
        console.log(`⏭️  ${step.title} skipped`);
      }
    } catch (error) {
      const endedAt = new Date();
      const failure: StepResult = {
        key: step.key,
        title: step.title,
        status: 'failed',
        startedAt: endedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: 0,
        notes: [error instanceof Error ? error.message : String(error)],
      };
      results.push(failure);
      console.error(`❌ ${step.title} failed:`, error instanceof Error ? error.message : error);
      break;
    }
  }

  await fs.writeFile(path.join(CELESTIAL_ROOT, 'steps.json'), `${JSON.stringify(results, null, 2)}${EOL}`, 'utf8');

  const finalStep = results[results.length - 1];
  if (finalStep?.status === 'failed') {
    process.exitCode = 1;
    console.error('Celestial Sovereign demo completed with failures. Review run-report.json for remediation guidance.');
  } else {
    console.log('🌌 Celestial Sovereign demo completed successfully. Share the celestial-sovereign artefacts with stakeholders.');
  }
}

main().catch((error) => {
  console.error('Fatal error during Celestial Sovereign demo:', error);
  process.exitCode = 1;
});
