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
} from './utils';
import { Job } from './types';

export function registerEvents(wss: WebSocketServer): void {
  registry.on(
    'JobCreated',
    (
      jobId: ethers.BigNumberish,
      employer: string,
      agentAddr: string,
      reward: bigint,
      stake: bigint,
      fee: bigint
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
      };
      jobs.set(job.jobId, job);
      jobTimestamps.set(job.jobId, Date.now());
      broadcast(wss, { type: 'JobCreated', job });
      dispatch(wss, job);
      console.log('JobCreated', job);
      scheduleExpiration(job.jobId);
    }
  );

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
    (jobId: ethers.BigNumberish, success: boolean) => {
      const id = jobId.toString();
      broadcast(wss, { type: 'JobCompleted', jobId: id, success });
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
