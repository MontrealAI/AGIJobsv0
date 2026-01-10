import { existsSync, promises as fs } from 'fs';
import path from 'path';

const { loadJobRegistryConfig, loadThermodynamicsConfig } = require('../index.js');

describe('config network aliases', () => {
  const configDir = path.join(process.cwd(), 'config');
  const hardhatJobRegistryPath = path.join(configDir, 'job-registry.hardhat.json');
  const localhostThermoPath = path.join(configDir, 'thermodynamics.localhost.json');

  afterEach(async () => {
    if (existsSync(hardhatJobRegistryPath)) {
      await fs.unlink(hardhatJobRegistryPath);
    }
    if (existsSync(localhostThermoPath)) {
      await fs.unlink(localhostThermoPath);
    }
  });

  it('loads hardhat-specific configs when network is hardhat', async () => {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      hardhatJobRegistryPath,
      JSON.stringify(
        {
          taxPolicy: '0x0000000000000000000000000000000000000001',
        },
        null,
        2
      )
    );

    const { config, path: resolvedPath } = loadJobRegistryConfig({ network: 'hardhat' });
    expect(resolvedPath).toBe(hardhatJobRegistryPath);
    expect(config.taxPolicy).toBe('0x0000000000000000000000000000000000000001');
  });

  it('loads localhost-specific configs when network is localhost', async () => {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      localhostThermoPath,
      JSON.stringify(
        {
          rewardEngine: {
            address: '0x0000000000000000000000000000000000000002',
            thermostat: '0x0000000000000000000000000000000000000003',
          },
          thermostat: {
            address: '0x0000000000000000000000000000000000000003',
          },
        },
        null,
        2
      )
    );

    const { config, path: resolvedPath } = loadThermodynamicsConfig({
      network: 'localhost',
    });
    expect(resolvedPath).toBe(localhostThermoPath);
    expect(config.rewardEngine.address).toBe(
      '0x0000000000000000000000000000000000000002'
    );
  });
});
