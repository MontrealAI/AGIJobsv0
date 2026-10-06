'use strict';
const fs = require('node:fs'),
  http = require('node:http'),
  path = require('node:path'),
  os = require('node:os');
const { readJson } = require('./io.cjs');
const assetNames = [
  'index.html',
  'styles.css',
  'app.mjs',
  'model.mjs',
  'execute.mjs',
  'review.mjs',
  'scenario.json',
  'architecture.svg',
];
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.mmd': 'text/plain',
  '.md': 'text/markdown',
};
function createServer({ directory = __dirname, assets = assetNames } = {}) {
  const allowed = new Set(assets);
  return http.createServer((req, res) => {
    const hosts = [
      '127.0.0.1:' + req.socket.localPort,
      'localhost:' + req.socket.localPort,
    ];
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    );
    if (
      !hosts.includes(req.headers.host) ||
      req.headers['sec-fetch-site'] === 'cross-site' ||
      (req.headers.origin &&
        !hosts.map((h) => 'http://' + h).includes(req.headers.origin))
    ) {
      res.writeHead(403);
      res.end('Local access only');
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    let name;
    try {
      name = decodeURIComponent(
        new URL(req.url, 'http://127.0.0.1').pathname
      ).slice(1);
      if (!name || name.endsWith('/')) name += 'index.html';
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (!allowed.has(name)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.setHeader(
      'Content-Type',
      (types[path.extname(name)] || 'text/plain') + '; charset=utf-8'
    );
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(path.join(directory, name));
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end('Asset unavailable');
    });
    stream.pipe(res);
  });
}
function readRecordArgs(args) {
  if (!args.length) return null;
  if (
    args.length !== 3 ||
    args[0] !== '--record' ||
    !/^v(?:[5-9]|1[01])$/.test(args[1])
  )
    throw new Error(
      'Usage: npm run demo:meta-agentic-alpha:serve -- [--record v5..v11 DASHBOARD_DATA.json]'
    );
  const payload = readJson(path.resolve(args[2]));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Dashboard record must be a JSON object.');
  return { version: Number(args[1].slice(1)), payload };
}
module.exports = { createServer, assetNames, readRecordArgs };
if (require.main === module)
  (async () => {
    const record = readRecordArgs(process.argv.slice(2));
    const port = Number(process.env.PORT || 4191);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('PORT must be an integer from 1 to 65535.');
    const { buildSite } = await import('../scripts/build-site.mjs');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-alpha-viewer-'));
    let server;
    try {
      server = createServer(
        await buildSite(path.join(temp, 'site'), { record })
      );
    } catch (error) {
      fs.rmSync(temp, { recursive: true, force: true });
      throw error;
    }
    const cleanup = () => fs.rmSync(temp, { recursive: true, force: true });
    server.on('close', cleanup);
    server.on('error', (error) => {
      console.error(error.message);
      cleanup();
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () =>
      console.log(
        'Meta-Agentic ALPHA: http://127.0.0.1:' +
          port +
          (record
            ? '/archive/meta_agentic_alpha_v' + record.version + '/ui/'
            : '/') +
          '\nLocal evaluation and preserved dashboards; Ctrl+C to stop.'
      )
    );
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.on(signal, () => {
        server.closeAllConnections();
        server.close();
      });
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
