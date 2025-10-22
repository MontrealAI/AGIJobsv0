const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { once } = require('node:events');
const dotenv = require('dotenv');

const REQUIRED_ENV_KEYS = ['RPC_URL', 'JOB_REGISTRY_ADDRESS', 'ONEBOX_RELAYER_PRIVATE_KEY'];
const PLACEHOLDER_TOKENS = [
  'your-key',
  'your_private_key',
  'your-private-key',
  'changeme',
  'change-me',
];
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

function parseAbsoluteUrl(value) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value);
  } catch (error) {
    return null;
  }
}

function isLoopbackHostname(hostname) {
  if (!hostname) {
    return false;
  }
  const lowered = hostname.toLowerCase();
  return (
    lowered === 'localhost' ||
    lowered === '127.0.0.1' ||
    lowered === '::1' ||
    lowered.endsWith('.localhost') ||
    lowered.endsWith('.local')
  );
}

function normalisePrefix(value, fallback = '/onebox') {
  if (value === undefined || value === null) {
    return fallback;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return '';
  }
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, '');
}

function isUnsetEnvValue(value, { treatZeroAddress = true } = {}) {
  if (value === undefined || value === null) {
    return true;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return true;
  }
  const lowered = trimmed.toLowerCase();
  if (PLACEHOLDER_TOKENS.some((token) => lowered.includes(token))) {
    return true;
  }
  if (treatZeroAddress && /^0x0{40}$/.test(lowered)) {
    return true;
  }
  return false;
}

function loadEnvironment({ rootDir, demoDir } = {}) {
  const env = { ...process.env };
  const candidates = [];
  if (rootDir) {
    candidates.push(path.join(rootDir, '.env'));
    candidates.push(path.join(rootDir, '.env.local'));
  }
  if (demoDir) {
    candidates.push(path.join(demoDir, '.env'));
    candidates.push(path.join(demoDir, '.env.local'));
  }
  for (const file of candidates) {
    if (!file) continue;
    if (!fs.existsSync(file)) continue;
    const parsed = dotenv.parse(fs.readFileSync(file));
    Object.assign(env, parsed);
  }
  return env;
}

function resolveNumber(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function parsePositiveDecimal(value, { allowZero = false, label = 'value' } = {}) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new Error(`${label} must be provided`);
  }
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(`${label} must be a positive decimal number`);
  }
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} is not a finite number`);
  }
  if (numeric < 0 || (!allowZero && numeric === 0)) {
    throw new Error(`${label} must be ${allowZero ? 'non-negative' : 'greater than zero'}`);
  }
  return trimmed;
}

function parsePositiveInteger(value, { label = 'value' } = {}) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new Error(`${label} must be provided`);
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} must be a positive integer`);
  }
  const numeric = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  return numeric;
}

function parseShortcutExamples(input) {
  const collected = [];

  const addExample = (value) => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    collected.push(trimmed);
  };

  const process = (candidate) => {
    if (candidate === undefined || candidate === null) {
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        process(item);
      }
      return;
    }
    if (typeof candidate !== 'string') {
      return;
    }
    const trimmed = candidate.trim();
    if (!trimmed) {
      return;
    }
    const looksJsonArray = trimmed.startsWith('[') && trimmed.endsWith(']');
    if (looksJsonArray) {
      try {
        const parsed = JSON.parse(trimmed);
        process(parsed);
        return;
      } catch (error) {
        // Fallback to delimiter parsing when JSON is invalid.
      }
    }
    const segments = trimmed
      .split(/[\n\r]+|\s*\|\s*/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    for (const segment of segments) {
      addExample(segment);
    }
  };

  process(input);
  return [...new Set(collected)];
}

