import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const source = path.join(root, 'demo/Phase-6-Scaling-Multi-Domain-Expansion');

export async function buildPhase6Site(
  destination = path.join(root, 'build/phase6'),
  { base = '/AGIJobsv0/', standalone = false } = {}
) {
  fs.mkdirSync(destination, { recursive: true });
  const document = new JSDOM(
    fs.readFileSync(path.join(source, 'index.html'), 'utf8')
  ).window.document;
  document.querySelector('script[type="module"]').src = './ui/app.js';
  if (!standalone) {
    for (const link of document.querySelectorAll(
      'a[href^="https://montrealai.github.io/AGIJobsv0/"]'
    )) {
      link.setAttribute(
        'href',
        base +
          link
            .getAttribute('href')
            .slice('https://montrealai.github.io/AGIJobsv0/'.length)
      );
    }
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href =
      'https://montrealai.github.io' + base + 'experiments/phase6/';
    document.head.append(canonical);
  }
  fs.writeFileSync(
    path.join(destination, 'index.html'),
    '<!doctype html>\n' + document.documentElement.outerHTML + '\n'
  );
  for (const asset of [
    'ui/styles.css',
    'config/domains.phase6.json',
    'abi/Phase6ExpansionManager.json',
  ]) {
    fs.mkdirSync(path.dirname(path.join(destination, asset)), {
      recursive: true,
    });
    fs.copyFileSync(path.join(source, asset), path.join(destination, asset));
  }
  await build({
    entryPoints: [path.join(source, 'ui/app.mjs')],
    outdir: path.join(destination, 'ui'),
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'linked',
    logLevel: 'warning',
  });
  return destination;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const destination = await buildPhase6Site(undefined, { standalone: true });
  console.log(
    `Built offline Phase 6 experience: ${destination}\nServe with: python -m http.server 8080 --bind 127.0.0.1 --directory build/phase6`
  );
}
