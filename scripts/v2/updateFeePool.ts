import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import { loadTokenConfig, loadFeePoolConfig } from '../config';
import { buildFeePoolPlan, type FeePoolPlanInput } from './lib/feePoolPlan';
import { describeArgs, sameAddress } from './lib/utils';

interface CliOptions {
  execute: boolean;
  configPath?: string;
  feePoolAddress?: string;
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
    } else if (arg === '--fee-pool' || arg === '--feePool') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--fee-pool requires an address');
      }
      options.feePoolAddress = value;
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    }
  }
  return options;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const { config: tokenConfig } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });
  const { config: feeConfig, path: feeConfigPath } = loadFeePoolConfig({
    network: network.name,
    chainId: network.config?.chainId,
    path: cli.configPath,
  });

  const feePoolCandidate = cli.feePoolAddress || tokenConfig.modules?.feePool;
  if (!feePoolCandidate) {
    throw new Error('Fee pool address is not configured');
  }
  const feePoolAddress = ethers.getAddress(feePoolCandidate);
  if (feePoolAddress === ethers.ZeroAddress) {
    throw new Error('Fee pool address cannot be the zero address');
  }

  const feePool = (await ethers.getContractAt(
    'contracts/v2/FeePool.sol:FeePool',
    feePoolAddress
  )) as Contract;

  const version = await feePool.version();
  if (version !== 2n) {
    throw new Error(
      `FeePool at ${feePoolAddress} reports version ${version}, expected 2`
    );
  }

  const signer = await ethers.getSigner();
  const ownerAddress = await feePool.owner();
  const signerAddress = await signer.getAddress();

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

  const planInput: FeePoolPlanInput = {
    feePool,
    config: feeConfig,
    configPath: feeConfigPath,
    ownerAddress,
  };
  const plan = await buildFeePoolPlan(planInput);

  if (cli.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  console.log('FeePool:', feePoolAddress);
  console.log('Configuration file:', feeConfigPath);

  if (plan.actions.length === 0) {
    console.log('All tracked parameters already match the configuration.');
    return;
  }

  console.log(`Planned actions (${plan.actions.length}):`);
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
    const tx = await (feePool as any)[action.method](...action.args);
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
