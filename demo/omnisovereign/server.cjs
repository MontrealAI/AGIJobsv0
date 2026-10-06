'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assetNames = [
  'index.html',
  'styles.css',
  'app.mjs',
  'model.mjs',
  'execute.mjs',
  'review.mjs',
  'scenario.json',
  'project-plan.omnisovereign.json',
  'architecture.svg',
];
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
function createServer() {
  return http.createServer((req, res) => {
    const port = req.socket.localPort;
    const allowedHosts = ['127.0.0.1:' + port, 'localhost:' + port];
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    );
    const origin = req.headers.origin;
    if (
      !allowedHosts.includes(req.headers.host) ||
      req.headers['sec-fetch-site'] === 'cross-site' ||
      (origin && !allowedHosts.map((host) => 'http://' + host).includes(origin))
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
    const name = req.url === '/' ? 'index.html' : req.url?.slice(1);
    if (!assetNames.includes(name)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.setHeader(
      'Content-Type',
      types[path.extname(name)] + '; charset=utf-8'
    );
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(path.join(__dirname, name));
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end('Asset unavailable');
    });
    stream.pipe(res);
  });
}
module.exports = { createServer, assetNames };
if (require.main === module) {
  const port = Number(process.env.PORT || 4190);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer from 1 to 65535.');
  const server = createServer();
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(
      'OmniSovereign: http://127.0.0.1:' +
        port +
        '/\nOffline rehearsal; Ctrl+C to stop.'
    )
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      server.closeAllConnections();
      server.close();
    });
}
