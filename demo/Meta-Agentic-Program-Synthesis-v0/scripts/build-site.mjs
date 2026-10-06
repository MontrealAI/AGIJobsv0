import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');
export async function buildSite(destination) {
  const output = path.resolve(destination);
  fs.mkdirSync(output, { recursive: true });
  for (const name of [
    'index.html',
    'styles.css',
    'app.mjs',
    'model.mjs',
    'cases.json',
  ])
    fs.copyFileSync(
      path.join(root, 'workbench', name),
      path.join(output, name)
    );
  const python = process.env.PYTHON_BIN || 'python3';
  execFileSync(
    python,
    [
      path.join(root, 'start_demo.py'),
      'all',
      '--output',
      path.join(output, 'legacy/python'),
    ],
    { cwd: repo, stdio: 'pipe', timeout: 120000 }
  );
  execFileSync(
    process.execPath,
    [
      path.join(repo, 'node_modules/ts-node/dist/bin.js'),
      '--project',
      path.join(root, 'tsconfig.json'),
      path.join(root, 'scripts/runSynthesis.ts'),
      '--report-dir',
      path.join(output, 'legacy/typescript'),
    ],
    { cwd: repo, stdio: 'pipe', timeout: 120000 }
  );
  const sourceSha256 = createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'workbench/cases.json')))
    .digest('hex');
  fs.writeFileSync(
    path.join(output, 'build.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: repo,
          encoding: 'utf8',
        }).trim(),
        sourceSha256,
        evidenceClass: 'local-synthesis-and-seeded-simulation',
        providerCalls: 0,
        chainTransactions: 0,
        externalIndependentReview: false,
        productionApproved: false,
        settlementApproved: false,
      },
      null,
      2
    ) + '\n'
  );
  return {
    route: 'experiments/program-synthesis/',
    archiveRoutes: [
      'legacy/python/',
      'legacy/python/batch.html',
      ...['alpha', 'atlas', 'sovereign', 'imperium'].map(
        (id) => `legacy/python/${id}/report.html`
      ),
      'legacy/typescript/meta-agentic-program-synthesis-dashboard.html',
    ],
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildSite(
    process.argv[2] || path.join(repo, 'build/program-synthesis')
  );
  console.log(
    'Built Synthesis Foundry and both preserved engines. Serve the output on localhost or through Pages.'
  );
}
