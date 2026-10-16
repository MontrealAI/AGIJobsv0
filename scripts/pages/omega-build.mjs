import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export async function buildOmegaSite(destination) {
  const source = path.join(
    root,
    'demo/zenith-sapience-initiative-omega-omni-operating-system'
  );
  fs.mkdirSync(destination, { recursive: true });
  for (const file of [
    'index.html',
    'style.css',
    'app.mjs',
    'i18n.mjs',
    'json.mjs',
    'replay.mjs',
  ])
    fs.copyFileSync(
      path.join(source, 'web', file),
      path.join(destination, file)
    );
  fs.copyFileSync(
    path.join(source, 'local-fixture.json'),
    path.join(destination, 'fixture.json')
  );
  const pins = Object.fromEntries(
    [
      'engine.cjs',
      'run.cjs',
      '../One-Box/computer-work/review.cjs',
      '../One-Box/computer-work/quotes.json',
    ].map((p) => [
      p,
      createHash('sha256')
        .update(fs.readFileSync(path.resolve(source, p)))
        .digest('hex'),
    ])
  );
  fs.writeFileSync(
    path.join(destination, 'source-pins.json'),
    JSON.stringify(pins, null, 2) + '\n'
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
    plugins: [
      {
        name: 'bounded-sha256-only',
        setup(b) {
          b.onResolve({ filter: /^node:crypto$/ }, (args) => {
            if (
              ![
                path.join(source, 'engine.cjs'),
                path.resolve(source, '../One-Box/computer-work/review.cjs'),
              ].includes(args.importer)
            )
              throw Error('Unexpected crypto importer');
            return { path: path.join(source, 'web/crypto-shim.mjs') };
          });
        },
      },
    ],
  });
  return destination;
}
