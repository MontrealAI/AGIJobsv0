import fs from 'fs';
import { TextDecoder } from 'util';
import { parsePhase6Json } from '../../../scripts/phase6/config-validation';

export const GOVERNANCE_JSON_MAX_BYTES = 1024 * 1024;
export const GOVERNANCE_JSON_MAX_DEPTH = 8;

/** Bound and disambiguate raw tokens before the shared duplicate-aware parser. */
export function parseGovernanceJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength > GOVERNANCE_JSON_MAX_BYTES)
    throw new Error('Governance JSON exceeds 1 MiB');
  const text = new TextDecoder('utf-8', {
    fatal: true,
    ignoreBOM: true,
  }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff)
    throw new Error('Governance JSON must not contain a UTF-8 BOM');
  let index = 0;
  let depth = 0;
  while (index < text.length) {
    const character = text[index];
    if (/[ \t\r\n,:]/.test(character)) {
      index++;
      continue;
    }
    if (character === '{' || character === '[') {
      // object/array depth is bounded before JSON.parse
      if (++depth > GOVERNANCE_JSON_MAX_DEPTH)
        throw new Error('Governance JSON exceeds depth 8');
      index++;
      continue;
    }
    if (character === '}' || character === ']') {
      depth--;
      index++;
      continue;
    }
    if (character === '"') {
      const start = index++;
      let closed = false;
      while (index < text.length) {
        if (text[index] === '\\') {
          index += 2;
          continue;
        }
        if (text[index++] === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) throw new Error('Unterminated governance JSON string');
      const value: string = JSON.parse(text.slice(start, index));
      for (let i = 0; i < value.length; i++) {
        const unit = value.charCodeAt(i);
        if (unit >= 0xd800 && unit <= 0xdbff) {
          const next = value.charCodeAt(++i);
          if (!(next >= 0xdc00 && next <= 0xdfff))
            throw new Error('Governance JSON contains malformed Unicode');
        } else if (unit >= 0xdc00 && unit <= 0xdfff)
          throw new Error('Governance JSON contains malformed Unicode');
      }
      continue;
    }
    const start = index;
    while (index < text.length && !/[ \t\r\n,\]}:]/.test(text[index])) index++;
    const token = text.slice(start, index);
    if (
      !['true', 'false', 'null'].includes(token) &&
      (!/^(?:0|[1-9][0-9]*)$/.test(token) ||
        !Number.isSafeInteger(Number(token)))
    ) {
      throw new Error(
        'Governance JSON numbers must be canonical nonnegative safe-integer tokens (no fractions, exponent notation, or negative zero)'
      );
    }
  }
  // Native JSON grammar validation and decoded duplicate-key rejection are shared.
  return parsePhase6Json(text);
}

/** A fixed-size read rejects special files and growth races without unbounded allocation. */
export function readGovernanceJson(file: string): unknown {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY |
      fs.constants.O_NONBLOCK |
      (fs.constants.O_NOFOLLOW || 0)
  );
  try {
    const info = fs.fstatSync(fd);
    if (!info.isFile() || info.size > GOVERNANCE_JSON_MAX_BYTES)
      throw new Error(
        'Governance JSON must be a regular file of at most 1 MiB'
      );
    const bytes = Buffer.alloc(GOVERNANCE_JSON_MAX_BYTES + 1);
    let size = 0;
    let count: number;
    while (
      size < bytes.length &&
      (count = fs.readSync(fd, bytes, size, bytes.length - size, null))
    )
      size += count;
    return parseGovernanceJson(bytes.subarray(0, size));
  } finally {
    fs.closeSync(fd);
  }
}
