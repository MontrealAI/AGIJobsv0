#!/usr/bin/env node
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseOptions, resolveOptions } = require('./runtime.cjs');
const DEMO_ROOT = path.resolve(__dirname, '..');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mmd': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const inside = (root, target) =>
  target === root || target.startsWith(root + path.sep);

async function resolvePath(root, requestUrl) {
  try {
    const parsed = new URL(requestUrl, 'http://127.0.0.1');
    const decoded = decodeURIComponent(parsed.pathname);
    if (
      decoded.includes('\\') ||
      decoded.includes('\0') ||
      decoded.split('/').some((part) => part.startsWith('.'))
    )
      return null;
    let target = path.resolve(root, '.' + decoded);
    if (!inside(root, target)) return null;
    target = await fs.realpath(target);
    if (!inside(root, target)) return null;
    if ((await fs.stat(target)).isDirectory())
      target = await fs.realpath(path.join(target, 'index.html'));
    return inside(root, target) ? target : null;
  } catch {
    return null;
  }
}

async function createServer(directory) {
  const root = await fs.realpath(directory);
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method not allowed');
      return;
    }
    const target = await resolvePath(root, req.url || '/');
    if (!target) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    try {
      const bytes = await fs.readFile(target);
      res.writeHead(200, {
        'Content-Type':
          MIME_TYPES[path.extname(target)] || 'application/octet-stream',
        'Content-Length': bytes.length,
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
}

async function startServer(argv = process.argv.slice(2)) {
  const parsed = parseOptions(argv, ['port']);
  if (parsed.help) {
    console.log(
      'Serve a read-only simulation on 127.0.0.1.\nOptions: --port 4175, --profile stellar-civilization-lattice|k2-stellar-demo,\n         --output-dir DIR, --config-root DIR --generate, --help\n--generate explicitly regenerates the selected profile. Errors never fall back to a different model.'
    );
    return;
  }
  for (const key of ['check', 'ci', 'reflect'])
    if (parsed[key])
      throw new Error(`--${key} belongs to the orchestrator, not the server`);
  if (parsed['config-root'] && !parsed.generate)
    throw new Error(
      '--config-root requires --generate, or serve existing results with --output-dir'
    );
  const port = Number(parsed.port ?? process.env.PORT ?? 4175);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Port must be an integer from 1 to 65535');
  const coreArgs = Object.entries(parsed)
    .filter(([key]) => !['port', 'generate'].includes(key))
    .flatMap(([key, value]) => [`--${key}`, value]);
  const options = resolveOptions(DEMO_ROOT, coreArgs);
  const stellar = path.basename(options.root) === 'k2-stellar-demo';
  const prefix = stellar ? 'stellar' : options.prefix;
  if (parsed.generate) {
    const orchestrator = stellar
      ? path.join(options.root, 'scripts/orchestrate.ts')
      : path.join(__dirname, 'run-kardashev-demo.ts');
    const args = [
      require.resolve('ts-node/dist/bin.js'),
      '--compiler-options',
      '{"module":"commonjs"}',
      orchestrator,
      '--config-root',
      options.configRoot,
      '--output-dir',
      options.outputDir,
    ];
    if (!stellar && parsed.profile) args.push('--profile', parsed.profile);
    const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
    if (result.status !== 0)
      throw new Error(
        'Selected simulation failed. Review its errors; the server was not started.'
      );
  }
  const output =
    parsed['output-dir'] || parsed.generate
      ? options.outputDir
      : path.join(options.root, 'output');
  for (const file of [
    `${prefix}-telemetry.json`,
    `${prefix}-stability-ledger.json`,
    `${prefix}-run-manifest.json`,
  ]) {
    try {
      await fs.access(path.join(output, file));
    } catch {
      throw new Error(
        `Missing ${file}. Run the selected orchestration command or add --generate.`
      );
    }
  }
  const serveRoot =
    parsed['output-dir'] || parsed.generate ? output : options.root;
  const server = await createServer(serveRoot);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  console.log(`Kardashev II simulation dashboard: http://127.0.0.1:${port}/`);
  console.log(
    'Read-only local snapshot. Press Ctrl+C to stop. No provider calls, signatures or transactions.'
  );
  return server;
}

if (require.main === module)
  startServer().catch((error) => {
    console.error(`Dashboard could not start: ${error.message}`);
    process.exitCode = 1;
  });
module.exports = { createServer, resolvePath, startServer };
