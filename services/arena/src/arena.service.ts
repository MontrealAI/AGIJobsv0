import { PrismaClient, RoundState, CommitteeRole } from '@prisma/client';
import { trace } from '@opentelemetry/api';
import { DifficultyController } from './difficulty.js';
import { Snapshotter } from './ipfs.js';
import { JobsClient } from './jobs.client.js';
import { MonitoringClient, monitoringClient } from './monitoring.js';
import { ModerationService } from './moderation.js';
import { calculateQDScore, aggregateQD } from './qd.js';
import { updateRating } from './elo.js';
import { deterministicShuffle, toCommitHash } from './utils.js';
import { startRoundSchema, commitSchema, revealSchema } from './validators.js';
import type { StartRoundInput, RevealPayload, CommitPayload, ArenaState } from './types.js';

const tracer = trace.getTracer('arena.service');

export interface ArenaServiceOptions {
  commitWindowSeconds?: number;
  revealWindowSeconds?: number;
  moderationEndpoint?: string;
  monitoringClient?: MonitoringClient;
}

export class ArenaService {
  private readonly commitWindowSeconds: number;
  private readonly revealWindowSeconds: number;
  private readonly moderation: ModerationService;
  private readonly monitoring: MonitoringClient;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly difficulty: DifficultyController,
    private readonly snapshotter: Snapshotter,
    private readonly jobsClient: JobsClient,
    options: ArenaServiceOptions = {}
  ) {
    this.commitWindowSeconds = options.commitWindowSeconds ?? 300;
    this.revealWindowSeconds = options.revealWindowSeconds ?? 300;
    this.moderation = new ModerationService(options.moderationEndpoint);
    this.monitoring = options.monitoringClient ?? monitoringClient;
  }

  async startRound(input: StartRoundInput): Promise<ArenaState> {
    const payload = startRoundSchema.parse(input);
    return tracer.startActiveSpan('arena.startRound', async (span) => {
      const now = new Date();
      const commitDeadline = new Date(now.getTime() + this.commitWindowSeconds * 1000);
      const revealDeadline = new Date(commitDeadline.getTime() + this.revealWindowSeconds * 1000);

      const contestantIds = deterministicShuffle(payload.contestantIds, now.toISOString());
      const validatorIds = deterministicShuffle(payload.validatorIds, commitDeadline.toISOString());

      const uniqueAgents = new Set([...contestantIds, ...validatorIds]);

      const round = await this.prisma.$transaction(async (tx) => {
        for (const agentId of uniqueAgents) {
          await tx.agent.upsert({
            where: { id: agentId },
            update: {},
            create: { id: agentId }
          });
        }

        const createdRound = await tx.round.create({
          data: {
            state: RoundState.COMMIT,
            startedAt: now,
            commitDeadline,
            revealDeadline,
            targetDuration: payload.targetDurationSeconds ?? this.difficulty.targetSeconds,
            metadata: payload.roundMetadata ?? {}
          }
        });

        const committeeData = [
          ...contestantIds.map((agentId) => ({
            agentId,
            roundId: createdRound.id,
            role: CommitteeRole.CONTESTANT
          })),
          ...validatorIds.map((agentId) => ({
            agentId,
            roundId: createdRound.id,
            role: CommitteeRole.VALIDATOR
          }))
        ];

        await tx.committeeMember.createMany({ data: committeeData });
        await tx.roundLog.create({
          data: {
            roundId: createdRound.id,
            level: 'info',
            message: 'Round started',
            context: {
              contestantCount: contestantIds.length,
              validatorCount: validatorIds.length
            }
          }
        });

        return createdRound;
      });

      span.setAttribute('round.id', round.id);
      span.setAttribute('round.commitDeadline', commitDeadline.toISOString());
      span.setAttribute('round.revealDeadline', revealDeadline.toISOString());

      return {
        id: round.id,
        state: round.state,
        commitDeadline,
        revealDeadline,
        difficultyScore: this.difficulty.currentDifficulty
      };
    });
  }

  async commitSubmission(payload: CommitPayload) {
    const input = commitSchema.parse(payload);
    return tracer.startActiveSpan('arena.commit', async (span) => {
      const round = await this.prisma.round.findUnique({
        where: { id: input.roundId },
        include: { committee: true }
      });
      if (!round) {
        throw new Error('Round not found');
      }
      if (!round.commitDeadline || round.commitDeadline.getTime() < Date.now()) {
        throw new Error('Commit window closed');
      }

      const member = round.committee.find((c) => c.agentId === input.agentId && c.role === CommitteeRole.CONTESTANT);
      if (!member) {
        throw new Error('Agent not enrolled in round');
      }

      await this.prisma.committeeMember.update({
        where: { id: member.id },
        data: {
          commitHash: input.commitHash,
          commitAt: new Date()
        }
      });

      await this.prisma.roundLog.create({
        data: {
          roundId: round.id,
          level: 'info',
          message: 'Commit received',
          context: { agentId: input.agentId }
        }
      });

      span.setAttribute('round.id', round.id);
      span.setAttribute('agent.id', input.agentId);
    });
  }

  async revealSubmission(payload: RevealPayload) {
    const input = revealSchema.parse(payload);
    return tracer.startActiveSpan('arena.reveal', async (span) => {
      const round = await this.prisma.round.findUnique({
        where: { id: input.roundId },
        include: { committee: true }
      });
      if (!round) {
        throw new Error('Round not found');
      }
      if (!round.revealDeadline || round.revealDeadline.getTime() < Date.now()) {
        throw new Error('Reveal window closed');
      }

      const member = round.committee.find((c) => c.agentId === input.agentId && c.role === CommitteeRole.CONTESTANT);
      if (!member) {
        throw new Error('Agent not enrolled in round');
      }
      if (!member.commitHash) {
        throw new Error('Commit missing');
      }

      const computedHash = toCommitHash(input.submission);
      if (computedHash !== member.commitHash) {
        throw new Error('Commitment mismatch');
      }

      const moderation = await this.moderation.review(JSON.stringify(input.submission));
      if (moderation.flagged) {
        await this.prisma.committeeMember.update({
          where: { id: member.id },
          data: {
            slashed: true,
            moderationNote: moderation.reason,
            revealPayload: input.submission,
            revealAt: new Date()
          }
        });
        await this.prisma.roundLog.create({
          data: {
            roundId: round.id,
            level: 'warn',
            message: 'Submission flagged by moderation',
            context: { agentId: input.agentId, reason: moderation.reason }
          }
        });
        await this.monitoring.recordFailure(round.id, `moderation:${moderation.reason}`);
        throw new Error(`Submission rejected: ${moderation.reason}`);
      }

      await this.prisma.committeeMember.update({
        where: { id: member.id },
        data: {
          revealPayload: input.submission,
          revealAt: new Date()
        }
      });

      await this.prisma.roundLog.create({
        data: {
          roundId: round.id,
          level: 'info',
          message: 'Reveal accepted',
          context: { agentId: input.agentId }
        }
      });

      span.setAttribute('round.id', round.id);
      span.setAttribute('agent.id', input.agentId);
      this.monitoring.recordSuccess(round.id);
    });
  }

  async closeRound(roundId: string) {
    return tracer.startActiveSpan('arena.closeRound', async (span) => {
      const round = await this.prisma.round.findUnique({
        where: { id: roundId },
        include: { committee: { include: { agent: true } } }
      });
      if (!round) {
        throw new Error('Round not found');
      }
      if (round.state === RoundState.CLOSED) {
        return round;
      }

      const now = new Date();
      const committeeUpdates: Promise<unknown>[] = [];
      const validators = round.committee.filter((m) => m.role === CommitteeRole.VALIDATOR);
      const contestants = round.committee.filter((m) => m.role === CommitteeRole.CONTESTANT);

      for (const validator of validators) {
        if (!validator.commitHash) {
          validator.slashed = true;
          committeeUpdates.push(
            this.prisma.committeeMember.update({
              where: { id: validator.id },
              data: { slashed: true }
            })
          );
        }
      }

      for (const contestant of contestants) {
        if (!contestant.revealPayload) {
          contestant.slashed = true;
          committeeUpdates.push(
            this.prisma.committeeMember.update({
              where: { id: contestant.id },
              data: { slashed: true }
            })
          );
        }
      }
      await Promise.all(committeeUpdates);

      const qualifiedContestants = contestants.filter((c) => Boolean(c.revealPayload) && !c.slashed);
      const contestantScores = qualifiedContestants.map((contestant) => {
        const metrics = {
          novelty: Math.random(),
          quality: Math.random()
        };
        return {
          contestant,
          score: calculateQDScore(metrics)
        };
      });
      const aggregate = aggregateQD(contestantScores.map((entry) => entry.score));
      const totalInfractions =
        validators.filter((v) => v.slashed).length + contestants.filter((c) => c.slashed).length;
      if (totalInfractions > 0) {
        await this.monitoring.recordFailure(round.id, `auto-slash:${totalInfractions}`);
      } else {
        this.monitoring.recordSuccess(round.id);
      }

      const validatorAverageRating =
        validators.reduce((acc, member) => acc + (member.agent?.rating ?? 1500), 0) / Math.max(validators.length, 1);

      const ratingUpdates: Promise<unknown>[] = [];
      for (const { contestant } of contestantScores) {
        const agent = contestant.agent!;
        const updatedRating = updateRating(
          { rating: agent.rating, kFactor: agent.kFactor },
          { rating: validatorAverageRating },
          1
        );
        ratingUpdates.push(
          this.prisma.agent.update({
            where: { id: agent.id },
            data: { rating: updatedRating }
          })
        );
      }

      for (const validator of validators) {
        const agent = validator.agent!;
        const updatedRating = updateRating(
          { rating: agent.rating, kFactor: agent.kFactor },
          { rating: aggregate.fitness * 1000 + 1000 },
          validator.slashed ? 0 : 1
        );
        ratingUpdates.push(
          this.prisma.agent.update({
            where: { id: agent.id },
            data: { rating: updatedRating }
          })
        );
      }

      await Promise.all(ratingUpdates);

      const updatedRound = await this.prisma.round.update({
        where: { id: round.id },
        data: {
          state: RoundState.CLOSED,
          closedAt: now,
          ipfsSnapshotCid: (
            await this.snapshotter.snapshot({
              round,
              aggregate,
              closedAt: now.toISOString()
            })
          ).cid
        }
      });

      await this.prisma.roundLog.create({
        data: {
          roundId: round.id,
          level: 'info',
          message: 'Round closed',
          context: {
            contestantCount: contestants.length,
            validatorCount: validators.length,
            aggregate
          }
        }
      });

      try {
        await this.jobsClient.triggerOnChainAction('/onchain/finalize-round', {
          roundId: round.id,
          aggregate
        });
      } catch (error) {
        await this.prisma.roundLog.create({
          data: {
            roundId: round.id,
            level: 'error',
            message: 'Failed to finalize on-chain',
            context: { error: (error as Error).message }
          }
        });
      }

      const actualDuration = (updatedRound.closedAt!.getTime() - round.startedAt!.getTime()) / 1000;
      this.difficulty.update(actualDuration);

      span.setAttribute('round.id', round.id);
      span.setAttribute('round.duration', actualDuration);

      return updatedRound;
    });
  }

  async getScoreboard(limit = 10) {
    const agents = await this.prisma.agent.findMany({
      orderBy: { rating: 'desc' },
      take: limit
    });
    return agents;
  }

  async getStatus(roundId: string) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      include: {
        committee: true
      }
    });
    if (!round) {
      throw new Error('Round not found');
    }
    return round;
  }
}
