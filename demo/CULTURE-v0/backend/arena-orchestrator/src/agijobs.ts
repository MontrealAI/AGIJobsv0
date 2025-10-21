import { randomUUID } from 'node:crypto';

export interface JobHandle {
  readonly jobId: number;
  readonly requestId: string;
}

let nextJobId = 1;

export async function createJob(description: string): Promise<JobHandle> {
  // Placeholder for integration with AGI Jobs JobRegistry
  const jobId = nextJobId++;
  return {
    jobId,
    requestId: randomUUID()
  };
}

export async function finalizeJob(jobId: number): Promise<void> {
  // Placeholder hook for ValidationModule interaction
  if (jobId <= 0) {
    throw new Error('Invalid job id');
  }
}
