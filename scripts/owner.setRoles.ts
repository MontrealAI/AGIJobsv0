import hre from 'hardhat';

interface RoleArgs {
  arena?: string;
  stakeManager?: string;
  allowOrchestrators: string[];
  revokeOrchestrators: string[];
  allowLockManagers: string[];
  revokeLockManagers: string[];
  dryRun: boolean;
}

function parseArgs(): RoleArgs {
  const args: RoleArgs = {
    allowOrchestrators: [],
    revokeOrchestrators: [],
    allowLockManagers: [],
    revokeLockManagers: [],
    dryRun: false,
  };
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
      case '--allow-orchestrator':
        if (!next) throw new Error('--allow-orchestrator <address>');
        args.allowOrchestrators.push(next);
        i += 1;
        break;
      case '--revoke-orchestrator':
        if (!next) throw new Error('--revoke-orchestrator <address>');
        args.revokeOrchestrators.push(next);
        i += 1;
        break;
      case '--allow-lock-manager':
        if (!next) throw new Error('--allow-lock-manager <address>');
        args.allowLockManagers.push(next);
        i += 1;
        break;
      case '--revoke-lock-manager':
        if (!next) throw new Error('--revoke-lock-manager <address>');
        args.revokeLockManagers.push(next);
        i += 1;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.arena && !args.stakeManager) {
    throw new Error('At least one of --arena or --stake-manager must be provided.');
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

async function configureArenaRoles(args: RoleArgs) {
  if (!args.arena) return;
  const { ethers } = hre as any;
  const [signer] = await ethers.getSigners();
  const arenaAbi = [
    'function orchestrators(address) view returns (bool)',
    'function setOrchestrator(address,bool)',
  ];
  const arena = new ethers.Contract(args.arena, arenaAbi, signer);

  for (const address of args.allowOrchestrators) {
    const current = await arena.orchestrators(address);
    if (!current) {
      await maybeSend(
        () => arena.setOrchestrator(address, true),
        args.dryRun,
        `Allow orchestrator ${address}`,
      );
    } else {
      console.log(`ℹ️  ${address} already authorised as orchestrator.`);
    }
  }

  for (const address of args.revokeOrchestrators) {
    const current = await arena.orchestrators(address);
    if (current) {
      await maybeSend(
        () => arena.setOrchestrator(address, false),
        args.dryRun,
        `Revoke orchestrator ${address}`,
      );
    } else {
      console.log(`ℹ️  ${address} already removed from orchestrators.`);
    }
  }
}

async function configureLockManagers(args: RoleArgs) {
  if (!args.stakeManager) return;
  const { ethers } = hre as any;
  const [signer] = await ethers.getSigners();
  const stakeAbi = [
    'function validatorLockManagers(address) view returns (bool)',
    'function setValidatorLockManager(address,bool)',
  ];
  const stakeManager = new ethers.Contract(args.stakeManager, stakeAbi, signer);

  for (const address of args.allowLockManagers) {
    const current = await stakeManager.validatorLockManagers(address);
    if (!current) {
      await maybeSend(
        () => stakeManager.setValidatorLockManager(address, true),
        args.dryRun,
        `Allow validator lock manager ${address}`,
      );
    } else {
      console.log(`ℹ️  ${address} already allowed as lock manager.`);
    }
  }

  for (const address of args.revokeLockManagers) {
    const current = await stakeManager.validatorLockManagers(address);
    if (current) {
      await maybeSend(
        () => stakeManager.setValidatorLockManager(address, false),
        args.dryRun,
        `Revoke validator lock manager ${address}`,
      );
    } else {
      console.log(`ℹ️  ${address} already removed from lock manager allowlist.`);
    }
  }
}

async function main() {
  const args = parseArgs();
  console.log(`🔧 Configuring role assignments in ${args.dryRun ? 'dry-run' : 'live'} mode.`);
  await configureArenaRoles(args);
  await configureLockManagers(args);
}

main().catch((error) => {
  console.error('Failed to update owner roles:', error);
  process.exitCode = 1;
});

