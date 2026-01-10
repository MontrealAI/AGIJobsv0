import { promises as fs } from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';
import {
  resolveDemoAddressBookOutputPath,
  writeDemoAddressBook,
} from './lib/demoAddressBook';

const LOCAL_NETWORKS = new Set(['hardhat', 'localhost']);
interface DemoAddressOverrides {
  taxPolicy: string;
  rewardEngine: string;
  thermostat: string;
}

async function loadThermostatConfig(): Promise<{ temp: bigint; min: bigint; max: bigint }> {
  const configPath = path.join(process.cwd(), 'config', 'thermodynamics.json');
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, any>;
  const thermostat = parsed.thermostat ?? {};
  const tempRaw = thermostat.systemTemperature ?? thermostat.temperature ?? '1000000000000000000';
  const bounds = thermostat.bounds ?? {};
  const minRaw = bounds.min ?? '100000000000000000';
  const maxRaw = bounds.max ?? '5000000000000000000';
  return {
    temp: BigInt(tempRaw),
    min: BigInt(minRaw),
    max: BigInt(maxRaw),
  };
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

  const [deployer] = await ethers.getSigners();

  const taxPolicyFactory = await ethers.getContractFactory(
    'contracts/v2/TaxPolicy.sol:TaxPolicy'
  );
  const taxPolicy = await taxPolicyFactory.deploy(
    'ipfs://demo-tax-policy',
    'Hardhat demo tax policy acknowledgement.'
  );
  await taxPolicy.waitForDeployment();

  const { temp, min, max } = await loadThermostatConfig();
  const thermostatFactory = await ethers.getContractFactory(
    'contracts/v2/Thermostat.sol:Thermostat'
  );
  const thermostat = await thermostatFactory.deploy(
    temp,
    min,
    max,
    deployer.address
  );
  await thermostat.waitForDeployment();

  const mockFeePoolFactory = await ethers.getContractFactory(
    'contracts/v2/mocks/RewardEngineMBMocks.sol:MockFeePool'
  );
  const mockReputationFactory = await ethers.getContractFactory(
    'contracts/v2/mocks/RewardEngineMBMocks.sol:MockReputation'
  );
  const mockOracleFactory = await ethers.getContractFactory(
    'contracts/v2/mocks/RewardEngineMBMocks.sol:MockEnergyOracle'
  );

  const feePool = await mockFeePoolFactory.deploy();
  const reputation = await mockReputationFactory.deploy();
  const energyOracle = await mockOracleFactory.deploy();

  await Promise.all([
    feePool.waitForDeployment(),
    reputation.waitForDeployment(),
    energyOracle.waitForDeployment(),
  ]);

  const rewardEngineFactory = await ethers.getContractFactory(
    'contracts/v2/RewardEngineMB.sol:RewardEngineMB'
  );
  const rewardEngine = await rewardEngineFactory.deploy(
    await thermostat.getAddress(),
    await feePool.getAddress(),
    await reputation.getAddress(),
    await energyOracle.getAddress(),
    deployer.address
  );
  await rewardEngine.waitForDeployment();

  const payload = {
    generatedAt: new Date().toISOString(),
    network: network.name,
    taxPolicy: await taxPolicy.getAddress(),
    rewardEngine: await rewardEngine.getAddress(),
    thermostat: await thermostat.getAddress(),
  };

  await writeDemoNetworkConfig(network.name, {
    taxPolicy: payload.taxPolicy,
    rewardEngine: payload.rewardEngine,
    thermostat: payload.thermostat,
  });

  const outputPath = resolveDemoAddressBookOutputPath();
  await writeDemoAddressBook(payload, outputPath);

  console.log(`Demo owner matrix address book written to ${outputPath}`);
  console.table(payload);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('demoHardhatOwnerMatrixConfig failed:', error);
    process.exitCode = 1;
  });
}
