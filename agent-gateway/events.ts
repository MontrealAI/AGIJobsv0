import { WebSocketServer } from 'ws';
import { ethers } from 'ethers';
import {
  registry,
  validation,
  jobs,
  broadcast,
  dispatch,
  scheduleExpiration,
  scheduleFinalize,
  agents,
  pendingJobs,
  TOKEN_DECIMALS,
  cleanupJob,
  jobTimestamps,
  stakeManager,
} from './utils';
import { Job } from './types';
import { handleJob } from './orchestrator';
import { appendTrainingRecord, RewardPayout } from '../shared/trainingRecords';

const rewardPayoutCache = new Map<string, RewardPayout[]>();

export function registerEvents(wss: WebSocketServer): void {
  registry.on(
    'JobCreated',
    (
      jobId: ethers.BigNumberish,
      employer: string,
      agentAddr: string,
      reward: bigint,
      stake: bigint,
      fee: bigint,
      specHash: string,
      uri: string
    ) => {
      const job: Job = {
        jobId: jobId.toString(),
        employer,
        agent: agentAddr,
        rewardRaw: reward.toString(),
        reward: ethers.formatUnits(reward, TOKEN_DECIMALS),
        stakeRaw: stake.toString(),
        stake: ethers.formatUnits(stake, TOKEN_DECIMALS),
        feeRaw: fee.toString(),
        fee: ethers.formatUnits(fee, TOKEN_DECIMALS),
        specHash,
        uri,
      };
      jobs.set(job.jobId, job);
      jobTimestamps.set(job.jobId, Date.now());
      broadcast(wss, { type: 'JobCreated', job });
      dispatch(wss, job);
      console.log('JobCreated', job);
      scheduleExpiration(job.jobId);
      if (job.agent === ethers.ZeroAddress) {
        handleJob(job).catch((err) => console.error('autoApply error', err));
      }
    }
  );

  if (stakeManager) {
    stakeManager.on(
      'RewardPaid',
      (jobId: string, recipient: string, amount: bigint) => {
        let id: string;
        try {
          id = ethers.getBigInt(jobId).toString();
        } catch {
          id = jobId.toString();
        }
        if (id === '0') return;
        const payout: RewardPayout = {
          recipient,
          raw: amount.toString(),
          formatted: ethers.formatUnits(amount, TOKEN_DECIMALS),
        };
        if (!rewardPayoutCache.has(id)) {
          rewardPayoutCache.set(id, []);
        }
        rewardPayoutCache.get(id)!.push(payout);
      }
    );
  }

  registry.on(
    'JobSubmitted',
    (
      jobId: ethers.BigNumberish,
      worker: string,
      resultHash: string,
      resultURI: string,
      subdomain: string
    ) => {
      const id = jobId.toString();
      broadcast(wss, {
        type: 'JobSubmitted',
        jobId: id,
        worker,
        resultHash,
        resultURI,
        subdomain,
      });
      scheduleFinalize(id);
      console.log('JobSubmitted', id);
    }
  );

  registry.on(
    'JobCompleted',
    async (jobId: ethers.BigNumberish, success: boolean) => {
      const id = jobId.toString();
      broadcast(wss, { type: 'JobCompleted', jobId: id, success });

      let rewardRaw = '0';
      let rewardFormatted = '0';
      let employer: string | undefined;
      let agentAddress: string | undefined;
      let agentType: number | undefined;
      let category: string | undefined;

      try {
        const chainJob = await registry.jobs(id);
        if (chainJob) {
          const rewardValue = chainJob.reward as bigint | undefined;
          if (typeof rewardValue !== 'undefined') {
            rewardRaw = rewardValue.toString();
            rewardFormatted = ethers.formatUnits(rewardValue, TOKEN_DECIMALS);
          }
          employer = (chainJob.employer as string) || undefined;
          agentAddress = (chainJob.agent as string) || undefined;
          const typeValue =
            typeof chainJob.agentTypes !== 'undefined'
              ? Number(chainJob.agentTypes)
              : undefined;
          if (!Number.isNaN(typeValue as number)) {
            agentType = typeValue as number;
          }
        }
      } catch (err) {
        console.warn('Failed to load job details for training log', id, err);
      }

      const cachedJob = jobs.get(id);
      if (!rewardRaw || rewardRaw === '0') {
        if (cachedJob?.rewardRaw) {
          rewardRaw = cachedJob.rewardRaw;
        }
        if (cachedJob?.reward) {
          rewardFormatted = cachedJob.reward;
        }
      }
      if (!employer && cachedJob?.employer) {
        employer = cachedJob.employer;
      }
      if (
        !agentAddress &&
        cachedJob?.agent &&
        cachedJob.agent !== ethers.ZeroAddress
      ) {
        agentAddress = cachedJob.agent;
      }

      if (agentAddress === ethers.ZeroAddress) {
        agentAddress = undefined;
      }

      if (typeof agentType === 'number' && !Number.isNaN(agentType)) {
        category = `agentType-${agentType}`;
      }

      const payouts = rewardPayoutCache.get(id);
      const createdAt = jobTimestamps.get(id);
      const durationMs = createdAt ? Date.now() - createdAt : undefined;
      const recordedAt = new Date().toISOString();

      try {
        await appendTrainingRecord({
          kind: 'job',
          jobId: id,
          recordedAt,
          agent: agentAddress,
          employer,
          agentType,
          category: category ?? undefined,
          success,
          reward: {
            posted: { raw: rewardRaw, formatted: rewardFormatted },
            payouts,
            decimals: TOKEN_DECIMALS,
          },
          metadata: {
            durationMs,
          },
        });
      } catch (err) {
        console.error('Failed to append training record', err);
      }

      rewardPayoutCache.delete(id);
      cleanupJob(id);
      jobTimestamps.delete(id);
      console.log('JobCompleted', id, success);
    }
  );

  if (validation) {
    validation.on(
      'ValidatorsSelected',
      (jobId: ethers.BigNumberish, validators: string[]) => {
        const id = jobId.toString();
        broadcast(wss, { type: 'ValidationStarted', jobId: id, validators });
        scheduleFinalize(id);
        console.log('ValidationStarted', id);
      }
    );
  }

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type === 'register') {
        const { id, wallet } = msg;
        if (!id || !wallet) return;
        const existing = agents.get(id) || {};
        agents.set(id, { url: (existing as any).url, wallet, ws });
        if (!pendingJobs.has(id)) pendingJobs.set(id, []);
        pendingJobs.get(id)!.forEach((job) => {
          ws.send(JSON.stringify({ type: 'job', job }));
        });
      } else if (msg.type === 'ack') {
        const { id, jobId } = msg;
        const queue = pendingJobs.get(id) || [];
        pendingJobs.set(
          id,
          queue.filter((j) => j.jobId !== String(jobId))
        );
      }
    });

    ws.on('close', () => {
      agents.forEach((info) => {
        if (info.ws === ws) info.ws = null;
      });
    });
  });
}