async function detectPortAvailability({ port, host }) {
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('Port must be a positive integer');
  }
  const listenHost = host && String(host).trim() ? host.trim() : '0.0.0.0';
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    const finish = (status, error) => {
      try {
        server.close();
      } catch (closeError) {
        // ignore close errors because we already captured the state we care about
      }
      resolve({ status, error: error ?? null, host: listenHost, port });
    };

    server.once('error', (error) => {
      if (error && (error.code === 'EADDRINUSE' || error.code === 'EACCES')) {
        finish('blocked', error);
        return;
      }
      if (error && error.code === 'EADDRNOTAVAIL') {
        finish('unknown', error);
        return;
      }
      finish('unknown', error);
    });

    server.once('listening', () => {
      finish('available');
    });

    try {
      server.listen({ port, host: listenHost, exclusive: true });
    } catch (error) {
      finish('unknown', error);
    }
  });
}

async function collectPortDiagnostics(config) {
  const checks = [
    {
      id: 'orchestrator',
      label: 'Orchestrator API',
      port: config.orchestratorPort,
      host: config.uiHost ?? '0.0.0.0',
      listenHost: '0.0.0.0',
    },
    {
      id: 'ui',
      label: 'UI server',
      port: config.uiPort,
      host: config.uiHost,
      listenHost: config.uiHost,
    },
  ];

  const results = [];
  for (const check of checks) {
    const result = await detectPortAvailability({ port: check.port, host: check.listenHost });
    results.push({
      id: check.id,
      label: check.label,
      port: check.port,
      host: check.listenHost,
      status: result.status,
      error: result.error,
    });
  }

  return results;
}

async function assertPortsAvailable(config) {
  const diagnostics = await collectPortDiagnostics(config);
  const conflicts = diagnostics.filter((entry) => entry.status === 'blocked');
  if (conflicts.length > 0) {
    const message = conflicts
      .map((entry) => `${entry.label} port ${entry.port} (${entry.host})`)
      .join(', ');
    const error = new Error(`Ports already in use: ${message}`);
    error.diagnostics = diagnostics;
    throw error;
  }
  return diagnostics;
}

