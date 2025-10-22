import type { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import {
  confirmBytecode,
  ensureAddress,
  loadCultureConfig,
  resolveSigner,
  toBytes32Array,
} from './culture/utils';

async function resolveOperatorSigner(expected?: string): Promise<Wallet> {
  const signer = await resolveSigner(ethers.provider, {
    envVar: 'CULTURE_ORCHESTRATOR_KEY',
    vaultVar: 'CULTURE_ORCHESTRATOR_VAULT_PATH',
    fallbackIndex: 0,
    label: 'Arena orchestrator',
  });
  if (expected) {
    const signerAddress = (await signer.getAddress()).toLowerCase();
    if (signerAddress !== expected.toLowerCase()) {
      console.warn(
        `⚠️ Operator signer ${signerAddress} differs from configured orchestrator ${expected}. ` +
          'Proceeding with the available signer; update CULTURE_ORCHESTRATOR_KEY to enforce a specific address.'
      );
    }
  }
  return signer;
}

async function runStubRound(): Promise<void> {
  const config = await loadCultureConfig();
  const sample = config.sampleRound;
  if (!sample) {
    throw new Error('sampleRound configuration missing from config/culture.json');
  }
  const difficulty = sample.difficulty ?? config.arena.defaultDifficulty;
  console.log('🧪 Running stubbed arena round simulation');
  console.log(`Difficulty: ${difficulty}`);
  console.log(`Teacher: ${sample.teacher.address} (job ${sample.teacher.jobId})`);
  console.log('Students:');
  for (const student of sample.students ?? []) {
    console.log(`  - ${student.address} (job ${student.jobId})`);
  }
  console.log('Validators:');
  for (const validator of sample.validators ?? []) {
    console.log(`  - ${validator.address} (job ${validator.jobId})`);
  }
  const winners = sample.winners ?? [];
  console.log(`Winners: ${winners.length > 0 ? winners.join(', ') : 'none'}`);
  console.log('📊 Stubbed scoreboard (equal weights):');
  const scoreboard = new Map<string, number>();
  scoreboard.set(sample.teacher.address, 10);
  for (const student of sample.students ?? []) {
    scoreboard.set(student.address, 7);
  }
  for (const validator of sample.validators ?? []) {
    scoreboard.set(validator.address, winners.includes(validator.address) ? 9 : 6);
  }
  for (const [participant, score] of scoreboard.entries()) {
    console.log(`  ${participant}: ${score}`);
  }
  console.log('✅ Stub simulation complete. Use --onchain to execute against a deployed arena.');
}

async function runOnChainRound(): Promise<void> {
  const config = await loadCultureConfig();
  const sample = config.sampleRound;
  if (!sample) {
    throw new Error('sampleRound configuration missing from config/culture.json');
  }
  const cultureArena = config.contracts?.selfPlayArena ?? (config.dependencies as any).selfPlayArena;
  if (!cultureArena) {
    throw new Error('SelfPlayArena address missing from config/culture.json');
  }
  const arenaAddress = ensureAddress('contracts.selfPlayArena', cultureArena);
  await confirmBytecode('SelfPlayArena', arenaAddress);

  const orchestratorCandidates = config.seed?.agents?.orchestrators ?? config.orchestrators ?? [];
  const expectedOperator = orchestratorCandidates.length > 0 ? orchestratorCandidates[0] : undefined;
  const operatorSigner = await resolveOperatorSigner(expectedOperator);
  const arena = await ethers.getContractAt(
    'contracts/v2/SelfPlayArena.sol:SelfPlayArena',
    arenaAddress,
    operatorSigner
  );

  const difficulty = sample.difficulty ?? config.arena.defaultDifficulty;
  console.log('🎯 Starting on-chain arena round');
  const startTx = await arena.startRound(
    difficulty,
    sample.teacher.jobId,
    sample.teacher.address,
    sample.teacher.subdomain ?? '',
    toBytes32Array(sample.teacher.proof)
  );
  const startReceipt = await startTx.wait(1);
  if (!startReceipt || startReceipt.status !== 1) {
    throw new Error('startRound transaction failed');
  }
  const startEvent = startReceipt.logs
    .map((log) => {
      try {
        return arena.interface.parseLog(log);
      } catch (error) {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === 'RoundStarted');
  if (!startEvent) {
    throw new Error('Unable to locate RoundStarted event');
  }
  const roundId = Number(startEvent.args.roundId);
  console.log(`✅ Round ${roundId} started`);

  for (const student of sample.students ?? []) {
    const tx = await arena.registerStudentJob(
      roundId,
      student.jobId,
      student.address,
      student.subdomain ?? '',
      toBytes32Array(student.proof)
    );
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Failed to register student ${student.address}`);
    }
  }

  for (const validator of sample.validators ?? []) {
    const tx = await arena.registerValidatorJob(
      roundId,
      validator.jobId,
      validator.address,
      validator.subdomain ?? '',
      toBytes32Array(validator.proof)
    );
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Failed to register validator ${validator.address}`);
    }
  }

  const closeTx = await arena.closeRound(roundId);
  const closeReceipt = await closeTx.wait(1);
  if (!closeReceipt || closeReceipt.status !== 1) {
    throw new Error('closeRound transaction failed');
  }
  console.log(`🔒 Round ${roundId} closed`);

  const winners = sample.winners ?? [];
  const finaliseTx = await arena.finaliseRound(roundId, winners, 0);
  const finaliseReceipt = await finaliseTx.wait(1);
  if (!finaliseReceipt || finaliseReceipt.status !== 1) {
    throw new Error('finaliseRound transaction failed');
  }
  const rewardEvent = finaliseReceipt.logs
    .map((log) => {
      try {
        return arena.interface.parseLog(log);
      } catch (error) {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === 'RewardsDistributed');
  if (rewardEvent) {
    console.log(
      `🎉 Rewards distributed — teacher ${ethers.formatUnits(rewardEvent.args.teacherReward, 18)}, ` +
        `students total ${ethers.formatUnits(rewardEvent.args.studentRewardTotal, 18)}, ` +
        `validators total ${ethers.formatUnits(rewardEvent.args.validatorRewardTotal, 18)}`
    );
  } else {
    console.warn('⚠️ RewardsDistributed event not observed; verify FeePool balance and rewarder permissions.');
  }

  const roundView = await arena.getRound(roundId);
  console.log('📋 Round summary:', {
    id: roundView.id,
    difficulty: roundView.difficulty,
    teacher: roundView.teacher,
    students: roundView.students,
    validators: roundView.validators,
    winners: roundView.winners,
    difficultyDelta: roundView.difficultyDelta,
  });
  console.log('✅ On-chain arena sanity check complete');
}

async function main(): Promise<void> {
  const config = await loadCultureConfig();
  const forcedMode = process.env.CULTURE_ARENA_MODE?.toLowerCase();
  const sampleMode =
    (forcedMode === 'onchain' || forcedMode === 'stub' ? forcedMode : undefined) ??
    config.sampleRound?.mode ??
    'stub';
  if (sampleMode === 'onchain') {
    await runOnChainRound();
  } else {
    await runStubRound();
  }
}

main().catch((error) => {
  console.error('Arena sample run failed:', error);
  process.exitCode = 1;
});
