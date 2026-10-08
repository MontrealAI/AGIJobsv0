/** Node-only bounded JSON import from one opened regular-file descriptor. */
import fs from 'node:fs';
import { canonicalize } from './integrity.mjs';

const MAX_BYTES = 16 * 1024 * 1024;
function reject(code, message) {
  throw Object.assign(new Error(message), { code });
}

export function readJsonFile(path, { maxBytes = MAX_BYTES } = {}) {
  if (typeof path !== 'string' || !path)
    reject('INPUT_REQUIRED', 'An explicit input file is required.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES)
    reject(
      'INPUT_LIMIT',
      'JSON import limit must be between 1 byte and 16 MiB.'
    );
  const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = fs.constants;
  if (!O_NOFOLLOW || !O_NONBLOCK)
    reject(
      'INPUT_PLATFORM_UNSUPPORTED',
      'Safe JSON import requires no-follow and nonblocking file opens.'
    );
  let fd;
  try {
    fd = fs.openSync(path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  } catch (error) {
    if (error.code === 'ELOOP')
      reject('INPUT_SYMLINK', 'JSON input must not be a symbolic link.');
    throw error;
  }
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile())
      reject('INPUT_TYPE', 'JSON input must be a regular file.');
    if (before.size > BigInt(maxBytes))
      reject('INPUT_LIMIT', `JSON input exceeds ${maxBytes} bytes.`);
    const chunks = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(
        Math.min(64 * 1024, maxBytes + 1 - total)
      );
      const count = fs.readSync(fd, chunk, 0, chunk.length, total);
      if (count === 0) break;
      total += count;
      if (total > maxBytes)
        reject('INPUT_LIMIT', `JSON input exceeds ${maxBytes} bytes.`);
      chunks.push(chunk.subarray(0, count));
    }
    const after = fs.fstatSync(fd, { bigint: true });
    if (
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      BigInt(total) !== after.size
    )
      reject(
        'INPUT_CHANGED',
        'JSON input changed during reading; use a stable evidence file.'
      );
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.concat(chunks, total)
      );
    } catch {
      reject('INPUT_ENCODING', 'JSON input must contain valid UTF-8.');
    }
    const value = JSON.parse(text);
    canonicalize(value);
    return value;
  } finally {
    fs.closeSync(fd);
  }
}
