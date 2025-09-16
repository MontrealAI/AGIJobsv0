import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ethers } from 'ethers';
import {
  readTrainingRecords,
  resolveCategory,
  type TrainingRecord,
} from './trainingRecords';
import { readEnergySamples, type EnergySample } from './energyMonitor';

export interface SpawnRequest {
  category: string;
  observed: number;
  jobs: string[];
  lastSeen: string;
}

export interface SpawnCandidate extends SpawnRequest {
  categoryKey: string;
  recencyHours: number;
  priority: number;
  recommendedLabel: string;
  saturationRatio: number;
  saturated: boolean;
}

export interface BlueprintMetrics {
  totalJobs: number;
  successRate: number;
  averageReward: string;
  averageRewardRaw: string;
  rewardDecimals: number;
  averageEnergy: number;
  energySamples: number;
  recommendedStake: string;
  recommendedStakeRaw: string;
}

export interface AgentBlueprint {
  id: string;
  category: string;
  categoryKey: string;
  ensLabel: string;
  ensName: string;
  createdAt: string;
  wallet: {
    address: string;
    privateKey: string;
  };
  spawn: {
    observed: number;
    jobs: string[];
    lastSeen: string;
    priority: number;
    recencyHours: number;
  };
  metrics: BlueprintMetrics;
  metadata: {
    description: string;
    tags: string[];
    notes: string[];
  };
  status: 'blueprint';
  persistedTo?: string;
}

const TRAINING_DIR = path.resolve(__dirname, '../storage/training');
const SPAWN_REQUEST_PATH = path.join(TRAINING_DIR, 'spawn-requests.json');
const BLUEPRINT_DIR = path.resolve(__dirname, '../storage/identity/blueprints');

const DEFAULT_PRIORITY_HALFLIFE_HOURS = Number(
  process.env.SPAWN_PRIORITY_HALFLIFE_HOURS || '18'
);
const DEFAULT_CATEGORY_CAP = Number(
  process.env.SPAWN_MAX_AGENTS || process.env.SPAWN_CATEGORY_CAP || '3'
);
const DEFAULT_MIN_PRIORITY = Number(process.env.SPAWN_MIN_PRIORITY || '1');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.promises.readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn('Failed to read JSON file', file, err);
    }
    return fallback;
  }
}

async function writeJsonFile(file: string, data: unknown): Promise<void> {
  ensureDir(path.dirname(file));
  await fs.promises.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function normaliseCategory(value: string): { key: string; label: string } {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return { key: 'uncategorized', label: 'uncategorized' };
  }
  const compact = trimmed.replace(/\s+/g, ' ');
  return { key: compact.toLowerCase(), label: compact };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function computeRecencyHours(request: SpawnRequest, now: Date): number {
  const lastSeen = new Date(request.lastSeen || 0);
  const diffMs = Math.max(0, now.getTime() - lastSeen.getTime());
  return diffMs / (1000 * 60 * 60);
}

function computePriorityScore(
  request: SpawnRequest,
  recencyHours: number
): number {
  const observations = Math.max(1, request.observed);
  const jobWeight = Math.log2(1 + (request.jobs?.length ?? 0)) + 1;
  const halflife = Math.max(1, DEFAULT_PRIORITY_HALFLIFE_HOURS);
  const recencyFactor = Math.pow(0.5, recencyHours / halflife);
  const priority = observations * jobWeight * (1 + recencyFactor);
  return Number(priority.toFixed(6));
}

async function readSpawnRequestsFile(): Promise<SpawnRequest[]> {
  return readJsonFile<SpawnRequest[]>(SPAWN_REQUEST_PATH, []);
}

export async function getSpawnRequests(): Promise<SpawnRequest[]> {
  const requests = await readSpawnRequestsFile();
  return requests.sort((a, b) =>
    a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0
  );
}

export async function recordSpawnRequest(
  category: string,
  jobId: string,
  timestamp: Date = new Date()
): Promise<void> {
  const { key, label } = normaliseCategory(category);
  const requests = await readSpawnRequestsFile();
  const existing = requests.find(
    (entry) => normaliseCategory(entry.category).key === key
  );
  if (existing) {
    existing.category = label;
    existing.observed += 1;
    if (jobId && !existing.jobs.includes(jobId)) {
      existing.jobs.push(jobId);
    }
    existing.lastSeen = timestamp.toISOString();
  } else {
    requests.push({
      category: label,
      observed: 1,
      jobs: jobId ? [jobId] : [],
      lastSeen: timestamp.toISOString(),
    });
  }
  await writeJsonFile(SPAWN_REQUEST_PATH, requests);
}

export async function consumeSpawnRequest(category: string): Promise<void> {
  const { key } = normaliseCategory(category);
  const requests = await readSpawnRequestsFile();
  const filtered = requests.filter(
    (entry) => normaliseCategory(entry.category).key !== key
  );
  if (filtered.length !== requests.length) {
    await writeJsonFile(SPAWN_REQUEST_PATH, filtered);
  }
}

async function readLabelsFromDirectory(dir: string): Promise<Set<string>> {
  const labels = new Set<string>();
  try {
    const entries = await fs.promises.readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const fullPath = path.join(dir, entry);
      try {
        const raw = await fs.promises.readFile(fullPath, 'utf8');
        const data = JSON.parse(raw) as Record<string, unknown>;
        const label =
          typeof data.label === 'string'
            ? data.label
            : typeof data.ensLabel === 'string'
            ? data.ensLabel
            : typeof data.ens === 'string'
            ? data.ens.split('.')[0]
            : undefined;
        if (label) {
          labels.add(label.toLowerCase());
        }
      } catch (err) {
        console.warn('Failed to parse identity label', fullPath, err);
      }
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn('Failed to read identity directory', dir, err);
    }
  }
  return labels;
}

