'use strict';
const fs = require('node:fs');
function readJson(file, limit = 262144) {
  if (!file) throw new Error('A JSON file is required');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit)
      throw new Error('Use a regular JSON file of at most 256 KiB');
    const buffer = Buffer.alloc(limit + 1);
    let size = 0,
      count;
    while (
      size < buffer.length &&
      (count = fs.readSync(fd, buffer, size, buffer.length - size, null))
    )
      size += count;
    if (size > limit) throw new Error('JSON file exceeds 256 KiB');
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size))
    );
  } finally {
    fs.closeSync(fd);
  }
}
module.exports = { readJson };
