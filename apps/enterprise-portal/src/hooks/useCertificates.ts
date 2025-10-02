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
import { verifyDeliverableSignature } from '../lib/crypto';
import { resolveResourceUri } from '../lib/uri';

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
const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
const HEX_32_REGEX = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE_REGEX = /^0x[0-9a-fA-F]{130,132}$/;

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

const normalizeBytes32 = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    if (typeof value === 'number') {
      const hex = value.toString(16);
      const prefixed = hex.length % 2 === 0 ? `0x${hex}` : `0x0${hex}`;
      return HEX_32_REGEX.test(prefixed) ? prefixed.toLowerCase() : undefined;
    }
    if (typeof value === 'bigint') {
      const hex = value.toString(16);
      const prefixed = hex.length % 2 === 0 ? `0x${hex}` : `0x0${hex}`;
      return HEX_32_REGEX.test(prefixed) ? prefixed.toLowerCase() : undefined;
    }
    if (value instanceof Uint8Array) {
      const hex = hexlify(value);
      return HEX_32_REGEX.test(hex) ? hex.toLowerCase() : undefined;
    }
    if (
      value &&
      typeof value === 'object' &&
      'toString' in (value as { toString?: () => string })
    ) {
      try {
        const text = (value as { toString: () => string }).toString();
        const prefixed = text.startsWith('0x') ? text : `0x${text}`;
        return HEX_32_REGEX.test(prefixed) ? prefixed.toLowerCase() : undefined;
      } catch (err) {
        console.warn('Unable to normalise bytes32 value', value, err);
        return undefined;
      }
    }
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return HEX_32_REGEX.test(prefixed) ? prefixed.toLowerCase() : undefined;
};

const normalizeSignature = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return SIGNATURE_REGEX.test(prefixed) ? prefixed.toLowerCase() : undefined;
};

const isUriLike = (value: string | undefined): value is string => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^(ipfs|https?|ar):\/\//i.test(trimmed);
};

const isCidLike = (value: string | undefined): value is string => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('ipfs://')) return true;
  if (trimmed.startsWith('Qm') && trimmed.length >= 46) return true;
  if (
    trimmed.startsWith('bafy') ||
    trimmed.startsWith('bag') ||
    trimmed.startsWith('ba')
  )
    return true;
  return false;
};

