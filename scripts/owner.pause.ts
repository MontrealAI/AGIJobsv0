import hre from 'hardhat';

interface PauseArgs {
  arena?: string;
  stakeManager?: string;
  systemPause?: string;
  action: 'pause' | 'unpause';
  dryRun: boolean;
}

function parseArgs(): PauseArgs {
  const args: PauseArgs = { action: 'pause', dryRun: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--arena':
        if (!next) throw new Error('--arena <address> is required');
        args.arena = next;
        i += 1;
        break;
      case '--stake-manager':
        if (!next) throw new Error('--stake-manager <address> is required');
        args.stakeManager = next;
        i += 1;
        break;
      case '--system-pause':
        if (!next) throw new Error('--system-pause <address> is required');
        args.systemPause = next;
        i += 1;
        break;
      case '--unpause':
        args.action = 'unpause';
        break;
      case '--pause':
        args.action = 'pause';
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.arena && !args.stakeManager && !args.systemPause) {
    throw new Error('Provide at least one contract via --arena, --stake-manager, or --system-pause.');
  }
  return args;
}

async function maybeSend(txPromise: () => Promise<any>, dryRun: boolean, description: string) {
  if (dryRun) {
    console.log(`ℹ️  [dry-run] ${description}`);
    return;
  }
  const tx = await txPromise();
  console.log(`⏳ ${description} → ${tx.hash}`);
  await tx.wait();
  console.log(`✅ ${description} confirmed`);
}

async function handleArena(args: PauseArgs) {
  if (!args.arena) return;
  const { ethers } = hre as any;
  const [signer] = await ethers.getSigners();
  const arenaAbi = ['function pause()', 'function unpause()', 'function paused() view returns (bool)'];
  const arena = new ethers.Contract(args.arena, arenaAbi, signer);
  const paused = await arena.paused();
  if (args.action === 'pause') {
    if (paused) {
      console.log('ℹ️  Arena already paused.');
      return;
    }
    await maybeSend(() => arena.pause(), args.dryRun, 'Pause SelfPlayArena');
  } else {
    if (!paused) {
      console.log('ℹ️  Arena already active.');
      return;
    }
    await maybeSend(() => arena.unpause(), args.dryRun, 'Unpause SelfPlayArena');
  }
}

async function handleStakeManager(args: PauseArgs) {
  if (!args.stakeManager) return;
  const { ethers } = hre as any;
  const [signer] = await ethers.getSigners();
  const stakeAbi = ['function pause()', 'function unpause()', 'function paused() view returns (bool)'];
  const stakeManager = new ethers.Contract(args.stakeManager, stakeAbi, signer);
  const paused = await stakeManager.paused();
  if (args.action === 'pause') {
    if (paused) {
      console.log('ℹ️  StakeManager already paused.');
      return;
    }
    await maybeSend(() => stakeManager.pause(), args.dryRun, 'Pause StakeManager');
  } else {
    if (!paused) {
      console.log('ℹ️  StakeManager already active.');
      return;
    }
    await maybeSend(() => stakeManager.unpause(), args.dryRun, 'Unpause StakeManager');
  }
}

async function handleSystemPause(args: PauseArgs) {
  if (!args.systemPause) return;
  const { ethers } = hre as any;
  const [signer] = await ethers.getSigners();
  const systemAbi = [
    'function pause()',
    'function unpause()',
    'function paused() view returns (bool)',
  ];
  const systemPause = new ethers.Contract(args.systemPause, systemAbi, signer);
  const paused = await systemPause.paused();
  if (args.action === 'pause') {
    if (paused) {
      console.log('ℹ️  SystemPause already engaged.');
      return;
    }
    await maybeSend(() => systemPause.pause(), args.dryRun, 'Activate SystemPause');
  } else {
    if (!paused) {
      console.log('ℹ️  SystemPause already inactive.');
      return;
    }
    await maybeSend(() => systemPause.unpause(), args.dryRun, 'Deactivate SystemPause');
  }
}

async function main() {
  const args = parseArgs();
  console.log(`🔧 ${args.action === 'pause' ? 'Pausing' : 'Resuming'} contracts in ${args.dryRun ? 'dry-run' : 'live'} mode.`);
  await handleArena(args);
  await handleStakeManager(args);
  await handleSystemPause(args);
}

main().catch((error) => {
  console.error('Failed to toggle pause state:', error);
  process.exitCode = 1;
});