function resolveConfig(env, options = {}) {
  const missing = [];
  const warnings = [];
  for (const key of REQUIRED_ENV_KEYS) {
    const value = env[key];
    const treatZeroAddress = key !== 'RPC_URL';
    if (isUnsetEnvValue(value, { treatZeroAddress })) {
      missing.push(key);
    }
  }
  if (missing.length && !options.allowPartial) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const orchestratorPort = resolveNumber(options.orchestratorPort ?? env.ONEBOX_PORT, 8080);
  const uiPort = resolveNumber(options.uiPort ?? env.ONEBOX_UI_PORT, 4173);
  const uiHost = (options.uiHost ?? env.ONEBOX_UI_HOST ?? '127.0.0.1').trim() || '127.0.0.1';
  const prefixCandidate = options.prefix ?? env.ONEBOX_PUBLIC_ONEBOX_PREFIX ?? env.ONEBOX_DEMO_PREFIX ?? '/onebox';
  const prefix = normalisePrefix(prefixCandidate, '/onebox');
  const apiToken = (options.apiToken ?? env.ONEBOX_API_TOKEN ?? '').trim();
  const defaultModeRaw = (options.defaultMode ?? env.ONEBOX_UI_DEFAULT_MODE ?? 'guest').toString().toLowerCase();
  const defaultMode = defaultModeRaw === 'expert' ? 'expert' : 'guest';
  const publicOrchestratorUrl =
    options.publicOrchestratorUrl ??
    env.ONEBOX_PUBLIC_ORCHESTRATOR_URL ??
    `http://${uiHost}:${orchestratorPort}`;
  const explorerBase = (options.explorerBase ?? env.ONEBOX_EXPLORER_TX_BASE ?? env.NEXT_PUBLIC_ONEBOX_EXPLORER_TX_BASE ?? '').trim();
  const welcomeMessage = (options.welcomeMessage ?? env.ONEBOX_UI_WELCOME ?? '').toString().trim();

  let jobRegistryAddress = (env.JOB_REGISTRY_ADDRESS ?? '').trim();
  let stakeManagerAddress = (env.STAKE_MANAGER_ADDRESS ?? '').trim();
  let systemPauseAddress = (env.SYSTEM_PAUSE_ADDRESS ?? '').trim();
  let agentAddress = (env.AGENT_ADDRESS ?? '').trim();

  if (!isUnsetEnvValue(jobRegistryAddress) && !ADDRESS_REGEX.test(jobRegistryAddress)) {
    const message = 'JOB_REGISTRY_ADDRESS must be a 0x-prefixed 40-character address.';
    if (options.allowPartial) {
      warnings.push(message);
    } else {
      throw new Error(message);
    }
  }

  if (isUnsetEnvValue(stakeManagerAddress)) {
    warnings.push(
      'Stake manager address not configured. Ensure STAKE_MANAGER_ADDRESS is set or provided by network metadata so owner staking guardrails remain enforceable.',
    );
    stakeManagerAddress = '';
  } else if (!ADDRESS_REGEX.test(stakeManagerAddress)) {
    warnings.push('Stake manager address must be a 0x-prefixed 40-character address. Update STAKE_MANAGER_ADDRESS.');
  }

  if (isUnsetEnvValue(systemPauseAddress)) {
    warnings.push(
      'System pause address not configured. Set SYSTEM_PAUSE_ADDRESS to preserve emergency pause control for the contract owner.',
    );
    systemPauseAddress = '';
  } else if (!ADDRESS_REGEX.test(systemPauseAddress)) {
    warnings.push('System pause address must be a 0x-prefixed 40-character address. Update SYSTEM_PAUSE_ADDRESS.');
  }

  if (agentAddress) {
    if (agentAddress.startsWith('0x') && !ADDRESS_REGEX.test(agentAddress)) {
      warnings.push('AGENT_ADDRESS must be a 0x-prefixed 40-character address or a valid ENS name.');
    }
    if (/^0x0{40}$/i.test(agentAddress)) {
      warnings.push('AGENT_ADDRESS is the zero address placeholder. Update it or clear the variable.');
    }
  }

  const exampleSources = [];
  if (env.ONEBOX_UI_SHORTCUTS !== undefined) {
    exampleSources.push(env.ONEBOX_UI_SHORTCUTS);
  }
  if (options.examples !== undefined) {
    exampleSources.push(options.examples);
  }
  const shortcutExamples = parseShortcutExamples(exampleSources);

  const parsedPublicUrl = parseAbsoluteUrl(publicOrchestratorUrl);
  if (!parsedPublicUrl) {
    warnings.push(
      `Public orchestrator URL '${publicOrchestratorUrl}' is not a valid absolute URL. Update ONEBOX_PUBLIC_ORCHESTRATOR_URL or supply --orchestrator-url.`,
    );
  }

  const isLoopback = parsedPublicUrl ? isLoopbackHostname(parsedPublicUrl.hostname) : false;
  if (parsedPublicUrl && parsedPublicUrl.protocol === 'http:' && !isLoopback) {
    warnings.push(
      `Public orchestrator URL ${publicOrchestratorUrl} uses HTTP on a non-loopback host. Use HTTPS or a trusted tunnel before sharing the demo.`,
    );
  }
  if (!apiToken && parsedPublicUrl && !isLoopback) {
    warnings.push(
      'No API token configured while exposing the orchestrator beyond loopback. Set ONEBOX_API_TOKEN or provide --token to keep the surface restricted.',
    );
  }

  let maxJobBudgetAgia;
  const budgetSource = options.maxJobBudgetAgia ?? env.ONEBOX_MAX_JOB_BUDGET_AGIA;
  if (!isUnsetEnvValue(budgetSource, { treatZeroAddress: false })) {
    try {
      maxJobBudgetAgia = parsePositiveDecimal(budgetSource, {
        label: 'ONEBOX_MAX_JOB_BUDGET_AGIA',
      });
    } catch (error) {
      if (options.allowPartial) {
        warnings.push(
          error instanceof Error
            ? error.message
            : 'Invalid ONEBOX_MAX_JOB_BUDGET_AGIA configuration'
        );
      } else {
        throw error instanceof Error
          ? error
          : new Error('Invalid ONEBOX_MAX_JOB_BUDGET_AGIA configuration');
      }
    }
  }

  let maxJobDurationDays;
  const durationSource = options.maxJobDurationDays ?? env.ONEBOX_MAX_JOB_DURATION_DAYS;
  if (!isUnsetEnvValue(durationSource, { treatZeroAddress: false })) {
    try {
      maxJobDurationDays = parsePositiveInteger(durationSource, {
        label: 'ONEBOX_MAX_JOB_DURATION_DAYS',
      });
    } catch (error) {
      if (options.allowPartial) {
        warnings.push(
          error instanceof Error
            ? error.message
            : 'Invalid ONEBOX_MAX_JOB_DURATION_DAYS configuration'
        );
      } else {
        throw error instanceof Error
          ? error
          : new Error('Invalid ONEBOX_MAX_JOB_DURATION_DAYS configuration');
      }
    }
  }

  return {
    env,
    orchestratorPort,
    uiPort,
    uiHost,
    prefix,
    apiToken,
    defaultMode,
    publicOrchestratorUrl,
    explorerBase,
    missing,
    warnings,
    maxJobBudgetAgia,
    maxJobDurationDays,
    welcomeMessage,
    shortcutExamples,
    jobRegistryAddress,
    stakeManagerAddress,
    systemPauseAddress,
    agentAddress,
  };
}

