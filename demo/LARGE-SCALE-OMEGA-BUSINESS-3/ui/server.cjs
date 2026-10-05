'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { run, parseArgs } = require('../lib/mission.cjs');
const { verifyReport } = require('../lib/verify.cjs');
const { sha256 } = require('../lib/scenario.cjs');
function parse(argv, env = process.env) {
  const result = {
    port: env.OMEGA_UI_PORT || '4186',
    report: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') result.help = true;
    else if (['--port', '--report'].includes(argv[i]) && argv[i + 1])
      result[argv[i].slice(2)] = argv[++i];
    else throw new Error(`Unknown or incomplete dashboard option ${argv[i]}`);
  }
  if (
    !/^[1-9][0-9]{0,4}$/.test(String(result.port)) ||
    Number(result.port) > 65535
  )
    throw new Error('Port must be 1–65535');
  result.port = Number(result.port);
  return result;
}
function createServer(directory, port) {
  const verified = verifyReport(directory),
    reportBytes = fs.readFileSync(path.join(directory, 'report.json'));
  const manifest = new Map(verified.report.artifacts.map((a) => [a.path, a]));
  const staticFiles = new Map([
    ['/', ['index.html', 'text/html']],
    ['/app.js', ['app.js', 'text/javascript']],
    ['/style.css', ['style.css', 'text/css']],
  ]);
  return http.createServer((req, res) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const respond = (status, body, type = 'text/plain') => {
      res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (
      req.headers.host !== new URL(`http://127.0.0.1:${port}`).host ||
      (req.headers.origin &&
        req.headers.origin !== new URL(`http://127.0.0.1:${port}`).origin)
    )
      return respond(403, 'Use the printed loopback URL');
    if (!['GET', 'HEAD'].includes(req.method))
      return respond(405, 'Read-only dashboard');
    if (
      !req.url ||
      req.url.includes('%') ||
      req.url.includes('?') ||
      req.url.includes('..')
    )
      return respond(404, 'Not found');
    try {
      if (req.url === '/api/report')
        return respond(200, reportBytes, 'application/json');
      if (staticFiles.has(req.url)) {
        const [name, type] = staticFiles.get(req.url);
        return respond(200, fs.readFileSync(path.join(__dirname, name)), type);
      }
      if (req.url === '/download/report.json') {
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="report.json"'
        );
        return respond(200, reportBytes, 'application/json');
      }
      if (req.url.startsWith('/download/')) {
        const name = req.url.slice('/download/'.length),
          entry = manifest.get(name);
        if (!entry) return respond(404, 'Not a report artifact');
        const bytes = verified.read(name);
        if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256)
          return respond(409, 'Artifact changed; stop and verify the report');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${name.replaceAll('/', '-')}"`
        );
        return respond(
          200,
          bytes,
          name.endsWith('.json') ? 'application/json' : 'text/plain'
        );
      }
      return respond(404, 'Not found');
    } catch {
      return respond(409, 'Evidence unavailable; stop and verify the report');
    }
  });
}
async function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (options.help) {
    console.log(
      'Omega local dashboard: --port 4186 --report <existing run directory>\nDefault creates a fresh offline rehearsal. Use --stack for the separate configured application stack.'
    );
    return;
  }
  const origin = `http://127.0.0.1:${options.port}`;
  const directory =
    options.report || (await run(parseArgs(['--origin', origin]))).out;
  const server = createServer(directory, options.port);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', resolve);
  });
  console.log(
    `Omega dashboard: ${origin}\nEvidence: ${directory}\nRead-only synthetic rehearsal. Ctrl+C stops the server.`
  );
  const stop = () => {
    server.close();
    server.closeAllConnections();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  server.once('close', () => {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  });
}
module.exports = { parse, createServer, main };
if (require.main === module)
  main().catch((error) => {
    console.error(`Dashboard failed: ${error.message}`);
    process.exitCode = 1;
  });
