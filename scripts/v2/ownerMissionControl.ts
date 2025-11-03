import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const DEFAULT_NETWORK = process.env.HARDHAT_NETWORK || 'hardhat';

const STEP_KEYS = ['surface', 'plan', 'verify', 'dashboard'] as const;
type StepKey = (typeof STEP_KEYS)[number];

type OutputFormat = 'markdown' | 'human' | 'json';

type StepStatus = 'success' | 'warning' | 'error' | 'skipped';

interface CliOptions {
  network: string;
  format: OutputFormat;
  includeMermaid: boolean;
  outPath?: string;
  bundlePath?: string;
  bundleBaseName?: string;
  help?: boolean;
  strict: boolean;
  run: Record<StepKey, boolean>;
}

interface StepAnalysis {
  status: StepStatus;
  summary: string;
  details: string[];
  metrics?: Record<string, number | string>;
}

interface ExtractedJson {
  data?: any;
  error?: string;
  logs: string[];
}

interface StepExecutionContext {
  options: CliOptions;
  command: string[];
  env: Record<string, string>;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: Error;
  durationMs: number;
  json?: any;
  parseError?: string;
  logs: string[];
}

interface StepReport extends StepAnalysis {
  key: StepKey;
  title: string;
  command: string[];
  env: Record<string, string>;
  durationMs: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  parseError?: string;
  json?: any;
  logs: string[];
}

interface StepDefinition {
  key: StepKey;
  title: string;
  description: string;
  expectsJson: boolean;
  buildCommand: (options: CliOptions) => {
    command: string;
    args: string[];
    env: Record<string, string>;
  };
  analyze: (context: StepExecutionContext) => StepAnalysis;
  rerunHint: (options: CliOptions) => string;
}

function parseStepKey(value: string): StepKey {
  const normalised = value.trim().toLowerCase();
  switch (normalised) {
    case 'surface':
    case 'snapshot':
    case 'report':
      return 'surface';
    case 'plan':
    case 'owner-plan':
    case 'dryrun':
      return 'plan';
    case 'verify':
    case 'verification':
    case 'control':
      return 'verify';
    case 'dashboard':
    case 'dash':
    case 'status':
      return 'dashboard';
    default:
      throw new Error(`Unknown step name "${value}"`);
  }
}

function parseStepList(value: string): StepKey[] {
  if (!value) {
    throw new Error('Step list cannot be empty');
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map(parseStepKey);
}

function parseArgs(argv: string[]): CliOptions {
  const run: Record<StepKey, boolean> = {
    surface: true,
    plan: true,
    verify: true,
    dashboard: true,
  };
  const options: CliOptions = {
    network: DEFAULT_NETWORK,
    format: 'markdown',
    includeMermaid: true,
    strict: false,
    run,
  };
  let onlyApplied = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--network': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--network requires a value');
        }
        options.network = value;
        i += 1;
        break;
      }
      case '--format': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--format requires a value');
        }
        const normalised = value.trim().toLowerCase();
        if (normalised === 'markdown' || normalised === 'md') {
          options.format = 'markdown';
        } else if (normalised === 'human' || normalised === 'text') {
          options.format = 'human';
        } else if (normalised === 'json') {
          options.format = 'json';
        } else {
          throw new Error(`Unsupported format ${value}`);
        }
        i += 1;
        break;
      }
      case '--json':
        options.format = 'json';
        break;
      case '--human':
        options.format = 'human';
        break;
      case '--out':
      case '--output': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a path`);
        }
        options.outPath = value;
        i += 1;
        break;
      }
      case '--bundle':
      case '--bundle-dir': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a directory path`);
        }
        options.bundlePath = value;
        i += 1;
        break;
      }
      case '--bundle-name':
      case '--bundle-basename': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a base name`);
        }
        options.bundleBaseName = value;
        i += 1;
        break;
      }
      case '--strict':
      case '--fail-on-warn':
      case '--fail-on-warning':
        options.strict = true;
        break;
      case '--allow-warnings':
      case '--no-strict':
        options.strict = false;
        break;
      case '--no-mermaid':
        options.includeMermaid = false;
        break;
      case '--skip-surface':
        options.run.surface = false;
        break;
      case '--skip-plan':
        options.run.plan = false;
        break;
      case '--skip-verify':
        options.run.verify = false;
        break;
      case '--skip-dashboard':
        options.run.dashboard = false;
        break;
      case '--skip':
      case '--skip-steps': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a comma-separated list`);
        }
        const steps = parseStepList(value);
        steps.forEach((step) => {
          options.run[step] = false;
        });
        i += 1;
        break;
      }
      default:
        if (arg.startsWith('--only=')) {
          const raw = arg.slice('--only='.length);
          const steps = parseStepList(raw);
          STEP_KEYS.forEach((step) => {
            options.run[step] = false;
          });
          steps.forEach((step) => {
            options.run[step] = true;
          });
          onlyApplied = true;
        } else if (arg === '--only' || arg === '--steps') {
          const value = argv[i + 1];
          if (!value) {
            throw new Error(`${arg} requires a comma-separated list`);
          }
          const steps = parseStepList(value);
          STEP_KEYS.forEach((step) => {
            options.run[step] = false;
          });
          steps.forEach((step) => {
            options.run[step] = true;
          });
          onlyApplied = true;
          i += 1;
        } else if (arg === '--help' || arg === '-h') {
          options.help = true;
        } else {
          throw new Error(`Unknown argument ${arg}`);
        }
        break;
    }
  }

  if (!onlyApplied) {
    const anyEnabled = STEP_KEYS.some((step) => options.run[step]);
    if (!anyEnabled) {
      throw new Error('At least one step must be enabled');
    }
  }

  return options;
}

