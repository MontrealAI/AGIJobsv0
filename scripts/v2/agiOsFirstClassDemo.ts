#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_ROOT = path.join(ROOT, 'reports', 'agi-os');
const TAKEOFF_ROOT = path.join(ROOT, 'reports', 'asi-takeoff');
const FIRST_CLASS_ROOT = path.join(REPORT_ROOT, 'first-class');
const LOG_ROOT = path.join(FIRST_CLASS_ROOT, 'logs');
const GRAND_SUMMARY_MD = path.join(REPORT_ROOT, 'grand-summary.md');
const GRAND_SUMMARY_JSON = path.join(REPORT_ROOT, 'grand-summary.json');
const OWNER_CONTROL_MATRIX = path.join(
  REPORT_ROOT,
  'owner-control-matrix.json'
);
const GRAND_SUMMARY_HTML = path.join(REPORT_ROOT, 'grand-summary.html');
const FIRST_CLASS_RUN = path.join(FIRST_CLASS_ROOT, 'first-class-run.json');
const FIRST_CLASS_MANIFEST = path.join(
  FIRST_CLASS_ROOT,
  'first-class-manifest.json'
);
const OWNER_CONTROL_MAP = path.join(FIRST_CLASS_ROOT, 'owner-control-map.mmd');

const NETWORK_PRESETS = {
  localhost: {
    key: 'localhost',
    label: 'Local Hardhat (Anvil)',
    description: 'Deterministic rehearsal using the built-in Anvil network.',
    configPath: path.join('deployment-config', 'deployer.sample.json'),
    envPath: path.join('deployment-config', 'oneclick.env'),
    hardhatNetwork: 'localhost',
  },
  sepolia: {
    key: 'sepolia',
    label: 'Sepolia testnet',
    description: 'Requires funded governance signer and RPC credentials.',
    configPath: path.join('deployment-config', 'sepolia.json'),
    envPath: path.join('deployment-config', 'oneclick.env'),
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
};

type StepDefinition = {
  key: string;
  title: string;
  optional?: boolean;
  skip?: (ctx: DemoContext) => boolean;
  skipReason?: (ctx: DemoContext) => string | undefined;
  run: (ctx: DemoContext) => Promise<StepResult>;
};

type ManifestEntry = {
  path: string;
  size: number;
  sha256: string;
};

type DemoContext = {
  network: NetworkKey;
  configPath: string;
  envPath: string;
  hardhatNetwork: string;
  autoYes: boolean;
  launchCompose: boolean;
  dockerAvailable?: boolean;
  runtimeUnavailable?: boolean;
  skipDeployment: boolean;
  startTimestamp: string;
  gitCommit?: string;
  gitBranch?: string;
  gitStatusClean?: boolean;
  dockerVersion?: string;
  composeVersion?: string;
  nodeVersion: string;
};

type ControlSurfaceStatus = 'ready' | 'needs-config' | 'missing-surface';

type ControlMatrixSummary = {
  total: number;
  ready: number;
  needsConfig: number;
  missingSurface: number;
};

type ControlMatrixModule = {
  key: string;
  label?: string;
  status: ControlSurfaceStatus;
  [key: string]: unknown;
};

type ControlMatrix = {
  owner?: string | null;
  governance?: string | null;
  modules?: ControlMatrixModule[];
  summary?: ControlMatrixSummary;
};

type GrandSummary = {
  control?: ControlMatrix | null;
};

type ManifestReport = {
  entries?: ManifestEntry[];
};

function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const result: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (['-h', '-?', '--help'].includes(token)) {
      result.help = true;
      continue;
    }
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

function printUsage(): void {
  console.log(buildUsage());
}

function buildUsage(): string {
  return [
    'Astral Omnidominion Operating System Demo',
    '',
    'Usage: ts-node scripts/v2/agiOsFirstClassDemo.ts [options]',
    '',
    'Options:',
    '  -h, --help                 Show this help message and exit.',
    '  --network <name>           Select network preset (localhost | sepolia).',
    '  --yes, --non-interactive   Assume defaults for all prompts.',
    '  --compose                  Launch Docker Compose automatically.',
    '  --no-compose               Skip Docker Compose auto-launch.',
    '  --skip-deploy              Run demo steps without the deployment wizard.',
    '',
    'Examples:',
    '  ts-node ... --help',
    '  ts-node ... --network localhost --yes --compose',
  ].join('\n');
}

async function promptYesNo(
  question: string,
  defaultValue: boolean,
  autoYes: boolean
): Promise<boolean> {
  if (autoYes) {
    return defaultValue;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const suffix = defaultValue ? ' [Y/n] ' : ' [y/N] ';
  const answer: string = await new Promise((resolve) =>
    rl.question(`${question}${suffix}`, resolve)
  );
  rl.close();
  const normalised = answer.trim().toLowerCase();
  if (!normalised) return defaultValue;
  return ['y', 'yes'].includes(normalised);
}

async function promptSelect<
  T extends { key: string; label: string; description?: string }
>(
  question: string,
  options: T[],
  defaultKey: string,
  autoYes: boolean
): Promise<T> {
  if (autoYes) {
    const fallback = options.find((option) => option.key === defaultKey);
    if (!fallback) {
      throw new Error(`Default option ${defaultKey} not found`);
    }
    return fallback;
  }
  console.log(question);
  options.forEach((option, index) => {
    const prefix = option.key === defaultKey ? '*' : ' ';
    const description = option.description ? ` — ${option.description}` : '';
    console.log(`  ${prefix} [${index + 1}] ${option.label}${description}`);
  });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer: string = await new Promise((resolve) =>
    rl.question(`Select 1-${options.length} (default ${defaultKey}): `, resolve)
  );
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
  const direct = options.find(
    (option) =>
      option.key === trimmed ||
      option.label.toLowerCase() === trimmed.toLowerCase()
  );
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
        process.stdout.write(`${prefix}${line}\n`);
        newlineIndex = buffer.indexOf('\n');
      }
    },
    flush() {
      if (buffer.length > 0) {
        process.stdout.write(`${prefix}${buffer}\n`);
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
  const logPath = path.join(
    LOG_ROOT,
    `${startedAt.toISOString().replace(/[:.]/g, '-')}-${key}.log`
  );
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
    child.on('exit', (code) => {
      resolve(code ?? 0);
    });
  });

  prefixedStdout.flush();
  prefixedStderr.flush();

  const combinedLog = `# ${title}\n# Command: ${command} ${args.join(
    ' '
  )}\n# Started: ${startedAt.toISOString()}\n# Exit code: ${exitCode}\n\n## STDOUT\n${stdoutBuffer}\n\n## STDERR\n${stderrBuffer}\n`;
  await fs.writeFile(logPath, combinedLog, 'utf8');

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
  };
}

