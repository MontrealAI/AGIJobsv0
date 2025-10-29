import { hashMetadata } from '../utils/crypto.js';
import { AgentProfile, Domain, JobOutcome } from '../types.js';

export interface JobSpec {
  jobId: string;
  domain: Domain;
  budget: bigint;
  metadata: Record<string, unknown>;
}

export class JobLedger {
  private jobs = new Map<string, JobSpec>();
  private outcomes = new Map<string, JobOutcome>();

  public registerJob(job: JobSpec) {
    if (this.jobs.has(job.jobId)) {
      throw new Error(`Job ${job.jobId} already exists`);
    }
    this.jobs.set(job.jobId, job);
  }

  public executeJob(jobId: string, agent: AgentProfile, success: boolean, cost: bigint) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error('Job not found');
    }
    const outcome: JobOutcome = {
      jobId,
      domain: job.domain,
      executedBy: agent.ensName,
      success,
      cost,
      metadataHash: hashMetadata(job.metadata),
    };
    this.outcomes.set(jobId, outcome);
    return outcome;
  }

  public getOutcome(jobId: string) {
    return this.outcomes.get(jobId);
  }

  public listPending() {
    return [...this.jobs.values()].filter((job) => !this.outcomes.has(job.jobId));
  }

  public listOutcomes() {
    return [...this.outcomes.values()];
  }
}
