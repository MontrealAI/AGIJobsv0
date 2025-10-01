import { ethers } from 'ethers';
import {
  listDeliverables,
  type AgentDeliverableRecord,
  type StoredPayloadReference,
} from './deliverableStore';
import {
  getCachedIdentity,
  refreshIdentity,
  type AgentIdentity,
} from './identity';

export type ContributionSource = 'primary' | 'contributor';

export interface ContributionDetailSummary {
  jobId: string;
  deliverableId: string;
  submittedAt: string;
  success: boolean;
  submissionMethod?: string;
  txHash?: string;
  source: ContributionSource;
  contributorRole?: string;
  contributorLabel?: string;
  resultUri?: string;
  resultCid?: string;
  resultRef?: string;
  resultHash?: string;
  digest?: string;
  signature?: string;
  payloadDigest?: string;
  proof?: Record<string, unknown>;
  telemetry?: StoredPayloadReference;
  deliverableMetadata?: Record<string, unknown>;
  contributorMetadata?: Record<string, unknown>;
}

export interface ContributorProfileSummary {
  address: string;
  ens?: string;
  label?: string;
  role?: string;
  manifestCategories?: string[];
  totalContributions: number;
  successfulContributions: number;
  failedContributions: number;
  firstContributionAt?: string;
  lastContributionAt?: string;
  signatures: string[];
  payloadDigests: string[];
  contributions: ContributionDetailSummary[];
}

export interface JobContributorSummary {
  jobId: string;
  deliverableCount: number;
  lastSubmissionAt?: string;
  contributors: ContributorProfileSummary[];
}

export interface AgentContributionHistorySummary {
  agent: string;
  ens?: string;
  label?: string;
  role?: string;
  manifestCategories?: string[];
  totalContributions: number;
  successfulContributions: number;
  failedContributions: number;
  uniqueJobs: number;
  firstContributionAt?: string;
  lastContributionAt?: string;
  signatures: string[];
  payloadDigests: string[];
  contributions: ContributionDetailSummary[];
}

interface BuildJobContributorOptions {
  refreshIdentity?: boolean;
}

interface BuildAgentContributionOptions extends BuildJobContributorOptions {
  limit?: number;
}

interface ParticipantContribution {
  address: string;
  ens?: string;
  label?: string;
  role?: string;
  signature?: string;
  payloadDigest?: string;
  metadata?: Record<string, unknown>;
  source: ContributionSource;
}

interface InternalProfile {
  address: string;
  ens?: string;
  label?: string;
  role?: string;
  manifestCategories?: Set<string>;
  contributions: ContributionDetailSummary[];
  totalContributions: number;
  successfulContributions: number;
  failedContributions: number;
  firstContributionAt?: string;
  lastContributionAt?: string;
  signatures: Set<string>;
  payloadDigests: Set<string>;
}

