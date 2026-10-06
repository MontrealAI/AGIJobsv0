'use strict';
const fs = require('node:fs');
function readText(file) {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY |
      fs.constants.O_NONBLOCK |
      (fs.constants.O_NOFOLLOW || 0)
  );
  try {
    const info = fs.fstatSync(fd);
    if (!info.isFile() || info.size > 1048576)
      throw new Error('Input must be a regular JSON file at most 1 MiB.');
    const buffer = Buffer.alloc(1048577);
    let size = 0,
      count;
    while (
      size < buffer.length &&
      (count = fs.readSync(fd, buffer, size, buffer.length - size, null))
    )
      size += count;
    if (size > 1048576) throw new Error('Input exceeds 1 MiB.');
    return new TextDecoder('utf-8', { fatal: true }).decode(
      buffer.subarray(0, size)
    );
  } finally {
    fs.closeSync(fd);
  }
}
const readJson = (file) => JSON.parse(readText(file));
module.exports = { readJson, readText };
