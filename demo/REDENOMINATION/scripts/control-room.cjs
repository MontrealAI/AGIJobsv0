'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const planner = require('./playbook.cjs');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
};
const WORK_DOWNLOADS = new Set([
  '/computer-work/task.json',
  '/computer-work/ledger.json',
  '/computer-work/conversion.example.json',
  '/computer-work/dossier.example.md',
]);
async function resource(root, url) {
  let request;
  try {
    request = decodeURIComponent((url || '/').split('?')[0]);
  } catch {
    throw Object.assign(new Error('Invalid path'), { status: 400 });
  }
  if (
    !request.startsWith('/') ||
    /[\\\0%]/.test(request) ||
    request.split('/').includes('..')
  )
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  if (request.endsWith('/')) request += 'index.html';
  if (
    (!/^\/(?:index\.html|scenario\.json|(?:ui|config|i18n)\/[^?]+)$/.test(
      request
    ) &&
      !WORK_DOWNLOADS.has(request)) ||
    !MIME[path.extname(request)] ||
    (path.extname(request) === '.md' && !WORK_DOWNLOADS.has(request))
  )
    throw Object.assign(new Error('Not found'), { status: 404 });
  const base = await fs.realpath(root);
  const target = await fs.realpath(path.resolve(base, `.${request}`));
  const relative = path.relative(base, target);
  if (
    relative === '..' ||
    relative.startsWith('..' + path.sep) ||
    path.isAbsolute(relative)
  )
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  const stat = await fs.stat(target);
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024)
    throw Object.assign(new Error('Not found'), { status: 404 });
  return {
    content: await fs.readFile(target),
    type: MIME[path.extname(target)],
    download: WORK_DOWNLOADS.has(request) ? path.basename(request) : undefined,
  };
}
function createControlRoom(root = planner.DEMO) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    );
    const port = server.address().port;
    const host = (req.headers.host || '').toLowerCase();
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (port === 80) allowedHosts.push('127.0.0.1', 'localhost');
    if (
      !allowedHosts.includes(host) ||
      (req.headers.origin !== undefined &&
        req.headers.origin !== `http://${host}`) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(
        req.method === 'HEAD' ? undefined : 'Local same-origin access required'
      );
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method not allowed');
      return;
    }
    try {
      const file = await resource(root, req.url);
      if (file.download)
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${file.download}"`
        );
      res.writeHead(200, {
        'Content-Type': file.type,
        'Content-Length': file.content.length,
      });
      res.end(req.method === 'HEAD' ? undefined : file.content);
    } catch (error) {
      const status =
        error.status ||
        (['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500);
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(
        req.method === 'HEAD'
          ? undefined
          : status === 500
          ? 'Unable to read demo asset'
          : status === 403
          ? 'Forbidden'
          : 'Not found'
      );
    }
  });
  return server;
}
async function main() {
  const port = Number(process.env.PORT ?? 4174);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('PORT must be an integer from 0 to 65535');
  if (planner.main() !== 0)
    throw new Error('Generation failed; server not started with stale output');
  const server = createControlRoom();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const actual = server.address().port;
  console.log(
    `Storyboard: http://127.0.0.1:${actual}/\nControl room: http://127.0.0.1:${actual}/ui/\nRead-only local server. Browser Refresh reloads the saved plan; Enter here regenerates it. Ctrl+C stops.`
  );
  const stop = () => {
    server.close();
    server.closeAllConnections();
    process.stdin.pause();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  if (process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      if (['q', 'quit', 'exit'].includes(chunk.trim().toLowerCase())) stop();
      else if (planner.main() !== 0)
        console.error('Refresh failed; previously saved plan is retained.');
    });
  }
  return server;
}
module.exports = { resource, createControlRoom, main };
if (require.main === module)
  main().catch((error) => {
    console.error(`Control room failed: ${error.message}`);
    process.exitCode = 1;
  });
