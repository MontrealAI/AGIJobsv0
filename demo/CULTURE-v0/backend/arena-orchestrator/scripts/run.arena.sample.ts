import { loadEnvironment } from '../src/env.js';
import { ArenaService } from '../src/arena.service.js';
import { OnChainSelfPlayArenaClient } from '../src/selfplay-arena.js';

const HARDHAT_DEFAULTS = {
  teacher: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
  students: [
    '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
    '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65'
  ],
  validators: [
    '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'
  ]
};

async function main(): Promise<void> {
  const env = loadEnvironment();
  if (!env.arenaAddress || !env.operatorKey) {
    throw new Error('SELFPLAY_ARENA_ADDRESS and ORCHESTRATOR_PRIVATE_KEY must be configured for the sample script.');
  }

  const teacher = process.env.ARENA_TEACHER ?? HARDHAT_DEFAULTS.teacher;
  const students = process.env.ARENA_STUDENTS?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? HARDHAT_DEFAULTS.students;
  const validators = process.env.ARENA_VALIDATORS?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? HARDHAT_DEFAULTS.validators;

  const arenaClient = new OnChainSelfPlayArenaClient(env.arenaAddress, env.rpcUrl, env.operatorKey);
  const service = new ArenaService(env.arena, {
    arenaContract: arenaClient,
    slashRecipient: env.slashRecipient
  });

  const round = await service.startRound({
    artifactId: 1,
    teacher,
    students,
    validators
  });
  console.log('Round started:', round.id);

  await service.recordSubmission(round.id, teacher, `cid:teacher:${Date.now()}`);
  for (const student of students) {
    await service.recordSubmission(round.id, student, `cid:student:${student}`);
  }

  await service.closeRound(round.id);
  const summary = await service.finalizeRound(round.id);
  console.log('Round finalized:', summary);
  console.log('Scoreboard snapshot:', service.getScoreboard());
}

main().catch((error) => {
  console.error('Sample run failed:', error);
  process.exitCode = 1;
});
