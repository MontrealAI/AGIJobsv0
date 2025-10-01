'use client';

import { EventFilter, EventLog, hexlify } from 'ethers';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createReadOnlyProvider,
  getCertificateNFTContract,
  getJobRegistryContract,
} from '../lib/contracts';
import { jobStateToPhase } from '../lib/jobStatus';
import type { CertificateBadge, JobPhase } from '../types';

interface CertificateState {
  certificates: CertificateBadge[];
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
}

const compareJobIds = (a: bigint, b: bigint): number => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

const normalizeBigInt = (value: unknown): bigint | undefined => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string' && value.length > 0) {
    try {
      return BigInt(value);
    } catch (err) {
      console.warn('Unable to parse bigint value', value, err);
      return undefined;
    }
  }
  return undefined;
};

const normalizeUriHash = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString(16);
  if (typeof value === 'bigint') return `0x${value.toString(16)}`;
  if (value instanceof Uint8Array) return hexlify(value);
  if (Array.isArray(value)) {
    try {
      return hexlify(Uint8Array.from(value));
    } catch (err) {
      console.warn('Unable to normalize uri hash array', value, err);
      return undefined;
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

const sortCertificates = (items: CertificateBadge[]): CertificateBadge[] => {
  return [...items].sort((a, b) => {
    if (a.issuedAt !== b.issuedAt) {
      return b.issuedAt - a.issuedAt;
    }
    return compareJobIds(a.jobId, b.jobId);
  });
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeAddress = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string' && value.length > 0) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toString' in (value as { toString?: () => string })
  ) {
    try {
      const text = (value as { toString: () => string }).toString();
      return text.length > 0 ? text : undefined;
    } catch (err) {
      console.warn('Unable to normalise address value', value, err);
      return undefined;
    }
  }
  return undefined;
};

type JobRegistryReader = {
  jobs: (jobId: bigint) => Promise<unknown>;
  decodeJobMetadata: (packed: bigint) => Promise<unknown>;
};

interface JobSnapshot {
  employer: string;
  agent: string;
  deadline?: number;
  phase?: JobPhase;
}

const buildCertificateDescription = (
  jobId: bigint,
  snapshot: JobSnapshot
): string => {
  const parts = [`Certificate minted for job ${jobId.toString()}`];
  if (snapshot.phase) {
    parts.push(`Phase: ${snapshot.phase}`);
  }
  if (snapshot.deadline) {
    try {
      const formatted = new Date(snapshot.deadline * 1000).toLocaleDateString();
      parts.push(`Deadline: ${formatted}`);
    } catch (err) {
      console.warn(
        'Unable to format deadline for certificate badge',
        snapshot.deadline,
        err
      );
    }
  }
  return parts.join('. ');
};

const readJobSnapshot = async (
  contract: JobRegistryReader,
  jobId: bigint,
  fallbackAgent?: string
): Promise<JobSnapshot> => {
  const jobData = await contract.jobs(jobId);
  const jobRecord = jobData as Record<string, unknown> & {
    [index: number]: unknown;
  };
  const employer =
    normalizeAddress(jobRecord.employer ?? jobRecord[0]) ?? 'Unknown';
  const rawAgent = normalizeAddress(jobRecord.agent ?? jobRecord[1]);
  const agentCandidate =
    rawAgent && rawAgent.toLowerCase() !== ZERO_ADDRESS ? rawAgent : undefined;
  const packedMetadata =
    normalizeBigInt(jobRecord.packedMetadata ?? jobRecord[8]) ?? 0n;

  let phase: JobPhase | undefined;
  let deadline: number | undefined;
  try {
    const metadata = await contract.decodeJobMetadata(packedMetadata);
    const metadataRecord = metadata as Record<string, unknown> & {
      [index: number]: unknown;
    };
    const stateValue =
      normalizeNumber(metadataRecord.state ?? metadataRecord[0]) ?? 0;
    phase = jobStateToPhase(stateValue);
    const deadlineValue = normalizeNumber(
      metadataRecord.deadline ?? metadataRecord[6]
    );
    if (
      typeof deadlineValue === 'number' &&
      Number.isFinite(deadlineValue) &&
      deadlineValue > 0
    ) {
      deadline = deadlineValue;
    }
  } catch (err) {
    console.warn(
      'Unable to decode job metadata for certificate snapshot',
      jobId.toString(),
      err
    );
  }

  if (!phase) {
    phase = jobStateToPhase(0);
  }

  const agent = agentCandidate ?? fallbackAgent ?? 'Unknown';
  return { employer, agent, deadline, phase };
};

export const useCertificates = (owner?: string): CertificateState => {
  const provider = useMemo(() => createReadOnlyProvider(), []);
  const [certificates, setCertificates] = useState<CertificateBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!owner) {
      setCertificates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const certificateContract = getCertificateNFTContract(provider);
      const jobRegistry = getJobRegistryContract(provider);
      const filterFactory = (
        certificateContract.filters as Record<
          string,
          (...args: never[]) => EventFilter
        >
      ).CertificateMinted;
      if (!filterFactory) {
        setCertificates([]);
        setLoading(false);
        return;
      }
      const filter = filterFactory(owner);
      const logs = await (
        certificateContract as unknown as {
          queryFilter: (
            f: EventFilter,
            fromBlock?: number,
            toBlock?: number
          ) => Promise<EventLog[]>;
        }
      ).queryFilter(filter);

      const orderedLogs = [...logs].sort(
        (a, b) => a.blockNumber - b.blockNumber || a.index - b.index
      );

      const blockNumbers = Array.from(
        new Set(
          orderedLogs
            .map((log) =>
              typeof log.blockNumber === 'number' ? log.blockNumber : undefined
            )
            .filter((value): value is number => typeof value === 'number')
        )
      );

      const jobIds = Array.from(
        new Set(
          orderedLogs
            .map((log) => {
              const args = log.args ?? [];
              const jobArg =
                (args as { jobId?: unknown })?.jobId ??
                (args as unknown[])[1] ??
                log.topics?.[2];
              return normalizeBigInt(jobArg);
            })
            .filter((value): value is bigint => typeof value === 'bigint')
        )
      );

      const blockTimestampCache = new Map<number, number>();
      for (const blockNumber of blockNumbers) {
        try {
          const block = await provider.getBlock(blockNumber);
          if (block?.timestamp) {
            blockTimestampCache.set(blockNumber, Number(block.timestamp));
          }
        } catch (blockErr) {
          console.warn(
            'Unable to fetch block timestamp',
            blockNumber,
            blockErr
          );
        }
      }

      const metadataCache = new Map<bigint, string>();
      for (const jobId of jobIds) {
        try {
          const uri = await certificateContract.tokenURI(jobId);
          metadataCache.set(jobId, uri);
        } catch (uriErr) {
          console.warn(
            'Unable to fetch metadata for job',
            jobId.toString(),
            uriErr
          );
          metadataCache.set(jobId, '');
        }
      }

      const jobInfoCache = new Map<bigint, JobSnapshot>();
      const registryReader = jobRegistry as unknown as JobRegistryReader;
      for (const jobId of jobIds) {
        try {
          const snapshot = await readJobSnapshot(registryReader, jobId, owner);
          jobInfoCache.set(jobId, snapshot);
        } catch (jobErr) {
          console.warn(
            'Unable to fetch job info for',
            jobId.toString(),
            jobErr
          );
          jobInfoCache.set(jobId, {
            employer: 'Unknown',
            agent: owner ?? 'Unknown',
            phase: jobStateToPhase(0),
          });
        }
      }

      const badgeMap = new Map<string, CertificateBadge>();
      for (const log of orderedLogs) {
        const args = log.args ?? [];
        const jobArg =
          (args as { jobId?: unknown })?.jobId ??
          (args as unknown[])[1] ??
          log.topics?.[2];
        const jobId = normalizeBigInt(jobArg);
        if (!jobId) continue;
        const blockNumber =
          typeof log.blockNumber === 'number' ? log.blockNumber : undefined;
        const issuedAt = blockNumber
          ? blockTimestampCache.get(blockNumber) ??
            Math.floor(Date.now() / 1000)
          : Math.floor(Date.now() / 1000);
        const uriHash = normalizeUriHash(
          (args as { uriHash?: unknown })?.uriHash ?? (args as unknown[])[2]
        );
        const metadataURI = metadataCache.get(jobId) ?? '';
        const jobInfo = jobInfoCache.get(jobId) ?? {
          employer: 'Unknown',
          agent: owner ?? 'Unknown',
          phase: jobStateToPhase(0),
        };
        const description = buildCertificateDescription(jobId, jobInfo);
        const badge: CertificateBadge = {
          tokenId: jobId,
          jobId,
          metadataURI,
          slaURI: uriHash,
          issuedAt,
          employer: jobInfo.employer,
          agent: jobInfo.agent,
          description,
        };
        badgeMap.set(jobId.toString(), badge);
      }

      setCertificates(sortCertificates(Array.from(badgeMap.values())));
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Unable to load certificates');
    } finally {
      setLoading(false);
    }
  }, [owner, provider]);

  useEffect(() => {
    load().catch((err) => console.error(err));
  }, [load]);

  useEffect(() => {
    if (!owner) return;
    const certificateContract = getCertificateNFTContract(provider);
    const jobRegistry = getJobRegistryContract(provider);
    const registryReader = jobRegistry as unknown as JobRegistryReader;
    const ownerLower = owner.toLowerCase();

    const handler = async (
      to: string,
      jobIdRaw: unknown,
      uriHashRaw: unknown,
      event: EventLog
    ) => {
      if (!to || to.toLowerCase() !== ownerLower) return;
      try {
        const jobId = normalizeBigInt(jobIdRaw ?? event.topics?.[2]);
        if (!jobId) return;
        const [metadataURI, snapshot, block] = await Promise.all([
          certificateContract.tokenURI(jobId).catch((uriErr) => {
            console.warn(
              'Unable to fetch metadata for job',
              jobId.toString(),
              uriErr
            );
            return '';
          }),
          readJobSnapshot(registryReader, jobId, owner).catch((jobErr) => {
            console.warn(
              'Unable to fetch job info for',
              jobId.toString(),
              jobErr
            );
            return undefined;
          }),
          typeof event.blockNumber === 'number'
            ? provider.getBlock(event.blockNumber).catch((blockErr) => {
                console.warn(
                  'Unable to fetch block timestamp',
                  event.blockNumber,
                  blockErr
                );
                return undefined;
              })
            : Promise.resolve(undefined),
        ]);

        const jobSnapshot = snapshot ?? {
          employer: 'Unknown',
          agent: owner ?? 'Unknown',
          phase: jobStateToPhase(0),
        };
        const issuedAt = block?.timestamp
          ? Number(block.timestamp)
          : Math.floor(Date.now() / 1000);
        const uriHash = normalizeUriHash(
          uriHashRaw ?? (event.args as { uriHash?: unknown })?.uriHash
        );
        const description = buildCertificateDescription(jobId, jobSnapshot);

        const badge: CertificateBadge = {
          tokenId: jobId,
          jobId,
          metadataURI,
          slaURI: uriHash,
          issuedAt,
          employer: jobSnapshot.employer,
          agent: jobSnapshot.agent ?? owner ?? 'Unknown',
          description,
        };

        setCertificates((prev) => {
          const map = new Map(
            prev.map((entry) => [entry.tokenId.toString(), entry])
          );
          map.set(jobId.toString(), badge);
          return sortCertificates(Array.from(map.values()));
        });
      } catch (eventErr) {
        console.error('Failed to process CertificateMinted event', eventErr);
        load().catch((err) => console.error(err));
      }
    };

    certificateContract.on('CertificateMinted', handler);
    return () => {
      certificateContract.off('CertificateMinted', handler);
    };
  }, [load, owner, provider]);

  return { certificates, loading, error, refresh: load };
};
