import { AntifragileShell } from '../ai/antifragileShell.js';
import { PlanningEngine } from '../ai/planningEngine.js';
import { ControlPlane } from './controlPlane.js';
import { incrementMetric, setMetric } from './metrics.js';
import { broadcast } from './dashboard.js';

export interface LifecycleContext {
  controlPlane: ControlPlane;
  antifragile: AntifragileShell;
  planner: PlanningEngine;
}

export async function handleNewJob(
  context: LifecycleContext,
  job: { jobId: bigint; metadata: string },
  execute: (planId: string) => Promise<{ success: boolean; resultHash?: string }>
): Promise<void> {
  if (context.controlPlane.state.paused) {
    broadcast({ type: 'job-skipped', payload: { jobId: job.jobId.toString() } });
    return;
  }

  const planCandidates = context.planner.generateCandidates({
    jobMetadata: job.metadata,
    rewardEstimate: 5,
    expectedDurationMinutes: 45,
    riskScore: 1
  });

  const plan = context.planner.selectBestPlan(planCandidates);
  broadcast({ type: 'plan-selected', payload: { jobId: job.jobId.toString(), plan } });

  const result = await execute(plan.id);
  if (result.success) {
    incrementMetric('jobsCompleted');
    broadcast({ type: 'job-completed', payload: { jobId: job.jobId.toString(), resultHash: result.resultHash } });
  } else {
    incrementMetric('jobsFailed');
    broadcast({ type: 'job-failed', payload: { jobId: job.jobId.toString() } });
  }
}

export function updateStakeMetrics(balance: number, rewards: number): void {
  setMetric('stakeBalance', balance);
  setMetric('rewardsClaimed', rewards);
  broadcast({ type: 'finance-update', payload: { balance, rewards } });
}
