#!/usr/bin/env node

const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const DEMO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(DEMO_ROOT, 'output');
const REQUIRED_ARTEFACTS = [
  'index.html',
  'kardashev-telemetry.json',
  'kardashev-stability-ledger.json',
  'kardashev-equilibrium-ledger.json',
  'kardashev-owner-proof.json',
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mmd': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function parseArgs(argv) {
  const portIndex = argv.findIndex((value) => value === '--port');
  const portValue = portIndex >= 0 ? argv[portIndex + 1] : undefined;
  const port = Number(portValue || process.env.PORT || 4175);

  const profileIndex = argv.findIndex((value) => value === '--profile');
  const profileValue = profileIndex >= 0 ? argv[profileIndex + 1] : undefined;

  const configRootIndex = argv.findIndex((value) => value === '--config-root');
  const configRootValue = configRootIndex >= 0 ? argv[configRootIndex + 1] : undefined;

  return {
    port: Number.isFinite(port) && port > 0 ? port : 4175,
    profile: profileValue || process.env.KARDASHEV_DEMO_PROFILE || '',
    configRoot: configRootValue || process.env.KARDASHEV_DEMO_ROOT || '',
  };
}

function resolvePath(requestUrl) {
  try {
    const parsed = new URL(requestUrl, 'http://localhost');
    const decoded = decodeURIComponent(parsed.pathname);
    const safePath = path.normalize(decoded).replace(/^\.\.(\/|\\)/, '');
    const resolved = path.join(DEMO_ROOT, safePath);
    if (!resolved.startsWith(DEMO_ROOT)) {
      return null;
    }
    return resolved;
  } catch (error) {
    return null;
  }
}

async function readFileOr404(targetPath, res) {
  try {
    const stats = await fs.stat(targetPath);
    if (stats.isDirectory()) {
      const indexPath = path.join(targetPath, 'index.html');
      return readFileOr404(indexPath, res);
    }
    const ext = path.extname(targetPath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const buffer = await fs.readFile(targetPath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(buffer);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

async function startServer() {
  const { port, profile, configRoot } = parseArgs(process.argv.slice(2));
  await ensureArtefacts({ profile, configRoot });

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing request URL');
      return;
    }

    const targetPath = resolvePath(req.url);
    if (!targetPath) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid path');
      return;
    }

    await readFileOr404(targetPath, res);
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}/index.html`;
    console.log(`🚀 Kardashev II dashboard ready at ${url}`);
    console.log('   Serve this URL in a browser to load telemetry without CORS errors.');
    console.log(`   Demo root: ${pathToFileURL(DEMO_ROOT).toString()}`);
  });
}

async function ensureArtefacts({ profile, configRoot }) {
  const missing = [];
  for (const filename of REQUIRED_ARTEFACTS) {
    const targetPath = path.join(OUTPUT_DIR, filename);
    try {
      await fs.stat(targetPath);
    } catch (error) {
      missing.push(filename);
    }
  }

  if (missing.length === 0) {
    return;
  }

  console.log(
    `⚠️ Missing Kardashev II artefacts (${missing.join(
      ', '
    )}). Regenerating via run-kardashev-demo.ts...`
  );
  const env = {
    ...process.env,
    ...(profile ? { KARDASHEV_DEMO_PROFILE: profile } : {}),
    ...(configRoot ? { KARDASHEV_DEMO_ROOT: configRoot } : {}),
  };
  const orchestratorArgs = [
    'ts-node',
    '--compiler-options',
    '{"module":"commonjs"}',
    path.join(DEMO_ROOT, 'scripts', 'run-kardashev-demo.ts'),
    ...(profile ? ['--profile', profile] : []),
    ...(configRoot ? ['--config-root', configRoot] : []),
  ];
  const result = spawnSync('npx', orchestratorArgs, {
    stdio: 'inherit',
    cwd: DEMO_ROOT,
    env,
  });
  if (result.status === 0) {
    return;
  }

  console.warn('⚠️ Falling back to run-demo.cjs after orchestrator failure.');
  const fallback = spawnSync(process.execPath, [path.join(DEMO_ROOT, 'run-demo.cjs')], {
    stdio: 'inherit',
    cwd: DEMO_ROOT,
    env,
  });
  if (fallback.status !== 0) {
    throw new Error('Failed to regenerate Kardashev II demo artefacts.');
  }
}

startServer().catch((error) => {
  console.error('Failed to start dashboard server:', error);
  process.exit(1);
});
