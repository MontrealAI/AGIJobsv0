import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
export const demoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
export const workbenchAssets = [
  'index.html',
  'styles.css',
  'app.mjs',
  'model.mjs',
  'execute.mjs',
  'review.mjs',
  'scenario.json',
  'architecture.svg',
];
export async function buildSite(destination, { record = null } = {}) {
  if (
    record &&
    (!Number.isInteger(record.version) ||
      record.version < 5 ||
      record.version > 11 ||
      !record.payload ||
      typeof record.payload !== 'object' ||
      Array.isArray(record.payload))
  )
    throw new Error(
      'A local record needs a version from 5 to 11 and an object payload.'
    );
  const output = path.resolve(destination),
    assets = [];
  fs.mkdirSync(output, { recursive: true });
  if (fs.readdirSync(output).length)
    throw new Error('Choose an empty site output directory.');
  const write = (name, content) => {
    const target = path.join(output, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    assets.push(name);
  };
  const copy = (name, source) =>
    write(name, fs.readFileSync(path.join(demoRoot, source)));
  for (const asset of workbenchAssets) copy(asset, 'workbench/' + asset);
  const snapshots = JSON.parse(
    fs.readFileSync(path.join(demoRoot, 'legacy/snapshots.json'), 'utf8')
  );
  if (record) snapshots['v' + record.version] = record.payload;
  for (let version = 2; version <= 11; version++) {
    const prefix = `meta_agentic_alpha_v${version}/ui/`;
    for (const asset of ['index.html', 'styles.css', 'dashboard.js'])
      copy('archive/' + prefix + asset, prefix + asset);
    const filename =
      version === 2
        ? '../latest_run_v2.json'
        : version === 3
        ? 'dashboard-data.json'
        : `dashboard-data-v${version}.json`;
    const payload = structuredClone(snapshots['v' + version]);
    if (version === 2) {
      payload.__sourceSummaryPath = 'meta_agentic_alpha_v2/latest_run_v2.json';
      payload.__masterplanPath = 'records/v2.md';
      payload.__dashboardPath = 'meta_agentic_alpha_v2/ui/';
    }
    if (version === 3)
      payload.links = {
        summary: 'dashboard-data.json',
        report: '../../records/v3.md',
        dashboard: './',
      };
    if (version >= 2 && version <= 4)
      copy(`archive/records/v${version}.md`, `legacy/reports/v${version}.md`);
    write(
      path.posix.normalize('archive/' + prefix + filename),
      JSON.stringify(payload, null, 2) + '\n'
    );
  }
  for (const asset of ['index.html', 'styles.css', 'app.js'])
    copy('archive/ui/' + asset, 'ui/' + asset);
  execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      path.join(demoRoot, 'scripts/runDemo.ts'),
      '--out',
      path.join(output, 'archive/reports'),
    ],
    { stdio: 'pipe' }
  );
  for (const name of fs.readdirSync(path.join(output, 'archive/reports')))
    assets.push('archive/reports/' + name);
  copy('archive/prime.html', 'legacy/prime.html');
  copy('archive/legacy/viewer.css', 'legacy/viewer.css');
  const escaped = JSON.stringify(snapshots.v1, null, 2)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;');
  write(
    'archive/v1.html',
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meta-Agentic V1 rehearsal</title><link rel="stylesheet" href="../styles.css"><body><main id="main" class="wrap section"><a href="../">Return to the delivery workbench</a><h1>V1 orchestration record</h1><p>Preserved synthetic rehearsal. Completion scores do not establish economic performance, live provider execution or settlement authority.</p><pre tabindex="0">${escaped}</pre></main></body></html>`
  );
  const result = await build({
    entryPoints: [
      path.join(demoRoot, 'legacy/runtime.mjs'),
      path.join(demoRoot, 'legacy/prime.mjs'),
    ],
    outdir: path.join(output, 'archive/legacy'),
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    metafile: true,
    logLevel: 'warning',
    entryNames: '[name]',
    outExtension: { '.js': '.mjs' },
  });
  for (const file of Object.keys(result.metafile.outputs))
    assets.push(
      path.relative(output, path.resolve(file)).split(path.sep).join('/')
    );
  write(
    'site-assets.json',
    JSON.stringify(
      {
        assets: [...assets].sort(),
        fixtureMeaning:
          'Recorded synthetic examples; no live operation or settlement approval',
      },
      null,
      2
    ) + '\n'
  );
  return {
    directory: output,
    assets,
    archiveRoutes: assets.filter(
      (name) => name.startsWith('archive/') && name.endsWith('.html')
    ),
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 3)
    throw new Error('Usage: node scripts/build-site.mjs NEW_OUTPUT_DIRECTORY');
  console.log(await buildSite(process.argv[2]));
}