async function collectExistingLabels(
  extra?: Iterable<string>
): Promise<Set<string>> {
  const labels = new Set<string>();
  if (extra) {
    for (const value of extra) {
      if (value) labels.add(value.toLowerCase());
    }
  }
  const directories = [
    path.resolve(__dirname, '../config/agents'),
    path.resolve(__dirname, '../storage/identity/agents'),
    BLUEPRINT_DIR,
  ];
  const dirResults = await Promise.all(
    directories.map((dir) => readLabelsFromDirectory(dir))
  );
  for (const set of dirResults) {
    for (const label of set) {
      labels.add(label);
    }
  }
  return labels;
}

function generateUniqueLabel(
  categoryLabel: string,
  existing: Set<string>
): string {
  let base = slugify(categoryLabel);
  if (!base) {
    base = 'agent';
  }
  let candidate = base;
  let counter = 2;
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  existing.add(candidate.toLowerCase());
  return candidate;
}

export interface SpawnCandidateOptions {
  now?: Date;
  minObservations?: number;
  existingCategoryCounts?: Map<string, number>;
  categoryCap?: number;
  existingLabels?: Iterable<string>;
}

export async function listSpawnCandidates(
  options: SpawnCandidateOptions = {}
): Promise<SpawnCandidate[]> {
  const now = options.now ?? new Date();
  const requests = await getSpawnRequests();
  if (requests.length === 0) return [];

  const existingLabels = await collectExistingLabels(options.existingLabels);
  const cap = options.categoryCap ?? DEFAULT_CATEGORY_CAP;
  const candidates: SpawnCandidate[] = [];

  for (const request of requests) {
    if (options.minObservations && request.observed < options.minObservations) {
      continue;
    }
    const { key, label } = normaliseCategory(request.category);
    const recencyHours = computeRecencyHours(request, now);
    const basePriority = computePriorityScore(request, recencyHours);
    const existingCount = options.existingCategoryCounts?.get(key) ?? 0;
    const saturationRatio = cap > 0 ? Math.min(1, existingCount / cap) : 0;
    const saturated = cap > 0 ? existingCount >= cap : false;
    const penalty = saturated ? 0.25 : 1 - saturationRatio * 0.5;
    const priority = Number((basePriority * Math.max(0.1, penalty)).toFixed(6));
    const recommendedLabel = generateUniqueLabel(label, existingLabels);

    candidates.push({
      ...request,
      category: label,
      categoryKey: key,
      recencyHours,
      priority,
      recommendedLabel,
      saturationRatio,
      saturated,
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates;
}

function resolveRewardDecimals(records: TrainingRecord[]): number {
  for (const record of records) {
    const value = record.reward?.decimals;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return 18;
}

function sumRewards(records: TrainingRecord[]): bigint {
  return records.reduce((total, record) => {
    const raw = record.reward?.posted?.raw;
    if (!raw) return total;
    try {
      return total + BigInt(raw);
    } catch {
      return total;
    }
  }, 0n);
}

function filterRecordsByCategory(
  records: TrainingRecord[],
  categoryKey: string
): TrainingRecord[] {
  return records.filter((record) => {
    const resolved = resolveCategory(record);
    if (!resolved) return false;
    return normaliseCategory(resolved).key === categoryKey;
  });
}

function filterEnergyByCategory(
  samples: EnergySample[],
  categoryKey: string
): EnergySample[] {
  return samples.filter((sample) => {
    if (!sample.category) return false;
    return normaliseCategory(sample.category).key === categoryKey;
  });
}

async function buildBlueprintMetrics(
  candidate: SpawnCandidate
): Promise<BlueprintMetrics> {
  const records = await readTrainingRecords();
  const relevant = filterRecordsByCategory(records, candidate.categoryKey);
  const totalJobs = relevant.length;
  const successCount = relevant.filter((record) => record.success).length;
  const decimals = resolveRewardDecimals(relevant);
  const rewardSum = sumRewards(relevant);
  const averageRewardRaw = totalJobs > 0 ? rewardSum / BigInt(totalJobs) : 0n;
  const averageRewardFormatted =
    totalJobs > 0 ? ethers.formatUnits(averageRewardRaw, decimals) : '0';

  const energySamples = filterEnergyByCategory(
    await readEnergySamples(),
    candidate.categoryKey
  );
  const averageEnergy =
    energySamples.length === 0
      ? 0
      : energySamples.reduce((total, sample) => {
          const value = Number(sample.energyEstimate ?? 0);
          return total + (Number.isFinite(value) ? value : 0);
        }, 0) / energySamples.length;

  const successRate = totalJobs === 0 ? 0 : successCount / totalJobs;

  return {
    totalJobs,
    successRate,
    averageReward: averageRewardFormatted,
    averageRewardRaw: averageRewardRaw.toString(),
    rewardDecimals: decimals,
    averageEnergy,
    energySamples: energySamples.length,
    recommendedStake: ethers.formatUnits(averageRewardRaw, decimals),
    recommendedStakeRaw: averageRewardRaw.toString(),
  };
}

function buildBlueprintNotes(candidate: SpawnCandidate): string[] {
  const notes: string[] = [];
  notes.push(`Spawn priority score ${candidate.priority.toFixed(3)}`);
  notes.push(
    `Observed ${candidate.observed} opportunities; saturation ${(
      candidate.saturationRatio * 100
    ).toFixed(1)}%`
  );
  if (candidate.jobs.length) {
    const recentJobs = candidate.jobs.slice(-5);
    notes.push(`Recent jobs: ${recentJobs.join(', ')}`);
  }
  return notes;
}

function formatBlueprintDescription(category: string): string {
  return `Autogenerated blueprint for ${category} specialist based on spawn requests.`;
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:]/g, '-');
}

async function persistBlueprint(
  blueprint: AgentBlueprint,
  blueprintDir = BLUEPRINT_DIR
): Promise<string> {
  ensureDir(blueprintDir);
  const timestamp = formatTimestamp(new Date(blueprint.createdAt));
  const file = path.join(
    blueprintDir,
    `${timestamp}-${blueprint.ensLabel}.json`
  );
  await fs.promises.writeFile(file, JSON.stringify(blueprint, null, 2), 'utf8');
  return file;
}

export interface BlueprintOptions {
  persist?: boolean;
  markConsumed?: boolean;
  blueprintDir?: string;
  existingLabels?: Iterable<string>;
  now?: Date;
}

export async function createBlueprintForCandidate(
  candidate: SpawnCandidate,
  options: BlueprintOptions = {}
): Promise<AgentBlueprint> {
  const now = options.now ?? new Date();
  const metrics = await buildBlueprintMetrics(candidate);
  const wallet = ethers.Wallet.createRandom();
  const blueprint: AgentBlueprint = {
    id: crypto.randomUUID(),
    category: candidate.category,
    categoryKey: candidate.categoryKey,
    ensLabel: candidate.recommendedLabel,
    ensName: `${candidate.recommendedLabel}.agent.agi.eth`,
    createdAt: now.toISOString(),
    wallet: {
      address: wallet.address,
      privateKey: wallet.privateKey,
    },
    spawn: {
      observed: candidate.observed,
      jobs: candidate.jobs,
      lastSeen: candidate.lastSeen,
      priority: candidate.priority,
      recencyHours: candidate.recencyHours,
    },
    metrics,
    metadata: {
      description: formatBlueprintDescription(candidate.category),
      tags: [
        'spawn-request',
        candidate.categoryKey,
        candidate.recommendedLabel,
      ],
      notes: buildBlueprintNotes(candidate),
    },
    status: 'blueprint',
  };

  if (options.persist ?? true) {
    blueprint.persistedTo = await persistBlueprint(
      blueprint,
      options.blueprintDir
    );
  }
  if (options.markConsumed ?? true) {
    await consumeSpawnRequest(candidate.category);
  }

  return blueprint;
}

export interface MaterializeOptions
  extends SpawnCandidateOptions,
    BlueprintOptions {
  minPriority?: number;
  includeSaturated?: boolean;
}

export async function materializeTopBlueprint(
  options: MaterializeOptions = {}
): Promise<AgentBlueprint | null> {
  const {
    minPriority = DEFAULT_MIN_PRIORITY,
    includeSaturated = false,
    ...candidateOptions
  } = options;
  const candidates = await listSpawnCandidates(candidateOptions);
  const target = candidates.find(
    (candidate) =>
      candidate.priority >= minPriority &&
      (includeSaturated || !candidate.saturated)
  );
  if (!target) {
    return null;
  }
  return createBlueprintForCandidate(target, options);
}

export function spawnRequestsPath(): string {
  return SPAWN_REQUEST_PATH;
}

export function spawnBlueprintDirectory(): string {
  return BLUEPRINT_DIR;
}

export const spawnDefaults = {
  priorityHalflifeHours: DEFAULT_PRIORITY_HALFLIFE_HOURS,
  categoryCap: DEFAULT_CATEGORY_CAP,
  minPriority: DEFAULT_MIN_PRIORITY,
};
