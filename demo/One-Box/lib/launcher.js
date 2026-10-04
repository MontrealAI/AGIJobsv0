const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const net = require('node:net');
const dotenv = require('dotenv');
const { formatHostForUrl, buildOrigin, createDemoUrl, startStaticServer } = require('./static-server.cjs');
const { probeRpc } = require('./rpc.js');
const ROOT_DIR = path.resolve(__dirname, '../../..');
const DEMO_DIR = path.resolve(__dirname, '..');

const REQUIRED_ENV_KEYS = ['RPC_URL', 'JOB_REGISTRY_ADDRESS', 'ONEBOX_RELAYER_PRIVATE_KEY', 'ONEBOX_API_TOKEN'];
const PLACEHOLDER_TOKENS = [
  'your-key',
  'your_private_key',
  'your-private-key',
  'changeme',
  'change-me',
];
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  const normalised = String(value).trim().toLowerCase();
  if (!normalised) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(normalised);
}

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
    lowered === '[::1]' ||
    lowered.endsWith('.localhost')
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
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(withLeading) || withLeading.includes('//')) throw new Error('Prefix must be a simple API path.');
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

function loadEnvironment({ rootDir = ROOT_DIR, demoDir = DEMO_DIR, processEnv = process.env } = {}) {
  const env = {};
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
  return { ...env, ...processEnv };
}

function resolveNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 1 || Number(text) > 65535) {
    throw new Error('Port must be an integer from 1 to 65535');
  }
  return Number(text);
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
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
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
      host: config.orchestratorHost ?? '127.0.0.1',
      listenHost: config.orchestratorHost ?? '127.0.0.1',
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
  for (const check of checks.filter(check => !config.staticOnly || check.id === 'ui')) {
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
  const allowPartialFromEnv = parseBoolean(env.ONEBOX_ALLOW_PARTIAL) || parseBoolean(env.ONEBOX_DEMO_MODE);
  const allowPartial = options.allowPartial ?? allowPartialFromEnv;
  const missing = [];
  const warnings = [];
  for (const key of REQUIRED_ENV_KEYS) {
    const value = key === 'ONEBOX_API_TOKEN' ? (options.apiToken ?? env[key]) : env[key];
    const treatZeroAddress = key !== 'RPC_URL';
    if (isUnsetEnvValue(value, { treatZeroAddress })) {
      missing.push(key);
    }
  }
  if (missing.length && !allowPartial) {
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
    options.publicOrchestratorUrl || env.ONEBOX_PUBLIC_ORCHESTRATOR_URL ||
    buildOrigin(uiHost === '0.0.0.0' || uiHost === '::' ? '127.0.0.1' : uiHost, orchestratorPort);
  const explorerBase = (options.explorerBase ?? env.ONEBOX_EXPLORER_TX_BASE ?? env.NEXT_PUBLIC_ONEBOX_EXPLORER_TX_BASE ?? '').trim();
  const welcomeMessage = (options.welcomeMessage ?? env.ONEBOX_UI_WELCOME ?? '').toString().trim();

  let jobRegistryAddress = (env.JOB_REGISTRY_ADDRESS ?? '').trim();
  let stakeManagerAddress = (env.STAKE_MANAGER_ADDRESS ?? '').trim();
  let systemPauseAddress = (env.SYSTEM_PAUSE_ADDRESS ?? '').trim();
  let agentAddress = (env.AGENT_ADDRESS ?? '').trim();

  if (!isUnsetEnvValue(jobRegistryAddress) && !ADDRESS_REGEX.test(jobRegistryAddress)) {
    const message = 'JOB_REGISTRY_ADDRESS must be a 0x-prefixed 40-character address.';
    if (allowPartial) {
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
  if (parsedPublicUrl && (!['http:', 'https:'].includes(parsedPublicUrl.protocol) || parsedPublicUrl.username || parsedPublicUrl.password || parsedPublicUrl.search || parsedPublicUrl.hash)) {
    throw new Error('Orchestrator URL must use HTTP(S) without credentials, query parameters or fragments.');
  }
  if (orchestratorPort === uiPort && !options.staticOnly) throw new Error('UI and orchestrator ports must be different.');
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
      if (allowPartial) {
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
      if (allowPartial) {
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

  if (!allowPartial) {
    if (!parsedPublicUrl) throw new Error('Invalid public orchestrator URL.');
    const rpc = parseAbsoluteUrl(env.RPC_URL);
    if (!rpc || !['http:', 'https:'].includes(rpc.protocol)) throw new Error('RPC_URL must be an HTTP(S) endpoint.');
    try { new (require('ethers').Wallet)(env.ONEBOX_RELAYER_PRIVATE_KEY); } catch { throw new Error('ONEBOX_RELAYER_PRIVATE_KEY must be a valid private key.'); }
    if (!/^[A-Za-z0-9._~+/=:-]{16,512}$/.test(apiToken)) throw new Error('ONEBOX_API_TOKEN must contain 16–512 bearer-token characters.');
  }

  return {
    env,
    orchestratorPort,
    orchestratorHost: env.ONEBOX_HOST || '127.0.0.1',
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
    allowPartial,
    staticOnly: Boolean(options.staticOnly),
    demoMode: Boolean(options.demoMode),
  };
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
    ONEBOX_HOST: config.orchestratorHost,
    ONEBOX_API_TOKEN: config.apiToken,
    ONEBOX_PREFIX: config.prefix,
    ONEBOX_CORS_ALLOW: env.ONEBOX_CORS_ALLOW || buildOrigin(['0.0.0.0', '::'].includes(config.uiHost) ? '127.0.0.1' : config.uiHost, config.uiPort),
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
  const child = spawn(process.execPath, ['apps/orchestrator/dist/apps/orchestrator/onebox-server.js'], {
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

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => console.warn('[onebox] Browser could not open automatically. Open the printed UI URL.'));
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
    try { return resolveNumber(value); } catch { throw new Error(`Invalid value for ${flag}: expected a port from 1 to 65535`); }
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--demo' || arg === '--static-only') { options.demoMode = true; options.staticOnly = true; continue; }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);

    if (arg === '--no-browser') {
      options.openBrowser = false;
      continue;
    }
    if (arg === '--browser' || arg === '--open-browser') {
      options.openBrowser = true;
      continue;
    }

    const equals = arg.indexOf('=');
    const flag = equals < 0 ? arg : arg.slice(0, equals);
    const inlineValue = equals < 0 ? undefined : arg.slice(equals + 1);
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
        throw new Error(`Unknown option: ${flag}. Use --help for supported options.`);
    }
  }

  return options;
}

const HELP = `AGI Jobs One-Box

Try a browser-only preview:
  npm run demo:onebox:launch -- --demo

Connect your configured local/test network:
  npm run demo:onebox:doctor -- --strict
  npm run demo:onebox:launch

Options:
  --demo, --static-only       Preview only; no backend or provider calls
  --no-browser               Print the URL without opening a browser
  --ui-port PORT             UI port (default 4173)
  --orchestrator-port PORT   Backend port (default 8080)
  --ui-host HOST             UI bind address (default 127.0.0.1)
  --orchestrator-url URL     Browser-reachable backend base URL
  --prefix PATH             API prefix (default /onebox)
  --mode guest|expert       Relayer execution or wallet calldata preparation
  --token TOKEN             Backend token; never placed in the launch URL
  --max-budget AMOUNT        Maximum AGIALPHA job reward
  --max-duration DAYS        Maximum job duration
  --welcome TEXT            Welcome message
  --example TEXT             Repeatable suggested prompt
  --explorer-base URL        Transaction explorer base URL
  --help                    Show this help

Use Advanced → Set API token in the browser for connected mode.
Guide: demo/One-Box/README.md
`;

async function waitForOrchestrator(child, config, { timeoutMs = 60000, fetchImpl = globalThis.fetch } = {}) {
  const deadline = Date.now() + timeoutMs;
  let spawnError;
  const onError = (error) => { spawnError = error; };
  child.on('error', onError);
  try {
    while (Date.now() < deadline) {
      if (spawnError) throw new Error(`Orchestrator failed to start: ${spawnError.message}`);
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Orchestrator exited before becoming ready. Check its startup output.');
      try {
        const origin = buildOrigin(config.orchestratorHost === '0.0.0.0' ? '127.0.0.1' : config.orchestratorHost, config.orchestratorPort);
        const response = await fetchImpl(`${origin}/healthz`, { signal: AbortSignal.timeout(1500) });
        const health = response.ok ? await response.json() : null;
        if (health?.ok === true) {
          const status = await fetchImpl(`${origin}${config.prefix}/status`, { headers: { Authorization: `Bearer ${config.apiToken}` }, signal: AbortSignal.timeout(3000) });
          if (status.status === 401 || status.status === 403) throw new Error('Backend rejected the configured API token.');
          if (status.ok && Array.isArray((await status.json()).jobs)) return;
        }
      } catch (error) {
        if (error.message === 'Backend rejected the configured API token.') throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('Orchestrator readiness timed out. Check RPC connectivity, contract addresses and API authentication.');
  } finally { child.removeListener('error', onError); }
}

async function stopChild(child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    const done = () => { clearTimeout(force); resolve(); };
    child.once('exit', done);
    child.once('error', done);
    child.kill('SIGTERM');
  });
}

async function runDemo(options = {}) {
  if (options.help) { console.log(HELP); return { help: true }; }
  const rootDir = options.rootDir ?? ROOT_DIR;
  const demoDir = options.demoDir ?? DEMO_DIR;
  const env = loadEnvironment({ rootDir, demoDir });
  const demoMode = Boolean(options.demoMode || options.staticOnly || parseBoolean(env.ONEBOX_DEMO_MODE) || options.allowPartial || parseBoolean(env.ONEBOX_ALLOW_PARTIAL));
  const config = resolveConfig(env, { ...options, demoMode, staticOnly: demoMode, allowPartial: demoMode });
  if (demoMode) config.publicOrchestratorUrl = '';
  config.portDiagnostics = await assertPortsAvailable(config);
  if (!demoMode) {
    const probe = await probeRpc({ rpcUrl: env.RPC_URL, jobRegistryAddress: config.jobRegistryAddress, stakeManagerAddress: config.stakeManagerAddress, systemPauseAddress: config.systemPauseAddress });
    if (probe.status !== 'ready' || probe.jobRegistry.status !== 'ok') throw new Error('RPC or Job Registry bytecode check failed. Run npm run demo:onebox:doctor.');
    if (env.CHAIN_ID && String(probe.chain.decimal) !== String(env.CHAIN_ID).trim()) throw new Error('RPC chain ID does not match CHAIN_ID.');
    for (const key of ['stakeManager', 'systemPause']) {
      if (probe[key].status !== 'ok' && probe[key].status !== 'missing') throw new Error(`${key} contract check failed. Run the doctor.`);
    }
  }
  await ensureInstall(rootDir);
  await buildStaticAssets(rootDir, env);
  let orchestratorProcess;
  let server;
  let stopping = false;
  let failure;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await stopChild(orchestratorProcess);
  };
  const onSignal = () => { stop().catch(error => { console.error(error.message); process.exitCode = 1; }); };
  try {
    if (!demoMode) {
      await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:orchestrator'], { cwd: rootDir, env: { ...process.env, ...env } });
      orchestratorProcess = startOrchestrator(rootDir, env, config);
      orchestratorProcess.on('error', error => { failure = error; });
      orchestratorProcess.on('exit', (code, signal) => {
        if (!stopping) {
          failure = new Error(`Orchestrator stopped (${signal || code}). The UI has been shut down.`);
          console.error('[onebox]', failure.message);
          process.exitCode = 1;
          if (server) void stop();
        }
      });
      await waitForOrchestrator(orchestratorProcess, config);
    }
    if (failure || stopping) throw failure || new Error('Startup interrupted');
    server = await startStaticServer(path.join(rootDir, 'apps/onebox-static/dist'), config);
    if (failure || stopping) throw failure || new Error('Startup interrupted');
    const demoUrl = createDemoUrl(config);
    console.log(`\nAGI Jobs One-Box ready — ${demoMode ? 'browser-only preview; zero blockchain transactions' : 'connected backend verified'}`);
    console.log(`   UI: ${demoUrl}`);
    if (!demoMode) console.log('   Open Advanced → Set API token. The token is never printed or included in the URL.');
    if (config.maxJobBudgetAgia) console.log(`   Maximum job budget: ${config.maxJobBudgetAgia} AGIALPHA`);
    if (config.maxJobDurationDays) console.log(`   Maximum job duration: ${config.maxJobDurationDays} day(s)`);
    for (const warning of demoMode ? [] : config.warnings) console.warn(`   ${warning}`);
    console.log('   Press Ctrl+C to stop.\n');
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    if (options.openBrowser !== false) openBrowser(demoUrl);
    return { config, demoUrl, orchestratorProcess, server, stop };
  } catch (error) { await stop(); throw error; }
}

module.exports = {
  ROOT_DIR,
  DEMO_DIR,
  HELP,
  waitForOrchestrator,
  stopChild,
  REQUIRED_ENV_KEYS,
  normalisePrefix,
  formatHostForUrl,
  buildOrigin,
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
