// Convert a completed Python run to the browser's lossless recovery envelope.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  review,
  pack,
  MAX_BYTES,
} from '../../demo/superintelligent-empowerment/web/model.mjs';
// Bind validation and bounded reads to one opened inode, never re-open its path.
export function readArtifact(file) {
  const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = fs.constants;
  if (O_NOFOLLOW === undefined || O_NONBLOCK === undefined)
    throw Error('Safe artifact file opening is unsupported on this platform');
  const fd = fs.openSync(file, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES)
      throw Error('Artifact must be a regular file at most 256 KiB');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(
        fd,
        buffer,
        length,
        buffer.length - length,
        null
      );
      if (count === 0) break;
      length += count;
    }
    if (length > MAX_BYTES)
      throw Error('Artifact must be a regular file at most 256 KiB');
    return new Uint8Array(buffer.subarray(0, length));
  } finally {
    fs.closeSync(fd);
  }
}
export async function bundleEmpowerment(directory, destination) {
  const files = {};
  for (const name of [
    'packet.json',
    'ledger.json',
    'report.md',
    'receipt.json',
  ]) {
    files[name] = readArtifact(path.join(directory, name));
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
