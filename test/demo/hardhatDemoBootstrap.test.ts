import { expect } from 'chai';
import { existsSync, promises as fs } from 'fs';
import path from 'path';

import { bootstrapHardhatDemoConfig } from '../../scripts/v2/lib/hardhatDemoBootstrap';

describe('hardhat demo bootstrap', () => {
  const configDir = path.join(process.cwd(), 'config');
  const addressBookPath = path.join(
    process.cwd(),
    'deployment-config',
    'generated',
    'demo-hardhat-addresses.json'
  );
  const jobRegistryPath = path.join(configDir, 'job-registry.hardhat.json');
  const thermoPath = path.join(configDir, 'thermodynamics.hardhat.json');

  afterEach(async () => {
    if (existsSync(addressBookPath)) {
      await fs.unlink(addressBookPath);
    }
    if (existsSync(jobRegistryPath)) {
      await fs.unlink(jobRegistryPath);
    }
    if (existsSync(thermoPath)) {
      await fs.unlink(thermoPath);
    }
  });

  it('writes non-zero demo addresses for hardhat', async () => {
    await bootstrapHardhatDemoConfig('hardhat', [], { force: true });

    const addressBook = JSON.parse(await fs.readFile(addressBookPath, 'utf8'));
    expect(addressBook.taxPolicy).to.not.equal(
      '0x0000000000000000000000000000000000000000'
    );
    expect(addressBook.rewardEngine).to.not.equal(
      '0x0000000000000000000000000000000000000000'
    );

    const jobRegistry = JSON.parse(await fs.readFile(jobRegistryPath, 'utf8'));
    expect(jobRegistry.taxPolicy).to.equal(addressBook.taxPolicy);

    const thermodynamics = JSON.parse(await fs.readFile(thermoPath, 'utf8'));
    expect(thermodynamics.rewardEngine.address).to.equal(addressBook.rewardEngine);
  });
});
