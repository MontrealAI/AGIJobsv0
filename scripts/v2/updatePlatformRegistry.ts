import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import { loadPlatformRegistryConfig, loadTokenConfig } from '../config';
import {
  buildPlatformRegistryPlan,
  describePlatformRegistryPlan,
  type PlatformRegistryPlanInput,
} from './lib/platformRegistryPlan';
import { sameAddress } from './lib/utils';

interface CliOptions {
  execute: boolean;
  configPath?: string;
  platformRegistryAddress?: string;
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
    } else if (arg === '--platform-registry' || arg === '--platformRegistry') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--platform-registry requires an address');
      }
      options.platformRegistryAddress = value;
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    }
  }
  return options;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));

  const { config: tokenConfig } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });

  const { config: registryConfig, path: configPath } =
    loadPlatformRegistryConfig({
      network: network.name,
      chainId: network.config?.chainId,
      path: cli.configPath,
    });

  const decimals =
    typeof tokenConfig.decimals === 'number' ? tokenConfig.decimals : 18;
  const symbol =
    typeof tokenConfig.symbol === 'string' && tokenConfig.symbol
      ? tokenConfig.symbol
      : 'tokens';

  const registryCandidate =
    cli.platformRegistryAddress ||
    registryConfig.address ||
    tokenConfig.modules?.platformRegistry;
  if (!registryCandidate) {
    throw new Error('Platform registry address is not configured');
  }
  const platformRegistryAddress = ethers.getAddress(registryCandidate);
  if (platformRegistryAddress === ethers.ZeroAddress) {
    throw new Error('Platform registry address cannot be the zero address');
  }

  const platformRegistry = (await ethers.getContractAt(
    'contracts/v2/PlatformRegistry.sol:PlatformRegistry',
    platformRegistryAddress
  )) as Contract;

  const signer = await ethers.getSigner();
  const signerAddress = await signer.getAddress();
  const ownerAddress = await platformRegistry.owner();

  if (cli.execute && !sameAddress(ownerAddress, signerAddress)) {
    throw new Error(
      `Signer ${signerAddress} is not the governance owner ${ownerAddress}`
    );
  }

  if (!sameAddress(ownerAddress, signerAddress)) {
    console.warn(
      `Warning: connected signer ${signerAddress} is not the governance owner ${ownerAddress}. ` +
        'Running in dry-run mode.'
    );
  }

  const planInput: PlatformRegistryPlanInput = {
    platformRegistry,
    config: registryConfig,
    configPath,
    decimals,
    symbol,
    ownerAddress,
  };
  const plan = await buildPlatformRegistryPlan(planInput);

  if (cli.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  describePlatformRegistryPlan(plan);

  if (plan.actions.length === 0) {
    return;
  }

  if (!cli.execute || !sameAddress(ownerAddress, signerAddress)) {
    console.log(
      '\nDry run complete. Re-run with --execute once ready to submit transactions.'
    );
    return;
  }

  console.log('\nSubmitting transactions...');
  for (const action of plan.actions) {
    console.log(`Executing ${action.label}...`);
    const tx = await (platformRegistry as any)[action.method](...action.args);
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
  process.exit(1);
});
