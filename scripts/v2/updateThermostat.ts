import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import { loadThermostatConfig, loadTokenConfig } from '../config';
import { buildThermostatPlan } from './lib/thermostatPlan';
import { describeArgs, sameAddress } from './lib/utils';

type ThermostatConfig = ReturnType<typeof loadThermostatConfig>['config'];

interface CliOptions {
  execute: boolean;
  configPath?: string;
  thermostatAddress?: string;
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
    } else if (arg === '--thermostat') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--thermostat requires an address');
      }
      options.thermostatAddress = value;
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    }
  }
  return options;
}

function resolveThermostatAddress(
  cli: CliOptions,
  thermostatConfig: ThermostatConfig,
  linkedRewardEngineThermostat: string | undefined,
  tokenModules?: Record<string, string | undefined>
): string {
  const candidate =
    cli.thermostatAddress ||
    thermostatConfig.address ||
    linkedRewardEngineThermostat ||
    tokenModules?.thermostat;

  if (!candidate) {
    throw new Error('Thermostat address is not configured');
  }

  const address = ethers.getAddress(candidate);
  if (address === ethers.ZeroAddress) {
    throw new Error('Thermostat address cannot be the zero address');
  }
  return address;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const { config: tokenConfig } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });

  const {
    config: thermostatConfig,
    path: thermostatConfigPath,
    source: configSource,
    rewardEngineThermostat,
  } = loadThermostatConfig({
    network: network.name,
    chainId: network.config?.chainId,
    path: cli.configPath,
  });

  const thermostatAddress = resolveThermostatAddress(
    cli,
    thermostatConfig,
    rewardEngineThermostat,
    tokenConfig.modules
  );

  const thermostatRead = (await ethers.getContractAt(
    'contracts/v2/Thermostat.sol:Thermostat',
    thermostatAddress
  )) as Contract;

  const signer = await ethers.getSigner();
  const signerAddress = await signer.getAddress();
  const governanceAddress = await thermostatRead.owner();

  if (cli.execute && !sameAddress(governanceAddress, signerAddress)) {
    throw new Error(
      `Signer ${signerAddress} is not the governance owner ${governanceAddress}`
    );
  }

  if (!sameAddress(governanceAddress, signerAddress)) {
    console.warn(
      `Warning: connected signer ${signerAddress} is not the governance owner ${governanceAddress}. Running in dry-run mode.`
    );
  }

  const thermostat = thermostatRead.connect(signer);

  const plan = await buildThermostatPlan({
    thermostat,
    config: thermostatConfig,
    configPath: thermostatConfigPath,
  });

  if (cli.json) {
    const { contract: _contract, iface: _iface, ...serialisable } = plan;
    console.log(
      JSON.stringify(
        {
          ...serialisable,
          source: configSource,
          governance: governanceAddress,
        },
        null,
        2
      )
    );
    return;
  }

  console.log('Thermostat:', thermostatAddress);
  console.log('Configuration file:', thermostatConfigPath);
  if (configSource === 'thermodynamics') {
    console.log('Configuration source: thermodynamics (thermostat section)');
  } else {
    console.log('Configuration source: thermostat');
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

  if (!cli.execute || !sameAddress(governanceAddress, signerAddress)) {
    console.log(
      '\nDry run complete. Re-run with --execute once governance is ready to submit transactions.'
    );
    return;
  }

  console.log('\nSubmitting transactions...');
  for (const action of plan.actions) {
    console.log(`Executing ${action.method}...`);
    const tx = await (thermostat as any)[action.method](...action.args);
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