const extractCidFromUri = (value?: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('ipfs://')) {
    const path = trimmed.slice(7).replace(/^ipfs\//, '');
    return path.split(/[/?#]/)[0] ?? undefined;
  }
  const ipfsMatch = trimmed.match(/\/ipfs\/([^/?#]+)/i);
  if (ipfsMatch?.[1]) {
    return ipfsMatch[1];
  }
  if (isCidLike(trimmed)) {
    return trimmed.split(/[/?#]/)[0];
  }
  return undefined;
};

interface Candidate {
  value: string;
  path: string[];
}

interface FieldCandidates {
  uris: Candidate[];
  cids: Candidate[];
  hashes: Candidate[];
  signatures: Candidate[];
}

const collectCandidates = (
  value: unknown,
  path: string[] = [],
  acc: FieldCandidates = { uris: [], cids: [], hashes: [], signatures: [] }
): FieldCandidates => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const nextPath = [...path, `[${index}]`];
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (!trimmed) return;
        const candidate: Candidate = { value: trimmed, path: nextPath };
        if (isUriLike(trimmed)) acc.uris.push(candidate);
        if (isCidLike(trimmed)) acc.cids.push(candidate);
        const hash = normalizeBytes32(trimmed);
        if (hash) acc.hashes.push({ value: hash, path: nextPath });
        const signature = normalizeSignature(trimmed);
        if (signature)
          acc.signatures.push({ value: signature, path: nextPath });
      } else {
        collectCandidates(entry, nextPath, acc);
      }
    });
    return acc;
  }

  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return acc;
      const candidate: Candidate = { value: trimmed, path };
      if (isUriLike(trimmed)) acc.uris.push(candidate);
      if (isCidLike(trimmed)) acc.cids.push(candidate);
      const hash = normalizeBytes32(trimmed);
      if (hash) acc.hashes.push({ value: hash, path });
      const signature = normalizeSignature(trimmed);
      if (signature) acc.signatures.push({ value: signature, path });
    }
    return acc;
  }

  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    const nextPath = [...path, key];
    const lowerKey = key.toLowerCase();
    if (typeof child === 'string') {
      const trimmed = child.trim();
      if (!trimmed) continue;
      const candidate: Candidate = { value: trimmed, path: nextPath };
      if (
        lowerKey.includes('uri') ||
        lowerKey.includes('url') ||
        isUriLike(trimmed)
      ) {
        acc.uris.push(candidate);
      }
      if (lowerKey.includes('cid') || isCidLike(trimmed)) {
        acc.cids.push(candidate);
      }
      const hash = normalizeBytes32(trimmed);
      if (hash) acc.hashes.push({ value: hash, path: nextPath });
      const signature = normalizeSignature(trimmed);
      if (signature) acc.signatures.push({ value: signature, path: nextPath });
    } else if (Array.isArray(child)) {
      collectCandidates(child, nextPath, acc);
    } else if (child && typeof child === 'object') {
      const possibleTrait =
        'trait_type' in (child as { trait_type?: unknown }) &&
        'value' in (child as { value?: unknown });
      if (possibleTrait) {
        const trait = String(
          (child as { trait_type?: unknown }).trait_type ?? ''
        )
          .toLowerCase()
          .trim();
        const traitValue = (child as { value?: unknown }).value;
        const traitPath = [...nextPath, trait || 'trait'];
        if (typeof traitValue === 'string') {
          const trimmed = traitValue.trim();
          if (trimmed) {
            const candidate: Candidate = { value: trimmed, path: traitPath };
            if (
              trait.includes('uri') ||
              trait.includes('url') ||
              isUriLike(trimmed)
            ) {
              acc.uris.push(candidate);
            }
            if (trait.includes('cid') || isCidLike(trimmed)) {
              acc.cids.push(candidate);
            }
            const hash = normalizeBytes32(trimmed);
            if (hash) acc.hashes.push({ value: hash, path: traitPath });
            const signature = normalizeSignature(trimmed);
            if (signature)
              acc.signatures.push({ value: signature, path: traitPath });
          }
        } else {
          collectCandidates(traitValue, traitPath, acc);
        }
      } else {
        collectCandidates(child, nextPath, acc);
      }
    }
  }
  return acc;
};

const scoreCandidate = (candidate: Candidate, keywords: string[]): number => {
  const pathText = candidate.path.join('.').toLowerCase();
  let score = 0;
  keywords.forEach((keyword, index) => {
    if (pathText.includes(keyword)) {
      score += (keywords.length - index) * 10;
    }
  });
  const value = candidate.value.toLowerCase();
  if (value.startsWith('ipfs://')) score += 6;
  if (value.includes('/ipfs/')) score += 4;
  if (value.startsWith('https://') || value.startsWith('http://')) score += 3;
  if (
    value.startsWith('qm') ||
    value.startsWith('bafy') ||
    value.startsWith('bag')
  )
    score += 5;
  if (HEX_32_REGEX.test(value)) score += 4;
  if (SIGNATURE_REGEX.test(value)) score += 4;
  return score;
};

const pickCandidate = (
  candidates: Candidate[],
  keywords: string[],
  predicate?: (value: string) => boolean
): Candidate | undefined => {
  const filtered = predicate
    ? candidates.filter((candidate) => predicate(candidate.value))
    : candidates;
  if (filtered.length === 0) return undefined;
  const scored = filtered
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, keywords),
    }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.candidate;
};

interface CertificateMetadataDetail {
  name?: string;
  description?: string;
  deliverableUri?: string;
  deliverableCid?: string;
  resultHash?: string;
  signature?: string;
  slaUri?: string;
}

const toStringOrUndefined = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return undefined;
};