function sanitizeBaseName(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const cleaned = trimmed.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-');
  const normalised = cleaned.replace(/^-+/, '').replace(/-+$/, '');
  return normalised.length > 0 ? normalised : fallback;
}

function safeParseJson(candidate: string): any | undefined {
  try {
    return JSON.parse(candidate);
  } catch (_) {
    return undefined;
  }
}

function collectLogLines(section: string): string[] {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function extractJsonFromOutput(output: string): ExtractedJson {
  if (!output) {
    return { logs: [] };
  }

  const lines = output.split(/\r?\n/);
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      continue;
    }
    if (start === -1) {
      if (trimmed.startsWith('{')) {
        start = i;
      } else if (trimmed.startsWith('[')) {
        const next = trimmed[1];
        if (
          next === '{' ||
          next === '[' ||
          next === '"' ||
          next === ']' ||
          next === undefined
        ) {
          start = i;
        }
      }
    }
    const lastChar = trimmed[trimmed.length - 1];
    if (lastChar === '}' || lastChar === ']') {
      end = i;
    }
  }

  if (start !== -1 && end !== -1 && end >= start) {
    const jsonText = lines.slice(start, end + 1).join('\n');
    const parsed = safeParseJson(jsonText);
    if (parsed !== undefined) {
      const logs = collectLogLines(lines.slice(0, start).join('\n')).concat(
        collectLogLines(lines.slice(end + 1).join('\n'))
      );
      return { data: parsed, logs };
    }
  }

  const firstBrace = output.indexOf('{');
  const lastBrace = output.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = output.slice(firstBrace, lastBrace + 1);
    const parsed = safeParseJson(candidate);
    if (parsed !== undefined) {
      const logs = collectLogLines(output.slice(0, firstBrace)).concat(
        collectLogLines(output.slice(lastBrace + 1))
      );
      return { data: parsed, logs };
    }
  }

  const firstBracket = output.indexOf('[');
  const lastBracket = output.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const candidate = output.slice(firstBracket, lastBracket + 1);
    const parsed = safeParseJson(candidate);
    if (parsed !== undefined) {
      const logs = collectLogLines(output.slice(0, firstBracket)).concat(
        collectLogLines(output.slice(lastBracket + 1))
      );
      return { data: parsed, logs };
    }
  }

  return {
    logs: collectLogLines(output),
    error: 'Failed to locate JSON payload',
  };
}

