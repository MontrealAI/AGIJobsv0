import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import {
  loadTokenConfig,
  loadEnergyOracleConfig,
  type EnergyOracleConfig,
} from '../config';
import { buildEnergyOraclePlan } from './lib/energyOraclePlan';
import { describeArgs, sameAddress } from './lib/utils';

interface CliOptions {
  execute: boolean;
  configPath?: string;
  oracleAddress?: string;
  json?: boolean;
  keepExtras?: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { execute: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute') {
      options.execute = true;
    } else if (arg === '--config') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--config requires a file path');
      }
      options.configPath = value;
      i += 1;
    } else if (arg === '--oracle' || arg === '--energy-oracle') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--oracle requires an address');
      }
      options.oracleAddress = value;
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--keep-extras') {
      options.keepExtras = true;
    } else if (arg === '--prune-extras' || arg === '--no-keep-extras') {
      options.keepExtras = false;
    }
  }
  return options;
}

const ENV_ORACLE_KEYS = [
  'ENERGY_ORACLE_ADDRESS',
  'ENERGY_ORACLE',
  'AGI_ENERGY_ORACLE',
  'AGJ_ENERGY_ORACLE',
  'AGIALPHA_ENERGY_ORACLE',
  'AGIALPHA_ORACLE',
];

function readEnvOracleCandidate(): string | undefined {
  for (const key of ENV_ORACLE_KEYS) {
    const value = process.env[key];
    if (value !== undefined && value !== null) {
      const trimmed = String(value).trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function resolveOracleAddress(
  tokenConfigModules: Record<string, string> | undefined,
  tokenConfigContracts: Record<string, string> | undefined,
  cliCandidate?: string,
  envCandidate?: string
): string | undefined {
  if (cliCandidate) {
    return cliCandidate;
  }
  if (envCandidate) {
    return envCandidate;
  }
  if (tokenConfigModules?.energyOracle) {
    return tokenConfigModules.energyOracle;
  }
  if (tokenConfigContracts?.energyOracle) {
    return tokenConfigContracts.energyOracle;
  }
  if (tokenConfigModules?.oracle) {
    return tokenConfigModules.oracle;
  }
  if (tokenConfigContracts?.oracle) {
    return tokenConfigContracts.oracle;
  }
  return undefined;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const { config: tokenConfig } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });

  const {
    config: energyConfig,
    path: energyConfigPath,
  }: { config: EnergyOracleConfig; path: string } = loadEnergyOracleConfig({
    network: network.name,
    chainId: network.config?.chainId,
    path: cli.configPath,
  });

  const envOracle = readEnvOracleCandidate();
  const oracleCandidate = resolveOracleAddress(
    tokenConfig.modules,
    tokenConfig.contracts,
    cli.oracleAddress,
    envOracle
  );
  if (!oracleCandidate) {
    throw new Error('Energy oracle address is not configured');
  }

  const energyOracleAddress = ethers.getAddress(oracleCandidate);
  if (energyOracleAddress === ethers.ZeroAddress) {
    throw new Error('Energy oracle address cannot be the zero address');
  }

  const energyOracle = (await ethers.getContractAt(
    'contracts/v2/EnergyOracle.sol:EnergyOracle',
    energyOracleAddress
  )) as Contract;

  const signers = await ethers.getSigners();
  const signer = signers[0];
  if (!signer) {
    throw new Error('No signer accounts available on the selected network');
  }
  const signerAddress = await signer.getAddress();
  const ownerAddress = await energyOracle.owner();

  if (cli.execute && !sameAddress(ownerAddress, signerAddress)) {
    throw new Error(
      `Signer ${signerAddress} is not the contract owner ${ownerAddress}`
    );
  }

  if (!sameAddress(ownerAddress, signerAddress)) {
    console.warn(
      `Warning: connected signer ${signerAddress} is not the contract owner ${ownerAddress}. ` +
        'Running in dry-run mode.'
    );
  }

  const plan = await buildEnergyOraclePlan({
    oracle: energyOracle,
    config: energyConfig,
    configPath: energyConfigPath,
    ownerAddress,
    retainUnknown: cli.keepExtras,
  });

  if (cli.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  console.log('EnergyOracle:', energyOracleAddress);
  console.log('Configuration file:', energyConfigPath);
  console.log('Governance (owner):', ownerAddress);
  console.log('Connected signer:', signerAddress);

  if (plan.metadata) {
    const metadata = plan.metadata as Record<string, unknown>;
    if (Array.isArray(metadata.currentSigners)) {
      console.log(
        `Current signers (${metadata.currentSigners.length}): ${metadata.currentSigners.join(', ')}`
      );
    }
    if (Array.isArray(metadata.desiredSigners)) {
      console.log(
        `Desired signers (${metadata.desiredSigners.length}): ${metadata.desiredSigners.join(', ')}`
      );
    }
    if (metadata.retainUnknown !== undefined) {
      console.log(
        `Retain unknown signers: ${metadata.retainUnknown ? 'yes' : 'no'}`
      );
    }
  }

  if (plan.warnings?.length) {
    console.log('\nWarnings:');
    plan.warnings.forEach((warning) => console.log(` - ${warning}`));
  }

  if (plan.actions.length === 0) {
    console.log('All tracked parameters already match the configuration.');
    return;
  }

  console.log(`\nPlanned actions (${plan.actions.length}):`);
  plan.actions.forEach((action, index) => {
    const data = plan.iface?.encodeFunctionData(action.method, action.args);
    console.log(`\n${index + 1}. ${action.label}`);
    if (action.current !== undefined) {
      console.log(`   Current: ${action.current}`);
    }
    if (action.desired !== undefined) {
      console.log(`   Desired: ${action.desired}`);
    }
    action.notes?.forEach((note) => {
      console.log(`   Note: ${note}`);
    });
    console.log(`   Method: ${action.method}(${describeArgs(action.args)})`);
    if (data) {
      console.log(`   Calldata: ${data}`);
    }
  });

  if (!cli.execute || !sameAddress(ownerAddress, signerAddress)) {
    console.log(
      '\nDry run complete. Re-run with --execute once ready to submit transactions.'
    );
    return;
  }

  console.log('\nSubmitting transactions...');
  for (const action of plan.actions) {
    console.log(`Executing ${action.method}...`);
    const tx = await (energyOracle as any)[action.method](...action.args);
    console.log(`   Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt?.status !== 1n) {
      throw new Error(`Transaction for ${action.method} failed`);
    }
    console.log('   Confirmed');
  }
  console.log('All transactions confirmed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
