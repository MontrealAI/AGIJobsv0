import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** The application owns this directory tree; untrusted peers never choose it. */
export function ensurePrivateDirectory(directory: string): void {
  const absolute = path.resolve(directory);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { fs.mkdirSync(current, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Storage directory must not be a symlink');
    if ((stat.mode & 0o022) !== 0 && (stat.mode & 0o1000) === 0) throw new Error('Storage ancestor must not be writable by other users');
  }
  const stat = fs.statSync(absolute);
  if ((stat.mode & 0o022) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
    throw new Error('Storage directory must be owned and writable only by the service');
  }
}

export function containedFile(directory: string, filename: string): string {
  if (typeof filename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/.test(filename) || filename === '..') {
    throw new Error('Invalid storage filename');
  }
  const root = path.resolve(directory);
  const file = path.resolve(root, filename);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (!file.startsWith(prefix)) throw new Error('Storage path escapes its directory');
  if (path.dirname(file) !== root) throw new Error('Storage path escapes its directory');
  return file;
}

export function readContainedFile(directory: string, filename: string, maxBytes = 4 * 1024 * 1024): string {
  ensurePrivateDirectory(directory);
  const fd = fs.openSync(containedFile(directory, filename), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes) throw new Error('Invalid storage file');
    const bytes = Buffer.alloc(Math.min(stat.size + 1, maxBytes + 1));
    let count = 0;
    while (count < bytes.length) {
      const read = fs.readSync(fd, bytes, count, bytes.length - count, count);
      if (!read) break;
      count += read;
    }
    if (count > maxBytes || count > stat.size) throw new Error('Storage file changed or exceeds its size limit');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
  } finally { fs.closeSync(fd); }
}

export function writeContainedFile(directory: string, filename: string, body: string, exclusive = false): void {
  ensurePrivateDirectory(directory);
  const target = containedFile(directory, filename);
  const temporary = containedFile(directory, `tmp-${randomUUID()}.json`);
  let fd: number | undefined;
  try {
    fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(fd, body, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    if (exclusive) fs.linkSync(temporary, target);
    else fs.renameSync(temporary, target);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
