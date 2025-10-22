import crypto from 'crypto';
import type { CommitteeRole, RoundState } from '@prisma/client';

type AgentRecord = {
  id: string;
  rating: number;
  rd: number;
  kFactor: number;
  createdAt: Date;
  updatedAt: Date;
};

type RoundRecord = {
  id: string;
  state: RoundState;
  targetDuration: number;
  difficultyScore: number;
  commitDeadline: Date | null;
  revealDeadline: Date | null;
  startedAt: Date | null;
  closedAt: Date | null;
  metadata: Record<string, unknown> | null;
  ipfsSnapshotCid: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CommitteeRecord = {
  id: string;
  roundId: string;
  agentId: string;
  role: CommitteeRole;
  commitHash: string | null;
  commitAt: Date | null;
  revealPayload: unknown;
  revealAt: Date | null;
  slashed: boolean;
  moderationNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RoundLogRecord = {
  id: string;
  roundId: string;
  level: string;
  message: string;
  context: unknown;
  createdAt: Date;
};

export class MockPrismaClient {
  readonly agent: any;
  readonly round: any;
  readonly committeeMember: any;
  readonly roundLog: any;
  private readonly agents = new Map<string, AgentRecord>();
  private readonly rounds = new Map<string, RoundRecord>();
  private readonly committees = new Map<string, CommitteeRecord>();
  private readonly logs: RoundLogRecord[] = [];

  constructor() {
    this.agent = {
      upsert: async ({ where, create }: any) => {
        const id = where.id;
        const existing = this.agents.get(id);
        if (existing) {
          existing.updatedAt = new Date();
          return existing;
        }
        const record: AgentRecord = {
          id,
          rating: 1500,
          rd: 350,
          kFactor: 32,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create
        };
        this.agents.set(id, record);
        return record;
      },
      findMany: async ({ orderBy, take }: any = {}) => {
        const items = Array.from(this.agents.values());
        if (orderBy?.rating === 'desc') {
          items.sort((a, b) => b.rating - a.rating);
        }
        if (typeof take === 'number') {
          return items.slice(0, take);
        }
        return items;
      },
      update: async ({ where, data }: any) => {
        const record = this.agents.get(where.id);
        if (!record) throw new Error('Agent not found');
        Object.assign(record, data, { updatedAt: new Date() });
        return record;
      }
    };

    this.round = {
      create: async ({ data }: any) => {
        const id = crypto.randomUUID();
        const record: RoundRecord = {
          id,
          state: data.state,
          targetDuration: data.targetDuration,
          difficultyScore: 1,
          commitDeadline: data.commitDeadline ?? null,
          revealDeadline: data.revealDeadline ?? null,
          startedAt: data.startedAt ?? null,
          closedAt: data.closedAt ?? null,
          metadata: (data.metadata ?? null) as Record<string, unknown> | null,
          ipfsSnapshotCid: data.ipfsSnapshotCid ?? null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.rounds.set(id, record);
        return { ...record };
      },
      findUnique: async ({ where, include }: any) => {
        const record = this.rounds.get(where.id);
        if (!record) return null;
        const result: any = { ...record };
        if (include?.committee) {
          const committee = Array.from(this.committees.values()).filter((c) => c.roundId === record.id);
          if (include.committee?.include?.agent) {
            result.committee = committee.map((member) => ({
              ...member,
              agent: this.agents.get(member.agentId) ?? null
            }));
          } else {
            result.committee = committee;
          }
        }
        return result;
      },
      update: async ({ where, data }: any) => {
        const record = this.rounds.get(where.id);
        if (!record) throw new Error('Round not found');
        Object.assign(record, data, { updatedAt: new Date() });
        this.rounds.set(where.id, record);
        return { ...record };
      }
    };

    this.committeeMember = {
      createMany: async ({ data }: any) => {
        for (const entry of data) {
          const id = crypto.randomUUID();
          const record: CommitteeRecord = {
            id,
            roundId: entry.roundId,
            agentId: entry.agentId,
            role: entry.role,
            commitHash: entry.commitHash ?? null,
            commitAt: null,
            revealPayload: null,
            revealAt: null,
            slashed: false,
            moderationNote: null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          this.committees.set(id, record);
        }
        return { count: data.length };
      },
      update: async ({ where, data }: any) => {
        const record = this.committees.get(where.id);
        if (!record) throw new Error('Committee member not found');
        Object.assign(record, data, { updatedAt: new Date() });
        this.committees.set(where.id, record);
        return { ...record };
      }
    };

    this.roundLog = {
      create: async ({ data }: any) => {
        const record: RoundLogRecord = {
          id: crypto.randomUUID(),
          roundId: data.roundId,
          level: data.level,
          message: data.message,
          context: data.context ?? null,
          createdAt: new Date()
        };
        this.logs.push(record);
        return record;
      }
    };
  }

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }
}
