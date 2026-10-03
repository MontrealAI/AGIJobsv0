import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { jest } from '@jest/globals';
import { jsonFileAdapter } from '../src/persistence';

describe('jsonFileAdapter', () => {
  const fallback = { counter: 1 };
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'persistence-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns fallback when file missing', async () => {
    const target = path.join(tempDir, 'missing.json');
    const adapter = jsonFileAdapter(target, fallback);
    const loaded = await adapter.load();
    expect(loaded).toEqual(fallback);
  });

  it('persists data to disk', async () => {
    const target = path.join(tempDir, 'state.json');
    const adapter = jsonFileAdapter(target, fallback);
    await adapter.save({ counter: 3 });
    const contents = await fs.readFile(target, 'utf8');
    expect(JSON.parse(contents)).toEqual({ counter: 3 });
  });

  it('parses stored JSON', async () => {
    const target = path.join(tempDir, 'state.json');
    await fs.writeFile(target, JSON.stringify({ counter: 42 }), 'utf8');
    const adapter = jsonFileAdapter(target, fallback);
    const loaded = await adapter.load();
    expect(loaded).toEqual({ counter: 42 });
  });

  it('refuses to replace unreadable state with an empty fallback', async () => {
    const target = path.join(tempDir, 'state.json');
    const adapter = jsonFileAdapter(target, fallback);
    const error = Object.assign(new Error('permission denied'), {
      code: 'EACCES',
    });
    const readSpy = jest.spyOn(fs, 'readFile').mockRejectedValueOnce(error);

    try {
      await expect(adapter.load()).rejects.toThrow(
        'Cannot load persistent state',
      );
    } finally {
      readSpy.mockRestore();
    }
  });

  it('preserves corrupt JSON for recovery instead of resetting it', async () => {
    const target = path.join(tempDir, 'state.json');
    await fs.writeFile(target, '{truncated');
    await expect(jsonFileAdapter(target, fallback).load()).rejects.toThrow(
      'Cannot load persistent state',
    );
    expect(await fs.readFile(target, 'utf8')).toBe('{truncated');
  });

  it('keeps the previous file intact if atomic replacement fails', async () => {
    const target = path.join(tempDir, 'state.json');
    const adapter = jsonFileAdapter(target, fallback);
    await adapter.save({ counter: 1 });
    const rename = jest
      .spyOn(fs, 'rename')
      .mockRejectedValueOnce(new Error('disk unavailable'));
    try {
      await expect(adapter.save({ counter: 2 })).rejects.toThrow(
        'disk unavailable',
      );
      expect(JSON.parse(await fs.readFile(target, 'utf8'))).toEqual({
        counter: 1,
      });
      expect(await fs.readdir(tempDir)).toEqual(['state.json']);
    } finally {
      rename.mockRestore();
    }
    await adapter.save({ counter: 3 });
    expect(await adapter.load()).toEqual({ counter: 3 });
  });

  it('serializes concurrent saves and snapshots the data at submission', async () => {
    const target = path.join(tempDir, 'state.json');
    const adapter = jsonFileAdapter(target, fallback);
    const data = { counter: 3 };
    const saves = [adapter.save({ counter: 2 }), adapter.save(data)];
    data.counter = 99;
    await Promise.all(saves);
    expect(await adapter.load()).toEqual({ counter: 3 });
  });
});