const parseCertificateMetadata = (
  payload: unknown
): CertificateMetadataDetail => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const record = payload as Record<string, unknown>;

  const work =
    (record.work as Record<string, unknown> | undefined) ?? undefined;
  const deliverable =
    (record.deliverable as Record<string, unknown> | undefined) ?? undefined;

  const directDeliverableUris = [
    toStringOrUndefined(
      record.deliverableUri ?? record.resultUri ?? record.artifactUri
    ),
    toStringOrUndefined(work?.deliverableUri ?? work?.resultUri ?? work?.uri),
    toStringOrUndefined(deliverable?.uri ?? deliverable?.url),
  ].filter(isUriLike);

  const directDeliverableCids = [
    toStringOrUndefined(record.deliverableCid ?? record.resultCid),
    toStringOrUndefined(work?.deliverableCid ?? work?.resultCid ?? work?.cid),
    toStringOrUndefined(deliverable?.cid ?? deliverable?.contentId),
  ].filter(isCidLike);

  const directResultHashes = [
    normalizeBytes32(
      record.resultHash ?? record.outputHash ?? record.artifactHash
    ),
    normalizeBytes32(work?.resultHash ?? work?.hash),
    normalizeBytes32(deliverable?.hash),
  ].filter(Boolean) as string[];

  const directSignatures = [
    normalizeSignature(
      record.signature ?? record.agentSignature ?? record.resultSignature
    ),
    normalizeSignature(work?.signature),
    normalizeSignature(deliverable?.signature ?? deliverable?.agentSignature),
  ].filter(Boolean) as string[];

  const directSlaUris = [
    toStringOrUndefined(
      (record.sla as Record<string, unknown> | undefined)?.uri ??
        (record.sla as Record<string, unknown> | undefined)?.url
    ),
    toStringOrUndefined(record.slaUri ?? record.slaURL ?? record.slaLink),
  ].filter(isUriLike);

  const candidates = collectCandidates(payload);

  const deliverableUriCandidate =
    directDeliverableUris[0] ??
    pickCandidate(
      candidates.uris,
      ['deliverable', 'result', 'work', 'evidence'],
      isUriLike
    )?.value;

  const deliverableCidCandidate =
    directDeliverableCids[0] ??
    pickCandidate(
      candidates.cids,
      ['deliverable', 'result', 'work', 'evidence'],
      isCidLike
    )?.value;

  const resultHashCandidate =
    directResultHashes[0] ??
    pickCandidate(candidates.hashes, ['result', 'deliverable', 'work'])?.value;

  const signatureCandidate =
    directSignatures[0] ??
    pickCandidate(candidates.signatures, ['signature', 'deliverable', 'result'])
      ?.value;

  const slaUriCandidate =
    directSlaUris[0] ??
    pickCandidate(candidates.uris, ['sla', 'agreement', 'contract'], isUriLike)
      ?.value;

  let deliverableUri = deliverableUriCandidate;
  let deliverableCid = deliverableCidCandidate;
  if (!deliverableCid && deliverableUri) {
    deliverableCid = extractCidFromUri(deliverableUri);
  }
  if (!deliverableUri && deliverableCid) {
    deliverableUri = `ipfs://${deliverableCid}`;
  }

  const resultHash =
    resultHashCandidate && resultHashCandidate !== ZERO_HASH
      ? resultHashCandidate
      : undefined;

  const signature = signatureCandidate ?? undefined;

  const name = toStringOrUndefined(record.name ?? record.title);
  const description = toStringOrUndefined(record.description ?? record.summary);

  return {
    name,
    description,
    deliverableUri,
    deliverableCid,
    resultHash,
    signature,
    slaUri: slaUriCandidate,
  };
};

