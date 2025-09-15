import { ethers } from 'ethers';
import { Job } from './types';
import {
  refreshIdentity,
  getCachedIdentity,
  AgentIdentity,
  AgentIdentityMetadata,
} from './identity';
import { readTrainingRecords } from '../shared/trainingRecords';
import { readEnergySamples } from '../shared/energyMonitor';
import {
  getEfficiencyIndex,
  findCategoryBreakdown,
  clearEfficiencyCache,
  type EfficiencyBreakdown,
} from '../shared/efficiencyMetrics';
import { walletManager } from './utils';
import { getStakeBalance } from './stakeCoordinator';

export interface AgentProfile extends AgentIdentity {
  categories: string[];
  skills: string[];
  reputationScore: number;
  successRate: number;
  totalJobs: number;
  averageEnergy: number;
  averageDurationMs: number;
  stakeBalance?: bigint;
  endpoint?: string;
  metadata?: AgentIdentityMetadata;
}

export interface JobAnalysis {
  jobId: string;
  reward: bigint;
  stake: bigint;
  fee: bigint;
  employer: string;
  category?: string;
  specHash?: string;
  uri?: string;
  deadline?: number;
  description?: string;
  skills?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface AgentStats {
  success: number;
  total: number;
  totalDuration: number;
  totalEnergy: number;
}

const profileCache = new Map<string, AgentProfile>();
let statsCache: Map<string, AgentStats> | null = null;
let jobMetadataCache: Map<string, JobAnalysis> = new Map();

async function getIdentity(address: string): Promise<AgentIdentity> {
  const cached = getCachedIdentity(address);
  if (cached) return cached;
  return refreshIdentity(address);
}

async function loadStats(): Promise<Map<string, AgentStats>> {
  if (statsCache) {
    return statsCache;
  }
  const records = await readTrainingRecords();
  const energies = await readEnergySamples();
  const stats = new Map<string, AgentStats>();
  for (const record of records) {
    if (!record.agent) continue;
    const key = record.agent.toLowerCase();
    if (!stats.has(key)) {
      stats.set(key, {
        success: 0,
        total: 0,
        totalDuration: 0,
        totalEnergy: 0,
      });
    }
    const stat = stats.get(key)!;
    stat.total += 1;
    if (record.success) stat.success += 1;
    const duration = Number(record.metadata?.durationMs ?? 0);
    if (!Number.isNaN(duration)) {
      stat.totalDuration += duration;
    }
  }
  for (const sample of energies) {
    if (!sample.agent) continue;
    const key = sample.agent.toLowerCase();
    if (!stats.has(key)) {
      stats.set(key, {
        success: 0,
        total: 0,
        totalDuration: 0,
        totalEnergy: 0,
      });
    }
    const stat = stats.get(key)!;
    stat.totalEnergy += sample.energyEstimate;
  }
  statsCache = stats;
  return stats;
}

function buildCategories(
  identity: AgentIdentity,
  metadata?: AgentIdentityMetadata
): { categories: string[]; skills: string[]; endpoint?: string } {
  const categories = new Set<string>();
  const skills = new Set<string>();
  if (identity.manifestCategories) {
    identity.manifestCategories.forEach((cat) => categories.add(cat));
  }
  const meta = metadata || identity.metadata;
  if (meta?.categories) {
    meta.categories.forEach((cat) => categories.add(cat));
  }
  if (meta?.skills) {
    meta.skills.forEach((skill) => skills.add(skill));
  }
  const endpoint = meta?.url || identity.metadata?.url;
  return {
    categories: Array.from(categories),
    skills: Array.from(skills),
    endpoint,
  };
}

export async function buildAgentProfile(
  address: string
): Promise<AgentProfile> {
  const lower = address.toLowerCase();
  if (profileCache.has(lower)) {
    return profileCache.get(lower)!;
  }
  const identity = await getIdentity(address);
  const stats = await loadStats();
  const stat = stats.get(lower) || {
    success: 0,
    total: 0,
    totalDuration: 0,
    totalEnergy: 0,
  };
  const metadata = identity.metadata;
  const { categories, skills, endpoint } = buildCategories(identity, metadata);
  const successRate = stat.total === 0 ? 0 : stat.success / stat.total;
  const averageDurationMs =
    stat.total === 0 ? 0 : stat.totalDuration / stat.total;
  const averageEnergy = stat.total === 0 ? 0 : stat.totalEnergy / stat.total;
  const reputationScore = successRate;
  let stakeBalance: bigint | undefined;
  try {
    stakeBalance = await getStakeBalance(address);
  } catch (err) {
    console.warn('Unable to fetch stake balance', address, err);
  }
  const profile: AgentProfile = {
    ...identity,
    categories,
    skills,
    reputationScore,
    successRate,
    totalJobs: stat.total,
    averageDurationMs,
    averageEnergy,
    stakeBalance,
    endpoint,
    metadata,
  };
  profileCache.set(lower, profile);
  return profile;
}

export async function listAgentProfiles(): Promise<AgentProfile[]> {
  const addresses = walletManager.list();
  return Promise.all(addresses.map((addr) => buildAgentProfile(addr)));
}

async function parseJobMetadata(job: Job): Promise<Partial<JobAnalysis>> {
  if (!job.uri) return {};
  if (!job.uri.startsWith('http')) return {};
  try {
    const res = await fetch(job.uri);
    if (!res.ok) {
      console.warn('Failed to fetch job metadata', job.uri, res.statusText);
      return {};
    }
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      const category =
        typeof data.category === 'string' ? data.category : undefined;
      const description =
        typeof data.description === 'string' ? data.description : undefined;
      const skills = Array.isArray(data.skills)
        ? data.skills.filter((skill: unknown) => typeof skill === 'string')
        : undefined;
      const tags = Array.isArray(data.tags)
        ? data.tags.filter((tag: unknown) => typeof tag === 'string')
        : undefined;
      return {
        category,
        description,
        skills,
        tags,
        metadata: data,
      };
    } catch {
      return { metadata: { raw: text } };
    }
  } catch (err) {
    console.warn('Error fetching job metadata', job.uri, err);
    return {};
  }
}

