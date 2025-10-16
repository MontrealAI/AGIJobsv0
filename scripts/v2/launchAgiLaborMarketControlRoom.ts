#!/usr/bin/env ts-node

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, normalize, resolve } from 'node:path';

import { runAgiLaborMarketDemo } from './lib/agiLaborMarketExport';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function safeJoin(base: string, target: string): string {
  const resolvedPath = resolve(base, target);
  if (!resolvedPath.startsWith(base)) {
    throw new Error('Attempted directory traversal');
  }
  return resolvedPath;
}

async function serveStatic(root: string, port: number): Promise<void> {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = req.url ? normalize(req.url.split('?')[0]) : '/';
      const sanitized = urlPath.replace(/\\\\/g, '/');
      let relative = sanitized;
      if (relative === '/' || relative === '') {
        relative = 'index.html';
      } else if (relative.startsWith('/')) {
        relative = relative.slice(1);
      }
      const filePath = safeJoin(root, relative);
      const fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        return void serveIndex(res, root);
      }
      const ext = extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      createReadStream(filePath).pipe(res);
    } catch (error) {
      serveNotFound(res, error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.on('error', rejectPromise);
    server.listen(port, () => {
      resolvePromise();
    });
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`\n🌐 Sovereign labour market control room ready at http://localhost:${port}`);
  console.log('   Press Ctrl+C to stop the server.');
}

function serveIndex(res: import('http').ServerResponse, root: string): void {
  const indexPath = resolve(root, 'index.html');
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES['.html'],
    'Cache-Control': 'no-store',
  });
  createReadStream(indexPath).pipe(res);
}

function serveNotFound(res: import('http').ServerResponse, detail: string): void {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Resource not found. ${detail}`);
}

async function main(): Promise<void> {
  const uiRoot = resolve('demo/agi-labor-market-grand-demo/ui');
  const exportPath = resolve(uiRoot, 'export/latest.json');
  const payload = await runAgiLaborMarketDemo(exportPath, { silent: false });
  console.log(
    `\n🚀 Transcript generated with ${payload.scenarios.length} scenarios and ${payload.market.mintedCertificates.length} credential NFTs.`
  );
  console.log('   Launching immersive control room for non-technical operators...');
  const port = Number(process.env.PORT ?? 4173);
  await serveStatic(uiRoot, port);
}

main().catch((error) => {
  console.error('❌ Unable to launch control room:', error);
  process.exit(1);
});
