#!/usr/bin/env ts-node

import { createServer, Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const UI_ROOT = resolve(__dirname, '../../demo/agi-labor-market-grand-demo/ui');
const EXPORT_DEFAULT = resolve(UI_ROOT, 'export/latest.json');
const PORT = Number(process.env.PORT ?? 4173);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

let isRunningSimulation = false;
let server: Server | undefined;

function spawnHardhat(): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const args = [
      'hardhat',
      'run',
      '--no-compile',
      '--network',
      'hardhat',
      'scripts/v2/agiLaborMarketGrandDemo.ts',
    ];

    const child = spawn('npx', args, {
      cwd: resolve(__dirname, '..', '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        AGI_JOBS_DEMO_EXPORT: EXPORT_DEFAULT,
      },
    });

    child.on('close', (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`Hardhat demo terminated via signal ${signal}`));
        return;
      }
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`Hardhat demo exited with code ${code ?? 'unknown'}`));
      }
    });

    child.on('error', (error) => {
      rejectPromise(error);
    });
  });
}

async function ensureExportExists(): Promise<void> {
  if (!existsSync(EXPORT_DEFAULT)) {
    throw new Error(
      `Expected transcript export at ${EXPORT_DEFAULT} was not created. Check Hardhat output for errors.`
    );
  }
  await stat(EXPORT_DEFAULT);
}

async function runSimulation(): Promise<void> {
  if (isRunningSimulation) {
    console.log('⚙️  A simulation run is already in progress. Please wait for it to finish.');
    return;
  }

  isRunningSimulation = true;
  const start = Date.now();
  console.log('\n🚀 Launching AGI Jobs v2 sovereign labour market grand demo...');
  try {
    await spawnHardhat();
    await ensureExportExists();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ Demo transcript refreshed in ${elapsed}s → ${EXPORT_DEFAULT}`);
  } catch (error) {
    console.error('❌ Failed to execute the grand demo:', error);
    throw error;
  } finally {
    isRunningSimulation = false;
  }
}

async function readFileSafe(pathname: string): Promise<Buffer> {
  return await readFile(pathname);
}

async function serveStaticFile(requestPath: string) {
  let normalized = requestPath.split('?')[0] ?? '/';
  if (normalized.endsWith('/')) {
    normalized += 'index.html';
  }
  const resolvedPath = resolve(UI_ROOT, '.' + normalized);
  if (!resolvedPath.startsWith(UI_ROOT)) {
    throw new Error('Forbidden');
  }
  try {
    const content = await readFileSafe(resolvedPath);
    return { content, type: MIME_TYPES[extname(resolvedPath)] ?? 'application/octet-stream' };
  } catch (error) {
    if (normalized !== '/index.html') {
      const fallback = await readFileSafe(resolve(UI_ROOT, 'index.html'));
      return { content: fallback, type: MIME_TYPES['.html'] };
    }
    throw error;
  }
}

async function startServer(): Promise<void> {
  if (server) {
    return;
  }

  server = createServer(async (req, res) => {
    try {
      const { content, type } = await serveStaticFile(req.url ?? '/');
      res.statusCode = 200;
      res.setHeader('Content-Type', type);
      res.end(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.statusCode = message === 'Forbidden' ? 403 : 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(message);
    }
  });

  await new Promise<void>((resolvePromise) => {
    server?.listen(PORT, '127.0.0.1', () => {
      resolvePromise();
    });
  });

  console.log('\n🌐 Control room ready:');
  console.log(`   URL: http://127.0.0.1:${PORT}`);
  console.log('   Data source:', EXPORT_DEFAULT);
  console.log('\n💡 Commands:');
  console.log('   • Press Enter (or type "run") to replay the entire sovereign market scenario.');
  console.log('   • Type "q" or "quit" then Enter to exit.');
}

function attachCommandInterface(): void {
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  process.stdin.on('data', async (chunk) => {
    const input = chunk.trim().toLowerCase();
    if (input === 'q' || input === 'quit' || input === 'exit') {
      console.log('\n👋 Shutting down control room.');
      await shutdown();
      process.exit(0);
      return;
    }
    try {
      await runSimulation();
    } catch (error) {
      console.error('Replay failed. Check logs above and resolve the issue before retrying.');
    }
  });
}

async function shutdown(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolvePromise) => {
    server?.close(() => resolvePromise());
  });
  server = undefined;
}

process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully…');
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully…');
  await shutdown();
  process.exit(0);
});

async function main(): Promise<void> {
  await runSimulation();
  await startServer();
  attachCommandInterface();
}

void main().catch(async (error) => {
  console.error(error);
  await shutdown();
  process.exit(1);
});
