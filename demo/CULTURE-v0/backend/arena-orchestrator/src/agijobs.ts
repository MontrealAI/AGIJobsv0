import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { buildStructuredLogRecord } from '../../../../../shared/structuredLogger.js';

export type JobStatus = 'created' | 'submitted' | 'finalized';

export interface CreateJobInput {
  readonly description: string;
  readonly roundId: number;
  readonly role: 'teacher' | 'student' | 'validator';
  readonly participant: string;
  readonly artifactId: number;
}

export interface JobHandle {
  readonly jobId: number;
  readonly requestId: string;
}

export interface JobRecord extends JobHandle {
  readonly description: string;
  readonly roundId: number;
  readonly role: CreateJobInput['role'];
  readonly participant: string;
  readonly artifactId: number;
  status: JobStatus;
  submissionCid?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionUpdate {
  readonly jobId: number;
  readonly cid: string;
  readonly submittedAt: Date;
}

export interface JobRegistryEvents {
  readonly 'job:created': (record: JobRecord) => void;
  readonly 'job:submitted': (update: SubmissionUpdate) => void;
  readonly 'job:finalized': (record: JobRecord) => void;
}

type EventNames = keyof JobRegistryEvents;

class TypedEmitter extends EventEmitter {
  override on<T extends EventNames>(event: T, listener: JobRegistryEvents[T]): this {
    return super.on(event, listener) as this;
  }

  override emit<T extends EventNames>(event: T, ...args: Parameters<JobRegistryEvents[T]>): boolean {
    return super.emit(event, ...args);
  }
}

let nextJobId = 1;
const records = new Map<number, JobRecord>();

export class JobRegistryClient extends TypedEmitter {
  async createJob(input: CreateJobInput): Promise<JobHandle> {
    const jobId = nextJobId++;
    const handle: JobHandle = { jobId, requestId: randomUUID() };
    const record: JobRecord = {
      ...handle,
      description: input.description,
      roundId: input.roundId,
      role: input.role,
      participant: input.participant,
      artifactId: input.artifactId,
      status: 'created',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    records.set(jobId, record);
    this.emit('job:created', record);
    this.log('created', record);
    return handle;
  }

  async markSubmitted(jobId: number, cid: string): Promise<void> {
    const record = this.requireJob(jobId);
    record.status = 'submitted';
    record.submissionCid = cid;
    record.updatedAt = new Date();
    const update: SubmissionUpdate = { jobId, cid, submittedAt: record.updatedAt };
    this.emit('job:submitted', update);
    this.log('submitted', record, { cid });
  }

  async finalizeJob(jobId: number): Promise<void> {
    const record = this.requireJob(jobId);
    if (record.status !== 'submitted' && record.role !== 'teacher') {
      throw new Error(`Job ${jobId} has not been submitted`);
    }
    record.status = 'finalized';
    record.updatedAt = new Date();
    this.emit('job:finalized', record);
    this.log('finalized', record);
  }

  getJob(jobId: number): JobRecord {
    return this.requireJob(jobId);
  }

  listJobsByRound(roundId: number): JobRecord[] {
    return Array.from(records.values()).filter((record) => record.roundId === roundId);
  }

  private requireJob(jobId: number): JobRecord {
    const record = records.get(jobId);
    if (!record) {
      throw new Error(`Job ${jobId} not found`);
    }
    return record;
  }

  private log(action: string, record: JobRecord, extra: Record<string, unknown> = {}): void {
    const log = buildStructuredLogRecord({
      component: 'job-registry',
      action,
      actor: record.participant,
      jobId: String(record.jobId),
      details: {
        roundId: record.roundId,
        role: record.role,
        artifactId: record.artifactId,
        status: record.status,
        ...extra
      }
    });
    console.log(JSON.stringify(log));
  }
}

export const jobRegistry = new JobRegistryClient();
