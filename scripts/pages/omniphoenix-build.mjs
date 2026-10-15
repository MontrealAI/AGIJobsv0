import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export async function buildOmniphoenixSite(destination) {
  const source = path.join(root, 'demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE');
  const engine = path.join(root, 'demo/asi-takeoff/scripts/plan.cjs');
  fs.mkdirSync(destination, { recursive: true });
  for (const file of [
    'index.html',
    'style.css',
    'app.mjs',
    'i18n.mjs',
    'main.mjs',
  ])
    fs.copyFileSync(
      path.join(source, 'web', file),
      path.join(destination, file)
    );
  fs.copyFileSync(
    path.join(source, 'project-plan.hyperstructure.json'),
    path.join(destination, 'plan.json')
  );
  const pins = Object.fromEntries(
    [engine, path.join(source, 'disruption/core.cjs')].map((file) => [
      path.relative(root, file),
      createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
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
    define: { __dirname: '"."' },
    plugins: [
      {
        name: 'locked-analyzer-inert-io',
        setup(b) {
          b.onResolve({ filter: /^node:/ }, (args) => {
            if (
              args.importer !== engine ||
              !['node:fs', 'node:path', 'node:crypto'].includes(args.path)
            )
              throw Error('Unexpected Node dependency');
            return { path: args.path, namespace: 'inert-io' };
          });
          b.onLoad({ filter: /.*/, namespace: 'inert-io' }, (args) => ({
            contents:
              args.path === 'node:path'
                ? 'module.exports={resolve(...args){if(args.length===2&&args[0]==="."&&args[1]==="..")return ".";throw Error("Filesystem paths unavailable")},join(){throw Error("Filesystem unavailable")}}'
                : 'module.exports=new Proxy({}, {get(){return ()=>{throw Error("Node I/O unavailable in planning browser")}}})',
            loader: 'js',
          }));
        },
      },
    ],
  });
  return destination;
}
