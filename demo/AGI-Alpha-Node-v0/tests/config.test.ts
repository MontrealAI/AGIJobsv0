import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults.js';
import { loadConfig } from '../src/utils/config.js';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

describe('config loader', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-alpha-config-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
    delete process.env.ALPHA_NODE_MIN_STAKE;
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns defaults when no config file is present', () => {
    const config = loadConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('overrides values from yaml file', () => {
    const override = path.join(tempDir, 'alpha-node.config.yml');
    fs.writeFileSync(override, 'staking:\n  minimumStake: "12345"\n');
    const config = loadConfig();
    expect(config.staking.minimumStake).toBe('12345');
  });
});
