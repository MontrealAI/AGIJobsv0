'use client';

import {
  EventFilter,
  EventLog,
  JsonRpcProvider,
  keccak256,
  toUtf8Bytes,
} from 'ethers';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createReadOnlyProvider,
  getJobRegistryContract,
  getValidationModuleContract,
  portalConfig,
} from '../lib/contracts';
import { jobStateToPhase } from '../lib/jobStatus';
import type { JobSummary, JobTimelineEvent, ValidatorInsight } from '../types';
import { computeFromBlock } from './useJobFeed.helpers';

const JOB_EVENT_NAMES = [
  'JobCreated',
  'AgentAssigned',
  'ResultSubmitted',
  'ValidationStartTriggered',
  'JobFinalized',
  'JobDisputed',
] as const;

type JobEventName = (typeof JOB_EVENT_NAMES)[number];

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
const HEX_32_REGEX = /^0x[0-9a-fA-F]{64}$/;

const isHex32 = (value: string): boolean => HEX_32_REGEX.test(value);

const normaliseString = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint')
    return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalised = normaliseString(entry);
      if (normalised) return normalised;
    }
  }
  if (
    typeof value === 'object' &&
    'toString' in (value as { toString?: () => string })
  ) {
    return (value as { toString: () => string }).toString();
  }
  return undefined;
};

const extractResultDetails = (
  args: unknown
): { resultHash?: string; resultURI?: string } => {
  if (!args) return {};
  const record = args as Record<string, unknown>;
  const arrayArgs = Array.isArray(args) ? (args as unknown[]) : undefined;
  const resultHash = normaliseString(record.resultHash ?? arrayArgs?.[2]);
  const resultURI = normaliseString(record.resultURI ?? arrayArgs?.[3]);
  return { resultHash, resultURI };
};

const normaliseBigInt = (value: unknown, fallback = 0n): bigint => {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string' && value.length > 0) return BigInt(value);
    if (
      value &&
      typeof value === 'object' &&
      'toString' in (value as { toString?: () => string })
    ) {
      const text = (value as { toString: () => string }).toString();
      if (text.length > 0) return BigInt(text);
    }
  } catch (err) {
    console.warn('Unable to normalise bigint value', value, err);
  }
  return fallback;
};

const normaliseHex = (value: unknown): string | undefined => {
  const str = normaliseString(value)?.trim();
  if (!str) return undefined;
  const prefixed = str.startsWith('0x') ? str : `0x${str}`;
  if (!isHex32(prefixed)) return undefined;
  return prefixed.toLowerCase();
};

const normaliseNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const hashMatches = (candidate: string, expected: string): boolean => {
  try {
    const hashed = keccak256(toUtf8Bytes(candidate));
    return hashed.toLowerCase() === expected.toLowerCase();
  } catch (err) {
    console.warn('Unable to compare uri hash', candidate, err);
    return false;
  }
};

const deriveSpecUri = (params: {
  specHash?: string;
  uriHash?: string;
  createdArgs?: unknown;
}): string | undefined => {
  const { specHash, uriHash, createdArgs } = params;
  const expectedHash =
    uriHash && uriHash !== ZERO_HASH && isHex32(uriHash)
      ? uriHash.toLowerCase()
      : undefined;

  const eventUri = (() => {
    if (!createdArgs) return undefined;
    const record = createdArgs as Record<string, unknown>;
    const arrayArgs = Array.isArray(createdArgs)
      ? (createdArgs as unknown[])
      : undefined;
    const candidate = normaliseString(
      record.uri ??
        record.metadataURI ??
        record.specUri ??
        (arrayArgs ? arrayArgs[7] : undefined)
    );
    if (!candidate) return undefined;
    const trimmed = candidate.trim();
    if (!trimmed) return undefined;
    if (!expectedHash && isHex32(trimmed)) return undefined;
    return trimmed;
  })();

  const validatedEventUri =
    eventUri && (!expectedHash || hashMatches(eventUri, expectedHash))
      ? eventUri
      : undefined;

  const specDerived = (() => {
    const hash = specHash?.toLowerCase();
    if (!hash || hash === ZERO_HASH) return undefined;
    const suffix = hash.startsWith('0x') ? hash.slice(2) : hash;
    if (!suffix) return undefined;
    return `ipfs://job-spec/${suffix}`;
  })();

  const validatedSpecUri =
    specDerived && (!expectedHash || hashMatches(specDerived, expectedHash))
      ? specDerived
      : undefined;

  if (validatedEventUri) return validatedEventUri;
  if (validatedSpecUri) return validatedSpecUri;
  if (!expectedHash) return eventUri ?? specDerived;
  return undefined;
};

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

