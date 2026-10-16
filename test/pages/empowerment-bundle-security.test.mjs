import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  readArtifact,
  bundleEmpowerment,
} from '../../scripts/pages/empowerment-bundle.mjs';
import {
  MAX_BYTES,
  unpack,
} from '../../demo/superintelligent-empowerment/web/model.mjs';
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empowerment-safe-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'packet.json');
  fs.writeFileSync(file, 'original');
  return { dir, file };
}
test('bounded artifact reader preserves bytes and rejects oversized and nonregular input', (t) => {
  const { dir, file } = fixture(t);
  assert.equal(Buffer.from(readArtifact(file)).toString(), 'original');
  fs.writeFileSync(file, Buffer.alloc(MAX_BYTES, 97));
  assert.equal(readArtifact(file).length, MAX_BYTES);
  fs.appendFileSync(file, 'x');
  assert.throws(() => readArtifact(file), /regular file/);
  assert.throws(() => readArtifact(dir), /regular file/);
  const link = path.join(dir, 'link');
  fs.symlinkSync(file, link);
  assert.throws(() => readArtifact(link));
  const fifo = path.join(dir, 'fifo');
  execFileSync('mkfifo', [fifo]);
  assert.throws(() => readArtifact(fifo), /regular file/);
});
test('path substitution after open cannot redirect the read', (t) => {
  const { file } = fixture(t);
  const original = fs.fstatSync;
  t.mock.method(fs, 'fstatSync', (fd) => {
    const stat = original(fd);
    fs.renameSync(file, file + '.original');
    fs.writeFileSync(file, 'replacement');
    return stat;
  });
  assert.equal(Buffer.from(readArtifact(file)).toString(), 'original');
});
test('file growth is bounded and all failure paths close the descriptor', (t) => {
  const { file } = fixture(t);
  const original = fs.fstatSync;
  let fd;
  t.mock.method(fs, 'fstatSync', (opened) => {
    fd = opened;
    const stat = original(opened);
    fs.writeFileSync(file, Buffer.alloc(MAX_BYTES + 10));
    return stat;
  });
  assert.throws(() => readArtifact(file), /regular file/);
  assert.throws(() => original(fd), { code: 'EBADF' });
});
test('read failure closes descriptor', (t) => {
  const { file } = fixture(t);
  let fd;
  t.mock.method(fs, 'readSync', (opened) => {
    fd = opened;
    throw Error('read failed');
  });
  assert.throws(() => readArtifact(file), /read failed/);
  assert.throws(() => fs.fstatSync(fd), { code: 'EBADF' });
});
test('valid bundle retains exact bytes and invalid input never creates output', async (t) => {
  const { dir, file } = fixture(t);
  const source = path.resolve(
    'demo/superintelligent-empowerment/web/cli-example'
  );
  for (const name of [
    'packet.json',
    'ledger.json',
    'report.md',
    'receipt.json',
  ])
    fs.copyFileSync(path.join(source, name), path.join(dir, name));
  const destination = path.join(dir, 'bundle.json');
  await bundleEmpowerment(dir, destination);
  const files = unpack(new Uint8Array(fs.readFileSync(destination)));
  assert.deepEqual(Buffer.from(files['packet.json']), fs.readFileSync(file));
  await assert.rejects(bundleEmpowerment(dir, destination), { code: 'EEXIST' });
  fs.writeFileSync(file, Buffer.alloc(MAX_BYTES + 1));
  const rejected = path.join(dir, 'rejected.json');
  await assert.rejects(bundleEmpowerment(dir, rejected), /regular file/);
  assert.equal(fs.existsSync(rejected), false);
});
