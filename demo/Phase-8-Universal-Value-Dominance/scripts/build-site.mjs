import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');
export async function buildSite(destination) {
  const output = path.resolve(destination);
  fs.mkdirSync(output, { recursive: true });
  for (const name of [
    'index.html',
    'ui',
    'assets',
    'config',
    'configs',
    'workbench',
  ])
    fs.cpSync(path.join(root, name), path.join(output, name), {
      recursive: true,
      filter: (source) =>
        !source.includes(`${path.sep}tests`) &&
        !source.endsWith('.py') &&
        !source.endsWith('cli.mjs'),
    });
  execFileSync(
    process.execPath,
    [
      path.join(repo, 'node_modules/ts-node/dist/bin.js'),
      '--compiler-options',
      '{"module":"commonjs"}',
      path.join(root, 'scripts/run-phase8-demo.ts'),
    ],
    {
      cwd: repo,
      stdio: 'pipe',
      env: {
        ...process.env,
        PHASE8_OUTPUT_DIR: path.join(output, 'output'),
        PHASE8_CHAIN_ID: '31337',
      },
    }
  );
  return {
    route: 'experiments/phase8/workbench/',
    archiveRoutes: ['experiments/phase8/', 'experiments/phase8/ui/'],
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await buildSite(process.argv[2] || path.join(repo, 'build/phase8'));
