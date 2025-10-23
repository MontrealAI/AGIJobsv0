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

  it('warns and returns fallback on unexpected load errors', async () => {
    const target = path.join(tempDir, 'state.json');
    const adapter = jsonFileAdapter(target, fallback);
    const error = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const readSpy = jest.spyOn(fs, 'readFile').mockRejectedValueOnce(error);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const loaded = await adapter.load();
      expect(loaded).toEqual(fallback);
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to load persistent state',
        path.resolve(process.cwd(), target),
        error
      );
    } finally {
      readSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
