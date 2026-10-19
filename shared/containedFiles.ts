import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const PROCFS_MAGIC = 0x9fa0;

function descriptorDirectory(fd: number): string {
  // Node has no openat/renameat API. Linux procfs provides a directory-FD path
  // whose lookup remains anchored to that inode even after its parents move.
  // Never fall back to the configured storage pathname on another platform.
  if (process.platform !== 'linux' || fs.statfsSync('/proc/self/fd').type !== PROCFS_MAGIC) {
    throw new Error('Descriptor-anchored storage requires Linux procfs');
  }
  const anchor = `/proc/self/fd/${fd}`;
  const opened = fs.fstatSync(fd), resolved = fs.statSync(anchor);
  if (!opened.isDirectory() || !resolved.isDirectory() || opened.dev !== resolved.dev || opened.ino !== resolved.ino) {
    throw new Error('Storage directory descriptor cannot be verified');
  }
  return anchor;
}

function checkDirectory(fd: number, final: boolean): void {
  const stat = fs.fstatSync(fd);
  if (!stat.isDirectory()) throw new Error('Storage directory must not be a symlink');
  if ((stat.mode & 0o022) !== 0 && (stat.mode & 0o1000) === 0) throw new Error('Storage ancestor must not be writable by other users');
  if (final && ((stat.mode & 0o022) !== 0 || (process.getuid && stat.uid !== process.getuid()))) {
    throw new Error('Storage directory must be owned and writable only by the service');
  }
}

/** The application chooses this tree; retain each verified inode while walking it. */
function openPrivateDirectory(directory: string): number {
  if (process.platform !== 'linux') throw new Error('Descriptor-anchored storage requires Linux procfs');
  const absolute = path.resolve(directory), root = path.parse(absolute).root;
  const parts = absolute.slice(root.length).split(path.sep).filter(Boolean);
  const flags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
  let fd = fs.openSync(root, flags);
  try {
    descriptorDirectory(fd);
    checkDirectory(fd, parts.length === 0);
    for (let index = 0; index < parts.length; index++) {
      const child = path.join(descriptorDirectory(fd), parts[index]);
      try { fs.mkdirSync(child, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      let next: number;
      try { next = fs.openSync(child, flags); }
      catch (error) {
        if (['ELOOP', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
          throw new Error('Storage directory must not be a symlink');
        }
        throw error;
      }
      const previous = fd;
      fd = next;
      fs.closeSync(previous);
      checkDirectory(fd, index === parts.length - 1);
    }
    return fd;
  } catch (error) { fs.closeSync(fd); throw error; }
}

export function ensurePrivateDirectory(directory: string): void {
  const fd = openPrivateDirectory(directory);
  fs.closeSync(fd);
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
  containedFile(directory, filename);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('Invalid storage size limit');
  const directoryFd = openPrivateDirectory(directory);
  let fd: number | undefined;
  try {
    fd = fs.openSync(path.join(descriptorDirectory(directoryFd), filename), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes || (stat.mode & 0o022) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new Error('Invalid storage file');
    const bytes = Buffer.alloc(Math.min(stat.size + 1, maxBytes + 1));
    let count = 0;
    while (count < bytes.length) {
      const read = fs.readSync(fd, bytes, count, bytes.length - count, count);
      if (!read) break;
      count += read;
    }
    const after = fs.fstatSync(fd);
    if (count > maxBytes || count !== stat.size || !['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every((key) => after[key as keyof fs.Stats] === stat[key as keyof fs.Stats])) throw new Error('Storage file changed or exceeds its size limit');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); }
    finally { fs.closeSync(directoryFd); }
  }
}

export function writeContainedFile(directory: string, filename: string, body: string, exclusive = false): void {
  containedFile(directory, filename);
  const directoryFd = openPrivateDirectory(directory);
  let fd: number | undefined;
  let temporary: string | undefined;
  let created = false;
  try {
    const anchor = descriptorDirectory(directoryFd);
    const target = path.join(anchor, filename);
    temporary = path.join(anchor, `tmp-${randomUUID()}.json`);
    fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
    created = true;
    fs.writeFileSync(fd, body, 'utf8');
    fs.fsyncSync(fd);
    if (exclusive) fs.linkSync(temporary, target);
    else fs.renameSync(temporary, target);
  } finally {
    try {
      if (fd !== undefined) fs.closeSync(fd);
    } finally {
      try {
        if (created && temporary !== undefined) {
          try { fs.unlinkSync(temporary); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        }
      } finally { fs.closeSync(directoryFd); }
    }
  }
}
