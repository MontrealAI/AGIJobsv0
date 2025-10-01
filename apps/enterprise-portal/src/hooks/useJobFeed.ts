'use client';

import { EventFilter, EventLog, JsonRpcProvider } from 'ethers';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createReadOnlyProvider, getJobRegistryContract, getValidationModuleContract, portalConfig } from '../lib/contracts';
import { jobStateToPhase } from '../lib/jobStatus';
import type { JobSummary, JobTimelineEvent, ValidatorInsight } from '../types';
import { computeFromBlock } from './useJobFeed.helpers';

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
  validators: ValidatorInsight[];
  loading: boolean;
  error?: string;
  hasValidationModule: boolean;
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
  const [validators, setValidators] = useState<ValidatorInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const provider = useMemo(() => createReadOnlyProvider(), []);

  const resolveFromBlock = useCallback(
    () => computeFromBlock(provider, { jobId: options.jobId }),
    [options.jobId, provider]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const contract = getJobRegistryContract(provider);
      const validationModule = getValidationModuleContract(provider);
      const fromBlock = await resolveFromBlock();
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

      const jobIdSet = new Set(timeline.map((evt) => evt.jobId.toString()));
      if (options.jobId) {
        jobIdSet.add(options.jobId.toString());
      }
      const jobIds = Array.from(jobIdSet);
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

      const validatorMap = new Map<string, Map<string, ValidatorInsight>>();
      const ensureInsight = (jobId: bigint, address: string): ValidatorInsight => {
        const normalizedAddress = address.toLowerCase();
        const jobKey = jobId.toString();
        if (!validatorMap.has(jobKey)) {
          validatorMap.set(jobKey, new Map());
        }
        const jobValidators = validatorMap.get(jobKey)!;
        let insight = jobValidators.get(normalizedAddress);
        if (!insight) {
          insight = {
            jobId,
            validator: address,
            stake: validationModule ? 0n : undefined
          };
          jobValidators.set(normalizedAddress, insight);
        }
        if (!insight.validator) {
          insight.validator = address;
        }
        return insight;
      };

      for (const idStr of jobIds) {
        const jobId = BigInt(idStr);
        try {
          const committee = await (contract as unknown as { getJobValidators: (jobId: bigint) => Promise<string[]> }).getJobValidators(jobId);
          committee.forEach((address) => {
            if (address && address !== '0x0000000000000000000000000000000000000000') {
              ensureInsight(jobId, String(address));
            }
          });
        } catch (err) {
          console.warn('Failed to load validator committee from registry', jobId.toString(), err);
        }
      }

      if (validationModule) {
        const moduleLogs: EventLog[] = [];
        const vmFilters = validationModule.filters as Record<string, (...args: never[]) => EventFilter>;
        const selectedFilter = vmFilters.ValidatorsSelected(options.jobId ?? null);
        const commitFilter = vmFilters.ValidationCommitted(options.jobId ?? null, null);
        const revealFilter = vmFilters.ValidationRevealed(options.jobId ?? null, null);
        const selectedLogs = await validationModule.queryFilter(selectedFilter, fromBlock);
        const commitLogs = await validationModule.queryFilter(commitFilter, fromBlock);
        const revealLogs = await validationModule.queryFilter(revealFilter, fromBlock);
        moduleLogs.push(...selectedLogs, ...commitLogs, ...revealLogs);

        const blockNumbers = Array.from(
          new Set(
            moduleLogs
              .map((log) => (typeof log.blockNumber === 'number' ? log.blockNumber : Number(log.blockNumber ?? 0)))
              .filter((value) => Number.isFinite(value) && value > 0)
          )
        );
        const timestampCache = new Map<number, number>();
        for (const blockNumber of blockNumbers) {
          const block = await provider.getBlock(blockNumber);
          if (block?.timestamp) {
            timestampCache.set(blockNumber, Number(block.timestamp));
          }
        }

        const logTimestamp = (log: EventLog): number | undefined => {
          const blockNumber = typeof log.blockNumber === 'number' ? log.blockNumber : Number(log.blockNumber ?? 0);
          if (!Number.isFinite(blockNumber) || blockNumber <= 0) return undefined;
          return timestampCache.get(blockNumber);
        };

        for (const log of selectedLogs) {
          const jobIdValue = log.args?.jobId ?? (log.topics?.[1] ? BigInt(log.topics[1]) : undefined);
          if (jobIdValue === undefined) continue;
          const jobId = typeof jobIdValue === 'bigint' ? jobIdValue : BigInt(jobIdValue);
          const validatorsFromLog = (log.args?.validators ?? []) as string[];
          const timestamp = logTimestamp(log);
          validatorsFromLog.forEach((address) => {
            if (!address) return;
            const insight = ensureInsight(jobId, String(address));
            if (timestamp && (!insight.selectedAt || insight.selectedAt < timestamp)) {
              insight.selectedAt = timestamp;
            }
          });
        }

        for (const log of commitLogs) {
          const jobIdValue = log.args?.jobId ?? (log.topics?.[1] ? BigInt(log.topics[1]) : undefined);
          const validatorAddress = log.args?.validator ?? (log.topics?.[2] ? `0x${log.topics[2].slice(26)}` : undefined);
          if (jobIdValue === undefined || !validatorAddress) continue;
          const jobId = typeof jobIdValue === 'bigint' ? jobIdValue : BigInt(jobIdValue);
          const insight = ensureInsight(jobId, String(validatorAddress));
          const timestamp = logTimestamp(log);
          if (timestamp && (!insight.committedAt || insight.committedAt < timestamp)) {
            insight.committedAt = timestamp;
          }
          if (!insight.commitTx) {
            insight.commitTx = log.transactionHash;
          }
        }

        for (const log of revealLogs) {
          const jobIdValue = log.args?.jobId ?? (log.topics?.[1] ? BigInt(log.topics[1]) : undefined);
          const validatorAddress = log.args?.validator ?? (log.topics?.[2] ? `0x${log.topics[2].slice(26)}` : undefined);
          if (jobIdValue === undefined || !validatorAddress) continue;
          const jobId = typeof jobIdValue === 'bigint' ? jobIdValue : BigInt(jobIdValue);
          const insight = ensureInsight(jobId, String(validatorAddress));
          const timestamp = logTimestamp(log);
          if (timestamp && (!insight.revealedAt || insight.revealedAt < timestamp)) {
            insight.revealedAt = timestamp;
          }
          insight.vote = log.args?.approve ? 'approve' : 'reject';
          if (!insight.revealTx) {
            insight.revealTx = log.transactionHash;
          }
        }

        const stakeFetches: Promise<void>[] = [];
        validatorMap.forEach((validatorsForJob) => {
          validatorsForJob.forEach((insight) => {
            stakeFetches.push(
              validationModule
                .validatorStakes(insight.jobId, insight.validator)
                .then((value: bigint) => {
                  try {
                    insight.stake = typeof value === 'bigint' ? value : BigInt(value);
                  } catch (err) {
                    insight.stake = 0n;
                  }
                })
                .catch(() => {
                  if (typeof insight.stake === 'undefined') {
                    insight.stake = 0n;
                  }
                })
            );
          });
        });
        await Promise.allSettled(stakeFetches);
      }

      const validatorList = Array.from(validatorMap.values()).flatMap((collection) => Array.from(collection.values()));

      validatorList.sort((a, b) => {
        const timestampA = a.revealedAt ?? a.committedAt ?? a.selectedAt ?? 0;
        const timestampB = b.revealedAt ?? b.committedAt ?? b.selectedAt ?? 0;
        if (timestampA !== timestampB) return timestampB - timestampA;
        if (a.jobId !== b.jobId) return Number(b.jobId - a.jobId);
        return a.validator.localeCompare(b.validator);
      });

      setEvents(timeline);
      setJobs(summaries);
      setValidators(validatorList);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to load job activity');
    } finally {
      setLoading(false);
    }
  }, [options.jobId, provider, resolveFromBlock]);

  useEffect(() => {
    load().catch((err) => console.error(err));
  }, [load]);

  useEffect(() => {
    if (!options.watch) return;
    const contract = getJobRegistryContract(provider);
    const validationModule = getValidationModuleContract(provider);
    const handlers = JOB_EVENT_NAMES.map((name) => {
      const handler = () => {
        load().catch((err) => console.error(err));
      };
      contract.on(name, handler);
      return { name, handler };
    });
    const validationHandlers = validationModule
      ? ['ValidatorsSelected', 'ValidationCommitted', 'ValidationRevealed'].map((name) => {
          const handler = () => {
            load().catch((err) => console.error(err));
          };
          validationModule.on(name, handler);
          return { name, handler };
        })
      : [];
    return () => {
      handlers.forEach(({ name, handler }) => contract.off(name, handler));
      validationHandlers.forEach(({ name, handler }) => {
        validationModule?.off(name, handler);
      });
    };
  }, [load, options.watch, provider]);

  return {
    jobs,
    events,
    validators,
    loading,
    error,
    hasValidationModule: Boolean(portalConfig.validationModuleAddress),
    refresh: load
  };
};