function mergeLogs(prefix: string[], stderr: string): string[] {
  const stderrLines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const combined = [...prefix, ...stderrLines];
  const deduped: string[] = [];
  for (const line of combined) {
    if (!deduped.includes(line)) {
      deduped.push(line);
    }
  }
  return deduped;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return `${ms}ms`;
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = (seconds % 60).toFixed(1);
  return `${minutes}m ${remaining}s`;
}

function statusEmoji(status: StepStatus): string {
  switch (status) {
    case 'success':
      return '✅';
    case 'warning':
      return '⚠️';
    case 'error':
      return '❌';
    case 'skipped':
    default:
      return '⏭️';
  }
}

function computeOverallStatus(reports: StepReport[]): StepStatus {
  if (reports.some((report) => report.status === 'error')) {
    return 'error';
  }
  if (reports.some((report) => report.status === 'warning')) {
    return 'warning';
  }
  if (reports.every((report) => report.status === 'skipped')) {
    return 'skipped';
  }
  return 'success';
}

function formatCommand(command: string[]): string {
  return command
    .map((part) => (part.includes(' ') ? `'${part}'` : part))
    .join(' ');
}

function renderMarkdown(options: CliOptions, reports: StepReport[]): string {
  const overall = computeOverallStatus(reports);
  const now = new Date().toISOString();
  const lines: string[] = [];
  lines.push('# Owner Mission Control Summary');
  lines.push('');
  lines.push(`- **Network:** \`${options.network}\``);
  lines.push(`- **Generated:** ${now}`);
  lines.push(
    `- **Overall status:** ${statusEmoji(overall)} \`${overall.toUpperCase()}\``
  );
  lines.push('');

  if (options.includeMermaid) {
    const mermaidLines = ['```mermaid', 'flowchart LR'];
    const nodes: string[] = [];
    const edges = [
      ['surface', 'plan'],
      ['plan', 'verify'],
      ['verify', 'dashboard'],
    ];
    for (const report of reports) {
      const label = `${report.title}\\n${report.status.toUpperCase()}`;
      const node = `    ${report.key}[${label}]`;
      nodes.push(node);
    }
    mermaidLines.push(...nodes);
    for (const [from, to] of edges) {
      const fromEnabled = reports.find(
        (report) => report.key === (from as StepKey)
      );
      const toEnabled = reports.find(
        (report) => report.key === (to as StepKey)
      );
      if (
        fromEnabled &&
        toEnabled &&
        fromEnabled.status !== 'skipped' &&
        toEnabled.status !== 'skipped'
      ) {
        mermaidLines.push(`    ${from} --> ${to}`);
      }
    }
    mermaidLines.push('```');
    lines.push(...mermaidLines);
    lines.push('');
  }

  for (const report of reports) {
    lines.push(`## ${report.title}`);
    lines.push('');
    lines.push(
      `${statusEmoji(
        report.status
      )} **Status:** \`${report.status.toUpperCase()}\` — ${report.summary}`
    );
    if (report.command.length > 0) {
      lines.push(`- **Command:** \`${formatCommand(report.command)}\``);
    }
    if (Object.keys(report.env).length > 0) {
      const envPairs = Object.entries(report.env)
        .map(([key, value]) => `\`${key}=${value}\``)
        .join(', ');
      lines.push(`- **Environment overrides:** ${envPairs}`);
    }
    lines.push(`- **Duration:** ${formatDuration(report.durationMs)}`);
    if (report.metrics && Object.keys(report.metrics).length > 0) {
      lines.push('- **Metrics:**');
      for (const [key, value] of Object.entries(report.metrics)) {
        lines.push(`    - ${key}: ${value}`);
      }
    }
    if (report.details.length > 0) {
      lines.push('- **Details:**');
      report.details.forEach((detail) => lines.push(`    - ${detail}`));
    }
    if (report.logs.length > 0 || (report.stderr && report.stderr.trim())) {
      lines.push('<details><summary>Logs & Warnings</summary>');
      lines.push('');
      report.logs.forEach((log) => {
        lines.push(`- ${log}`);
      });
      if (report.stderr && report.stderr.trim()) {
        report.stderr
          .trim()
          .split(/\r?\n/)
          .forEach((line) => lines.push(`- ${line.trim()}`));
      }
      lines.push('');
      lines.push('</details>');
    }
    if (report.parseError) {
      lines.push(`- **Parser warning:** ${report.parseError}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderHuman(options: CliOptions, reports: StepReport[]): string {
  const overall = computeOverallStatus(reports);
  const now = new Date().toISOString();
  const lines: string[] = [];
  lines.push(`Owner Mission Control (${options.network})`);
  lines.push('='.repeat(40));
  lines.push(`Generated: ${now}`);
  lines.push(`Overall: ${statusEmoji(overall)} ${overall.toUpperCase()}`);
  lines.push('');

  for (const report of reports) {
    lines.push(`${report.title}`);
    lines.push('-'.repeat(report.title.length));
    lines.push(`${statusEmoji(report.status)} ${report.summary}`);
    if (report.command.length > 0) {
      lines.push(`Command: ${formatCommand(report.command)}`);
    }
    if (Object.keys(report.env).length > 0) {
      lines.push(
        `Env: ${Object.entries(report.env)
          .map(([key, value]) => `${key}=${value}`)
          .join(' ')}`
      );
    }
    lines.push(`Duration: ${formatDuration(report.durationMs)}`);
    if (report.metrics && Object.keys(report.metrics).length > 0) {
      for (const [key, value] of Object.entries(report.metrics)) {
        lines.push(`- ${key}: ${value}`);
      }
    }
    if (report.details.length > 0) {
      for (const detail of report.details) {
        lines.push(`* ${detail}`);
      }
    }
    if (report.logs.length > 0) {
      lines.push('Logs:');
      report.logs.forEach((log) => lines.push(`  - ${log}`));
    }
    if (report.parseError) {
      lines.push(`Parser warning: ${report.parseError}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderJson(options: CliOptions, reports: StepReport[]): string {
  const payload = {
    network: options.network,
    generatedAt: new Date().toISOString(),
    overallStatus: computeOverallStatus(reports),
    steps: reports.map((report) => ({
      key: report.key,
      title: report.title,
      status: report.status,
      summary: report.summary,
      command: report.command,
      env: report.env,
      durationMs: report.durationMs,
      metrics: report.metrics,
      details: report.details,
      logs: report.logs,
      parseError: report.parseError,
      exitCode: report.exitCode,
    })),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function render(options: CliOptions, reports: StepReport[]): string {
  switch (options.format) {
    case 'json':
      return renderJson(options, reports);
    case 'human':
      return renderHuman(options, reports);
    case 'markdown':
    default:
      return renderMarkdown(options, reports);
  }
}

type BundleFile = {
  format: 'markdown' | 'json' | 'human' | 'manifest' | 'checksums';
  filename: string;
  absolutePath: string;
  sha256: string;
  bytes: number;
};

async function computeSha256(
  filePath: string
): Promise<{ hash: string; bytes: number }> {
  const buffer = await fs.readFile(filePath);
  const hash = createHash('sha256').update(buffer).digest('hex');
  return { hash, bytes: buffer.length };
}

async function writeBundle(
  options: CliOptions,
  reports: StepReport[]
): Promise<void> {
  if (!options.bundlePath) {
    return;
  }

  const outDir = path.resolve(options.bundlePath);
  await fs.mkdir(outDir, { recursive: true });

  const fallbackBase = `mission-control-${options.network}`;
  const baseName = sanitizeBaseName(
    options.bundleBaseName ?? fallbackBase,
    fallbackBase
  );

  const markdownContent = renderMarkdown(
    { ...options, format: 'markdown' },
    reports
  );
  const jsonContent = renderJson({ ...options, format: 'json' }, reports);
  const humanContent = renderHuman({ ...options, format: 'human' }, reports);

  const outputs = [
    { format: 'markdown' as const, extension: '.md', content: markdownContent },
    { format: 'json' as const, extension: '.json', content: jsonContent },
    { format: 'human' as const, extension: '.txt', content: humanContent },
  ];

  const writtenFiles: BundleFile[] = [];
  for (const output of outputs) {
    const filename = `${baseName}${output.extension}`;
    const absolutePath = path.join(outDir, filename);
    const payload = output.content.endsWith('\n')
      ? output.content
      : `${output.content}\n`;
    await fs.writeFile(absolutePath, payload);
    const { hash, bytes } = await computeSha256(absolutePath);
    writtenFiles.push({
      format: output.format,
      filename,
      absolutePath,
      sha256: hash,
      bytes,
    });
  }

  const manifestPath = path.join(outDir, `${baseName}.manifest.json`);
  const manifest = {
    network: options.network,
    baseName,
    generatedAt: new Date().toISOString(),
    overallStatus: computeOverallStatus(reports),
    includeMermaid: options.includeMermaid,
    steps: reports.map((report) => ({
      key: report.key,
      title: report.title,
      status: report.status,
      summary: report.summary,
      metrics: report.metrics,
      command: report.command,
      env: report.env,
      durationMs: report.durationMs,
    })),
    files: writtenFiles.map(({ format, filename, sha256, bytes }) => ({
      format,
      file: filename,
      sha256,
      bytes,
    })),
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.writeFile(manifestPath, manifestContent);
  const manifestMeta = await computeSha256(manifestPath);
  writtenFiles.push({
    format: 'manifest',
    filename: path.basename(manifestPath),
    absolutePath: manifestPath,
    sha256: manifestMeta.hash,
    bytes: manifestMeta.bytes,
  });

  const checksumLines = writtenFiles.map(
    (file) => `${file.sha256}  ${file.filename}`
  );
  const checksumsPath = path.join(outDir, `${baseName}.checksums.txt`);
  await fs.writeFile(checksumsPath, `${checksumLines.join('\n')}\n`);
  const checksumsMeta = await computeSha256(checksumsPath);
  writtenFiles.push({
    format: 'checksums',
    filename: path.basename(checksumsPath),
    absolutePath: checksumsPath,
    sha256: checksumsMeta.hash,
    bytes: checksumsMeta.bytes,
  });
}

function analyzeSurface(context: StepExecutionContext): StepAnalysis {
  const data = context.json;
  if (!data || !Array.isArray(data.reports)) {
    return {
      status: 'error',
      summary: 'Surface report missing module data',
      details: context.logs,
    };
  }
  const counts = { ok: 0, warn: 0, error: 0 };
  const highlights: string[] = [];
  for (const report of data.reports) {
    const status = (report.status as string) || 'ok';
    if (status === 'ok') counts.ok += 1;
    else if (status === 'warn') counts.warn += 1;
    else counts.error += 1;
    if (status !== 'ok' && highlights.length < 5) {
      const warning =
        Array.isArray(report.warnings) && report.warnings.length > 0
          ? ` — ${report.warnings[0]}`
          : '';
      highlights.push(`${report.label || report.key}: ${status}${warning}`);
    }
  }
  const total = data.reports.length;
  let status: StepStatus = 'success';
  if (counts.error > 0) {
    status = 'error';
  } else if (counts.warn > 0) {
    status = 'warning';
  }
  const summary = `${total} modules inspected (${counts.ok} ok, ${counts.warn} warn, ${counts.error} error)`;
  const details = highlights.length > 0 ? highlights : ['All modules healthy'];
  return {
    status,
    summary,
    details,
    metrics: {
      modules: total,
      ok: counts.ok,
      warn: counts.warn,
      error: counts.error,
    },
  };
}

function analyzePlan(context: StepExecutionContext): StepAnalysis {
  const data = context.json;
  if (!data || !Array.isArray(data.modules)) {
    return {
      status: 'error',
      summary: 'Owner plan did not return module data',
      details: context.logs,
    };
  }
  const totalActions = Number(data.totalActions ?? 0);
  const pendingModules = data.modules.filter(
    (module: any) =>
      Number(module.totalActions ?? module.actions?.length ?? 0) > 0
  );
  const status: StepStatus = totalActions > 0 ? 'warning' : 'success';
  const summary =
    totalActions > 0
      ? `Planned ${totalActions} actions across ${pendingModules.length}/${data.modules.length} modules`
      : `No actions required across ${data.modules.length} modules`;
  const details = pendingModules.slice(0, 5).map((module: any) => {
    const count = Number(module.totalActions ?? module.actions?.length ?? 0);
    return `${module.module || module.key || module.label}: ${count} action${
      count === 1 ? '' : 's'
    }`;
  });
  if (details.length === 0) {
    details.push('No pending actions in the aggregated plan');
  }
  return {
    status,
    summary,
    details,
    metrics: {
      modules: data.modules.length,
      actions: totalActions,
      pendingModules: pendingModules.length,
    },
  };
}

function analyzeVerify(context: StepExecutionContext): StepAnalysis {
  const data = context.json;
  if (!data || typeof data !== 'object' || !data.summary) {
    return {
      status: 'error',
      summary: 'Verification step did not return structured output',
      details: context.logs,
    };
  }
  const summary = data.summary;
  const counts = {
    ok: Number(summary.ok ?? 0),
    mismatch: Number(summary.mismatch ?? 0),
    missingAddress: Number(summary.missingAddress ?? 0),
    missingExpected: Number(summary.missingExpected ?? 0),
    skipped: Number(summary.skipped ?? 0),
    error: Number(summary.error ?? 0),
  };
  let status: StepStatus = 'success';
  if (counts.error > 0 || counts.mismatch > 0) {
    status = 'error';
  } else if (counts.missingAddress > 0 || counts.missingExpected > 0) {
    status = 'warning';
  }
  const summaryLine = `Owner control summary — ok ${counts.ok}, mismatch ${counts.mismatch}, missing address ${counts.missingAddress}, missing expected ${counts.missingExpected}`;
  const problems: string[] = [];
  if (Array.isArray(data.results)) {
    data.results
      .filter((result: any) => result.status && result.status !== 'ok')
      .slice(0, 5)
      .forEach((result: any) => {
        const notes =
          Array.isArray(result.notes) && result.notes.length > 0
            ? ` — ${result.notes[0]}`
            : '';
        problems.push(
          `${result.label || result.key}: ${result.status}${notes}`
        );
      });
  }
  if (problems.length === 0) {
    problems.push('All configured modules match expected owners');
  }
  return {
    status,
    summary: summaryLine,
    details: problems,
    metrics: {
      ok: counts.ok,
      mismatch: counts.mismatch,
      missingAddress: counts.missingAddress,
      missingExpected: counts.missingExpected,
      error: counts.error,
    },
  };
}

function analyzeDashboard(context: StepExecutionContext): StepAnalysis {
  const data = context.json;
  if (!data || !Array.isArray(data.modules)) {
    return {
      status: 'error',
      summary: 'Dashboard output missing module summaries',
      details: context.logs,
    };
  }
  const moduleCount = data.modules.length;
  const errored = data.modules.filter(
    (module: any) =>
      Array.isArray(module.metrics) &&
      module.metrics.some((metric: any) => metric.label === 'error')
  );
  const warned = data.modules.filter(
    (module: any) =>
      Array.isArray(module.metrics) &&
      module.metrics.some((metric: any) => metric.label === 'warning')
  );
  const missing = data.modules.filter((module: any) => module.address === null);
  let status: StepStatus = 'success';
  if (errored.length > 0) {
    status = 'error';
  } else if (missing.length > 0 || warned.length > 0) {
    status = 'warning';
  }
  const summary = `${moduleCount} modules inspected — ${missing.length} without addresses, ${warned.length} warnings, ${errored.length} reported errors`;
  const details: string[] = [];
  if (errored.length > 0) {
    errored.slice(0, 5).forEach((module: any) => {
      const firstError = module.metrics.find(
        (metric: any) => metric.label === 'error'
      );
      details.push(
        `${module.name || module.key}: ${
          firstError?.value || 'Failed to load metrics'
        }`
      );
    });
  } else if (missing.length > 0) {
    missing.slice(0, 5).forEach((module: any) => {
      details.push(
        `${module.name || module.key}: address not in deployment records`
      );
    });
  } else if (warned.length > 0) {
    warned.slice(0, 5).forEach((module: any) => {
      const firstWarning = module.metrics.find(
        (metric: any) => metric.label === 'warning'
      );
      details.push(
        `${module.name || module.key}: ${
          firstWarning?.value || 'Module responded with warnings'
        }`
      );
    });
  }
  if (details.length === 0) {
    details.push('All modules returned telemetry successfully');
  }
  return {
    status,
    summary,
    details,
    metrics: {
      modules: moduleCount,
      missing: missing.length,
      warnings: warned.length,
      errored: errored.length,
    },
  };
}

const STEP_DEFINITIONS: StepDefinition[] = [
  {
    key: 'surface',
    title: 'Control Surface Snapshot',
    description: 'Renders the consolidated owner-control surface report',
    expectsJson: true,
    buildCommand: (options) => ({
      command: 'npx',
      args: [
        'ts-node',
        '--compiler-options',
        '{"module":"commonjs"}',
        'scripts/v2/ownerControlSurface.ts',
        '--network',
        options.network,
        '--json',
      ],
      env: {},
    }),
    analyze: analyzeSurface,
    rerunHint: (options) =>
      `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/v2/ownerControlSurface.ts --network ${options.network}`,
  },
  {
    key: 'plan',
    title: 'Owner Update Plan',
    description: 'Aggregates module changes into an execution plan',
    expectsJson: true,
    buildCommand: (options) => ({
      command: process.execPath,
      args: ['scripts/v2/run-owner-plan.js', '--json'],
      env: {
        HARDHAT_NETWORK: options.network,
      },
    }),
    analyze: analyzePlan,
    rerunHint: (options) =>
      `HARDHAT_NETWORK=${options.network} node scripts/v2/run-owner-plan.js --json`,
  },
  {
    key: 'verify',
    title: 'Owner Control Verification',
    description: 'Confirms deployed owners and governance wiring',
    expectsJson: true,
    buildCommand: (options) => ({
      command: 'npx',
      args: [
        'hardhat',
        'run',
        '--no-compile',
        'scripts/v2/verifyOwnerControl.ts',
        '--network',
        options.network,
      ],
      env: {
        OWNER_VERIFY_JSON: '1',
        HARDHAT_NETWORK: options.network,
      },
    }),
    analyze: analyzeVerify,
    rerunHint: (options) =>
      `OWNER_VERIFY_JSON=1 npx hardhat run --no-compile scripts/v2/verifyOwnerControl.ts --network ${options.network}`,
  },
  {
    key: 'dashboard',
    title: 'Owner Command Dashboard',
    description: 'Collects live module metrics for the owner control center',
    expectsJson: true,
    buildCommand: (options) => ({
      command: 'npx',
      args: [
        'hardhat',
        'run',
        '--no-compile',
        'scripts/v2/owner-dashboard.ts',
        '--network',
        options.network,
      ],
      env: {
        OWNER_DASHBOARD_JSON: '1',
        HARDHAT_NETWORK: options.network,
      },
    }),
    analyze: analyzeDashboard,
    rerunHint: (options) =>
      `OWNER_DASHBOARD_JSON=1 npx hardhat run --no-compile scripts/v2/owner-dashboard.ts --network ${options.network}`,
  },
];

function runStep(definition: StepDefinition, options: CliOptions): StepReport {
  const { command, args, env } = definition.buildCommand(options);
  const spawnEnv = { ...process.env, ...env };
  const started = Date.now();
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: spawnEnv,
    maxBuffer: 20 * 1024 * 1024,
  });
  const durationMs = Date.now() - started;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const exitCode = result.status ?? (result.error ? 1 : 0);
  const extraction = definition.expectsJson
    ? extractJsonFromOutput(stdout)
    : { logs: [] };
  const logs = mergeLogs(extraction.logs ?? [], stderr);

  const context: StepExecutionContext = {
    options,
    command: [command, ...args],
    env,
    stdout,
    stderr,
    exitCode,
    error: result.error ?? undefined,
    durationMs,
    json: extraction.data,
    parseError: extraction.error,
    logs,
  };

  if (result.error) {
    return {
      key: definition.key,
      title: definition.title,
      status: 'error',
      summary: `Failed to launch command: ${result.error.message}`,
      details: logs,
      metrics: {},
      command: context.command,
      env,
      durationMs,
      exitCode,
      stdout,
      stderr,
      parseError: extraction.error,
      json: extraction.data,
      logs,
    };
  }

  if (definition.expectsJson && !extraction.data) {
    return {
      key: definition.key,
      title: definition.title,
      status: 'error',
      summary: extraction.error || 'Expected JSON output was not produced',
      details: logs,
      metrics: {},
      command: context.command,
      env,
      durationMs,
      exitCode,
      stdout,
      stderr,
      parseError: extraction.error,
      json: extraction.data,
      logs,
    };
  }

  const analysis = definition.analyze(context);
  const details = [...analysis.details];
  let summary = analysis.summary;
  let status = analysis.status;
  if (exitCode !== 0) {
    status = 'error';
    if (!summary.includes('exit code')) {
      summary = `${summary} (exit code ${exitCode})`;
    }
    details.push(`Process exit code: ${exitCode}`);
  }

  return {
    key: definition.key,
    title: definition.title,
    status,
    summary,
    details,
    metrics: analysis.metrics,
    command: context.command,
    env,
    durationMs,
    exitCode,
    stdout,
    stderr,
    parseError: extraction.error,
    json: extraction.data,
    logs,
  };
}

function createSkippedReport(definition: StepDefinition): StepReport {
  return {
    key: definition.key,
    title: definition.title,
    status: 'skipped',
    summary: 'Step skipped by CLI configuration',
    details: [],
    metrics: {},
    command: [],
    env: {},
    durationMs: 0,
    exitCode: null,
    stdout: '',
    stderr: '',
    logs: [],
  };
}

function printHelp(): void {
  const lines = [
    'Usage: ts-node scripts/v2/ownerMissionControl.ts [options]',
    '',
    'Options:',
    '  --network <name>           Hardhat network to target (default: env HARDHAT_NETWORK or hardhat)',
    '  --format <markdown|human|json>  Output format (default: markdown)',
    '  --json                     Shortcut for --format json',
    '  --human                    Shortcut for --format human',
    '  --out <path>               Write report to a file instead of stdout',
    '  --bundle <dir>             Emit a multi-format bundle (md/json/txt + manifest/checksums) into <dir>',
    '  --bundle-name <name>       Override bundle base filename (default: mission-control-<network>)',
    '  --strict                   Exit with non-zero status on warnings as well as errors',
    '  --allow-warnings           Reset --strict behaviour (warnings keep exit code 0)',
    '  --no-mermaid               Disable Mermaid diagram in markdown output',
    '  --skip <steps>             Comma-separated list of steps to skip',
    '  --only <steps>             Run only the listed steps (comma separated)',
    '  --skip-surface             Skip the control surface snapshot',
    '  --skip-plan                Skip the owner plan aggregation',
    '  --skip-verify              Skip owner control verification',
    '  --skip-dashboard           Skip the dashboard telemetry pull',
    '  --help                     Show this message',
    '',
    'Step aliases:',
    '  surface|snapshot|report',
    '  plan|owner-plan|dryrun',
    '  verify|verification|control',
    '  dashboard|dash|status',
  ];
  console.log(lines.join('\n'));
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error: any) {
    console.error(`Argument error: ${error?.message || error}`);
    process.exit(1);
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  const reports: StepReport[] = [];
  for (const definition of STEP_DEFINITIONS) {
    if (!options.run[definition.key]) {
      reports.push(createSkippedReport(definition));
      continue;
    }
    reports.push(runStep(definition, options));
  }

  const rendered = render(options, reports);
  if (options.bundlePath) {
    await writeBundle(options, reports);
  }
  if (options.outPath) {
    const outFile = path.resolve(options.outPath);
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, `${rendered}\n`);
  } else {
    process.stdout.write(rendered);
    if (!rendered.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }

  const overall = computeOverallStatus(reports);
  if (overall === 'error' || (overall === 'warning' && options.strict)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `Mission control failed: ${
      error instanceof Error ? error.stack || error.message : error
    }`
  );
  process.exit(1);
});
