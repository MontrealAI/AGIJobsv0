import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export async function buildEmpowermentSite(
  destination = path.join(root, 'build/empowerment'),
  { base = '/AGIJobsv0/' } = {}
) {
  fs.mkdirSync(destination, { recursive: true });
  const source = path.join(root, 'demo/superintelligent-empowerment/web');
  for (const name of [
    'index.html',
    'styles.css',
    'app.mjs',
    'model.mjs',
    'cli-example',
  ])
    fs.cpSync(path.join(source, name), path.join(destination, name), {
      recursive: true,
    });
  const html = fs
    .readFileSync(path.join(destination, 'index.html'), 'utf8')
    .replace('https://montrealai.github.io/AGIJobsv0/', base)
    .replace('../README.md', base + 'demos/superintelligent-empowerment/');
  fs.writeFileSync(path.join(destination, 'index.html'), html);
  return destination;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await buildEmpowermentSite(process.argv[2]);
