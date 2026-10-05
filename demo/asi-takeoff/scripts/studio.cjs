'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { ROOT, loadScenario } = require('./plan.cjs');
const FILES = {
  '/': ['ui/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['ui/app.js', 'application/javascript; charset=utf-8'],
  '/styles.css': ['ui/styles.css', 'text/css; charset=utf-8'],
  '/architecture.svg': ['ui/architecture.svg', 'image/svg+xml'],
  '/project-plan.json': ['project-plan.json', 'application/json'],
  '/project-plan.planetary.json': [
    'project-plan.planetary.json',
    'application/json',
  ],
  '/computer-work/task.json': ['computer-work/task.json', 'application/json'],
  '/computer-work/analysis.example.json': [
    'computer-work/analysis.example.json',
    'application/json',
  ],
  '/computer-work/dossier.example.md': [
    'computer-work/dossier.example.md',
    'text/plain; charset=utf-8',
  ],
};
function createStudio(root = ROOT) {
  const server = http.createServer(async (req, res) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const host = req.headers.host || '',
      port = server.address().port;
    let status = 200,
      type = 'text/plain; charset=utf-8',
      body;
    try {
      if (
        ![
          `127.0.0.1:${port}`,
          `localhost:${port}`,
          ...(port === 80 ? ['127.0.0.1', 'localhost'] : []),
        ].includes(host) ||
        (req.headers.origin !== undefined &&
          req.headers.origin !== `http://${host}`) ||
        req.headers['sec-fetch-site'] === 'cross-site'
      )
        throw Object.assign(new Error('Local same-origin access required'), {
          status: 403,
        });
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        throw Object.assign(new Error('Method not allowed'), { status: 405 });
      }
      // Resolve only exact observed routes; encoded paths and traversal never reach the filesystem.
      const url = new URL(req.url, `http://${host}`);
      if (req.url.split('?')[0] !== url.pathname || /[%\\]/.test(url.pathname))
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      if (url.pathname === '/api/plan') {
        if (
          [...url.searchParams.keys()].some((k) => k !== 'scenario') ||
          url.searchParams.getAll('scenario').length > 1
        )
          throw Object.assign(new Error('Invalid query'), { status: 400 });
        try {
          body = Buffer.from(
            JSON.stringify(
              loadScenario(url.searchParams.get('scenario') || 'national')
            )
          );
        } catch (error) {
          throw Object.assign(error, { status: 400 });
        }
        type = 'application/json; charset=utf-8';
      } else {
        const file = Object.hasOwn(FILES, url.pathname) && FILES[url.pathname];
        if (!file) throw Object.assign(new Error('Not found'), { status: 404 });
        const base = await fs.realpath(root),
          target = await fs.realpath(path.join(base, file[0]));
        if (!target.startsWith(base + path.sep))
          throw Object.assign(new Error('Forbidden'), { status: 403 });
        const stat = await fs.stat(target);
        if (!stat.isFile() || stat.size > 1024 * 1024)
          throw Object.assign(new Error('Not found'), { status: 404 });
        body = await fs.readFile(target);
        type = file[1];
        if (
          url.pathname.startsWith('/computer-work/') ||
          url.pathname.startsWith('/project-plan')
        )
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${path.basename(file[0])}"`
          );
      }
    } catch (error) {
      status = error.status || (error.code === 'ENOENT' ? 404 : 500);
      body = Buffer.from(
        status === 500 ? 'Unable to read demo asset' : error.message
      );
    }
    res.writeHead(status, {
      'Content-Type': type,
      'Content-Length': body.length,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  return server;
}
async function main() {
  const port = Number(process.env.PORT ?? 4176);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('PORT must be an integer from 0 to 65535');
  loadScenario('national');
  loadScenario('planetary');
  const server = createStudio();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  console.log(
    `ASI Takeoff Studio: http://127.0.0.1:${
      server.address().port
    }/\nPlanning only; no provider or chain connection. Ctrl+C stops.`
  );
  const stop = () => {
    server.close();
    server.closeAllConnections();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
module.exports = { createStudio, main };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
