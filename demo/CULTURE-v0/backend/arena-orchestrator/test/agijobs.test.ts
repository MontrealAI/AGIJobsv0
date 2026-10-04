import { jest } from '@jest/globals';
import { JobRegistryClient } from '../src/agijobs.js';

const input = {
  description: 'Local fixture job',
  roundId: 1,
  role: 'teacher' as const,
  participant: `0x${'11'.repeat(20)}`,
  artifactId: 1,
};

describe('local job registry isolation and transitions', () => {
  it('isolates IDs, records, resets and waiters between clients', async () => {
    const first = new JobRegistryClient();
    const second = new JobRegistryClient();
    const a = await first.createJob(input);
    const b = await second.createJob(input);
    expect(a.jobId).toBe(1);
    expect(b.jobId).toBe(1);
    let secondResolved = false;
    const waiting = second.waitForSubmission(b.jobId, 1000).then(() => {
      secondResolved = true;
    });
    await first.markSubmitted(a.jobId, 'cid:first');
    expect(secondResolved).toBe(false);
    expect(second.getJob(b.jobId).status).toBe('created');
    first.reset();
    await second.markSubmitted(b.jobId, 'cid:second');
    await waiting;
    expect(second.getJob(b.jobId).submissionCid).toBe('cid:second');
  });
  it('rejects duplicate evidence and cannot reopen a finalized job', async () => {
    const registry = new JobRegistryClient();
    const { jobId } = await registry.createJob(input);
    await registry.markSubmitted(jobId, 'cid:first');
    await expect(registry.markSubmitted(jobId, 'cid:second')).rejects.toThrow(
      'already',
    );
    await registry.finalizeJob(jobId);
    await expect(registry.markSubmitted(jobId, 'cid:third')).rejects.toThrow(
      'already',
    );
    expect(registry.getJob(jobId)).toMatchObject({
      status: 'finalized',
      submissionCid: 'cid:first',
    });
  });
  it('requires evidence and emits finalization only once', async () => {
    const registry = new JobRegistryClient();
    const listener = jest.fn();
    registry.on('job:finalized', listener);
    const { jobId } = await registry.createJob(input);
    await expect(registry.finalizeJob(jobId)).rejects.toThrow(
      'not been submitted',
    );
    await expect(registry.markSubmitted(jobId, '  ')).rejects.toThrow(
      'Invalid',
    );
    await registry.markSubmitted(jobId, 'cid:proof');
    await registry.finalizeJob(jobId);
    await registry.finalizeJob(jobId);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('returns and emits copies so callers cannot mutate stored records', async () => {
    const registry = new JobRegistryClient();
    registry.on('job:created', (record) => {
      record.status = 'finalized';
    });
    const { jobId } = await registry.createJob(input);
    registry.getJob(jobId).status = 'finalized';
    registry.listJobsByRound(1)[0]!.roundId = 99;
    expect(registry.getJob(jobId)).toMatchObject({
      roundId: 1,
      status: 'created',
    });
    registry.on('job:submitted', (update) => {
      update.submittedAt.setFullYear(1990);
    });
    await registry.markSubmitted(jobId, 'cid:proof');
    expect(registry.getJob(jobId).updatedAt.getFullYear()).not.toBe(1990);
  });
});
