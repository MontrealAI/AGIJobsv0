import { DifficultyController } from '../src/difficulty.js';
import { Snapshotter } from '../src/ipfs.js';
import { ArenaService } from '../src/arena.service.js';
import { MockPrismaClient } from './__mocks__/prisma-client.js';
import { toCommitHash } from '../src/utils.js';

const jobsClient = {
  fetchTasks: jest.fn(),
  submitResult: jest.fn(),
  triggerOnChainAction: jest.fn().mockResolvedValue(undefined)
};

describe('ArenaService', () => {
  it('runs a full round lifecycle', async () => {
    const prisma = new MockPrismaClient() as any;
    const service = new ArenaService(prisma, new DifficultyController({ targetSeconds: 60 }), new Snapshotter(false), jobsClient as any);

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
    const prisma = new MockPrismaClient() as any;
    const service = new ArenaService(prisma, new DifficultyController({ targetSeconds: 60 }), new Snapshotter(false), jobsClient as any);

    const round = await service.startRound({
      contestantIds: ['agent-1', 'agent-2'],
      validatorIds: ['validator-1']
    });

    await Promise.all([
      service.commitSubmission({ roundId: round.id, agentId: 'agent-1', commitHash: toCommitHash('a') }),
      service.commitSubmission({ roundId: round.id, agentId: 'agent-2', commitHash: toCommitHash('b') })
    ]);

    const status = await service.getStatus(round.id);
    const committedAgents = status.committee.filter((member: any) => member.commitHash);
    expect(committedAgents).toHaveLength(2);
  });
});
