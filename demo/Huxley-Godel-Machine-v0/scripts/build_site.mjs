import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');
export async function buildSite(destination) {
  const output = path.resolve(destination);
  fs.mkdirSync(output, { recursive: true });
  for (const file of ['index.html', 'styles.css', 'model.mjs'])
    fs.copyFileSync(path.join(root, 'web', file), path.join(output, file));
  const records = path.join(output, 'records');
  fs.mkdirSync(records, { recursive: true });
  for (const [name, overrides] of [
    ['reference', []],
    ['constrained', ['--set', 'economics.max_budget=100']],
    ['paused', ['--set', 'owner_controls.pause_all=true']],
  ]) {
    const generated = path.join(output, 'reproduction', name);
    execFileSync(
      process.env.PYTHON_BIN || 'python3',
      [
        path.join(root, 'run_demo.py'),
        '--seed',
        '7',
        '--output-dir',
        generated,
        '--ui-artifact',
        path.join(records, name + '.json'),
        ...overrides,
      ],
      { cwd: repo, stdio: 'pipe' }
    );
  }
  await build({
    entryPoints: [path.join(root, 'web/viewer.js')],
    outfile: path.join(output, 'viewer.js'),
    bundle: true,
    format: 'esm',
    minify: true,
    logLevel: 'warning',
  });
  const legacy = path.join(output, 'legacy');
  fs.mkdirSync(legacy, { recursive: true });
  for (const file of ['index.html', 'styles.css', 'bootstrap.min.css'])
    fs.copyFileSync(path.join(root, 'ui', file), path.join(legacy, file));
  await build({
    entryPoints: [path.join(root, 'ui/script.js')],
    outfile: path.join(legacy, 'script.js'),
    bundle: true,
    format: 'esm',
    minify: true,
    logLevel: 'warning',
  });
  fs.writeFileSync(
    path.join(output, 'build.json'),
    JSON.stringify({
      schemaVersion: 1,
      evidenceClass: 'seeded-simulation',
      providerCalls: 0,
      chainTransactions: 0,
      productionApproved: false,
      settlementApproved: false,
    })
  );
  return {
    route: 'experiments/huxley-godel/',
    legacyRoute: 'experiments/huxley-godel/legacy/',
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildSite(process.argv[2] || path.join(repo, 'build/hgm'));
  console.log(
    'Built HGM console. Serve build/hgm on loopback or publish through the Pages workflow.'
  );
}