function createDemoUrl(config) {
  const base = `http://${config.uiHost}:${config.uiPort}/`;
  const params = new URLSearchParams();
  params.set('orchestrator', config.publicOrchestratorUrl);
  if (config.prefix) {
    params.set('oneboxPrefix', config.prefix);
  }
  if (config.apiToken) {
    params.set('token', config.apiToken);
  }
  params.set('mode', config.defaultMode);
  if (config.welcomeMessage) {
    params.set('welcome', config.welcomeMessage);
  }
  if (Array.isArray(config.shortcutExamples) && config.shortcutExamples.length > 0) {
    params.set('examples', JSON.stringify(config.shortcutExamples));
  }
  return `${base}?${params.toString()}`;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function ensureInstall(rootDir) {
  const nodeModules = path.join(rootDir, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], { cwd: rootDir });
  }
}

async function buildStaticAssets(rootDir, env) {
  await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'onebox:static:build'], {
    cwd: rootDir,
    env: { ...process.env, ...env },
  });
}

function startOrchestrator(rootDir, env, config) {
  const orchestratorEnv = {
    ...process.env,
    ...env,
    ONEBOX_PORT: String(config.orchestratorPort),
  };
  if (config.explorerBase) {
    orchestratorEnv.ONEBOX_EXPLORER_TX_BASE = config.explorerBase;
  }
  if (config.maxJobBudgetAgia) {
    orchestratorEnv.ONEBOX_MAX_JOB_BUDGET_AGIA = String(config.maxJobBudgetAgia);
  }
  if (config.maxJobDurationDays) {
    orchestratorEnv.ONEBOX_MAX_JOB_DURATION_DAYS = String(config.maxJobDurationDays);
  }
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, ['run', 'onebox:server'], {
    cwd: rootDir,
    env: orchestratorEnv,
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error('[onebox] Orchestrator exited unexpectedly with code', code);
    }
  });
  return child;
}

function safeJoin(root, targetPath) {
  const resolved = path.resolve(root, targetPath);
  if (!resolved.startsWith(path.resolve(root))) {
    return null;
  }
  return resolved;
}

