import { promises as fs } from 'fs';
import path from 'path';

import { writeDemoNetworkConfig } from '../demoHardhatOwnerMatrixConfig';

describe('writeDemoNetworkConfig', () => {
  const networkName = 'hardhat';
  const configDir = path.join(process.cwd(), 'config');
  const jobRegistryPath = path.join(
    configDir,
    `job-registry.${networkName}.json`
  );
  const thermodynamicsPath = path.join(
    configDir,
    `thermodynamics.${networkName}.json`
  );

  afterEach(async () => {
    await Promise.all(
      [jobRegistryPath, thermodynamicsPath].map(async (filePath) => {
        try {
          await fs.unlink(filePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        }
      })
    );
  });

  it('writes network-specific owner control overrides', async () => {
    const overrides = {
      taxPolicy: '0x0000000000000000000000000000000000000001',
      rewardEngine: '0x0000000000000000000000000000000000000002',
      thermostat: '0x0000000000000000000000000000000000000003',
    };

    const result = await writeDemoNetworkConfig(networkName, overrides);
    expect(result.jobRegistryPath).toBe(jobRegistryPath);
    expect(result.thermodynamicsPath).toBe(thermodynamicsPath);

    const jobRegistryRaw = await fs.readFile(jobRegistryPath, 'utf8');
    const jobRegistryConfig = JSON.parse(jobRegistryRaw) as Record<string, unknown>;
    expect(jobRegistryConfig.taxPolicy).toBe(overrides.taxPolicy);

    const thermoRaw = await fs.readFile(thermodynamicsPath, 'utf8');
    const thermoConfig = JSON.parse(thermoRaw) as Record<string, any>;
    expect(thermoConfig.rewardEngine.address).toBe(overrides.rewardEngine);
    expect(thermoConfig.rewardEngine.thermostat).toBe(overrides.thermostat);
    expect(thermoConfig.thermostat.address).toBe(overrides.thermostat);
  });
});