async function runPreflight(ctx: DemoContext): Promise<StepResult> {
  const startedAt = new Date();
  const notes: string[] = [];
  const details: Record<string, unknown> = {};

  await fs.mkdir(LOG_ROOT, { recursive: true });

  ctx.nodeVersion = process.version;
  details.nodeVersion = ctx.nodeVersion;

  const dockerCheck = await tryCommandCapture('docker', ['--version']);
  const dockerRequired = ctx.launchCompose;
  if (!dockerCheck.success) {
    details.dockerAvailable = false;
    notes.push(
      'Docker is not available in PATH. Auto-launch for Compose will be skipped; start any required services manually.'
    );
    if (dockerRequired) {
      const endedAt = new Date();
      return {
        key: 'preflight',
        title: 'Preflight checks',
        status: 'failed',
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        notes,
        details,
      };
    }
  } else {
    details.dockerAvailable = true;
    ctx.dockerVersion = dockerCheck.stdout.trim();
    details.dockerVersion = ctx.dockerVersion;

    const composeCheck = await tryCommandCapture('docker', [
      'compose',
      'version',
    ]);
    if (!composeCheck.success) {
      notes.push(
        'Docker Compose plugin is missing. Launch the stack manually or install the plugin to enable auto-launch.'
      );
      if (dockerRequired) {
        const endedAt = new Date();
        return {
          key: 'preflight',
          title: 'Preflight checks',
          status: 'failed',
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMs: endedAt.getTime() - startedAt.getTime(),
          notes,
          details,
        };
      }
    } else {
      ctx.composeVersion = composeCheck.stdout.trim();
      details.composeVersion = ctx.composeVersion;
    }
  }

  const gitStatus = await tryCommandCapture('git', ['status', '--short'], {
    cwd: ROOT,
  });
  const gitCommit = await tryCommandCapture('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
  });
  const gitBranch = await tryCommandCapture(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    { cwd: ROOT }
  );
  if (gitCommit.success) {
    ctx.gitCommit = gitCommit.stdout.trim();
    details.gitCommit = ctx.gitCommit;
  }
  if (gitBranch.success) {
    ctx.gitBranch = gitBranch.stdout.trim();
    details.gitBranch = ctx.gitBranch;
  }
  ctx.gitStatusClean = gitStatus.success
    ? gitStatus.stdout.trim().length === 0
    : undefined;
  details.gitStatusClean = ctx.gitStatusClean ?? null;
  if (ctx.gitStatusClean === false) {
    notes.push(
      'Working tree has uncommitted changes. Artefacts may not reflect a clean release.'
    );
  }

  const nodeModulesExists = await pathExists(path.join(ROOT, 'node_modules'));
  details.nodeModulesPresent = nodeModulesExists;
  if (!nodeModulesExists) {
    notes.push(
      'node_modules is missing. Run npm install before re-running the demo for faster execution.'
    );
  }

  const endedAt = new Date();
  return {
    key: 'preflight',
    title: 'Preflight checks',
    status: 'success',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    notes: notes.length > 0 ? notes : undefined,
    details,
  };
}