export async function analyseJob(job: Job): Promise<JobAnalysis> {
  if (jobMetadataCache.has(job.jobId)) {
    return jobMetadataCache.get(job.jobId)!;
  }
  const reward = BigInt(job.rewardRaw || '0');
  const stake = BigInt(job.stakeRaw || '0');
  const fee = BigInt(job.feeRaw || '0');
  const base: JobAnalysis = {
    jobId: job.jobId,
    reward,
    stake,
    fee,
    employer: job.employer,
    specHash: job.specHash,
    uri: job.uri,
  };
  const metadata = await parseJobMetadata(job);
  const category =
    metadata.category || resolveCategoryFromJob(job) || undefined;
  const analysis: JobAnalysis = {
    ...base,
    ...metadata,
    category,
  };
  jobMetadataCache.set(job.jobId, analysis);
  return analysis;
}

function resolveCategoryFromJob(job: Job): string | undefined {
  if (job.agent && job.agent !== ethers.ZeroAddress) {
    return 'assigned';
  }
  return undefined;
}

function categoryMatchScore(profile: AgentProfile, category?: string): number {
  if (!category) return 0.1; // minimal default preference
  const categories = new Set(
    profile.categories.map((cat) => cat.toLowerCase())
  );
  if (categories.has(category.toLowerCase())) return 1;
  const skills = new Set(profile.skills.map((skill) => skill.toLowerCase()));
  if (skills.has(category.toLowerCase())) return 0.7;
  return 0;
}

