import hre from 'hardhat';

type BigNumberish = string | number | bigint;

interface ParsedArgs {
  arena?: string;
  stakeManager?: string;
  teacherReward?: BigNumberish;
  studentReward?: BigNumberish;
  validatorReward?: BigNumberish;
  committeeSize?: BigNumberish;
  validatorStake?: BigNumberish;
  targetSuccessRate?: BigNumberish;
  teacherSplit?: number;
  studentSplit?: number;
  validatorSplit?: number;
  feePct?: number;
  burnPct?: number;
  validatorRewardPct?: number;
  dryRun: boolean;
}

function parseArgs(): ParsedArgs {
  const args: ParsedArgs = { dryRun: false };
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
      case '--teacher-reward':
        if (!next) throw new Error('--teacher-reward <amount>');
        args.teacherReward = next;
        i += 1;
        break;
      case '--student-reward':
        if (!next) throw new Error('--student-reward <amount>');
        args.studentReward = next;
        i += 1;
        break;
      case '--validator-reward':
        if (!next) throw new Error('--validator-reward <amount>');
        args.validatorReward = next;
        i += 1;
        break;
      case '--committee-size':
        if (!next) throw new Error('--committee-size <value>');
        args.committeeSize = next;
        i += 1;
        break;
      case '--validator-stake':
        if (!next) throw new Error('--validator-stake <amount>');
        args.validatorStake = next;
        i += 1;
        break;
      case '--target-success-rate':
        if (!next) throw new Error('--target-success-rate <bps>');
        args.targetSuccessRate = next;
        i += 1;
        break;
      case '--teacher-split':
        if (!next) throw new Error('--teacher-split <bps>');
        args.teacherSplit = Number(next);
        i += 1;
        break;
      case '--student-split':
        if (!next) throw new Error('--student-split <bps>');
        args.studentSplit = Number(next);
        i += 1;
        break;
      case '--validator-split':
        if (!next) throw new Error('--validator-split <bps>');
        args.validatorSplit = Number(next);
        i += 1;
        break;
      case '--fee-pct':
        if (!next) throw new Error('--fee-pct <percent>');
        args.feePct = Number(next);
        i += 1;
        break;
      case '--burn-pct':
        if (!next) throw new Error('--burn-pct <percent>');
        args.burnPct = Number(next);
        i += 1;
        break;
      case '--validator-reward-pct':
        if (!next) throw new Error('--validator-reward-pct <percent>');
        args.validatorRewardPct = Number(next);
        i += 1;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.arena) {
    throw new Error('--arena <address> is required');
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

async function updateArena(args: ParsedArgs) {
  const { ethers } = hre as any;
  const [signer] = await ethers.getSigners();
  const arenaAbi = [
    'function baseTeacherReward() view returns (uint256)',
    'function baseStudentReward() view returns (uint256)',
    'function baseValidatorReward() view returns (uint256)',
    'function committeeSize() view returns (uint256)',
    'function validatorStake() view returns (uint256)',
    'function targetSuccessRateBps() view returns (uint256)',
    'function teacherRewardSplitBps() view returns (uint16)',
    'function studentRewardSplitBps() view returns (uint16)',
    'function validatorRewardSplitBps() view returns (uint16)',
    'function setRewards(uint256,uint256,uint256)',
    'function setCommitteeParameters(uint256,uint256)',
    'function setTargetSuccessRateBps(uint256)',
    'function setRewardSplits(uint16,uint16,uint16)',
  ];
  const arena = new ethers.Contract(args.arena, arenaAbi, signer);

  if (args.teacherReward || args.studentReward || args.validatorReward) {
    const currentTeacher = BigInt((await arena.baseTeacherReward()).toString());
    const currentStudent = BigInt((await arena.baseStudentReward()).toString());
    const currentValidator = BigInt((await arena.baseValidatorReward()).toString());
    const desiredTeacher =
      args.teacherReward !== undefined ? BigInt(args.teacherReward) : currentTeacher;
    const desiredStudent =
      args.studentReward !== undefined ? BigInt(args.studentReward) : currentStudent;
    const desiredValidator =
      args.validatorReward !== undefined ? BigInt(args.validatorReward) : currentValidator;
    if (
      currentTeacher !== desiredTeacher ||
      currentStudent !== desiredStudent ||
      currentValidator !== desiredValidator
    ) {
      await maybeSend(
        () => arena.setRewards(desiredTeacher.toString(), desiredStudent.toString(), desiredValidator.toString()),
        args.dryRun,
        'Update arena base rewards',
      );
    } else {
      console.log('ℹ️  Arena rewards already match desired configuration.');
    }
  }

  if (args.committeeSize || args.validatorStake) {
    const currentCommittee = BigInt((await arena.committeeSize()).toString());
    const currentStake = BigInt((await arena.validatorStake()).toString());
    const desiredCommittee =
      args.committeeSize !== undefined ? BigInt(args.committeeSize) : currentCommittee;
    const desiredStake = args.validatorStake !== undefined ? BigInt(args.validatorStake) : currentStake;
    if (currentCommittee !== desiredCommittee || currentStake !== desiredStake) {
      await maybeSend(
        () => arena.setCommitteeParameters(desiredCommittee.toString(), desiredStake.toString()),
        args.dryRun,
        'Update arena committee parameters',
      );
    } else {
      console.log('ℹ️  Committee parameters already aligned.');
    }
  }

  if (args.targetSuccessRate) {
    const desired = BigInt(args.targetSuccessRate);
    const current = BigInt((await arena.targetSuccessRateBps()).toString());
    if (current !== desired) {
      await maybeSend(
        () => arena.setTargetSuccessRateBps(desired.toString()),
        args.dryRun,
        `Update target success rate to ${desired} bps`,
      );
    } else {
      console.log('ℹ️  Target success rate already matches.');
    }
  }

  if (
    args.teacherSplit !== undefined ||
    args.studentSplit !== undefined ||
    args.validatorSplit !== undefined
  ) {
    const currentTeacher = Number(await arena.teacherRewardSplitBps());
    const currentStudent = Number(await arena.studentRewardSplitBps());
    const currentValidator = Number(await arena.validatorRewardSplitBps());
    const teacherSplit = args.teacherSplit ?? currentTeacher;
    const studentSplit = args.studentSplit ?? currentStudent;
    const validatorSplit = args.validatorSplit ?? currentValidator;
    if (
      currentTeacher !== teacherSplit ||
      currentStudent !== studentSplit ||
      currentValidator !== validatorSplit
    ) {
      await maybeSend(
        () => arena.setRewardSplits(teacherSplit, studentSplit, validatorSplit),
        args.dryRun,
        'Update arena reward splits',
      );
    } else {
      console.log('ℹ️  Reward splits already aligned.');
    }
  }
}

async function updateStakeManager(args: ParsedArgs) {
  if (!args.stakeManager) return;
  if (
    args.feePct === undefined &&
    args.burnPct === undefined &&
    args.validatorRewardPct === undefined
  ) {
    return;
  }
  const { ethers } = hre as any;
  const [signer] = await ethers.getSigners();
  const stakeAbi = [
    'function feePct() view returns (uint256)',
    'function burnPct() view returns (uint256)',
    'function validatorRewardPct() view returns (uint256)',
    'function setFeePct(uint256)',
    'function setBurnPct(uint256)',
    'function setValidatorRewardPct(uint256)',
  ];
  const stakeManager = new ethers.Contract(args.stakeManager, stakeAbi, signer);

  if (args.feePct !== undefined) {
    const current = Number(await stakeManager.feePct());
    if (current !== args.feePct) {
      await maybeSend(
        () => stakeManager.setFeePct(args.feePct),
        args.dryRun,
        `Update fee percentage to ${args.feePct}`,
      );
    } else {
      console.log('ℹ️  Fee percentage already matches.');
    }
  }

  if (args.burnPct !== undefined) {
    const current = Number(await stakeManager.burnPct());
    if (current !== args.burnPct) {
      await maybeSend(
        () => stakeManager.setBurnPct(args.burnPct),
        args.dryRun,
        `Update burn percentage to ${args.burnPct}`,
      );
    } else {
      console.log('ℹ️  Burn percentage already matches.');
    }
  }

  if (args.validatorRewardPct !== undefined) {
    const current = Number(await stakeManager.validatorRewardPct());
    if (current !== args.validatorRewardPct) {
      await maybeSend(
        () => stakeManager.setValidatorRewardPct(args.validatorRewardPct),
        args.dryRun,
        `Update validator reward percentage to ${args.validatorRewardPct}`,
      );
    } else {
      console.log('ℹ️  Validator reward percentage already matches.');
    }
  }
}

async function main() {
  const args = parseArgs();
  console.log(`🔧 Configuring arena parameters using ${args.dryRun ? 'dry-run' : 'live'} mode.`);
  await updateArena(args);
  await updateStakeManager(args);
}

main().catch((error) => {
  console.error('Failed to update owner parameters:', error);
  process.exitCode = 1;
});

