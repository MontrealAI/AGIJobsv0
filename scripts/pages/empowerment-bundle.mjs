// Convert a completed Python run to the browser's lossless recovery envelope.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  review,
  pack,
  MAX_BYTES,
} from '../../demo/superintelligent-empowerment/web/model.mjs';
export async function bundleEmpowerment(directory, destination) {
  const files = {};
  for (const name of [
    'packet.json',
    'ledger.json',
    'report.md',
    'receipt.json',
  ]) {
    const file = path.join(directory, name),
      stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > MAX_BYTES)
      throw Error('Artifact must be a regular file at most 256 KiB');
    files[name] = new Uint8Array(fs.readFileSync(file));
  }
  await review(files);
  fs.writeFileSync(destination, pack(files), { flag: 'wx' });
  return destination;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 4)
    throw Error(
      'Usage: node scripts/pages/empowerment-bundle.mjs RUN_DIRECTORY NEW_BUNDLE_JSON'
    );
  console.log(await bundleEmpowerment(process.argv[2], process.argv[3]));
}