function startStaticServer(distDir, config) {
  const demoQuery = new URL(createDemoUrl(config)).searchParams.toString();
  const server = http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || config.uiHost}:${config.uiPort}`);
      if (requestUrl.pathname === '/' && !requestUrl.searchParams.has('orchestrator')) {
        res.statusCode = 302;
        res.setHeader('Location', `/?${demoQuery}`);
        res.end();
        return;
      }
      let filePath = requestUrl.pathname;
      if (filePath.endsWith('/')) {
        filePath = `${filePath}index.html`;
      }
      if (filePath === '/') {
        filePath = '/index.html';
      }
      const safePath = safeJoin(distDir, `.${decodeURIComponent(filePath)}`);
      if (!safePath) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }
      let contentPath = safePath;
      if (!fs.existsSync(contentPath)) {
        contentPath = safeJoin(distDir, './index.html');
      }
      if (!contentPath || !fs.existsSync(contentPath)) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const ext = path.extname(contentPath).toLowerCase();
      res.statusCode = 200;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      fs.createReadStream(contentPath).pipe(res);
    } catch (error) {
      res.statusCode = 500;
      res.end('Internal server error');
      console.error('[onebox] Static server error', error);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.uiPort, config.uiHost, () => {
      console.log(`[onebox] UI server listening on http://${config.uiHost}:${config.uiPort}`);
      resolve(server);
    });
  });
}

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.unref();
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {};
  const requireValue = (flag, value) => {
    if (value === undefined || value === null || String(value).startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }
    return String(value);
  };
  const parseNumber = (flag, value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Invalid value for ${flag}: ${value}`);
    }
    return parsed;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }

    if (arg === '--no-browser') {
      options.openBrowser = false;
      continue;
    }
    if (arg === '--browser' || arg === '--open-browser') {
      options.openBrowser = true;
      continue;
    }

    const [flag, inlineValue] = arg.split('=');
    let value = inlineValue;
    if (value === undefined) {
      value = argv[index + 1];
      if (value !== undefined) {
        index += 1;
      }
    }

    switch (flag) {
      case '--ui-port':
        options.uiPort = parseNumber(flag, requireValue(flag, value));
        break;
      case '--orchestrator-port':
        options.orchestratorPort = parseNumber(flag, requireValue(flag, value));
        break;
      case '--ui-host':
        options.uiHost = requireValue(flag, value);
        break;
      case '--prefix':
        options.prefix = requireValue(flag, value);
        break;
      case '--token':
        options.apiToken = requireValue(flag, value);
        break;
      case '--mode': {
        const mode = requireValue(flag, value).toLowerCase();
        if (mode !== 'guest' && mode !== 'expert') {
          throw new Error(`Invalid value for --mode: ${mode}`);
        }
        options.defaultMode = mode;
        break;
      }
      case '--orchestrator-url':
        options.publicOrchestratorUrl = requireValue(flag, value);
        break;
      case '--explorer-base':
        options.explorerBase = requireValue(flag, value);
        break;
      case '--max-budget':
        options.maxJobBudgetAgia = parsePositiveDecimal(requireValue(flag, value), {
          label: '--max-budget',
        });
        break;
      case '--max-duration':
        options.maxJobDurationDays = parsePositiveInteger(requireValue(flag, value), {
          label: '--max-duration',
        });
        break;
      case '--welcome':
        options.welcomeMessage = requireValue(flag, value);
        break;
      case '--example':
      case '--examples': {
        const parsedExamples = parseShortcutExamples(requireValue(flag, value));
        if (parsedExamples.length > 0) {
          options.examples = [...(options.examples ?? []), ...parsedExamples];
        }
        break;
      }
      default:
        // Unrecognised flag – ignore so scripts remain forward compatible.
        break;
    }
  }

  return options;
}

async function runDemo(options = {}) {
  const rootDir = options.rootDir ?? path.resolve(__dirname, '../../');
  const demoDir = options.demoDir ?? __dirname;
  const env = loadEnvironment({ rootDir, demoDir });
  const config = resolveConfig(env, options);

  const portDiagnostics = await assertPortsAvailable(config);
  const additionalWarnings = portDiagnostics
    .filter((entry) => entry.status === 'unknown' && entry.error)
    .map((entry) =>
      entry.error instanceof Error
        ? `Unable to verify ${entry.label} port ${entry.port} (${entry.host}): ${entry.error.message}`
        : `Unable to verify ${entry.label} port ${entry.port} (${entry.host}).`
    );
  config.portDiagnostics = portDiagnostics;
  if (additionalWarnings.length > 0) {
    config.warnings = [...config.warnings, ...additionalWarnings];
  }

  await ensureInstall(rootDir);
  await buildStaticAssets(rootDir, env);

  const orchestratorProcess = startOrchestrator(rootDir, env, config);
  const server = await startStaticServer(path.join(rootDir, 'apps/onebox-static/dist'), config);
  const demoUrl = createDemoUrl(config);

  console.log('');
  console.log('🎖️  AGI Jobs One-Box demo ready');
  console.log(`   • UI:        ${demoUrl}`);
  console.log(`   • Orchestrator API: http://${config.uiHost}:${config.orchestratorPort}/onebox`);
  if (config.maxJobBudgetAgia || config.maxJobDurationDays) {
    console.log('   • Guardrails:');
    if (config.maxJobBudgetAgia) {
      console.log(`       – Max job budget: ${config.maxJobBudgetAgia} AGIALPHA`);
    }
    if (config.maxJobDurationDays) {
      console.log(`       – Max job duration: ${config.maxJobDurationDays} day(s)`);
    }
  }
  if (config.welcomeMessage) {
    console.log(`   • Welcome prompt: ${config.welcomeMessage}`);
  }
  if (config.shortcutExamples.length > 0) {
    console.log('   • Shortcuts:');
    for (const shortcut of config.shortcutExamples) {
      console.log(`       – ${shortcut}`);
    }
  }
  if (config.warnings.length > 0) {
    console.log('   • Warnings:');
    for (const warning of config.warnings) {
      console.log(`       – ${warning}`);
    }
  }
  if (config.apiToken) {
    console.log('   • API token: supplied via query parameter (kept in-memory only)');
  }
  if (config.portDiagnostics) {
    console.log('   • Port diagnostics:');
    for (const diag of config.portDiagnostics) {
      const statusLabel =
        diag.status === 'available'
          ? 'available'
          : diag.status === 'blocked'
          ? 'in use'
          : 'unknown';
      console.log(`       – ${diag.label}: ${statusLabel} on ${diag.host}:${diag.port}`);
    }
  }
  console.log('   • Press Ctrl+C to stop');
  console.log('');

  if (options.openBrowser !== false) {
    openBrowser(demoUrl);
  }

  const shutdown = async () => {
    try {
      server.close();
    } catch (error) {
      // ignore
    }
    if (!orchestratorProcess.killed) {
      orchestratorProcess.kill('SIGINT');
      await once(orchestratorProcess, 'exit').catch(() => {});
    }
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  orchestratorProcess.on('exit', (code) => {
    console.log('[onebox] Orchestrator process exited', code);
    try {
      server.close();
    } catch (error) {
      // ignore
    }
    process.exit(code ?? 0);
  });

  return { config, demoUrl, orchestratorProcess, server };
}

module.exports = {
  REQUIRED_ENV_KEYS,
  normalisePrefix,
  isUnsetEnvValue,
  loadEnvironment,
  resolveConfig,
  createDemoUrl,
  ensureInstall,
  buildStaticAssets,
  startOrchestrator,
  startStaticServer,
  openBrowser,
  parseCliArgs,
  parsePositiveDecimal,
  parsePositiveInteger,
  parseShortcutExamples,
  detectPortAvailability,
  collectPortDiagnostics,
  assertPortsAvailable,
  runDemo,
};