function cloneValue<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  const scoped: typeof structuredClone | undefined = (globalThis as any)?.structuredClone;
  if (typeof scoped === 'function') {
    return scoped(value);
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function normaliseAddress(address: string): string {
  try {
    return ethers.getAddress(address);
  } catch {
    return address.toLowerCase();
  }
}

function extractString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function collectParticipants(
  deliverable: AgentDeliverableRecord
): ParticipantContribution[] {
  const participants: ParticipantContribution[] = [];
  const primaryMetadata = deliverable.metadata as Record<string, unknown> | undefined;
  participants.push({
    address: deliverable.agent,
    ens: extractString(primaryMetadata?.ens),
    label: extractString(primaryMetadata?.label),
    role: extractString(primaryMetadata?.role),
    signature: deliverable.signature,
    payloadDigest: deliverable.digest,
    metadata: primaryMetadata,
    source: 'primary',
  });
  if (Array.isArray(deliverable.contributors)) {
    for (const entry of deliverable.contributors) {
      const contributor: ParticipantContribution = {
        address: entry.address,
        ens: extractString(entry.ens),
        label: extractString(entry.label),
        role: extractString(entry.role),
        signature: entry.signature,
        payloadDigest: entry.payloadDigest,
        metadata: entry.metadata,
        source: 'contributor',
      };
      participants.push(contributor);
    }
  }
  return participants;
}

function ensureProfile(map: Map<string, InternalProfile>, address: string): InternalProfile {
  const key = address.toLowerCase();
  let profile = map.get(key);
  if (!profile) {
    profile = {
      address,
      contributions: [],
      totalContributions: 0,
      successfulContributions: 0,
      failedContributions: 0,
      signatures: new Set<string>(),
      payloadDigests: new Set<string>(),
      manifestCategories: new Set<string>(),
    };
    map.set(key, profile);
  }
  return profile;
}

function updateProfileWithDetail(
  profile: InternalProfile,
  detail: ContributionDetailSummary,
  participant: ParticipantContribution
): void {
  profile.contributions.push(detail);
  profile.totalContributions += 1;
  if (detail.success) {
    profile.successfulContributions += 1;
  } else {
    profile.failedContributions += 1;
  }
  if (!profile.firstContributionAt || detail.submittedAt < profile.firstContributionAt) {
    profile.firstContributionAt = detail.submittedAt;
  }
  if (!profile.lastContributionAt || detail.submittedAt > profile.lastContributionAt) {
    profile.lastContributionAt = detail.submittedAt;
  }
  if (!profile.ens && participant.ens) {
    profile.ens = participant.ens;
  }
  if (!profile.label && participant.label) {
    profile.label = participant.label;
  }
  if (!profile.role && participant.role) {
    profile.role = participant.role;
  }
  if (participant.signature) {
    profile.signatures.add(participant.signature);
  }
  if (participant.payloadDigest) {
    profile.payloadDigests.add(participant.payloadDigest);
  }
}

function applyIdentity(profile: InternalProfile, identity?: AgentIdentity | null): void {
  if (!identity) return;
  if (!profile.ens && identity.ensName) {
    profile.ens = identity.ensName;
  }
  if (!profile.label && identity.label) {
    profile.label = identity.label;
  }
  if (!profile.role && identity.role) {
    profile.role = identity.role;
  }
  if (Array.isArray(identity.manifestCategories)) {
    for (const category of identity.manifestCategories) {
      if (typeof category === 'string' && category.trim().length > 0) {
        profile.manifestCategories?.add(category);
      }
    }
  }
}

function finaliseProfile(profile: InternalProfile): ContributorProfileSummary {
  const contributions = profile.contributions.slice().sort((a, b) => {
    const timeCompare = b.submittedAt.localeCompare(a.submittedAt);
    if (timeCompare !== 0) return timeCompare;
    if (a.source === b.source) return 0;
    return a.source === 'primary' ? -1 : 1;
  });
  return {
    address: profile.address,
    ens: profile.ens,
    label: profile.label,
    role: profile.role,
    manifestCategories:
      profile.manifestCategories && profile.manifestCategories.size > 0
        ? Array.from(profile.manifestCategories).sort()
        : undefined,
    totalContributions: profile.totalContributions,
    successfulContributions: profile.successfulContributions,
    failedContributions: profile.failedContributions,
    firstContributionAt: profile.firstContributionAt,
    lastContributionAt: profile.lastContributionAt,
    signatures: Array.from(profile.signatures),
    payloadDigests: Array.from(profile.payloadDigests),
    contributions,
  };
}

function gatherProfiles(
  deliverables: AgentDeliverableRecord[]
): Map<string, InternalProfile> {
  const profiles = new Map<string, InternalProfile>();
  for (const deliverable of deliverables) {
    const participants = collectParticipants(deliverable);
    for (const participant of participants) {
      const address = normaliseAddress(participant.address);
      const profile = ensureProfile(profiles, address);
      const detail: ContributionDetailSummary = {
        jobId: deliverable.jobId,
        deliverableId: deliverable.id,
        submittedAt: deliverable.submittedAt,
        success: deliverable.success,
        submissionMethod: deliverable.submissionMethod,
        txHash: deliverable.txHash,
        source: participant.source,
        contributorRole: participant.role,
        contributorLabel: participant.label,
        resultUri: deliverable.resultUri,
        resultCid: deliverable.resultCid,
        resultRef: deliverable.resultRef,
        resultHash: deliverable.resultHash,
        digest: deliverable.digest,
        signature: participant.signature ?? deliverable.signature,
        payloadDigest: participant.payloadDigest ?? deliverable.digest,
        proof: deliverable.proof ? cloneValue(deliverable.proof) : undefined,
        telemetry: deliverable.telemetry ? cloneValue(deliverable.telemetry) : undefined,
        deliverableMetadata: deliverable.metadata
          ? cloneValue(deliverable.metadata)
          : undefined,
        contributorMetadata: participant.metadata
          ? cloneValue(participant.metadata)
          : undefined,
      };
      updateProfileWithDetail(profile, detail, participant);
    }
  }
  return profiles;
}

async function populateIdentities(
  profiles: Map<string, InternalProfile>,
  refresh = false
): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const profile of profiles.values()) {
    if (refresh) {
      tasks.push(
        refreshIdentity(profile.address)
          .then((identity) => applyIdentity(profile, identity))
          .catch((err) => {
            console.warn('Failed to refresh identity for', profile.address, err);
          })
      );
    } else {
      const cached = getCachedIdentity(profile.address);
      if (cached) {
        applyIdentity(profile, cached);
      } else {
        tasks.push(
          refreshIdentity(profile.address)
            .then((identity) => applyIdentity(profile, identity))
            .catch((err) => {
              console.warn('Identity lookup failed for', profile.address, err);
            })
        );
      }
    }
  }
  await Promise.all(tasks);
}

