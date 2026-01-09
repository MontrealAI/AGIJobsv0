import { existsSync, promises as fs } from 'fs';
import path from 'path';

import { resolveDemoAddressBookPath } from '../ownerParameterMatrix';

describe('resolveDemoAddressBookPath', () => {
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

  it('resolves explicit overrides', () => {
    process.env[envKey] = 'tmp/demo-owner-matrix.json';
    const resolved = resolveDemoAddressBookPath('hardhat');
    expect(resolved).toBe(path.join(process.cwd(), 'tmp', 'demo-owner-matrix.json'));
  });

  it('uses the default generated address book for local networks', async () => {
    await fs.mkdir(path.dirname(defaultPath), { recursive: true });
    await fs.writeFile(defaultPath, '{"taxPolicy":"0x0000000000000000000000000000000000000001","rewardEngine":"0x0000000000000000000000000000000000000002"}');

    const resolved = resolveDemoAddressBookPath('hardhat');
    expect(resolved).toBe(defaultPath);
  });

  it('skips the default address book on non-local networks', async () => {
    await fs.mkdir(path.dirname(defaultPath), { recursive: true });
    await fs.writeFile(defaultPath, '{"taxPolicy":"0x0000000000000000000000000000000000000001","rewardEngine":"0x0000000000000000000000000000000000000002"}');

    const resolved = resolveDemoAddressBookPath('mainnet');
    expect(resolved).toBeUndefined();
  });
});
