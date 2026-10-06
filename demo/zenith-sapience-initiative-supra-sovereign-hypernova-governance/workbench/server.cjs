const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assets = new Map(
  [
    'index.html',
    'styles.css',
    'app.mjs',
    'core.mjs',
    'review.mjs',
    'architecture.svg',
  ].map((name) => [name, path.join(__dirname, name)])
);
assets.set('project-plan.json', path.join(__dirname, '../project-plan.json'));
assets.set(
  'legacy-project-plan.json',
  path.join(__dirname, '../fixtures/legacy-project-plan.json')
);
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
exports.createServer = () =>
  http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    let name;
    try {
      name =
        decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(
          1
        ) || 'index.html';
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (!assets.has(name)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type':
        (types[path.extname(name)] || 'text/plain') + '; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(assets.get(name))
      .on('error', () => res.destroy())
      .pipe(res);
  });
if (require.main === module) {
  const port = Number(process.env.PORT || 4178);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid PORT.');
  exports
    .createServer()
    .listen(port, '127.0.0.1', () =>
      console.log(`Hypernova workbench: http://127.0.0.1:${port}`)
    );
}