export async function buildJobContributorSummary(
  jobId: string,
  options: BuildJobContributorOptions = {}
): Promise<JobContributorSummary> {
  const deliverables = listDeliverables({ jobId });
  const profiles = gatherProfiles(deliverables);
  if (profiles.size > 0) {
    await populateIdentities(profiles, options.refreshIdentity === true);
  }
  const contributors = Array.from(profiles.values())
    .map((profile) => finaliseProfile(profile))
    .sort((a, b) => {
      const aTime = a.lastContributionAt ?? '';
      const bTime = b.lastContributionAt ?? '';
      const compare = (bTime || '').localeCompare(aTime || '');
      if (compare !== 0) return compare;
      return a.address.localeCompare(b.address);
    });
  const lastSubmissionAt = deliverables
    .map((record) => record.submittedAt)
    .sort()
    .pop();
  return {
    jobId,
    deliverableCount: deliverables.length,
    lastSubmissionAt,
    contributors,
  };
}

export async function buildAgentContributionHistory(
  address: string,
  options: BuildAgentContributionOptions = {}
): Promise<AgentContributionHistorySummary> {
  const normalised = normaliseAddress(address);
  const deliverables = listDeliverables();
  const profiles = gatherProfiles(deliverables);
  const key = normalised.toLowerCase();
  const profile = profiles.get(key);
  if (profile) {
    await populateIdentities(new Map([[key, profile]]), options.refreshIdentity === true);
  }
  const summaryProfile = profile ? finaliseProfile(profile) : undefined;
  const contributions = summaryProfile ? summaryProfile.contributions : [];
  const sortedContributions = contributions
    .slice()
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const limitedContributions =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? sortedContributions.slice(0, Math.max(0, Math.floor(options.limit)))
      : sortedContributions;
  const jobSet = new Set(limitedContributions.map((entry) => entry.jobId));
  return {
    agent: normalised,
    ens: summaryProfile?.ens,
    label: summaryProfile?.label,
    role: summaryProfile?.role,
    manifestCategories: summaryProfile?.manifestCategories,
    totalContributions: contributions.length,
    successfulContributions: summaryProfile?.successfulContributions ?? 0,
    failedContributions: summaryProfile?.failedContributions ?? 0,
    uniqueJobs: jobSet.size,
    firstContributionAt: summaryProfile?.firstContributionAt,
    lastContributionAt: summaryProfile?.lastContributionAt,
    signatures: summaryProfile ? summaryProfile.signatures : [],
    payloadDigests: summaryProfile ? summaryProfile.payloadDigests : [],
    contributions: limitedContributions,
  };
}
