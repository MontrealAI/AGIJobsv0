const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

function formatHostForUrl(host) {
  const value = String(host || '127.0.0.1').trim();
  return value.includes(':') && !value.startsWith('[') ? `[${value}]` : value;
}

function buildOrigin(host, port) {
  return `http://${formatHostForUrl(host)}${Number.isFinite(port) ? `:${port}` : ''}`;
}

function createDemoUrl(config) {
  const host = ['0.0.0.0', '::'].includes(config.uiHost) ? '127.0.0.1' : config.uiHost;
  const url = new URL(buildOrigin(host, config.uiPort));
  url.searchParams.set('orchestrator', config.publicOrchestratorUrl || 'demo');
  url.searchParams.set('oneboxPrefix', config.prefix ?? '/onebox');
  url.searchParams.set('mode', config.defaultMode || 'guest');
  if (config.welcomeMessage) url.searchParams.set('welcome', config.welcomeMessage);
  if (config.shortcutExamples?.length) url.searchParams.set('examples', JSON.stringify(config.shortcutExamples));
  // A launch link is public metadata. Bearer credentials must never enter URLs.
  return url.href;
}

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function startStaticServer(distDir, config) {
  const root = fs.realpathSync(distDir);
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('UI build missing. Run npm run onebox:static:build.');
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    const finish = (status, message) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(req.method === 'HEAD' ? undefined : message); };
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return finish(405, 'Method not allowed'); }
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return finish(400, 'Malformed URL'); }
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) return finish(403, 'Forbidden');
      if (pathname === '/' && !url.searchParams.has('orchestrator')) {
        res.writeHead(302, { Location: `/${new URL(createDemoUrl({ ...config, uiPort: server.address().port })).search}` });
        return res.end();
      }
      let target = path.resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
      if (!inside(root, target)) return finish(403, 'Forbidden');
      if (!fs.existsSync(target)) {
        if (path.extname(pathname)) return finish(404, 'Asset not found');
        target = path.join(root, 'index.html');
      }
      const realTarget = fs.realpathSync(target);
      if (!inside(root, realTarget)) return finish(403, 'Forbidden');
      if (!fs.statSync(realTarget).isFile()) return finish(404, 'Not found');
      const ext = path.extname(realTarget).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      if (ext === '.html') {
        let html = fs.readFileSync(realTarget, 'utf8');
        if (config.demoMode || !config.publicOrchestratorUrl) {
          html = html.replace(/connect-src [^;]+;/, "connect-src 'none';");
          html = html.replace('</head>', '<meta name="onebox-demo" content="true"></head>');
        } else {
          const endpoint = new URL(config.publicOrchestratorUrl);
          if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Invalid orchestrator URL');
          html = html.replace(/connect-src ([^;]+);/, (_, origins) => `connect-src ${origins} ${endpoint.origin};`);
        }
        return res.end(req.method === 'HEAD' ? undefined : html);
      }
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(realTarget);
      stream.on('error', () => { if (!res.headersSent) finish(500, 'Unable to read asset'); else res.destroy(); });
      stream.pipe(res);
    } catch {
      if (!res.headersSent) finish(500, 'Unable to serve the requested file'); else res.destroy();
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.uiPort, config.uiHost, () => { server.removeListener('error', reject); resolve(server); });
  });
}

module.exports = { formatHostForUrl, buildOrigin, createDemoUrl, startStaticServer };
