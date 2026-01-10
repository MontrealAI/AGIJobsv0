import { promises as fs } from 'fs';
import path from 'path';
import { network } from 'hardhat';
import { resolveDemoAddressBookOutputPath } from './lib/demoAddressBook';
import { bootstrapHardhatOwnerMatrix } from './lib/hardhatOwnerMatrixBootstrap';

const LOCAL_NETWORKS = new Set(['hardhat', 'localhost']);
interface DemoAddressOverrides {
  taxPolicy: string;
  rewardEngine: string;
  thermostat: string;
}

export async function writeDemoNetworkConfig(
  networkName: string,
  overrides: DemoAddressOverrides
): Promise<{ jobRegistryPath: string; thermodynamicsPath: string }> {
  const configDir = path.join(process.cwd(), 'config');
  const jobRegistrySource = path.join(configDir, 'job-registry.json');
  const thermoSource = path.join(configDir, 'thermodynamics.json');

  const jobRegistryRaw = await fs.readFile(jobRegistrySource, 'utf8');
  const jobRegistryConfig = JSON.parse(jobRegistryRaw) as Record<string, unknown>;
  jobRegistryConfig.taxPolicy = overrides.taxPolicy;

  const thermoRaw = await fs.readFile(thermoSource, 'utf8');
  const thermoConfig = JSON.parse(thermoRaw) as Record<string, any>;
  const rewardEngineConfig = {
    ...(thermoConfig.rewardEngine ?? {}),
    address: overrides.rewardEngine,
    thermostat: overrides.thermostat,
  };
  thermoConfig.rewardEngine = rewardEngineConfig;
  thermoConfig.thermostat = {
    ...(thermoConfig.thermostat ?? {}),
    address: overrides.thermostat,
  };

  const jobRegistryPath = path.join(configDir, `job-registry.${networkName}.json`);
  const thermodynamicsPath = path.join(
    configDir,
    `thermodynamics.${networkName}.json`
  );

  await fs.writeFile(
    jobRegistryPath,
    `${JSON.stringify(jobRegistryConfig, null, 2)}\n`,
    'utf8'
  );
  await fs.writeFile(
    thermodynamicsPath,
    `${JSON.stringify(thermoConfig, null, 2)}\n`,
    'utf8'
  );

  return { jobRegistryPath, thermodynamicsPath };
}

async function main(): Promise<void> {
  if (!LOCAL_NETWORKS.has(network.name)) {
    throw new Error(
      `Demo owner matrix config can only run on local networks (hardhat/localhost). Current: ${network.name}`
    );
  }

  const outputPath = resolveDemoAddressBookOutputPath();
  const payload = await bootstrapHardhatOwnerMatrix(outputPath);

  await writeDemoNetworkConfig(network.name, {
    taxPolicy: payload.taxPolicy,
    rewardEngine: payload.rewardEngine,
    thermostat: payload.thermostat,
  });

  console.log(`Demo owner matrix address book written to ${outputPath}`);
  console.table(payload);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('demoHardhatOwnerMatrixConfig failed:', error);
    process.exitCode = 1;
  });
}