type CommandCapture = {
  success: boolean;
  stdout: string;
  stderr: string;
};

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
      resolve({ success: false, stdout: '', stderr: error.message });
    });
    child.on('exit', (code) => {
      resolve({ success: code === 0, stdout, stderr });
    });
  });
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

function deriveSummaryFromModules(
  modules: ControlMatrixModule[] = []
): ControlMatrixSummary {
  return modules.reduce<ControlMatrixSummary>(
    (acc, module) => {
      acc.total += 1;
      if (module.status === 'ready') {
        acc.ready += 1;
      } else if (module.status === 'needs-config') {
        acc.needsConfig += 1;
      } else {
        acc.missingSurface += 1;
      }
      return acc;
    },
    { total: 0, ready: 0, needsConfig: 0, missingSurface: 0 }
  );
}

function diffSummaries(
  context: string,
  derived: ControlMatrixSummary,
  observed?: ControlMatrixSummary | null
): string[] {
  if (!observed) {
    return [`${context} summary missing or null`];
  }
  const issues: string[] = [];
  (['total', 'ready', 'needsConfig', 'missingSurface'] as const).forEach(
    (key) => {
      if (derived[key] !== observed[key]) {
        issues.push(
          `${context} summary mismatch for ${key}: expected ${derived[key]}, found ${observed[key]}`
        );
      }
    }
  );
  return issues;
}

