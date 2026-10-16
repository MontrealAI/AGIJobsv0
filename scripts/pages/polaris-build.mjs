import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export async function buildPolarisSite(destination) {
  const source = path.join(root, 'demo/polaris-concordat');
  fs.mkdirSync(destination, { recursive: true });
  for (const file of [
    'index.html',
    'style.css',
    'polaris.mjs',
    'i18n.mjs',
    'json.mjs',
    'calculator.mjs',
  ])
    fs.copyFileSync(
      path.join(source, 'web', file),
      path.join(destination, file)
    );
  fs.copyFileSync(
    path.join(source, 'local-fixture.json'),
    path.join(destination, 'fixture.json')
  );
  await build({
    entryPoints: [path.join(source, 'web/reviewer-entry.mjs')],
    outfile: path.join(destination, 'reviewer.mjs'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    minify: true,
    legalComments: 'eof',
  });
  return destination;
}
