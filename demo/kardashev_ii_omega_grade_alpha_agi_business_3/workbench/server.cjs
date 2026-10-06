'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ...['app.mjs', 'core.mjs', 'catalog.mjs'].map((name) => [
    '/' + name,
    [name, 'text/javascript'],
  ]),
  ['/styles.css', ['styles.css', 'text/css']],
  ['/architecture.svg', ['architecture.svg', 'image/svg+xml']],
]);
function createServer() {
  return http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    );
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const target = assets.get(req.url);
    if (!target) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.setHeader('Content-Type', target[1] + '; charset=utf-8');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(path.join(__dirname, target[0])).pipe(res);
  });
}
module.exports = { createServer };
if (require.main === module) {
  const port = Number(process.env.PORT || 4188);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer from 1 to 65535');
  const server = createServer();
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(
      `Kardashev Business Workbench: http://127.0.0.1:${port}\nLocal planning only. Ctrl+C to stop.`
    )
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      server.closeAllConnections();
      server.close();
    });
}
