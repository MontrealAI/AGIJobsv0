#!/usr/bin/env ts-node

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ethers, network } from 'hardhat';
import { loadTokenConfig } from '../config';

type Action = 'pause' | 'unpause';

type CliOptions = {
  action?: Action;
  dryRun: boolean;
  autoYes: boolean;
  from?: string;
  signerIndex?: number;
};

function parseAction(value: string | undefined): Action | undefined {
  if (!value) {
    return undefined;
  }
  const normalised = value.trim().toLowerCase();
  switch (normalised) {
    case 'pause':
    case 'pause-all':
    case 'halt':
      return 'pause';
    case 'unpause':
    case 'unpause-all':
    case 'resume':
    case 'resume-all':
      return 'unpause';
    default:
      throw new Error(
        `Unsupported action "${value}". Use "pause" or "unpause".`
      );
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    autoYes: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--action':
      case '-a': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        options.action = parseAction(value);
        i += 1;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--yes':
      case '--auto-yes':
      case '--force':
        options.autoYes = true;
        break;
      case '--from': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--from requires an address');
        }
        options.from = value;
        i += 1;
        break;
      }
      case '--signer-index': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--signer-index requires a numeric value');
        }
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new Error('--signer-index must be a non-negative integer');
        }
        options.signerIndex = parsed;
        i += 1;
        break;
      }
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option ${arg}`);
        }
        break;
    }
  }

  return options;
}

function normaliseAddress(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is missing`);
  }
  try {
    return ethers.getAddress(value);
  } catch (error) {
    throw new Error(`${label} is not a valid address: ${value}`);
  }
}

async function prompt(question: string, autoYes: boolean): Promise<boolean> {
  if (autoYes) {
    return true;
  }
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`${question} [y/N] `);
  await rl.close();
  const response = answer.trim().toLowerCase();
  if (!response) {
    return false;
  }
  return response === 'y' || response === 'yes';
}

async function selectSigner(options: CliOptions) {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error('No signers available. Configure private keys in hardhat.config.js or via environment variables.');
  }

  if (options.from) {
    const target = normaliseAddress(options.from, 'from');
    for (const signer of signers) {
      const address = await signer.getAddress();
      if (ethers.getAddress(address) === target) {
        return signer;
      }
    }
    throw new Error(
      `No signer available for ${target}. Export the matching private key or specify --signer-index.`
    );
  }

  const index = options.signerIndex ?? 0;
  if (index >= signers.length) {
    throw new Error(
      `Signer index ${index} out of range. Only ${signers.length} signer(s) available.`
    );
  }
  return signers[index];
}

async function execute(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.action) {
    throw new Error('Missing --action. Use --action pause or --action unpause.');
  }

  const networkName = network.name;
  const tokenConfig = loadTokenConfig({ network: networkName });
  const systemPauseAddress = tokenConfig?.config?.modules?.systemPause;
  const pauseAddress = normaliseAddress(
    systemPauseAddress,
    'SystemPause address (config.modules.systemPause)'
  );

  const pause = await ethers.getContractAt('SystemPause', pauseAddress);
  const governance = await pause.governance();
  const governanceAddress = ethers.getAddress(governance);
  const paused = await pause.paused();

  const signer = await selectSigner(options);
  const signerAddress = ethers.getAddress(await signer.getAddress());

  if (governanceAddress !== ethers.ZeroAddress) {
    if (signerAddress !== governanceAddress) {
      throw new Error(
        `Signer ${signerAddress} is not the SystemPause governance (${governanceAddress}). ` +
          'Configure the correct private key (e.g. GOVERNANCE_PRIVATE_KEY) and retry.'
      );
    }
  }

  const targetState = options.action === 'pause';
  if (targetState === paused && !options.dryRun) {
    throw new Error(
      `SystemPause is already ${paused ? 'paused' : 'unpaused'}. ` +
        'Use --dry-run to verify permissions or choose the opposite action.'
    );
  }

  const method = options.action === 'pause' ? 'pauseAll' : 'unpauseAll';

  console.log('SystemPause control action');
  console.log('--------------------------');
  console.log(`Network          : ${networkName}`);
  console.log(`SystemPause      : ${pauseAddress}`);
  console.log(`Governance signer: ${signerAddress}`);
  console.log(`Current state    : ${paused ? 'paused' : 'live'}`);
  console.log(`Requested action : ${method}`);
  console.log('');

  if (options.dryRun) {
    await pause.connect(signer)[method].staticCall();
    console.log('✅ Dry run successful. Signer can execute the requested action.');
    return;
  }

  const confirmed = await prompt('Proceed with the transaction?', options.autoYes);
  if (!confirmed) {
    console.log('Aborted by operator. No transaction sent.');
    return;
  }

  const tx = await pause.connect(signer)[method]();
  console.log(`⏳ Transaction submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`✅ Completed in block ${receipt.blockNumber}.`);
}

execute().catch((error) => {
  console.error('owner:system-pause failed:', error);
  process.exitCode = 1;
});
