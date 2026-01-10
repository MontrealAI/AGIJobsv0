import { existsSync, promises as fs } from 'fs';
import path from 'path';

import {
  resolveDemoAddressBookOutputPath,
  writeDemoAddressBook,
} from '../lib/demoAddressBook';

describe('demoAddressBook helpers', () => {
  const envKey = 'OWNER_MATRIX_DEMO_ADDRESS_BOOK';
  const defaultPath = path.join(
    process.cwd(),
    'deployment-config',
    'generated',
    'demo-hardhat-addresses.json'
  );
  const originalEnv = process.env[envKey];

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = originalEnv;
    }
    if (existsSync(defaultPath)) {
      await fs.unlink(defaultPath);
    }
  });

  it('resolves the default output path when no override is set', () => {
    delete process.env[envKey];
    expect(resolveDemoAddressBookOutputPath()).toBe(defaultPath);
  });

  it('resolves relative output paths from the repository root', () => {
    process.env[envKey] = 'tmp/demo-owner-matrix.json';
    expect(resolveDemoAddressBookOutputPath()).toBe(
      path.join(process.cwd(), 'tmp', 'demo-owner-matrix.json')
    );
  });

  it('writes an address book payload to disk', async () => {
    const payload = {
      generatedAt: new Date(0).toISOString(),
      network: 'hardhat',
      taxPolicy: '0x0000000000000000000000000000000000000001',
      rewardEngine: '0x0000000000000000000000000000000000000002',
      thermostat: '0x0000000000000000000000000000000000000003',
    };

    await writeDemoAddressBook(payload);

    const raw = await fs.readFile(defaultPath, 'utf8');
    expect(JSON.parse(raw)).toEqual(payload);
  });
});