const toTimelineEvent = (
  event: JobEventName,
  log: EventLog
): JobTimelineEvent => {
  const jobId = BigInt(log.topics[1]);
  const actorTopic = log.topics[2];
  const actor =
    actorTopic && actorTopic !== '0x' ? `0x${actorTopic.slice(26)}` : undefined;
  const timestamp = 0; // placeholder
  const descriptionMap: Record<JobEventName, string> = {
    JobCreated: 'Job posted to the network',
    AgentAssigned: 'Agent assignment confirmed',
    ResultSubmitted: 'Agent deliverables submitted',
    ValidationStartTriggered: 'Validator committee engaged',
    JobFinalized: 'Job finalized and payout settled',
    JobDisputed: 'Dispute raised for this job',
  };
  const phaseMap: Record<JobEventName, JobTimelineEvent['phase']> = {
    JobCreated: 'Created',
    AgentAssigned: 'Assigned',
    ResultSubmitted: 'Submitted',
    ValidationStartTriggered: 'InValidation',
    JobFinalized: 'Finalized',
    JobDisputed: 'Disputed',
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
      args: log.args,
    },
  };
};

const hydrateTimestamps = async (
  provider: JsonRpcProvider,
  items: JobTimelineEvent[]
): Promise<JobTimelineEvent[]> => {
  const blockNumbers = Array.from(
    new Set(
      items.map((item) =>
        typeof item.meta?.blockNumber === 'number'
          ? item.meta.blockNumber
          : undefined
      )
    )
  ).filter((value): value is number => typeof value === 'number');
  const cache = new Map<number, number>();
  for (const blockNumber of blockNumbers) {
    const block = await provider.getBlock(blockNumber);
    if (block?.timestamp) {
      cache.set(blockNumber, Number(block.timestamp));
    }
  }
  return items.map((item) => {
    const blockNumber =
      typeof item.meta?.blockNumber === 'number'
        ? item.meta.blockNumber
        : undefined;
    const timestamp = blockNumber
      ? cache.get(blockNumber) ?? item.timestamp
      : item.timestamp;
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
        const filterFactory = (
          contract.filters as Record<string, (...args: never[]) => EventFilter>
        )[eventName];
        if (!filterFactory) continue;
        const filter = filterFactory();
        const result = await (
          contract as unknown as {
            queryFilter: (f: EventFilter, from?: number) => Promise<EventLog[]>;
          }
        ).queryFilter(filter, fromBlock);
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

      const eventsByJob = new Map<string, JobTimelineEvent[]>();
      for (const item of timeline) {
        const jobKey = item.jobId.toString();
        if (!eventsByJob.has(jobKey)) {
          eventsByJob.set(jobKey, []);
        }
        eventsByJob.get(jobKey)!.push(item);
      }

      if (options.jobId && !eventsByJob.has(options.jobId.toString())) {
        eventsByJob.set(options.jobId.toString(), []);
      }

      const jobIdStrings = Array.from(eventsByJob.keys());
      const summaryMap = new Map<string, JobSummary>();
      for (const idStr of jobIdStrings) {
        const jobId = BigInt(idStr);
        const jobData = await contract.jobs(jobId);
        const jobRecord = jobData as Record<string, unknown> & {
          [index: number]: unknown;
        };
        const packedMetadata = normaliseBigInt(
          jobRecord.packedMetadata ?? jobRecord[8] ?? 0n,
          0n
        );
        let metadataRecord:
          | (Record<string, unknown> & { [index: number]: unknown })
          | undefined;
        try {
          const metadata = await contract.decodeJobMetadata(packedMetadata);
          metadataRecord = metadata as Record<string, unknown> & {
            [index: number]: unknown;
          };
        } catch (metadataErr) {
          console.warn(
            'Failed to decode job metadata',
            jobId.toString(),
            metadataErr
          );
        }

        const statusValue = metadataRecord
          ? normaliseNumber(
              metadataRecord.status ??
                metadataRecord.state ??
                metadataRecord[0],
              0
            )
          : 0;
        const feePctValue = metadataRecord
          ? normaliseBigInt(
              metadataRecord.feePct ?? metadataRecord[4] ?? 0n,
              0n
            )
          : 0n;
        const deadlineValue = metadataRecord
          ? normaliseNumber(metadataRecord.deadline ?? metadataRecord[6], 0)
          : 0;
        const assignedAtOnchain = metadataRecord
          ? normaliseNumber(metadataRecord.assignedAt ?? metadataRecord[7], 0)
          : 0;

        const relatedEvents = eventsByJob.get(idStr) ?? [];
        const createdEvent = relatedEvents.find(
          (evt) => evt.name === 'JobCreated'
        );
        const assignedEvent = relatedEvents.find(
          (evt) => evt.name === 'AgentAssigned'
        );
        const resultEvent = [...relatedEvents]
          .filter((evt) => evt.name === 'ResultSubmitted')
          .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
          .pop();
        const validationEvent = [...relatedEvents]
          .filter((evt) => evt.name === 'ValidationStartTriggered')
          .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
          .pop();
        const { resultHash: submittedResultHash, resultURI } =
          extractResultDetails(resultEvent?.meta?.args);
        const storedResultHash = normaliseHex(
          jobRecord.resultHash ?? jobRecord[6]
        );
        const employer =
          normaliseString(jobRecord.employer ?? jobRecord[0]) ?? ZERO_ADDRESS;
        const agentRaw = normaliseString(jobRecord.agent ?? jobRecord[1]);
        const agent =
          agentRaw && agentRaw !== ZERO_ADDRESS ? agentRaw : undefined;
        const reward = normaliseBigInt(
          jobRecord.reward ?? jobRecord[2] ?? 0n,
          0n
        );
        const stake = normaliseBigInt(
          jobRecord.stake ?? jobRecord[3] ?? 0n,
          0n
        );
        const uriHashValue =
          normaliseHex(jobRecord.uriHash ?? jobRecord[5]) ?? ZERO_HASH;
        const specHashValue =
          normaliseHex(jobRecord.specHash ?? jobRecord[7]) ?? '0x';
        const fee = feePctValue > 0n ? (reward * feePctValue) / 100n : 0n;
        const specUri = deriveSpecUri({
          specHash: specHashValue,
          uriHash: uriHashValue,
          createdArgs: createdEvent?.meta?.args,
        });

        const phase = jobStateToPhase(statusValue);
        const summary: JobSummary = {
          jobId,
          employer,
          agent,
          reward,
          stake,
          fee,
          deadline: deadlineValue,
          specHash: specHashValue,
          specUri,
          uriHash: uriHashValue !== ZERO_HASH ? uriHashValue : undefined,
          phase,
          lastUpdated: relatedEvents.reduce(
            (acc, evt) => Math.max(acc, evt.timestamp ?? 0),
            0
          ),
          createdAt: createdEvent?.timestamp,
          assignedAt:
            assignedEvent?.timestamp ??
            (assignedAtOnchain ? assignedAtOnchain : undefined),
          resultSubmittedAt: resultEvent?.timestamp,
          resultHash:
            submittedResultHash ??
            (storedResultHash && storedResultHash !== ZERO_HASH
              ? storedResultHash
              : undefined),
          resultUri: resultURI,
          validationStartedAt: validationEvent?.timestamp,
          validationEndsAt: deadlineValue || undefined,
        };
        summaryMap.set(idStr, summary);
      }

      const validatorMap = new Map<string, Map<string, ValidatorInsight>>();
      const ensureInsight = (
        jobId: bigint,
        address: string
      ): ValidatorInsight => {
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
            stake: validationModule ? 0n : undefined,
          };
          jobValidators.set(normalizedAddress, insight);
        }
        if (!insight.validator) {
          insight.validator = address;
        }
        return insight;
      };

      for (const idStr of jobIdStrings) {
        const jobId = BigInt(idStr);
        try {
          const committee = await (
            contract as unknown as {
              getJobValidators: (jobId: bigint) => Promise<string[]>;
            }
          ).getJobValidators(jobId);
          committee.forEach((address) => {
            if (address && address !== ZERO_ADDRESS) {
              ensureInsight(jobId, String(address));
            }
          });
        } catch (err) {
          console.warn(
            'Failed to load validator committee from registry',
            jobId.toString(),
            err
          );
        }
      }

      if (validationModule) {
        const moduleLogs: EventLog[] = [];
        const vmFilters = validationModule.filters as Record<
          string,
          (...args: never[]) => EventFilter
        >;
        const selectedFilter = vmFilters.ValidatorsSelected(
          options.jobId ?? null
        );
        const commitFilter = vmFilters.ValidationCommitted(
          options.jobId ?? null,
          null
        );
        const revealFilter = vmFilters.ValidationRevealed(
          options.jobId ?? null,
          null
        );
        const selectedLogs = await validationModule.queryFilter(
          selectedFilter,
          fromBlock
        );
        const commitLogs = await validationModule.queryFilter(
          commitFilter,
          fromBlock
        );
        const revealLogs = await validationModule.queryFilter(
          revealFilter,
          fromBlock
        );
        moduleLogs.push(...selectedLogs, ...commitLogs, ...revealLogs);

        const blockNumbers = Array.from(
          new Set(
            moduleLogs
              .map((log) =>
                typeof log.blockNumber === 'number'
                  ? log.blockNumber
                  : Number(log.blockNumber ?? 0)
              )
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
          const blockNumber =
            typeof log.blockNumber === 'number'
              ? log.blockNumber
              : Number(log.blockNumber ?? 0);
          if (!Number.isFinite(blockNumber) || blockNumber <= 0)
            return undefined;
          return timestampCache.get(blockNumber);
        };

        for (const log of selectedLogs) {
          const jobIdValue =
            log.args?.jobId ??
            (log.topics?.[1] ? BigInt(log.topics[1]) : undefined);
          if (jobIdValue === undefined) continue;
          const jobId =
            typeof jobIdValue === 'bigint' ? jobIdValue : BigInt(jobIdValue);
          const validatorsFromLog = (log.args?.validators ?? []) as string[];
          const timestamp = logTimestamp(log);
          validatorsFromLog.forEach((address) => {
            if (!address) return;
            const insight = ensureInsight(jobId, String(address));
            if (
              timestamp &&
              (!insight.selectedAt || insight.selectedAt < timestamp)
            ) {
              insight.selectedAt = timestamp;
            }
          });
        }

        for (const log of commitLogs) {
          const jobIdValue =
            log.args?.jobId ??
            (log.topics?.[1] ? BigInt(log.topics[1]) : undefined);
          const validatorAddress =
            log.args?.validator ??
            (log.topics?.[2] ? `0x${log.topics[2].slice(26)}` : undefined);
          if (jobIdValue === undefined || !validatorAddress) continue;
          const jobId =
            typeof jobIdValue === 'bigint' ? jobIdValue : BigInt(jobIdValue);
          const insight = ensureInsight(jobId, String(validatorAddress));
          const timestamp = logTimestamp(log);
          if (
            timestamp &&
            (!insight.committedAt || insight.committedAt < timestamp)
          ) {
            insight.committedAt = timestamp;
          }
          if (!insight.commitTx) {
            insight.commitTx = log.transactionHash;
          }
        }

        for (const log of revealLogs) {
          const jobIdValue =
            log.args?.jobId ??
            (log.topics?.[1] ? BigInt(log.topics[1]) : undefined);
          const validatorAddress =
            log.args?.validator ??
            (log.topics?.[2] ? `0x${log.topics[2].slice(26)}` : undefined);
          if (jobIdValue === undefined || !validatorAddress) continue;
          const jobId =
            typeof jobIdValue === 'bigint' ? jobIdValue : BigInt(jobIdValue);
          const insight = ensureInsight(jobId, String(validatorAddress));
          const timestamp = logTimestamp(log);
          if (
            timestamp &&
            (!insight.revealedAt || insight.revealedAt < timestamp)
          ) {
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
                    insight.stake =
                      typeof value === 'bigint' ? value : BigInt(value);
                  } catch {
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

      summaryMap.forEach((summary, idStr) => {
        const validatorsForJob = validatorMap.get(idStr);
        if (!validatorsForJob || validatorsForJob.size === 0) {
          summary.totalValidators = 0;
          summary.validatorVotes = 0;
          summary.stakedByValidators = 0n;
          return;
        }
        let votes = 0;
        let totalStake = 0n;
        validatorsForJob.forEach((insight) => {
          if (insight.vote) {
            votes += 1;
          }
          if (typeof insight.stake === 'bigint') {
            totalStake += insight.stake;
          }
        });
        summary.totalValidators = validatorsForJob.size;
        summary.validatorVotes = votes;
        summary.stakedByValidators = totalStake;
      });

      const summaries = Array.from(summaryMap.values()).sort((a, b) =>
        Number(b.jobId - a.jobId)
      );

      const validatorList = Array.from(validatorMap.values()).flatMap(
        (collection) => Array.from(collection.values())
      );

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
      ? ['ValidatorsSelected', 'ValidationCommitted', 'ValidationRevealed'].map(
          (name) => {
            const handler = () => {
              load().catch((err) => console.error(err));
            };
            validationModule.on(name, handler);
            return { name, handler };
          }
        )
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
    refresh: load,
  };
};
