'use client';

import { EventFilter, EventLog, JsonRpcProvider } from 'ethers';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createReadOnlyProvider, getJobRegistryContract } from '../lib/contracts';
import { jobStateToPhase } from '../lib/jobStatus';
import type { JobSummary, JobTimelineEvent } from '../types';

const JOB_EVENT_NAMES = [
  'JobCreated',
  'AgentAssigned',
  'ResultSubmitted',
  'ValidationStartTriggered',
  'JobFinalized',
  'JobDisputed'
] as const;

type JobEventName = (typeof JOB_EVENT_NAMES)[number];

interface UseJobFeedOptions {
  employer?: string;
  jobId?: bigint;
  watch?: boolean;
}

interface JobFeedState {
  jobs: JobSummary[];
  events: JobTimelineEvent[];
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
}

const toTimelineEvent = (event: JobEventName, log: EventLog): JobTimelineEvent => {
  const jobId = BigInt(log.topics[1]);
  const actorTopic = log.topics[2];
  const actor = actorTopic && actorTopic !== '0x' ? `0x${actorTopic.slice(26)}` : undefined;
  const timestamp = 0; // placeholder
  const descriptionMap: Record<JobEventName, string> = {
    JobCreated: 'Job posted to the network',
    AgentAssigned: 'Agent assignment confirmed',
    ResultSubmitted: 'Agent deliverables submitted',
    ValidationStartTriggered: 'Validator committee engaged',
    JobFinalized: 'Job finalized and payout settled',
    JobDisputed: 'Dispute raised for this job'
  };
  const phaseMap: Record<JobEventName, JobTimelineEvent['phase']> = {
    JobCreated: 'Created',
    AgentAssigned: 'Assigned',
    ResultSubmitted: 'Submitted',
    ValidationStartTriggered: 'InValidation',
    JobFinalized: 'Finalized',
    JobDisputed: 'Disputed'
  };
  return {
    id: `${event}-${log.transactionHash}-${log.index}`,
    jobId,
    name: event,
    description: descriptionMap[event],
    actor,
    txHash: log.transactionHash,
    timestamp,
    phase: phaseMap[event],
    meta: {
      blockNumber: log.blockNumber,
      args: log.args
    }
  };
};

const hydrateTimestamps = async (
  provider: JsonRpcProvider,
  items: JobTimelineEvent[]
): Promise<JobTimelineEvent[]> => {
  const blockNumbers = Array.from(
    new Set(items.map((item) => (typeof item.meta?.blockNumber === 'number' ? item.meta.blockNumber : undefined)))
  ).filter((value): value is number => typeof value === 'number');
  const cache = new Map<number, number>();
  for (const blockNumber of blockNumbers) {
    const block = await provider.getBlock(blockNumber);
    if (block?.timestamp) {
      cache.set(blockNumber, Number(block.timestamp));
    }
  }
  return items.map((item) => {
    const blockNumber = typeof item.meta?.blockNumber === 'number' ? item.meta.blockNumber : undefined;
    const timestamp = blockNumber ? cache.get(blockNumber) ?? item.timestamp : item.timestamp;
    return { ...item, timestamp };
  });
};

export const useJobFeed = (options: UseJobFeedOptions = {}): JobFeedState => {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [events, setEvents] = useState<JobTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const provider = useMemo(() => createReadOnlyProvider(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const contract = getJobRegistryContract(provider);
      const fromBlock = options.jobId ? undefined : (await provider.getBlockNumber()) - 50_000;
      const logs: EventLog[] = [];
      for (const eventName of JOB_EVENT_NAMES) {
        const filterFactory = (contract.filters as Record<string, (...args: never[]) => EventFilter>)[eventName];
        if (!filterFactory) continue;
        const filter = filterFactory();
        const result = await (contract as unknown as { queryFilter: (f: EventFilter, from?: number) => Promise<EventLog[]> }).queryFilter(
          filter,
          fromBlock
        );
        logs.push(...(result as EventLog[]));
      }
      logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
      const timelineRaw = logs
        .map((log) => {
          const eventName = log.fragment?.name as JobEventName | undefined;
          if (!eventName || !JOB_EVENT_NAMES.includes(eventName)) {
            return null;
          }
          return toTimelineEvent(eventName, log);
        })
        .filter((evt): evt is JobTimelineEvent => Boolean(evt))
        .filter((evt) => (options.jobId ? evt.jobId === options.jobId : true));
      const timeline = await hydrateTimestamps(provider, timelineRaw);

      const jobIds = Array.from(new Set(timeline.map((evt) => evt.jobId.toString())));
      const summaries: JobSummary[] = [];
      for (const idStr of jobIds) {
        const jobId = BigInt(idStr);
        const jobData = await contract.job(jobId);
        const phase = jobStateToPhase(Number(jobData.state ?? jobData[7] ?? 0));
        const relatedEvents = timeline.filter((evt) => evt.jobId === jobId);
        const summary: JobSummary = {
          jobId,
          employer: String(jobData.employer ?? jobData[0]),
          agent: jobData.worker ?? jobData.agent ?? jobData[1] ?? undefined,
          reward: BigInt(jobData.reward ?? jobData[2] ?? 0),
          stake: BigInt(jobData.stake ?? jobData[3] ?? 0),
          fee: BigInt(jobData.fee ?? jobData[4] ?? 0),
          deadline: Number(jobData.deadline ?? jobData[6] ?? 0),
          specHash: String(jobData.specHash ?? jobData[8] ?? '0x'),
          uri: String(jobData.uri ?? jobData[9] ?? ''),
          phase,
          lastUpdated: relatedEvents.reduce((acc, evt) => Math.max(acc, evt.timestamp ?? 0), 0)
        };
        summaries.push(summary);
      }

      setEvents(timeline);
      setJobs(summaries);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to load job activity');
    } finally {
      setLoading(false);
    }
  }, [options.jobId, provider]);

  useEffect(() => {
    load().catch((err) => console.error(err));
  }, [load]);

  useEffect(() => {
    if (!options.watch) return;
    const contract = getJobRegistryContract(provider);
    const handlers = JOB_EVENT_NAMES.map((name) => {
      const handler = () => {
        load().catch((err) => console.error(err));
      };
      contract.on(name, handler);
      return { name, handler };
    });
    return () => {
      handlers.forEach(({ name, handler }) => contract.off(name, handler));
    };
  }, [load, options.watch, provider]);

  return { jobs, events, loading, error, refresh: load };
};
