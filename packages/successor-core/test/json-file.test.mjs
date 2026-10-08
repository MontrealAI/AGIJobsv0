import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJsonFile } from '../src/json-file.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'successor-json-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, path: join(dir, 'evidence.json') };
}

test('bounded JSON imports validate UTF-8 and canonical data', (t) => {
  const { path } = fixture(t);
  fs.writeFileSync(path, '{"mission":"Ω"}');
  assert.deepEqual(readJsonFile(path), { mission: 'Ω' });
  assert.throws(() => readJsonFile(path, { maxBytes: 4 }), {
    code: 'INPUT_LIMIT',
  });
  fs.writeFileSync(path, Buffer.from([0x22, 0xff, 0x22]));
  assert.throws(() => readJsonFile(path), { code: 'INPUT_ENCODING' });
  fs.writeFileSync(path, '{"__proto__":{}}');
  assert.throws(() => readJsonFile(path));
});

test('symbolic links and directories are rejected before reading', (t) => {
  const { dir, path } = fixture(t);
  const target = join(dir, 'target.json');
  fs.writeFileSync(target, '{"unapproved":true}');
  fs.symlinkSync(target, path);
  assert.throws(() => readJsonFile(path), { code: 'INPUT_SYMLINK' });
  assert.throws(() => readJsonFile(dir), { code: 'INPUT_TYPE' });
});

test('a path replacement after open cannot substitute different evidence', (t) => {
  const { dir, path } = fixture(t);
  const target = join(dir, 'replacement.json');
  fs.writeFileSync(path, '{"original":true}');
  fs.writeFileSync(target, '{"substituted":true}');
  const open = fs.openSync;
  t.mock.method(fs, 'openSync', (...args) => {
    const fd = open(...args);
    if (args[0] === path) {
      fs.renameSync(path, `${path}.opened`);
      fs.symlinkSync(target, path);
    }
    return fd;
  });
  assert.deepEqual(readJsonFile(path), { original: true });
  assert.equal(fs.lstatSync(path).isSymbolicLink(), true);
});

test('growth after the descriptor size check cannot bypass the byte limit and the handle closes', (t) => {
  const { path } = fixture(t);
  fs.writeFileSync(path, '{}');
  const read = fs.readSync;
  let opened;
  let bytesRead = 0;
  t.mock.method(fs, 'readSync', (fd, ...args) => {
    if (opened === undefined) {
      opened = fd;
      fs.appendFileSync(path, ' '.repeat(1024));
    }
    const count = read(fd, ...args);
    bytesRead += count;
    return count;
  });
  assert.throws(() => readJsonFile(path, { maxBytes: 128 }), {
    code: 'INPUT_LIMIT',
  });
  assert.ok(bytesRead <= 129);
  assert.throws(() => fs.fstatSync(opened), { code: 'EBADF' });
});

test('in-place evidence mutation during reading is refused', (t) => {
  const { path } = fixture(t);
  fs.writeFileSync(path, '{"value":1}');
  const read = fs.readSync;
  let changed = false;
  t.mock.method(fs, 'readSync', (fd, ...args) => {
    const count = read(fd, ...args);
    if (!changed) {
      changed = true;
      fs.truncateSync(path, 0);
    }
    return count;
  });
  assert.throws(() => readJsonFile(path), { code: 'INPUT_CHANGED' });
});

test('CLI refuses a FIFO without blocking for a writer', (t) => {
  const { path } = fixture(t);
  execFileSync('mkfifo', [path]);
  const cli = fileURLToPath(new URL('../bin/successor.mjs', import.meta.url));
  const result = spawnSync(
    process.execPath,
    [cli, 'mission', 'validate', '--file', path],
    {
      timeout: 2000,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    }
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(
    JSON.parse(
      result.stderr.split('\n').find((line) => line.startsWith('{"error":'))
    ).error.code,
    'INPUT_TYPE'
  );
});