function stakeAdequacyScore(
  profile: AgentProfile,
  requiredStake: bigint
): number {
  if (!profile.stakeBalance) return 0;
  if (profile.stakeBalance >= requiredStake) return 1;
  const ratio = Number(profile.stakeBalance) / Number(requiredStake || 1n);
  return Math.max(0, Math.min(1, ratio));
}

function energyScore(profile: AgentProfile): number {
  if (!profile.averageEnergy || profile.averageEnergy <= 0) {
    return 1;
  }
  return 1 / (1 + profile.averageEnergy / 1000);
}

function energyPreferenceFromThermodynamics(
  breakdown?: EfficiencyBreakdown
): number {
  if (!breakdown) {
    return 0;
  }
  if (breakdown.averageEnergy <= 0) {
    return 1;
  }
  return 1 / (1 + breakdown.averageEnergy / 1000);
}

function rewardEfficiencyScore(breakdown?: EfficiencyBreakdown): number {
  if (!breakdown) {
    return 0;
  }
  const rewardPerEnergy = breakdown.rewardPerEnergy;
  if (!Number.isFinite(rewardPerEnergy) || rewardPerEnergy <= 0) {
    return 0;
  }
  return Math.min(1, Math.log10(1 + rewardPerEnergy) / 2);
}

function thermodynamicScore(breakdown?: EfficiencyBreakdown): number {
  if (!breakdown) {
    return 0;
  }
  const value = breakdown.efficiencyScore;
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(1, value);
}

function formatScore(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.000';
  }
  return value.toFixed(3);
}

export interface MatchResult {
  profile: AgentProfile;
  score: number;
  analysis: JobAnalysis;
  reasons: string[];
  thermodynamics?: EfficiencyBreakdown;
}

export async function selectAgentForJob(job: Job): Promise<MatchResult | null> {
  const analysis = await analyseJob(job);
  const profiles = await listAgentProfiles();
  const efficiencyIndex = await getEfficiencyIndex();
  let best: MatchResult | null = null;
  for (const profile of profiles) {
    const reasons: string[] = [];
    const categoryScore = categoryMatchScore(profile, analysis.category);
    if (categoryScore > 0.5) {
      reasons.push(`category-match:${analysis.category}`);
    }
    const reputationScore = profile.reputationScore;
    const baselineEnergy = energyScore(profile);
    const stakeScore = stakeAdequacyScore(profile, analysis.stake);
    const efficiencyReport = efficiencyIndex.get(profile.address.toLowerCase());
    const thermodynamics = efficiencyReport
      ? findCategoryBreakdown(efficiencyReport, analysis.category)
      : undefined;
    const thermoScore = thermodynamicScore(thermodynamics);
    const energyComponent =
      thermodynamics !== undefined && thermodynamics !== null
        ? energyPreferenceFromThermodynamics(thermodynamics)
        : baselineEnergy;
    const rewardComponent = rewardEfficiencyScore(thermodynamics);
    if (thermodynamics) {
      reasons.push(`thermo:${formatScore(thermodynamics.efficiencyScore)}`);
      if (thermodynamics.rewardPerEnergy > 0) {
        reasons.push(
          `reward-per-energy:${formatScore(thermodynamics.rewardPerEnergy)}`
        );
      }
      if (thermodynamics.averageEnergy > 0) {
        reasons.push(`avg-energy:${formatScore(thermodynamics.averageEnergy)}`);
      }
    } else {
      reasons.push(`energy-baseline:${formatScore(baselineEnergy)}`);
    }
    const aggregate =
      categoryScore * 0.3 +
      reputationScore * 0.2 +
      energyComponent * 0.15 +
      stakeScore * 0.1 +
      thermoScore * 0.2 +
      rewardComponent * 0.05;
    if (!best || aggregate > best.score) {
      best = {
        profile,
        score: aggregate,
        analysis,
        reasons,
        thermodynamics,
      };
    }
  }
  return best;
}

export function clearProfileCache(): void {
  profileCache.clear();
  statsCache = null;
  jobMetadataCache = new Map();
  clearEfficiencyCache();
}
