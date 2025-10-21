const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const dotenv = require('dotenv');

const REQUIRED_ENV_KEYS = ['RPC_URL', 'JOB_REGISTRY_ADDRESS', 'ONEBOX_RELAYER_PRIVATE_KEY'];
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

function resolveConfig(env, options = {}) {
  const missing = [];
  for (const key of REQUIRED_ENV_KEYS) {
    const value = env[key];
    if (value === undefined || value === null || String(value).trim() === '') {
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

async function runDemo(options = {}) {
  const rootDir = options.rootDir ?? path.resolve(__dirname, '../../');
  const demoDir = options.demoDir ?? __dirname;
  const env = loadEnvironment({ rootDir, demoDir });
  const config = resolveConfig(env);

  await ensureInstall(rootDir);
  await buildStaticAssets(rootDir, env);

  const orchestratorProcess = startOrchestrator(rootDir, env, config);
  const server = await startStaticServer(path.join(rootDir, 'apps/onebox-static/dist'), config);
  const demoUrl = createDemoUrl(config);

  console.log('');
  console.log('🎖️  AGI Jobs One-Box demo ready');
  console.log(`   • UI:        ${demoUrl}`);
  console.log(`   • Orchestrator API: http://${config.uiHost}:${config.orchestratorPort}/onebox`);
  if (config.apiToken) {
    console.log('   • API token: supplied via query parameter (kept in-memory only)');
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
  loadEnvironment,
  resolveConfig,
  createDemoUrl,
  ensureInstall,
  buildStaticAssets,
  startOrchestrator,
  startStaticServer,
  openBrowser,
  runDemo,
};