const fetchCertificateMetadata = async (
  uri: string
): Promise<CertificateMetadataDetail> => {
  const resolved = resolveResourceUri(uri);
  if (!resolved) {
    throw new Error('Unable to resolve certificate metadata URI.');
  }
  const response = await fetch(resolved);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch certificate metadata: ${response.status} ${response.statusText}`
    );
  }
  try {
    const json = await response.json();
    return parseCertificateMetadata(json);
  } catch {
    throw new Error('Certificate metadata is not valid JSON.');
  }
};

const assembleBadge = async (params: {
  jobId: bigint;
  issuedAt: number;
  metadataURI: string;
  jobSnapshot: JobSnapshot;
  uriHash?: string;
  metadataDetail?: CertificateMetadataDetail;
  metadataError?: string;
}): Promise<CertificateBadge> => {
  const {
    jobId,
    issuedAt,
    metadataURI,
    jobSnapshot,
    uriHash,
    metadataDetail,
    metadataError,
  } = params;
  const metadataCid = extractCidFromUri(metadataURI);
  const metadataGatewayURI =
    metadataURI && metadataURI.trim().length > 0
      ? resolveResourceUri(metadataURI) ?? metadataURI
      : undefined;
  const deliverableUri =
    metadataDetail?.deliverableUri ??
    (metadataDetail?.deliverableCid
      ? `ipfs://${metadataDetail.deliverableCid}`
      : undefined);
  const deliverableCid =
    metadataDetail?.deliverableCid ?? extractCidFromUri(deliverableUri);
  const metadataResultHash = metadataDetail?.resultHash;
  const signature = metadataDetail?.signature;
  const slaUri = metadataDetail?.slaUri;

  const onChainResultHash =
    jobSnapshot.resultHash && jobSnapshot.resultHash !== ZERO_HASH
      ? jobSnapshot.resultHash
      : undefined;
  const resultHash = onChainResultHash ?? metadataResultHash;

  const hashMatchesOnChain =
    metadataResultHash && onChainResultHash
      ? metadataResultHash.toLowerCase() === onChainResultHash.toLowerCase()
      : undefined;

  let signatureVerified: boolean | undefined;
  let verificationMessage: string | undefined;
  let verificationError: string | undefined;
  let verificationDetails: CertificateBadge['verification'];

  if (signature) {
    if (!resultHash) {
      verificationError = 'Missing result hash for verification.';
    } else if (!jobSnapshot.agent || jobSnapshot.agent === 'Unknown') {
      verificationError = 'Agent address unavailable for verification.';
    } else {
      try {
        const verification = await verifyDeliverableSignature(
          signature,
          resultHash,
          jobSnapshot.agent
        );
        verificationDetails = {
          normalizedHash: verification.normalizedHash,
          recoveredAddress: verification.recoveredAddress,
          matchesAgent: verification.matchesAgent,
          matchesHash: verification.matchesHash,
        };

        if (!verification.matchesHash) {
          verificationError =
            'Result hash must be a 32-byte hex string prefixed with 0x.';
          signatureVerified = false;
        } else if (!verification.matchesAgent) {
          verificationError = `Recovered signer ${verification.recoveredAddress} does not match agent ${jobSnapshot.agent}.`;
          signatureVerified = false;
        } else if (
          onChainResultHash &&
          verification.normalizedHash.toLowerCase() !==
            onChainResultHash.toLowerCase()
        ) {
          verificationError =
            'Signature hash does not match on-chain result hash.';
          signatureVerified = false;
        } else {
          signatureVerified = true;
          verificationMessage =
            'Signature matches assigned agent and on-chain result hash.';
        }
      } catch (err) {
        verificationError =
          (err as Error).message ?? 'Failed to verify deliverable signature.';
        signatureVerified = false;
      }
    }
  }

  const description = buildCertificateDescription(jobId, jobSnapshot);

  return {
    tokenId: jobId,
    jobId,
    metadataURI,
    metadataCid,
    metadataGatewayURI,
    metadataName: metadataDetail?.name,
    metadataDescription: metadataDetail?.description,
    uriHash: uriHash ?? jobSnapshot.uriHash,
    slaUri,
    issuedAt,
    employer: jobSnapshot.employer,
    agent: jobSnapshot.agent,
    description,
    resultHash,
    metadataResultHash,
    hashMatchesOnChain,
    deliverableUri,
    deliverableCid,
    signature,
    signatureVerified,
    verification: verificationDetails,
    verificationMessage,
    verificationError,
    metadataError,
  };
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
  resultHash?: string;
  uriHash?: string;
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
  const resultHash = normalizeBytes32(jobRecord.resultHash ?? jobRecord[6]);
  const uriHash = normalizeBytes32(jobRecord.uriHash ?? jobRecord[5]);
  return { employer, agent, deadline, phase, resultHash, uriHash };
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

      const metadataDetails = new Map<bigint, CertificateMetadataDetail>();
      const metadataErrors = new Map<bigint, string>();
      await Promise.all(
        jobIds.map(async (jobId) => {
          const metadataURI = metadataCache.get(jobId);
          if (!metadataURI || metadataURI.trim().length === 0) {
            metadataErrors.set(
              jobId,
              'Metadata URI not configured for certificate.'
            );
            return;
          }
          try {
            const detail = await fetchCertificateMetadata(metadataURI);
            metadataDetails.set(jobId, detail);
          } catch (metadataErr) {
            console.warn(
              'Unable to load certificate metadata for job',
              jobId.toString(),
              metadataErr
            );
            const message =
              (metadataErr as Error).message ??
              'Unable to load certificate metadata';
            metadataErrors.set(jobId, message);
          }
        })
      );

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
            resultHash: undefined,
            uriHash: undefined,
          });
        }
      }

      const mintedLogsByJob = new Map<string, EventLog>();
      for (const log of orderedLogs) {
        const args = log.args ?? [];
        const jobArg =
          (args as { jobId?: unknown })?.jobId ??
          (args as unknown[])[1] ??
          log.topics?.[2];
        const jobId = normalizeBigInt(jobArg);
        if (!jobId) continue;
        mintedLogsByJob.set(jobId.toString(), log);
      }

      const badges = (
        await Promise.all(
          jobIds.map(async (jobId) => {
            const log = mintedLogsByJob.get(jobId.toString());
            if (!log) return undefined;
            const blockNumber =
              typeof log.blockNumber === 'number' ? log.blockNumber : undefined;
            const issuedAt = blockNumber
              ? blockTimestampCache.get(blockNumber) ??
                Math.floor(Date.now() / 1000)
              : Math.floor(Date.now() / 1000);
            const args = log.args ?? [];
            const uriHash = normalizeUriHash(
              (args as { uriHash?: unknown })?.uriHash ?? (args as unknown[])[2]
            );
            const metadataURI = metadataCache.get(jobId) ?? '';
            const jobInfo =
              jobInfoCache.get(jobId) ??
              ({
                employer: 'Unknown',
                agent: owner ?? 'Unknown',
                phase: jobStateToPhase(0),
                resultHash: undefined,
                uriHash: undefined,
              } as JobSnapshot);
            const metadataDetail = metadataDetails.get(jobId);
            const metadataError = metadataErrors.get(jobId);

            return assembleBadge({
              jobId,
              issuedAt,
              metadataURI,
              jobSnapshot: jobInfo,
              uriHash,
              metadataDetail,
              metadataError,
            });
          })
        )
      ).filter((badge): badge is CertificateBadge => Boolean(badge));

      setCertificates(sortCertificates(badges));
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

        let metadataDetail: CertificateMetadataDetail | undefined;
        let metadataError: string | undefined;
        if (metadataURI && metadataURI.trim().length > 0) {
          try {
            metadataDetail = await fetchCertificateMetadata(metadataURI);
          } catch (metaErr) {
            metadataError =
              (metaErr as Error).message ??
              'Unable to load certificate metadata';
          }
        } else {
          metadataError = 'Metadata URI not configured for certificate.';
        }

        const jobSnapshot =
          snapshot ??
          ({
            employer: 'Unknown',
            agent: owner ?? 'Unknown',
            phase: jobStateToPhase(0),
            resultHash: undefined,
            uriHash: undefined,
          } as JobSnapshot);
        const issuedAt = block?.timestamp
          ? Number(block.timestamp)
          : Math.floor(Date.now() / 1000);
        const uriHash = normalizeUriHash(
          uriHashRaw ?? (event.args as { uriHash?: unknown })?.uriHash
        );

        const badge = await assembleBadge({
          jobId,
          issuedAt,
          metadataURI,
          jobSnapshot,
          uriHash,
          metadataDetail,
          metadataError,
        });

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
