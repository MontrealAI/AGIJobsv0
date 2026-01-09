import { promises as fs } from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';

const LOCAL_NETWORKS = new Set(['hardhat', 'localhost']);
const DEFAULT_OUTPUT = path.join(
  process.cwd(),
  'deployment-config',
  'generated',
  'demo-hardhat-addresses.json'
);

function resolveOutputPath(): string {
  const override = process.env.OWNER_MATRIX_DEMO_ADDRESS_BOOK;
  if (!override || override.trim().length === 0) {
    return DEFAULT_OUTPUT;
  }
  const trimmed = override.trim();
  return path.isAbsolute(trimmed)
    ? trimmed
    : path.join(process.cwd(), trimmed);
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

  const outputPath = resolveOutputPath();
  const payload = {
    generatedAt: new Date().toISOString(),
    network: network.name,
    taxPolicy: await taxPolicy.getAddress(),
    rewardEngine: await rewardEngine.getAddress(),
    thermostat: await thermostat.getAddress(),
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`Demo owner matrix address book written to ${outputPath}`);
  console.table(payload);
}

main().catch((error) => {
  console.error('demoHardhatOwnerMatrixConfig failed:', error);
  process.exitCode = 1;
});
