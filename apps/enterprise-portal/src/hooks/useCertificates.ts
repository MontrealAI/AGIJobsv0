'use client';

import { EventFilter, EventLog, hexlify } from 'ethers';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createReadOnlyProvider, getCertificateNFTContract, getJobRegistryContract } from '../lib/contracts';
import type { CertificateBadge } from '../types';

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
  if (typeof value === 'object' && 'toString' in (value as { toString?: () => string })) {
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
      const filterFactory = (certificateContract.filters as Record<string, (...args: never[]) => EventFilter>).CertificateMinted;
      if (!filterFactory) {
        setCertificates([]);
        setLoading(false);
        return;
      }
      const filter = filterFactory(owner);
      const logs = await (certificateContract as unknown as {
        queryFilter: (f: EventFilter, fromBlock?: number, toBlock?: number) => Promise<EventLog[]>;
      }).queryFilter(filter);

      const orderedLogs = [...logs].sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

      const blockNumbers = Array.from(
        new Set(
          orderedLogs
            .map((log) => (typeof log.blockNumber === 'number' ? log.blockNumber : undefined))
            .filter((value): value is number => typeof value === 'number')
        )
      );

      const jobIds = Array.from(
        new Set(
          orderedLogs
            .map((log) => {
              const args = log.args ?? [];
              const jobArg = (args as { jobId?: unknown })?.jobId ?? (args as unknown[])[1] ?? log.topics?.[2];
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
          console.warn('Unable to fetch block timestamp', blockNumber, blockErr);
        }
      }

      const metadataCache = new Map<bigint, string>();
      for (const jobId of jobIds) {
        try {
          const uri = await certificateContract.tokenURI(jobId);
          metadataCache.set(jobId, uri);
        } catch (uriErr) {
          console.warn('Unable to fetch metadata for job', jobId.toString(), uriErr);
          metadataCache.set(jobId, '');
        }
      }

      const jobInfoCache = new Map<bigint, { employer: string; agent: string }>();
      for (const jobId of jobIds) {
        try {
          const jobData = await jobRegistry.job(jobId);
          const employer = String((jobData as { employer?: string })?.employer ?? (jobData as unknown[])[0] ?? 'Unknown');
          const agent = String(
            (jobData as { worker?: string })?.worker ??
              (jobData as { agent?: string })?.agent ??
              (jobData as unknown[])[1] ??
              owner ??
              'Unknown'
          );
          jobInfoCache.set(jobId, { employer, agent });
        } catch (jobErr) {
          console.warn('Unable to fetch job info for', jobId.toString(), jobErr);
          jobInfoCache.set(jobId, { employer: 'Unknown', agent: owner ?? 'Unknown' });
        }
      }

      const badgeMap = new Map<string, CertificateBadge>();
      for (const log of orderedLogs) {
        const args = log.args ?? [];
        const jobArg = (args as { jobId?: unknown })?.jobId ?? (args as unknown[])[1] ?? log.topics?.[2];
        const jobId = normalizeBigInt(jobArg);
        if (!jobId) continue;
        const blockNumber = typeof log.blockNumber === 'number' ? log.blockNumber : undefined;
        const issuedAt = blockNumber
          ? blockTimestampCache.get(blockNumber) ?? Math.floor(Date.now() / 1000)
          : Math.floor(Date.now() / 1000);
        const uriHash = normalizeUriHash((args as { uriHash?: unknown })?.uriHash ?? (args as unknown[])[2]);
        const metadataURI = metadataCache.get(jobId) ?? '';
        const jobInfo = jobInfoCache.get(jobId) ?? { employer: 'Unknown', agent: owner ?? 'Unknown' };
        const badge: CertificateBadge = {
          tokenId: jobId,
          jobId,
          metadataURI,
          slaURI: uriHash,
          issuedAt,
          employer: jobInfo.employer,
          agent: jobInfo.agent,
          description: `Certificate minted for job ${jobId.toString()}`
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
        const [metadataURI, jobData, block] = await Promise.all([
          certificateContract
            .tokenURI(jobId)
            .catch((uriErr) => {
              console.warn('Unable to fetch metadata for job', jobId.toString(), uriErr);
              return '';
            }),
          jobRegistry
            .job(jobId)
            .catch((jobErr) => {
              console.warn('Unable to fetch job info for', jobId.toString(), jobErr);
              return undefined;
            }),
          typeof event.blockNumber === 'number'
            ? provider.getBlock(event.blockNumber).catch((blockErr) => {
                console.warn('Unable to fetch block timestamp', event.blockNumber, blockErr);
                return undefined;
              })
            : Promise.resolve(undefined)
        ]);

        const employer = jobData
          ? String((jobData as { employer?: string })?.employer ?? (jobData as unknown[])[0] ?? 'Unknown')
          : 'Unknown';
        const agent = jobData
          ? String(
              (jobData as { worker?: string })?.worker ??
                (jobData as { agent?: string })?.agent ??
                (jobData as unknown[])[1] ??
                owner
            )
          : owner;
        const issuedAt = block?.timestamp ? Number(block.timestamp) : Math.floor(Date.now() / 1000);
        const uriHash = normalizeUriHash(uriHashRaw ?? (event.args as { uriHash?: unknown })?.uriHash);

        const badge: CertificateBadge = {
          tokenId: jobId,
          jobId,
          metadataURI,
          slaURI: uriHash,
          issuedAt,
          employer,
          agent: agent ?? owner,
          description: `Certificate minted for job ${jobId.toString()}`
        };

        setCertificates((prev) => {
          const map = new Map(prev.map((entry) => [entry.tokenId.toString(), entry]));
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
