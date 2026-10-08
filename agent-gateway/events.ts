import { WebSocketServer } from 'ws';
import { ethers } from 'ethers';
import { decodeJobMetadata } from './jobMetadata';
import { GatewayRequestBudget, peerAddressKey } from './requestBudget';
import {
  registry,
  validation,
  dispute,
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
  GATEWAY_API_KEY,
} from './utils';
import { Job, JobCreatedEvent } from './types';
import { appendTrainingRecord, RewardPayout } from '../shared/trainingRecords';
import {
  handleValidatorSelection,
  handleJobAwaitingValidation,
  handleJobCompletionForValidators,
  handleDisputeRaised,
  handleDisputeResolved,
} from './validator';
import { handleJobCompletion as handlePlanJobCompletion } from './jobPlanner';

const rewardPayoutCache = new Map<string, RewardPayout[]>();

export function getRewardPayouts(jobId: string): RewardPayout[] {
  const key = jobId.toString();
  const payouts = rewardPayoutCache.get(key);
  return payouts ? [...payouts] : [];
}

type JobCreatedCallback = (event: JobCreatedEvent) => void | Promise<void>;

interface EventCallbacks {
  onUnassignedJobCreated?: JobCreatedCallback;
}

export function registerEvents(
  wss: WebSocketServer,
  callbacks: EventCallbacks = {}
): void {
  const { onUnassignedJobCreated } = callbacks;
  const connectionBudget = new GatewayRequestBudget(60, 600);
  const messageBudget = new GatewayRequestBudget();
  const activePeers = new Map<string, number>();
  let activeConnections = 0;
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
      const jobIdBigInt = ethers.getBigInt(jobId);
      const job: Job = {
        jobId: jobIdBigInt.toString(),
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
      if (job.agent === ethers.ZeroAddress && onUnassignedJobCreated) {
        const payload: JobCreatedEvent = {
          jobId: jobIdBigInt,
          employer,
          agent: agentAddr,
          reward,
          stake,
          fee,
          specHash,
          uri,
        };
        Promise.resolve(onUnassignedJobCreated(payload)).catch((err) =>
          console.error('autoApply error', err)
        );
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
    'ResultSubmitted',
    (
      jobId: ethers.BigNumberish,
      worker: string,
      resultHash: string,
      resultURI: string,
      subdomain: string
    ) => {
      const id = jobId.toString();
      const submissionPayload = {
        jobId: id,
        worker,
        resultHash,
        resultURI,
        subdomain,
      };
      broadcast(wss, { type: 'ResultSubmitted', ...submissionPayload });
      broadcast(wss, { type: 'AwaitingValidation', ...submissionPayload });
      scheduleFinalize(id);
      console.log('AwaitingValidation', id);
      handleJobAwaitingValidation({
        jobId: id,
        worker,
        resultHash,
        resultURI,
        subdomain,
        receivedAt: new Date().toISOString(),
      }).catch((err) =>
        console.error('validator submission handling failed', err)
      );
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
          agentType = decodeJobMetadata(chainJob.packedMetadata).agentTypes;
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

      handlePlanJobCompletion(id, success).catch((err) =>
        console.error('job plan completion handling failed', id, err)
      );

      rewardPayoutCache.delete(id);
      cleanupJob(id);
      jobTimestamps.delete(id);
      console.log('JobCompleted', id, success);
      handleJobCompletionForValidators(id);
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
        handleValidatorSelection(id, validators).catch((err) =>
          console.error('validator selection handling failed', err)
        );
      }
    );
  }

  if (dispute) {
    dispute.on(
      'DisputeRaised',
      (jobId: ethers.BigNumberish, claimant: string, evidenceHash: string) => {
        const id = jobId.toString();
        console.log('DisputeRaised', id, claimant, evidenceHash);
        handleDisputeRaised(id, claimant, evidenceHash).catch((err) =>
          console.error('validator dispute handling failed', err)
        );
      }
    );
    dispute.on(
      'DisputeResolved',
      (jobId: ethers.BigNumberish, resolver: string, employerWins: boolean) => {
        const id = jobId.toString();
        console.log('DisputeResolved', id, resolver, employerWins);
        handleDisputeResolved(id, resolver, employerWins).catch((err) =>
          console.error('validator dispute resolution handling failed', err)
        );
      }
    );
  }

  wss.on('connection', (ws, request) => {
    let stopped = false;
    // Protocol and payload-limit errors are emitted on the socket. Handle
    // them before admission so a malformed client cannot crash the process.
    ws.on('error', () => {
      stopped = true;
      ws.terminate();
    });
    const rejectConnection = (code: number, reason: string): void => {
      stopped = true;
      // A peer may ignore the close handshake. Release the transport now so
      // denied connections cannot accumulate outside the active socket cap.
      try {
        ws.close(code, reason);
      } finally {
        ws.terminate();
      }
    };
    const peer = request?.socket?.remoteAddress;
    const peerKey = peerAddressKey(peer);
    const peerConnections = activePeers.get(peerKey) ?? 0;
    if (
      !connectionBudget.consume(peer).allowed ||
      activeConnections >= 256 ||
      peerConnections >= 16
    ) {
      rejectConnection(1013, 'connection budget exhausted; retry later');
      return;
    }
    activeConnections++;
    activePeers.set(peerKey, peerConnections + 1);
    let closed = false;
    // Dispatch registration is operator configuration. Public event listeners
    // cannot overwrite destinations or acknowledge another worker's queue.
    const operator = Boolean(
      GATEWAY_API_KEY && request?.headers['x-api-key'] === GATEWAY_API_KEY
    );
    const registrations = new Set<string>();
    ws.on('message', (data) => {
      if (closed || stopped) return;
      if (!messageBudget.consume(peer).allowed) {
        rejectConnection(1013, 'message budget exhausted; retry later');
        return;
      }
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
      if (msg.type !== 'register' && msg.type !== 'ack') return;
      if (!operator) {
        rejectConnection(1008, 'operator authentication required');
        return;
      }
      if (msg.type === 'register') {
        const { id, wallet } = msg;
        if (typeof id !== 'string' || typeof wallet !== 'string') return;
        const existing = agents.get(id);
        if (
          !existing ||
          !ethers.isAddress(wallet) ||
          typeof existing.wallet !== 'string' ||
          existing.wallet.toLowerCase() !== wallet.toLowerCase()
        ) {
          rejectConnection(
            1008,
            'agent registration does not match operator configuration'
          );
          return;
        }
        agents.set(id, { ...existing, ws });
        registrations.add(id);
        if (!pendingJobs.has(id)) pendingJobs.set(id, []);
        pendingJobs.get(id)!.forEach((job) => {
          ws.send(JSON.stringify({ type: 'job', job }));
        });
      } else if (msg.type === 'ack') {
        const { id, jobId } = msg;
        if (
          typeof id !== 'string' ||
          !registrations.has(id) ||
          agents.get(id)?.ws !== ws ||
          !['string', 'number'].includes(typeof jobId)
        )
          return;
        const queue = pendingJobs.get(id) || [];
        pendingJobs.set(
          id,
          queue.filter((j) => j.jobId !== String(jobId))
        );
      }
    });

    ws.on('close', () => {
      if (closed) return;
      closed = true;
      activeConnections--;
      const remaining = (activePeers.get(peerKey) ?? 1) - 1;
      if (remaining > 0) activePeers.set(peerKey, remaining);
      else activePeers.delete(peerKey);
      agents.forEach((info) => {
        if (info.ws === ws) info.ws = null;
      });
    });
  });
}
