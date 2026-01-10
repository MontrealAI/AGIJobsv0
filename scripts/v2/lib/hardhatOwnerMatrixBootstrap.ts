import { promises as fs } from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';
import { resolveDemoAddressBookOutputPath, writeDemoAddressBook } from './demoAddressBook';

const LOCAL_NETWORKS = new Set(['hardhat', 'localhost']);

export interface DemoAddressOverrides {
  taxPolicy: string;
  rewardEngine: string;
  thermostat: string;
}

export interface DemoAddressBookPayload {
  generatedAt: string;
  network: string;
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

export async function deployHardhatOwnerMatrixContracts(): Promise<DemoAddressOverrides> {
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
  const thermostat = await thermostatFactory.deploy(temp, min, max, deployer.address);
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

  return {
    taxPolicy: await taxPolicy.getAddress(),
    rewardEngine: await rewardEngine.getAddress(),
    thermostat: await thermostat.getAddress(),
  };
}

export async function bootstrapHardhatOwnerMatrix(
  addressBookPath?: string
): Promise<DemoAddressBookPayload> {
  if (!LOCAL_NETWORKS.has(network.name)) {
    throw new Error(
      `Demo owner matrix bootstrap can only run on local networks (hardhat/localhost). Current: ${network.name}`
    );
  }

  const overrides = await deployHardhatOwnerMatrixContracts();
  const payload: DemoAddressBookPayload = {
    generatedAt: new Date().toISOString(),
    network: network.name,
    taxPolicy: overrides.taxPolicy,
    rewardEngine: overrides.rewardEngine,
    thermostat: overrides.thermostat,
  };

  const outputPath = addressBookPath ?? resolveDemoAddressBookOutputPath();
  await writeDemoAddressBook(payload, outputPath);
  return payload;
}
