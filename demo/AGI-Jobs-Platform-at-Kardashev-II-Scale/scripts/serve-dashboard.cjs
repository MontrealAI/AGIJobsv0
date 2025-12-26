#!/usr/bin/env node

const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

const DEMO_ROOT = path.resolve(__dirname, '..');

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
  const help = argv.includes('--help') || argv.includes('-h');
  const portIndex = argv.findIndex((value) => value === '--port');
  const portValue =
    portIndex >= 0
      ? argv[portIndex + 1]
      : argv.find((value) => value.startsWith('--port='))?.split('=')[1];
  const port = Number(portValue || process.env.PORT || 4175);
  return {
    help,
    port: Number.isFinite(port) && port > 0 ? port : 4175,
  };
}

function renderHelp() {
  console.log(`Kardashev II dashboard server

Usage:
  node demo/AGI-Jobs-Platform-at-Kardashev-II-Scale/scripts/serve-dashboard.cjs [--port 4175]

Options:
  --port <number>     Override the HTTP port (default: 4175, env: PORT).
  --port=<number>     Override the HTTP port (alternate syntax).
  -h, --help          Show this help message.
`);
}

const REQUIRED_OUTPUTS = [
  'output/kardashev-telemetry.json',
  'output/kardashev-stability-ledger.json',
  'output/kardashev-equilibrium-ledger.json',
  'output/kardashev-owner-proof.json',
  'output/kardashev-task-hierarchy.mmd',
  'output/kardashev-mermaid.mmd',
  'output/kardashev-dyson.mmd',
];

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

async function detectMissingOutputs() {
  const missing = [];
  for (const relativePath of REQUIRED_OUTPUTS) {
    const absolutePath = path.join(DEMO_ROOT, relativePath);
    try {
      await fs.access(absolutePath);
    } catch (error) {
      missing.push(relativePath);
    }
  }
  return missing;
}

async function startServer() {
  const { port, help } = parseArgs(process.argv.slice(2));
  if (help) {
    renderHelp();
    return;
  }

  const missingOutputs = await detectMissingOutputs();

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing request URL');
      return;
    }

    if (req.url === '/status.json') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify(
          {
            ok: missingOutputs.length === 0,
            demoRoot: pathToFileURL(DEMO_ROOT).toString(),
            missingOutputs,
            hint:
              missingOutputs.length === 0
                ? 'All telemetry artefacts present.'
                : 'Run npm run demo:kardashev to regenerate missing artefacts.',
          },
          null,
          2
        )
      );
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
    if (missingOutputs.length > 0) {
      console.warn('⚠️  Telemetry artefacts are missing:');
      missingOutputs.forEach((file) => console.warn(`   - ${file}`));
      console.warn('   Run npm run demo:kardashev to regenerate the artefacts.');
      console.warn(`   Health check: http://localhost:${port}/status.json`);
    }
  });
}

startServer().catch((error) => {
  console.error('Failed to start dashboard server:', error);
  process.exit(1);
});
