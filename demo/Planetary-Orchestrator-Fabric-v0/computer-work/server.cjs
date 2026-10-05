#!/usr/bin/env node
'use strict';
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
const files = new Map([
  ['/', 'index.html'],
  ...[
    'index.html',
    'style.css',
    'app.mjs',
    'model.mjs',
    'board.json',
    'task.json',
    'guide.html',
  ].map((x) => ['/' + x, x]),
]);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
function createServer() {
  return http.createServer((req, res) => {
    const host = req.headers.host,
      port = res.socket.localPort;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) {
      res.writeHead(403);
      res.end('Loopback host required');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    const file = files.get(req.url);
    if (!file) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Type', types[path.extname(file)]);
    try {
      const content = fs.readFileSync(path.join(__dirname, file));
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
      res.writeHead(500);
      res.end('Asset unavailable');
    }
  });
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (
    args.length &&
    !(args.length === 2 && args[0] === '--port' && /^\d+$/.test(args[1]))
  )
    throw new Error('Usage: server.cjs [--port 18791]');
  const port = args.length ? Number(args[1]) : 18791;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Invalid port');
  const server = createServer();
  server.on('error', (error) => {
    console.error('Workbench could not start:', error.code);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(
      `Planetary workbench: http://127.0.0.1:${
        server.address().port
      }/\nSynthetic planning only. Stop with Ctrl+C.`
    )
  );
  process.on('SIGINT', () => server.close());
  process.on('SIGTERM', () => server.close());
}
module.exports = { createServer };
