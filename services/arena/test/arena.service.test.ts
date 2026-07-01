import { DifficultyController } from '../src/difficulty.js';
import { Snapshotter } from '../src/ipfs.js';
import { ArenaService } from '../src/arena.service.js';
import { MockPrismaClient } from './__mocks__/prisma-client.js';
import { toCommitHash } from '../src/utils.js';
import type { PrismaClient } from '@prisma/client';
import type { JobsClient } from '../src/jobs.client.js';

const jobsClient: Pick<JobsClient, 'fetchTasks' | 'submitResult' | 'triggerOnChainAction'> = {
  fetchTasks: jest.fn(),
  submitResult: jest.fn(),
  triggerOnChainAction: jest.fn().mockResolvedValue(undefined)
};

describe('ArenaService', () => {
  it('runs a full round lifecycle', async () => {
    const prisma = new MockPrismaClient() as unknown as PrismaClient;
    const service = new ArenaService(prisma, new DifficultyController({ targetSeconds: 60 }), new Snapshotter(false), jobsClient);

    const round = await service.startRound({
      contestantIds: ['agent-1'],
      validatorIds: ['validator-1']
    });

    await service.commitSubmission({
      roundId: round.id,
      agentId: 'agent-1',
      commitHash: toCommitHash({ output: 'hello' })
    });

    await service.revealSubmission({
      roundId: round.id,
      agentId: 'agent-1',
      submission: { output: 'hello' },
      proof: 'proof'
    });

    const closed = await service.closeRound(round.id);
    expect(closed.state).toBe('CLOSED');
    expect(jobsClient.triggerOnChainAction).toHaveBeenCalled();
  });

  it('handles concurrent commits without race conditions', async () => {
    const prisma = new MockPrismaClient() as unknown as PrismaClient;
    const service = new ArenaService(prisma, new DifficultyController({ targetSeconds: 60 }), new Snapshotter(false), jobsClient);

    const round = await service.startRound({
      contestantIds: ['agent-1', 'agent-2'],
      validatorIds: ['validator-1']
    });

    await Promise.all([
      service.commitSubmission({ roundId: round.id, agentId: 'agent-1', commitHash: toCommitHash('a') }),
      service.commitSubmission({ roundId: round.id, agentId: 'agent-2', commitHash: toCommitHash('b') })
    ]);

    const status = await service.getStatus(round.id);
    const committedAgents = status.committee.filter((member) => member.commitHash);
    expect(committedAgents).toHaveLength(2);
  });
});
