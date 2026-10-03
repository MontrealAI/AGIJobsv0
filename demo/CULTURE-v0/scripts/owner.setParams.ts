import dotenv from 'dotenv';
import type { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { z } from 'zod';
import { loadCultureConfig } from './utils';
import { loadContractArtifact, type ArtifactDescriptor } from './hardhat-utils';

const CULTURE_ARTIFACT: ArtifactDescriptor = {
  qualified: 'demo/CULTURE-v0/contracts/CultureRegistry.sol:CultureRegistry',
  fallback: 'CultureRegistry'
};

const ARENA_ARTIFACT: ArtifactDescriptor = {
  qualified: 'demo/CULTURE-v0/contracts/SelfPlayArena.sol:SelfPlayArena',
  fallback: 'SelfPlayArena'
};

const EnvSchema = z.object({
  RPC_URL: z.string().min(1),
  CULTURE_REGISTRY_ADDRESS: z.string().min(1),
  SELF_PLAY_ARENA_ADDRESS: z.string().min(1),
  DEPLOYER_PRIVATE_KEY: z.string().optional(),
  OWNER_ADMIN_PRIVATE_KEY: z.string().optional()
});

async function configureCultureParameters(cultureAddress: string, wallet: Wallet, config: Awaited<ReturnType<typeof loadCultureConfig>>) {
  const artifact = await loadContractArtifact(CULTURE_ARTIFACT);
  const culture = new ethers.Contract(cultureAddress, artifact.abi, wallet);
  const maxCitations = await culture.maxCitations();
  const desiredMax = BigInt(config.culture.maxCitations);
  if (maxCitations !== desiredMax) {
    const tx = await culture.setMaxCitations(desiredMax);
    await tx.wait();
    console.log(`✅ Updated max citations to ${config.culture.maxCitations}`);
  } else {
    console.log('ℹ️  Max citations already matches configuration.');
  }
  const pendingKinds: string[] = [];
  for (const kind of config.culture.kinds) {
    const allowed = await culture.isAllowedKind(kind);
    if (!allowed) {
      pendingKinds.push(kind);
    }
  }
  if (pendingKinds.length > 0) {
    const tx = await culture.setAllowedKinds(pendingKinds, true);
    await tx.wait();
    console.log(`✅ Enabled ${pendingKinds.length} artifact kinds`);
  } else {
    console.log('ℹ️  All configured kinds already enabled.');
  }
}

async function configureArenaParameters(arenaAddress: string, wallet: Wallet, config: Awaited<ReturnType<typeof loadCultureConfig>>) {
  const artifact = await loadContractArtifact(ARENA_ARTIFACT);
  const arena = new ethers.Contract(arenaAddress, artifact.abi, wallet);

  const currentTeacher = await arena.baseTeacherReward();
  const currentStudent = await arena.baseStudentReward();
  const currentValidator = await arena.baseValidatorReward();
  const desiredTeacher = BigInt(config.arena.teacherReward);
  const desiredStudent = BigInt(config.arena.studentReward);
  const desiredValidator = BigInt(config.arena.validatorReward);

  if (
    currentTeacher !== desiredTeacher ||
    currentStudent !== desiredStudent ||
    currentValidator !== desiredValidator
  ) {
    const tx = await arena.setRewards(desiredTeacher, desiredStudent, desiredValidator);
    await tx.wait();
    console.log('✅ Updated arena base rewards');
  } else {
    console.log('ℹ️  Arena rewards already aligned');
  }

  const committeeSize = await arena.committeeSize();
  const validatorStake = await arena.validatorStake();
  const desiredStake = BigInt(config.arena.validatorStake);
  const desiredCommitteeSize = BigInt(config.arena.committeeSize);
  if (committeeSize !== desiredCommitteeSize || validatorStake !== desiredStake) {
    const tx = await arena.setCommitteeParameters(desiredCommitteeSize, desiredStake);
    await tx.wait();
    console.log('✅ Updated committee parameters');
  } else {
    console.log('ℹ️  Committee parameters already aligned');
  }

  const targetSuccessRate = await arena.targetSuccessRateBps();
  const desiredSuccessRate = BigInt(config.arena.targetSuccessRateBps);
  if (targetSuccessRate !== desiredSuccessRate) {
    const tx = await arena.setTargetSuccessRateBps(desiredSuccessRate);
    await tx.wait();
    console.log(`✅ Updated target success rate to ${desiredSuccessRate} bps`);
  } else {
    console.log('ℹ️  Target success rate already aligned');
  }

  const currentMaxStep = await arena.maxDifficultyStep();
  const desiredMaxStep = BigInt(config.arena.maxDifficultyStep);
  if (currentMaxStep !== desiredMaxStep) {
    const tx = await arena.setMaxDifficultyStep(desiredMaxStep);
    await tx.wait();
    console.log(`✅ Updated max difficulty step to ${desiredMaxStep}`);
  } else {
    console.log('ℹ️  Max difficulty step already aligned');
  }
}

async function main() {
  dotenv.config({ path: process.env.CULTURE_ENV_FILE, override: true });
  const env = EnvSchema.parse(process.env);
  const config = await loadCultureConfig();
  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const privateKey = env.OWNER_ADMIN_PRIVATE_KEY ?? env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('OWNER_ADMIN_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY must be provided for owner actions.');
  }
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`🔧 Applying owner parameters with ${wallet.address}`);

  await configureCultureParameters(env.CULTURE_REGISTRY_ADDRESS, wallet, config);
  await configureArenaParameters(env.SELF_PLAY_ARENA_ADDRESS, wallet, config);
}

main().catch((error) => {
  console.error('Owner parameter configuration failed:', error);
  process.exitCode = 1;
});
