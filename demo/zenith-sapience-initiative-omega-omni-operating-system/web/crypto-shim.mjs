import { sha256, toUtf8Bytes } from 'ethers';
export function createHash(algorithm) {
  if (algorithm !== 'sha256') throw Error('Only SHA-256 is supported');
  let chunks = [],
    done = false;
  return {
    update(value, encoding) {
      if (
        done ||
        encoding !== undefined ||
        (typeof value !== 'string' && !(value instanceof Uint8Array))
      )
        throw Error('Unsupported SHA-256 input');
      chunks.push(
        typeof value === 'string' ? toUtf8Bytes(value) : new Uint8Array(value)
      );
      return this;
    },
    digest(encoding) {
      if (done || encoding !== 'hex')
        throw Error('Only one hex digest is supported');
      done = true;
      const data = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let offset = 0;
      for (const c of chunks) {
        data.set(c, offset);
        offset += c.length;
      }
      return sha256(data).slice(2);
    },
  };
}
