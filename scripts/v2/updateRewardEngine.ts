import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import { loadTokenConfig, loadRewardEngineConfig } from '../config';
import { buildRewardEnginePlan } from './lib/rewardEnginePlan';
import { describeArgs, sameAddress } from './lib/utils';

interface CliOptions {
  execute: boolean;
  configPath?: string;
  rewardEngineAddress?: string;
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
    } else if (arg === '--reward-engine' || arg === '--rewardEngine') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--reward-engine requires an address');
      }
      options.rewardEngineAddress = value;
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

  const {
    config: rewardConfig,
    path: rewardConfigPath,
    source: configSource,
  } = loadRewardEngineConfig({
    network: network.name,
    chainId: network.config?.chainId,
    path: cli.configPath,
  });

  const rewardEngineCandidate =
    cli.rewardEngineAddress ||
    rewardConfig.address ||
    tokenConfig.modules?.rewardEngine;
  if (!rewardEngineCandidate) {
    throw new Error('Reward engine address is not configured');
  }

  const rewardEngineAddress = ethers.getAddress(rewardEngineCandidate);
  if (rewardEngineAddress === ethers.ZeroAddress) {
    throw new Error('Reward engine address cannot be the zero address');
  }

  const rewardEngineRead = (await ethers.getContractAt(
    'contracts/v2/RewardEngineMB.sol:RewardEngineMB',
    rewardEngineAddress
  )) as Contract;

  const signer = await ethers.getSigner();
  const signerAddress = await signer.getAddress();
  const ownerAddress = await rewardEngineRead.owner();

  if (cli.execute && !sameAddress(ownerAddress, signerAddress)) {
    throw new Error(
      `Signer ${signerAddress} is not the governance owner ${ownerAddress}`
    );
  }

  if (!sameAddress(ownerAddress, signerAddress)) {
    console.warn(
      `Warning: connected signer ${signerAddress} is not the governance owner ${ownerAddress}. Running in dry-run mode.`
    );
  }

  const rewardEngine = rewardEngineRead.connect(signer);

  const plan = await buildRewardEnginePlan({
    rewardEngine,
    config: rewardConfig,
    configPath: rewardConfigPath,
  });

  if (cli.json) {
    const { contract: _contract, ...serialisable } = plan;
    console.log(
      JSON.stringify(
        {
          ...serialisable,
          source: configSource,
        },
        null,
        2
      )
    );
    return;
  }

  console.log('RewardEngineMB:', rewardEngineAddress);
  console.log('Configuration file:', rewardConfigPath);
  if (configSource === 'thermodynamics') {
    console.log('Configuration source: thermodynamics (rewardEngine section)');
  } else {
    console.log('Configuration source: reward-engine');
  }

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
      '\nDry run complete. Re-run with --execute once governance is ready to submit transactions.'
    );
    return;
  }

  console.log('\nSubmitting transactions...');
  for (const action of plan.actions) {
    console.log(`Executing ${action.method}...`);
    const tx = await (rewardEngine as any)[action.method](...action.args);
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