async function generateHtmlSummary(): Promise<void> {
  const markdown = await fs.readFile(GRAND_SUMMARY_MD, 'utf8');
  const escaped = escapeHtml(markdown);
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>AGI Jobs v0 (v2) – Astral Omnidominion Mission Summary</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem; background: #0b0f19; color: #f5f6ff; }
      pre { white-space: pre-wrap; word-break: break-word; background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 20px 45px rgba(0,0,0,0.45); }
      h1 { font-size: 2rem; margin-bottom: 1rem; }
      .meta { margin-bottom: 2rem; font-size: 0.95rem; color: rgba(255,255,255,0.65); }
      a { color: #8fd6ff; }
    </style>
  </head>
  <body>
    <h1>AGI Jobs v0 (v2) – Astral Omnidominion Mission Summary</h1>
    <div class="meta">Generated ${new Date().toISOString()} on ${os.hostname()}</div>
    <pre>${escaped}</pre>
  </body>
</html>`;
  await fs.writeFile(GRAND_SUMMARY_HTML, html, 'utf8');
}

async function buildManifest(
  ctx: DemoContext,
  steps: StepResult[]
): Promise<ManifestEntry[]> {
  const candidates = [
    GRAND_SUMMARY_MD,
    GRAND_SUMMARY_JSON,
    GRAND_SUMMARY_HTML,
    OWNER_CONTROL_MATRIX,
    path.join(REPORT_ROOT, 'mission-bundle', 'manifest.json'),
    path.join(TAKEOFF_ROOT, 'summary.json'),
    path.join(TAKEOFF_ROOT, 'dry-run.json'),
    path.join(TAKEOFF_ROOT, 'thermodynamics.json'),
    FIRST_CLASS_RUN,
    OWNER_CONTROL_MAP,
  ];

  const entries: ManifestEntry[] = [];
  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) {
      steps.push({
        key: `manifest:${path.basename(candidate)}`,
        title: `Manifest placeholder for ${path.relative(ROOT, candidate)}`,
        status: 'skipped',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 0,
        notes: ['File missing during manifest generation'],
      });
      continue;
    }
    const buffer = await fs.readFile(candidate);
    const hash = createHash('sha256').update(buffer).digest('hex');
    entries.push({
      path: path.relative(ROOT, candidate),
      size: buffer.length,
      sha256: hash,
    });
  }
  await fs.writeFile(
    FIRST_CLASS_MANIFEST,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        network: ctx.network,
        entries,
      },
      null,
      2
    ),
    'utf8'
  );
  return entries;
}

async function ensureEnvFile(envPath: string): Promise<void> {
  const resolved = path.resolve(envPath);
  if (await pathExists(resolved)) return;
  const template = `${resolved}.example`;
  if (await pathExists(template)) {
    await fs.copyFile(template, resolved);
    console.log(`📄 Created ${resolved} from ${template}`);
    return;
  }
  const directoryTemplate = path.join(
    path.dirname(resolved),
    'oneclick.env.example'
  );
  if (await pathExists(directoryTemplate)) {
    await fs.copyFile(directoryTemplate, resolved);
    console.log(`📄 Created ${resolved} from ${directoryTemplate}`);
    return;
  }
  throw new Error(`Missing environment template for ${resolved}`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printUsage();
    return;
  }
  const autoYes = Boolean(
    parseBool(args.yes) ?? parseBool(args['non-interactive'])
  );
  const networkArg = args.network as string | undefined;
  const skipDeploy = Boolean(parseBool(args['skip-deploy']));
  const launchComposeOverride =
    parseBool(args.compose) ??
    (parseBool(args['no-compose']) === true ? false : undefined);

  const networkPreset =
    networkArg && networkArg in NETWORK_PRESETS
      ? NETWORK_PRESETS[networkArg as NetworkKey]
      : undefined;

  const networkSelection =
    networkPreset ??
    (await promptSelect(
      'Select target network for the Astral Omnidominion demo:',
      Object.values(NETWORK_PRESETS),
      'localhost',
      autoYes
    ));

  const dockerAvailable = (
    await tryCommandCapture('docker', ['--version'])
  ).success;

  const launchCompose =
    launchComposeOverride !== undefined
      ? launchComposeOverride
      : await promptYesNo(
          'Launch Docker Compose stack automatically?',
          dockerAvailable && networkSelection.key === 'localhost',
          autoYes
        );

  const runtimeUnavailable =
    !dockerAvailable && !launchCompose && networkSelection.key === 'localhost';
  const skipDeployment = skipDeploy || runtimeUnavailable;

  if (runtimeUnavailable) {
    console.log(
      'ℹ️  Deployment wizard disabled because no local node or Compose target is available.'
    );
  }

  const context: DemoContext = {
    network: networkSelection.key as NetworkKey,
    configPath: networkSelection.configPath,
    envPath: networkSelection.envPath,
    hardhatNetwork: networkSelection.hardhatNetwork,
    autoYes,
    launchCompose,
    dockerAvailable,
    runtimeUnavailable,
    skipDeployment,
    startTimestamp: new Date().toISOString(),
    nodeVersion: process.version,
  };

  console.log('🌌 Astral Omnidominion Operating System Demo');
  console.log(`   • Network:          ${networkSelection.label}`);
  console.log(`   • Config:           ${path.resolve(context.configPath)}`);
  console.log(`   • Env file:         ${path.resolve(context.envPath)}`);
  console.log(
    `   • Launch Compose:   ${
      context.launchCompose ? 'yes' : 'no (manual start)'
    }`
  );
  console.log(
    `   • Skip deployment:  ${context.skipDeployment ? 'yes' : 'no'}`
  );
  console.log('');

  await fs.mkdir(FIRST_CLASS_ROOT, { recursive: true });
  await fs.mkdir(LOG_ROOT, { recursive: true });
  await ensureEnvFile(context.envPath);

  const results: StepResult[] = [];

  const steps: StepDefinition[] = [
    {
      key: 'preflight',
      title: 'Preflight checks',
      run: async () => runPreflight(context),
    },
    {
      key: 'deployment',
      title: 'One-click deployment wizard',
      skip: (ctx) => ctx.skipDeployment,
      skipReason: (ctx) =>
        ctx.runtimeUnavailable
          ? 'Runtime unavailable (no local node/Compose); deployment disabled.'
          : 'Deployment skipped by operator flag.',
      run: async (ctx) => {
        const wizardArgs = [
          'run',
          'deploy:oneclick:wizard',
          '--',
          '--config',
          path.resolve(ctx.configPath),
          '--network',
          ctx.hardhatNetwork,
          '--env',
          path.resolve(ctx.envPath),
          '--yes',
        ];
        wizardArgs.push(ctx.launchCompose ? '--compose' : '--no-compose');
        return runCommand(
          'deployment',
          'One-click deployment wizard',
          'npm',
          wizardArgs
        );
      },
    },
    {
      key: 'demo',
      title: 'AGI OS grand demonstration',
      skip: (ctx) => ctx.runtimeUnavailable,
      skipReason: () =>
        'Runtime dependencies unavailable; start Hardhat/Anvil or enable Docker Compose to run the full demo.',
      run: async (ctx) =>
        runCommand(
          'demo',
          'AGI OS grand demonstration',
          'npm',
          ['run', 'demo:agi-os'],
          {
            env: { HARDHAT_NETWORK: ctx.hardhatNetwork },
          }
        ),
    },
    {
      key: 'owner-diagram',
      title: 'Owner systems map (Mermaid)',
      skip: (ctx) => ctx.runtimeUnavailable,
      skipReason: () =>
        'Owner diagram generation requires runtime outputs; start the stack or enable Compose.',
      run: async (ctx) =>
        runCommand(
          'owner-diagram',
          'Owner systems map (Mermaid)',
          'npm',
          ['run', 'owner:diagram'],
          {
            env: {
              HARDHAT_NETWORK: ctx.hardhatNetwork,
              OWNER_MERMAID_FORMAT: 'mermaid',
              OWNER_MERMAID_OUTPUT: OWNER_CONTROL_MAP,
              OWNER_MERMAID_TITLE: 'Astral Omnidominion Owner Control Map',
            },
          }
        ),
    },
    {
      key: 'owner-verify',
      title: 'Verify owner control surface',
      skip: (ctx) => ctx.runtimeUnavailable,
      skipReason: () =>
        'Owner control verification requires a reachable runtime; start the stack or enable Compose.',
      run: async (ctx) =>
        runCommand(
          'owner-verify',
          'Verify owner control surface',
          'npm',
          ['run', 'owner:verify-control'],
          {
            env: { HARDHAT_NETWORK: ctx.hardhatNetwork },
          }
        ),
    },
    {
      key: 'html',
      title: 'Render mission summary HTML',
      skip: () => !existsSync(GRAND_SUMMARY_MD),
      skipReason: () =>
        'Grand summary markdown is missing; run the mission pipeline or provide reports before rendering HTML.',
      run: async () => {
        const startedAt = new Date();
        await generateHtmlSummary();
        const endedAt = new Date();
        return {
          key: 'html',
          title: 'Render mission summary HTML',
          status: 'success',
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMs: endedAt.getTime() - startedAt.getTime(),
          logFile: undefined,
        };
      },
    },
    {
      key: 'manifest',
      title: 'Compile first-class manifest',
      run: async (ctx) => {
        const startedAt = new Date();
        const manifestEntries = await buildManifest(ctx, results);
        const endedAt = new Date();
        return {
          key: 'manifest',
          title: 'Compile first-class manifest',
          status: 'success',
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMs: endedAt.getTime() - startedAt.getTime(),
          details: { totalFiles: manifestEntries.length },
        };
      },
    },
    {
      key: 'integrity-check',
      title: 'Cross-verify mission artefacts',
      run: async () => {
        const startedAt = new Date();
        const missing: string[] = [];
        const requiredFiles = [
          { path: OWNER_CONTROL_MATRIX, label: 'Owner control matrix' },
          { path: GRAND_SUMMARY_JSON, label: 'Grand summary JSON' },
          { path: FIRST_CLASS_MANIFEST, label: 'First-class manifest' },
        ];

        for (const file of requiredFiles) {
          if (!(await pathExists(file.path))) {
            missing.push(`${file.label} (${path.relative(ROOT, file.path)})`);
          }
        }

        if (missing.length > 0) {
          const endedAt = new Date();
          return {
            key: 'integrity-check',
            title: 'Cross-verify mission artefacts',
            status: 'skipped',
            startedAt: startedAt.toISOString(),
            endedAt: endedAt.toISOString(),
            durationMs: endedAt.getTime() - startedAt.getTime(),
            notes: [
              `Missing artefacts: ${missing.join(', ')}. Run the demo stack or supply the files to enable integrity checks.`,
            ],
          };
        }

        const matrix = await readJsonFile<ControlMatrix>(OWNER_CONTROL_MATRIX);
        const modules = matrix.modules ?? [];
        const derivedSummary = deriveSummaryFromModules(modules);

        const issues: string[] = [];

        issues.push(
          ...diffSummaries(
            'Owner control matrix',
            derivedSummary,
            matrix.summary
          )
        );

        const grandSummary = await readJsonFile<GrandSummary>(
          GRAND_SUMMARY_JSON
        );
        const summaryControl = grandSummary.control ?? null;
        if (!summaryControl) {
          issues.push('Grand summary missing control section');
        } else {
          const grandModules = summaryControl.modules ?? [];
          if (grandModules.length !== modules.length) {
            issues.push(
              `Grand summary module count mismatch: expected ${modules.length}, found ${grandModules.length}`
            );
          }
          issues.push(
            ...diffSummaries(
              'Grand summary control',
              derivedSummary,
              summaryControl.summary
            )
          );
        }

        const manifestReport = await readJsonFile<ManifestReport>(
          FIRST_CLASS_MANIFEST
        );
        const manifestEntries = manifestReport.entries ?? [];
        const manifestPaths = new Set(
          manifestEntries.map((entry) => entry.path)
        );
        const requiredPaths = [
          path.relative(ROOT, GRAND_SUMMARY_MD),
          path.relative(ROOT, GRAND_SUMMARY_JSON),
          path.relative(ROOT, GRAND_SUMMARY_HTML),
          path.relative(ROOT, OWNER_CONTROL_MATRIX),
        ];
        requiredPaths.forEach((requiredPath) => {
          if (!manifestPaths.has(requiredPath)) {
            issues.push(`Manifest missing required artefact ${requiredPath}`);
          }
        });

        const endedAt = new Date();
        const status: StepStatus = issues.length === 0 ? 'success' : 'failed';
        const notes =
          status === 'success'
            ? [
                `Validated ${modules.length} owner modules and ${requiredPaths.length} critical artefacts across mission reports.`,
              ]
            : issues;

        return {
          key: 'integrity-check',
          title: 'Cross-verify mission artefacts',
          status,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMs: endedAt.getTime() - startedAt.getTime(),
          notes,
          details: {
            ownerModules: modules.length,
            manifestEntries: manifestEntries.length,
          },
        };
      },
    },
  ];

  for (const step of steps) {
    if (step.skip?.(context)) {
      const now = new Date();
      const reason = step.skipReason?.(context);
      results.push({
        key: step.key,
        title: step.title,
        status: 'skipped',
        startedAt: now.toISOString(),
        endedAt: now.toISOString(),
        durationMs: 0,
        notes: [
          reason ?? 'Step skipped by operator or unavailable dependencies.',
        ],
      });
      continue;
    }

    console.log(`⚙️  ${step.title}`);
    try {
      const result = await step.run(context);
      results.push(result);
      if (result.status === 'failed' && !step.optional) {
        console.error(
          `❌ ${step.title} failed. See ${
            result.logFile ?? 'logs'
          } for details.`
        );
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
      console.error(
        `❌ ${step.title} failed:`,
        error instanceof Error ? error.message : error
      );
      break;
    }
  }

  const runReport = {
    generatedAt: new Date().toISOString(),
    host: os.hostname(),
    network: context.network,
    hardhatNetwork: context.hardhatNetwork,
    configPath: path.resolve(context.configPath),
    envPath: path.resolve(context.envPath),
    launchCompose: context.launchCompose,
    dockerAvailable: context.dockerAvailable ?? null,
    runtimeUnavailable: context.runtimeUnavailable ?? false,
    skipDeployment: context.skipDeployment,
    gitCommit: context.gitCommit ?? null,
    gitBranch: context.gitBranch ?? null,
    gitStatusClean: context.gitStatusClean ?? null,
    dockerVersion: context.dockerVersion ?? null,
    composeVersion: context.composeVersion ?? null,
    nodeVersion: context.nodeVersion,
    steps: results,
  };

  await fs.writeFile(
    FIRST_CLASS_RUN,
    JSON.stringify(runReport, null, 2),
    'utf8'
  );
  console.log(
    `🗂️  First-class run report written to ${path.relative(
      ROOT,
      FIRST_CLASS_RUN
    )}`
  );

  const lastStep = results[results.length - 1];
  if (lastStep?.status === 'failed') {
    process.exitCode = 1;
    console.error(
      'Astral Omnidominion demo completed with failures. Review the run report for remediation guidance.'
    );
  } else {
    console.log(
      '🌠 Astral Omnidominion demo completed successfully. Share the reports in reports/agi-os/.'
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error running Astral Omnidominion demo:', error);
    process.exitCode = 1;
  });
}

export { buildUsage, parseArgs, printUsage };
