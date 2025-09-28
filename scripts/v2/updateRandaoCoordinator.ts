import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import {
  loadTokenConfig,
  loadRandaoCoordinatorConfig,
  type RandaoCoordinatorConfig
} from '../config';
import { buildRandaoCoordinatorPlan } from './lib/randaoCoordinatorPlan';
import { describeArgs, sameAddress } from './lib/utils';

interface CliOptions {
  execute: boolean;
  configPath?: string;
  address?: string;
  json?: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { execute: false, json: false };
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
    } else if (arg === '--address') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--address requires a contract address');
      }
      options.address = value;
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    }
  }
  return options;
}

function resolveConfigAddress(config: RandaoCoordinatorConfig): string | undefined {
  if (!config.address) {
    return undefined;
  }
  try {
    return ethers.getAddress(config.address);
  } catch (error) {
    throw new Error(`Invalid RandaoCoordinator address in config: ${config.address}`);
  }
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const { config: tokenConfig } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId
  });

  const { config, path: configPath } = loadRandaoCoordinatorConfig({
    network: network.name,
    chainId: network.config?.chainId,
    path: cli.configPath
  });

  const candidateAddress =
    cli.address || resolveConfigAddress(config) || tokenConfig.modules?.randaoCoordinator;
  if (!candidateAddress) {
    throw new Error(
      'RandaoCoordinator address not provided. Supply --address or set "address" in the configuration.'
    );
  }
  const randaoAddress = ethers.getAddress(candidateAddress);
  if (randaoAddress === ethers.ZeroAddress) {
    throw new Error('RandaoCoordinator address cannot be the zero address');
  }

  const randao = (await ethers.getContractAt(
    'contracts/v2/RandaoCoordinator.sol:RandaoCoordinator',
    randaoAddress
  )) as Contract;

  const signer = await ethers.getSigner();
  const signerAddress = await signer.getAddress();
  const ownerAddress = await randao.owner();

  if (cli.execute && !sameAddress(ownerAddress, signerAddress)) {
    throw new Error(
      `Signer ${signerAddress} is not the RandaoCoordinator owner ${ownerAddress}`
    );
  }

  if (!sameAddress(ownerAddress, signerAddress)) {
    console.warn(
      `Warning: connected signer ${signerAddress} is not the RandaoCoordinator owner ${ownerAddress}. Running in dry-run mode.`
    );
  }

  const plan = await buildRandaoCoordinatorPlan({
    randao: randao.connect(signer),
    config,
    configPath
  });

  if (cli.json) {
    const { contract: _contract, iface: _iface, ...serialisable } = plan;
    console.log(JSON.stringify(serialisable, null, 2));
    return;
  }

  console.log('RandaoCoordinator:', randaoAddress);
  console.log('Configuration file:', configPath);

  if (plan.warnings?.length) {
    console.log('\nWarnings:');
    for (const warning of plan.warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (plan.actions.length === 0) {
    console.log('\nAll tracked parameters already match the configuration.');
    return;
  }

  console.log(`\nPlanned actions (${plan.actions.length}):`);
  plan.actions.forEach((action, index) => {
    console.log(`\n${index + 1}. ${action.label}`);
    if (action.current !== undefined) {
      console.log(`   Current: ${action.current}`);
    }
    if (action.desired !== undefined) {
      console.log(`   Desired: ${action.desired}`);
    }
    console.log(`   Method: ${action.method}(${describeArgs(action.args)})`);
    if (plan.iface) {
      const data = plan.iface.encodeFunctionData(action.method, action.args);
      console.log(`   Calldata: ${data}`);
    }
  });

  if (!cli.execute || !sameAddress(ownerAddress, signerAddress)) {
    console.log('\nDry run complete. Re-run with --execute once ready to submit transactions.');
    return;
  }

  console.log('\nSubmitting transactions...');
  for (const action of plan.actions) {
    console.log(`Executing ${action.method}...`);
    const tx = await (randao as any)[action.method](...action.args);
    console.log(`   Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt?.status !== 1n) {
      throw new Error(`Transaction for ${action.method} failed`);
    }
    console.log('   Confirmed');
  }
  console.log('All transactions confirmed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
