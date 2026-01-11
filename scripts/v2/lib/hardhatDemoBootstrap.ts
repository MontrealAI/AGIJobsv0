import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { artifacts, ethers, network, run } from 'hardhat';
import { writeDemoAddressBook } from './demoAddressBook';

const DEMO_BOOTSTRAP_ENV =
  process.env.AGJ_DEMO_BOOTSTRAP_HARDHAT ??
  process.env.THERMO_REPORT_BOOTSTRAP_HARDHAT ??
  process.env.THERMODYNAMICS_REPORT_BOOTSTRAP_HARDHAT ??
  process.env.OWNER_PLAN_BOOTSTRAP_HARDHAT;
const DEMO_NETWORKS = new Set(['hardhat', 'localhost']);

async function ensureDemoArtifacts(): Promise<void> {
  const requiredArtifacts = [
    'TaxPolicy',
    'Thermostat',
    'RewardEngineMB',
    'contracts/v2/mocks/RewardEngineMBMocks.sol:MockFeePool',
    'contracts/v2/mocks/RewardEngineMBMocks.sol:MockReputation',
    'contracts/v2/mocks/RewardEngineMBMocks.sol:MockEnergyOracle',
  ];

  for (const artifactName of requiredArtifacts) {
    try {
      await artifacts.readArtifact(artifactName);
    } catch (_) {
      if (!process.env.HARDHAT_FAST_COMPILE) {
        process.env.HARDHAT_FAST_COMPILE = '1';
      }
      if (process.env.HARDHAT_JOBREGISTRY_VIA_IR === undefined) {
        process.env.HARDHAT_JOBREGISTRY_VIA_IR = 'true';
      }
      await run('compile');
      return;
    }
  }
}

export async function bootstrapHardhatDemoConfig(
  configNetwork: string,
  notes?: string[],
  options: { force?: boolean } = {}
): Promise<void> {
  if (!options.force && !DEMO_BOOTSTRAP_ENV) {
    return;
  }
  if (!DEMO_NETWORKS.has(network.name)) {
    throw new Error(
      `Demo bootstrap is only supported on hardhat/localhost (current: ${network.name}).`
    );
  }

  const configDir = path.join(process.cwd(), 'config');
  const baseJobPath = path.join(configDir, 'job-registry.json');
  const baseThermoPath = path.join(configDir, 'thermodynamics.json');
  const baseTaxPath = path.join(configDir, 'tax-policy.json');

  const jobConfig = JSON.parse(fsSync.readFileSync(baseJobPath, 'utf8'));
  const thermoConfig = JSON.parse(fsSync.readFileSync(baseThermoPath, 'utf8'));
  const taxConfig = JSON.parse(fsSync.readFileSync(baseTaxPath, 'utf8'));

  await ensureDemoArtifacts();

  const [deployer] = await ethers.getSigners();

  const TaxPolicy = await ethers.getContractFactory('TaxPolicy');
  const policyUri = String(
    taxConfig?.policyURI ?? 'ipfs://demo-tax-policy'
  );
  const acknowledgement = String(
    taxConfig?.acknowledgement ??
      'Employers, agents, and validators accept full responsibility for all applicable taxes.'
  );
  const taxPolicy = await TaxPolicy.deploy(policyUri, acknowledgement);
  await taxPolicy.waitForDeployment();
  const taxPolicyAddress = await taxPolicy.getAddress();

  const thermostatSeed = thermoConfig?.thermostat ?? {};
  const bounds = thermostatSeed?.bounds ?? {};
  const systemTemperature = BigInt(
    thermostatSeed?.systemTemperature ?? '1000000000000000000'
  );
  const minTemp = BigInt(bounds?.min ?? '100000000000000000');
  const maxTemp = BigInt(bounds?.max ?? '5000000000000000000');

  const Thermostat = await ethers.getContractFactory('Thermostat');
  const thermostat = await Thermostat.deploy(
    systemTemperature,
    minTemp,
    maxTemp,
    deployer.address
  );
  await thermostat.waitForDeployment();
  const thermostatAddress = await thermostat.getAddress();

  const MockFeePool = await ethers.getContractFactory(
    'contracts/v2/mocks/RewardEngineMBMocks.sol:MockFeePool'
  );
  const MockReputation = await ethers.getContractFactory(
    'contracts/v2/mocks/RewardEngineMBMocks.sol:MockReputation'
  );
  const MockEnergyOracle = await ethers.getContractFactory(
    'contracts/v2/mocks/RewardEngineMBMocks.sol:MockEnergyOracle'
  );
  const mockFeePool = await MockFeePool.deploy();
  const mockReputation = await MockReputation.deploy();
  const mockEnergyOracle = await MockEnergyOracle.deploy();
  await Promise.all([
    mockFeePool.waitForDeployment(),
    mockReputation.waitForDeployment(),
    mockEnergyOracle.waitForDeployment(),
  ]);

  const RewardEngine = await ethers.getContractFactory('RewardEngineMB');
  const rewardEngine = await RewardEngine.deploy(
    thermostatAddress,
    await mockFeePool.getAddress(),
    await mockReputation.getAddress(),
    await mockEnergyOracle.getAddress(),
    deployer.address
  );
  await rewardEngine.waitForDeployment();
  const rewardEngineAddress = await rewardEngine.getAddress();

  jobConfig.taxPolicy = taxPolicyAddress;

  const rewardConfig = thermoConfig?.rewardEngine ?? {};
  const nextThermoConfig = {
    ...thermoConfig,
    rewardEngine: {
      ...rewardConfig,
      address: rewardEngineAddress,
      thermostat: thermostatAddress,
    },
    thermostat: {
      ...(thermoConfig?.thermostat ?? {}),
      address: thermostatAddress,
    },
  };

  await fs.writeFile(
    path.join(configDir, `job-registry.${configNetwork}.json`),
    `${JSON.stringify(jobConfig, null, 2)}\n`
  );
  await fs.writeFile(
    path.join(configDir, `thermodynamics.${configNetwork}.json`),
    `${JSON.stringify(nextThermoConfig, null, 2)}\n`
  );

  await writeDemoAddressBook({
    generatedAt: new Date().toISOString(),
    network: network.name,
    taxPolicy: taxPolicyAddress,
    rewardEngine: rewardEngineAddress,
    thermostat: thermostatAddress,
  });

  notes?.push(
    `Bootstrapped demo contracts: TaxPolicy ${taxPolicyAddress}, Thermostat ${thermostatAddress}, RewardEngineMB ${rewardEngineAddress}.`
  );
  notes?.push(
    `Generated config/job-registry.${configNetwork}.json and config/thermodynamics.${configNetwork}.json for demo runs.`
  );
  notes?.push(
    'Wrote deployment-config/generated/demo-hardhat-addresses.json for local demo address overrides.'
  );
}
