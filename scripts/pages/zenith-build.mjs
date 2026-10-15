import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export async function buildZenithSite(destination) {
  const source = path.join(root, 'demo/zenith-sapience');
  fs.mkdirSync(destination, { recursive: true });
  for (const file of ['index.html', 'style.css', 'app.mjs', 'i18n.mjs'])
    fs.copyFileSync(
      path.join(source, 'web', file),
      path.join(destination, file)
    );
  fs.copyFileSync(
    path.join(source, 'scenario.json'),
    path.join(destination, 'scenario.json')
  );
  await build({
    entryPoints: [path.join(source, 'web/entry.mjs')],
    outfile: path.join(destination, 'engine.mjs'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    minify: true,
    legalComments: 'eof',
  });
  return destination;
}
