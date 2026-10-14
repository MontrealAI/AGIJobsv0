'use strict';
const fs = require('node:fs');
const { createHash } = require('node:crypto');
// Shared with Alpha's MAX_DELIVERY_BYTES. This bounds artifact bytes, not JSON characters.
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
function readArtifactCommitment(filename) {
  // Nonblocking open prevents a special-file path (for example a FIFO)
  // from hanging before the regular-file check. It has no effect on files.
  const fd = fs.openSync(
    filename,
    fs.constants.O_RDONLY | fs.constants.O_NONBLOCK
  );
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('Artifact must be a regular file');
    if (stat.size > MAX_ARTIFACT_BYTES)
      throw new Error('Artifact exceeds shared 8 MiB limit');
    // Bounded reads also reject a file that grows after fstat without allocating
    // an unbounded buffer. A one-byte lookahead distinguishes exactly-at-limit.
    const buffer = Buffer.alloc(MAX_ARTIFACT_BYTES + 1);
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
    if (length > MAX_ARTIFACT_BYTES)
      throw new Error('Artifact exceeds shared 8 MiB limit');
    const bytes = buffer.subarray(0, length);
    return {
      bytes,
      resultHash: '0x' + createHash('sha256').update(bytes).digest('hex'),
    };
  } finally {
    fs.closeSync(fd);
  }
}
module.exports = { MAX_ARTIFACT_BYTES, readArtifactCommitment };
