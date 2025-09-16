import { ethers } from 'ethers';
import { Job } from './types';
import { walletManager, registry } from './utils';
import { ensureIdentity } from './identity';
import { selectAgentForJob } from './agentRegistry';
import { ensureStake, ROLE_AGENT } from './stakeCoordinator';
import { executeJob } from './taskExecution';
import {
  recordAgentFailure,
  recordAgentSuccess,
  quarantineManager,
  secureLogAction,
} from './security';

export async function handleJob(job: Job): Promise<void> {
  if (job.agent !== ethers.ZeroAddress) return; // already assigned
  const decision = await selectAgentForJob(job);
  if (!decision) {
    console.warn('No suitable agent found for job', job.jobId);
    return;
  }
  const { profile, analysis } = decision;
  const wallet = walletManager.get(profile.address);
  if (!wallet) {
    console.warn('Wallet not found for selected agent', profile.address);
    return;
  }
  if (quarantineManager.isQuarantined(wallet.address)) {
    console.warn(
      'Agent is quarantined; skipping job',
      job.jobId,
      wallet.address
    );
    return;
  }
  let identity;
  try {
    identity = await ensureIdentity(
      wallet,
      profile.role === 'validator' ? 'validator' : 'agent'
    );
  } catch (err: any) {
    console.error('Identity verification failed', err);
    recordAgentFailure(wallet.address, 'identity-verification');
    await secureLogAction(
      {
        component: 'orchestrator',
        action: 'identity-failed',
        agent: wallet.address,
        jobId: job.jobId,
        metadata: { error: err?.message },
        success: false,
      },
      wallet
    );
    return;
  }

  const requiredStake = analysis.stake;
  try {
    await ensureStake(wallet, requiredStake, ROLE_AGENT);
  } catch (err: any) {
    console.error('Failed to ensure stake', err);
    recordAgentFailure(wallet.address, 'stake-insufficient');
    await secureLogAction(
      {
        component: 'orchestrator',
        action: 'stake-failed',
        agent: wallet.address,
        jobId: job.jobId,
        metadata: {
          error: err?.message,
          requiredStake: requiredStake.toString(),
        },
        success: false,
      },
      wallet
    );
    return;
  }

  try {
    const tx = await (registry as any)
      .connect(wallet)
      .applyForJob(job.jobId, identity.label ?? '', '0x');
    await tx.wait();
    await secureLogAction(
      {
        component: 'orchestrator',
        action: 'apply',
        agent: wallet.address,
        jobId: job.jobId,
        metadata: { txHash: tx.hash },
        success: true,
      },
      wallet
    );
  } catch (err: any) {
    console.error('Failed to apply for job', err);
    recordAgentFailure(wallet.address, 'apply-failed');
    await secureLogAction(
      {
        component: 'orchestrator',
        action: 'apply-failed',
        agent: wallet.address,
        jobId: job.jobId,
        metadata: { error: err?.message },
        success: false,
      },
      wallet
    );
    return;
  }

  try {
    const chainJob = await registry.jobs(job.jobId);
    const assigned = (chainJob.agent as string | undefined)?.toLowerCase();
    if (assigned !== wallet.address.toLowerCase()) {
      console.warn('Job not assigned to this agent after apply', job.jobId);
      return;
    }
  } catch (err) {
    console.warn('Unable to confirm job assignment', err);
  }

  try {
    await executeJob({ job, wallet, profile, identity, analysis });
    recordAgentSuccess(wallet.address);
    await secureLogAction(
      {
        component: 'orchestrator',
        action: 'execute',
        agent: wallet.address,
        jobId: job.jobId,
        success: true,
      },
      wallet
    );
  } catch (err: any) {
    console.error('Task execution failed', err);
    recordAgentFailure(wallet.address, 'execution-error');
    await secureLogAction(
      {
        component: 'orchestrator',
        action: 'execute-failed',
        agent: wallet.address,
        jobId: job.jobId,
        metadata: { error: err?.message },
        success: false,
      },
      wallet
    );
  }
}
