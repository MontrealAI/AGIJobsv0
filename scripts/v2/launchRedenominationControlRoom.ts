#!/usr/bin/env ts-node

import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

const ROOT = resolve(__dirname, '..', '..');
const UI_ROOT = resolve(ROOT, 'demo/REDENOMINATION/ui');
const EXPORT_PATH = resolve(UI_ROOT, 'export/latest.json');
const PORT = Number(process.env.PORT ?? 4174);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

let server: Server | undefined;
let generatorProcess: ChildProcess | undefined;
let generatorPromise: Promise<void> | undefined;
let isRunning = false;

function spawnGenerator(): Promise<void> {
  if (generatorProcess) {
    throw new Error('A playbook generation is already running.');
  }
  const args = [
    'ts-node',
    'scripts/v2/redenominationPlaybook.ts',
    '--out',
    EXPORT_PATH,
  ];
  const child = spawn('npx', args, {
    cwd: ROOT,
    stdio: 'inherit',
  });
  generatorProcess = child;
  return new Promise<void>((resolvePromise, rejectPromise) => {
    child.on('error', (error) => {
      generatorProcess = undefined;
      generatorPromise = undefined;
      rejectPromise(error);
    });
    child.on('close', (code, signal) => {
      generatorProcess = undefined;
      generatorPromise = undefined;
      if (signal) {
        rejectPromise(new Error(`Generator terminated via signal ${signal}`));
        return;
      }
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`Generator exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

async function ensurePlaybook(): Promise<void> {
  if (!existsSync(EXPORT_PATH)) {
    throw new Error(`Playbook not found at ${EXPORT_PATH}. Run the generator first.`);
  }
}

async function runWorkflow(): Promise<void> {
  if (isRunning) {
    console.log('⏳ Redenomination playbook is already refreshing.');
    return;
  }
  isRunning = true;
  console.log('\n🚀 Generating redenomination playbook…');
  try {
    generatorPromise = spawnGenerator();
    await generatorPromise;
    await ensurePlaybook();
    console.log(`✅ Playbook ready → ${EXPORT_PATH}`);
  } catch (error) {
    console.error('❌ Failed to refresh playbook:', error);
  } finally {
    isRunning = false;
  }
}

async function serveStatic(pathname: string) {
  let requestPath = pathname.split('?')[0] ?? '/';
  if (requestPath.endsWith('/')) {
    requestPath += 'index.html';
  }
  const resolved = resolve(UI_ROOT, `.${requestPath}`);
  if (!resolved.startsWith(UI_ROOT)) {
    throw new Error('Forbidden');
  }
  try {
    const content = await readFile(resolved);
    return {
      content,
      type: MIME_TYPES[extname(resolved)] ?? 'application/octet-stream',
    };
  } catch (error) {
    if (requestPath !== '/index.html') {
      const fallback = await readFile(resolve(UI_ROOT, 'index.html'));
      return { content: fallback, type: MIME_TYPES['.html'] };
    }
    throw error;
  }
}

async function startServer(): Promise<void> {
  if (server) return;
  server = createServer(async (req, res) => {
    try {
      const { content, type } = await serveStatic(req.url ?? '/');
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
    server?.listen(PORT, '127.0.0.1', () => resolvePromise());
  });
  console.log('\n🌐 Redenomination control room ready:');
  console.log(`   URL: http://127.0.0.1:${PORT}`);
  console.log(`   Playbook: ${EXPORT_PATH}`);
  console.log('\n💡 Commands:');
  console.log('   • Press Enter to regenerate the playbook.');
  console.log('   • Type "q" then Enter to exit.');
}

function attachCli(): void {
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  process.stdin.on('data', async (chunk) => {
    const value = chunk.trim().toLowerCase();
    if (value === 'q' || value === 'quit' || value === 'exit') {
      console.log('\n👋 Exiting control room.');
      await shutdown();
      process.exit(0);
      return;
    }
    try {
      await runWorkflow();
    } catch (error) {
      console.error('Replay failed:', error);
    }
  });
}

async function shutdown(): Promise<void> {
  if (generatorProcess && !generatorProcess.killed) {
    generatorProcess.kill('SIGINT');
    await generatorPromise?.catch(() => undefined);
  }
  if (!server) return;
  await new Promise<void>((resolvePromise) => {
    server?.close(() => resolvePromise());
  });
  server = undefined;
}

(async () => {
  await runWorkflow();
  await startServer();
  attachCli();
})();
