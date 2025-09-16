import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

import type { LearningRecord } from '../agent-gateway/learning';

interface CliOptions {
  identifier?: string;
  dryRun: boolean;
  energyThreshold: number;
}

interface AgentLearningStats {
  total: number;
  successRate: number;
  averageEnergy: number;
  averageReward: number;
  averageDurationMs: number;
  energySamples: number;
  successes: number;
  lastRecordedAt?: string;
  recentJobIds: string[];
}

interface IdentityFileRecord {
  ens?: string;
  label?: string;
  address?: string;
  privateKey?: string;
  role?: string;
  metadata?: Record<string, unknown> | undefined;
}

interface IdentityFileHandle {
  path: string;
  data: IdentityFileRecord;
}

const LEARNING_RECORDS_PATH = path.resolve(
  __dirname,
  '../storage/learning/records.jsonl'
);
const IDENTITY_DIR = path.resolve(__dirname, '../config/agents');
const DEFAULT_ENERGY_THRESHOLD = Number(
  process.env.RETRAIN_ENERGY_THRESHOLD || '150000'
);

function parseArgs(argv: string[]): CliOptions {
  let identifier: string | undefined;
  let dryRun = false;
  let energyThreshold = DEFAULT_ENERGY_THRESHOLD;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--label' || arg === '-l') {
      identifier = argv[i + 1];
      i += 1;
    } else if (arg === '--agent' || arg === '-a' || arg === '--id') {
      identifier = argv[i + 1];
      i += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--energy-threshold') {
      const value = argv[i + 1];
      if (value) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          energyThreshold = parsed;
        }
        i += 1;
      }
    }
  }

  return { identifier, dryRun, energyThreshold };
}

async function loadLearningRecords(): Promise<LearningRecord[]> {
  try {
    const raw = await fs.promises.readFile(LEARNING_RECORDS_PATH, 'utf8');
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const records: LearningRecord[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as LearningRecord;
        records.push(parsed);
      } catch (err) {
        console.warn('Skipping malformed learning record', err);
      }
    }
    return records;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

function matchIdentifier(record: LearningRecord, identifier: string): boolean {
  const key = identifier.toLowerCase();
  if (record.agent.label && record.agent.label.toLowerCase() === key) {
    return true;
  }
  if (record.agent.address.toLowerCase() === key) {
    return true;
  }
  if (record.agent.ensName && record.agent.ensName.toLowerCase() === key) {
    return true;
  }
  return false;
}

function summariseRecords(records: LearningRecord[]): AgentLearningStats {
  let successes = 0;
  let totalReward = 0;
  let rewardSamples = 0;
  let totalEnergy = 0;
  let energySamples = 0;
  let totalDuration = 0;
  let durationSamples = 0;
  let lastRecordedAt: string | undefined;
  const recentJobIds = records
    .slice(-5)
    .map((record) => record.job.jobId)
    .filter((id) => typeof id === 'string');

  for (const record of records) {
    if (record.result.success) {
      successes += 1;
    }
    const reward = Number.parseFloat(record.job.reward.formatted || '0');
    if (Number.isFinite(reward)) {
      totalReward += reward;
      rewardSamples += 1;
    }
    const energy = record.energy?.estimate;
    if (energy !== undefined && energy !== null && Number.isFinite(energy)) {
      totalEnergy += Number(energy);
      energySamples += 1;
    }
    const duration = record.energy?.durationMs;
    if (
      duration !== undefined &&
      duration !== null &&
      Number.isFinite(duration)
    ) {
      totalDuration += Number(duration);
      durationSamples += 1;
    }
    if (!lastRecordedAt || record.recordedAt > lastRecordedAt) {
      lastRecordedAt = record.recordedAt;
    }
  }

  const total = records.length;
  const successRate = total > 0 ? successes / total : 0;
  return {
    total,
    successes,
    successRate,
    averageReward: rewardSamples > 0 ? totalReward / rewardSamples : 0,
    averageEnergy: energySamples > 0 ? totalEnergy / energySamples : 0,
    averageDurationMs:
      durationSamples > 0 ? totalDuration / durationSamples : 0,
    energySamples,
    lastRecordedAt,
    recentJobIds,
  };
}

function decideStrategy(
  stats: AgentLearningStats,
  energyThreshold: number
): 'fine-tune' | 'swap' {
  if (stats.total === 0) {
    return 'fine-tune';
  }
  if (stats.successRate < 0.55) {
    return 'swap';
  }
  if (stats.averageEnergy > energyThreshold) {
    return 'swap';
  }
  return 'fine-tune';
}

async function resolveIdentityFile(
  identifier: string
): Promise<IdentityFileHandle> {
  const key = identifier.toLowerCase();
  const directPath = path.join(IDENTITY_DIR, `${key}.json`);
  try {
    const raw = await fs.promises.readFile(directPath, 'utf8');
    return { path: directPath, data: JSON.parse(raw) as IdentityFileRecord };
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(IDENTITY_DIR, {
      withFileTypes: true,
    });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `Identity directory ${IDENTITY_DIR} is missing. Run identity provisioning first.`
      );
    }
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const fullPath = path.join(IDENTITY_DIR, entry.name);
    try {
      const raw = await fs.promises.readFile(fullPath, 'utf8');
      const parsed = JSON.parse(raw) as IdentityFileRecord;
      const label = parsed.label || entry.name.replace(/\.json$/i, '');
      const address = parsed.address || '';
      if (label.toLowerCase() === key || address.toLowerCase() === key) {
        return { path: fullPath, data: parsed };
      }
    } catch (err) {
      console.warn('Skipping malformed identity file', fullPath, err);
    }
  }
  throw new Error(`Unable to locate identity file for ${identifier}`);
}

function ensureMetadata(record: IdentityFileRecord): Record<string, unknown> {
  if (!record.metadata || typeof record.metadata !== 'object') {
    record.metadata = {};
  }
  return record.metadata as Record<string, unknown>;
}

function computeDatasetDigest(records: LearningRecord[]): string {
  const hash = createHash('sha256');
  for (const record of records) {
    hash.update(record.job.jobId || '');
    hash.update(record.result.success ? '1' : '0');
    hash.update(String(record.energy?.estimate ?? ''));
    hash.update(record.recordedAt);
  }
  return hash.digest('hex');
}

async function notifyOrchestratorReload(label: string): Promise<void> {
  const url =
    process.env.ORCHESTRATOR_CONTROL_URL || 'http://localhost:8787/reload';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: 'agent-retrained',
        label,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      console.warn(
        `Orchestrator reload request failed: ${res.status} ${res.statusText}`
      );
    }
  } catch (err) {
    console.warn('Failed to notify orchestrator reload endpoint', err);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.identifier) {
    console.error(
      'Usage: ts-node scripts/retrainAgent.ts --label <agent-label>'
    );
    process.exitCode = 1;
    return;
  }

  const records = await loadLearningRecords();
  if (records.length === 0) {
    console.error('No learning records found. Execute jobs before retraining.');
    process.exitCode = 1;
    return;
  }

  const filtered = records.filter((record) =>
    matchIdentifier(record, options.identifier!)
  );

  if (filtered.length === 0) {
    console.error(
      `No learning samples found for ${options.identifier}. Check the label or run jobs first.`
    );
    process.exitCode = 1;
    return;
  }

  const stats = summariseRecords(filtered);
  const strategy = decideStrategy(stats, options.energyThreshold);
  const datasetDigest = computeDatasetDigest(filtered);

  console.log(`Analysed ${stats.total} job records`);
  console.log(
    `Success rate: ${(stats.successRate * 100).toFixed(2)}% (${
      stats.successes
    }/${stats.total})`
  );
  console.log(
    `Average energy: ${stats.averageEnergy.toFixed(2)} (from ${
      stats.energySamples
    } samples)`
  );
  console.log(
    `Average reward: ${stats.averageReward.toFixed(
      4
    )} | Average duration: ${stats.averageDurationMs.toFixed(2)} ms`
  );
  console.log(`Recommended strategy: ${strategy}`);

  let identity: IdentityFileHandle;
  try {
    identity = await resolveIdentityFile(options.identifier);
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
    return;
  }

  const metadata = ensureMetadata(identity.data);
  metadata.learning = {
    ...(typeof metadata.learning === 'object' ? metadata.learning : {}),
    lastUpdated: stats.lastRecordedAt || new Date().toISOString(),
    strategy,
    successRate: Number(stats.successRate.toFixed(6)),
    totalRuns: stats.total,
    averageEnergy: Number(stats.averageEnergy.toFixed(2)),
    averageReward: Number(stats.averageReward.toFixed(4)),
    averageDurationMs: Number(stats.averageDurationMs.toFixed(2)),
    energySamples: stats.energySamples,
    datasetDigest,
    recentJobIds: stats.recentJobIds,
    energyThreshold: options.energyThreshold,
  };

  const label = (identity.data.label || options.identifier).toLowerCase();

  if (options.dryRun) {
    console.log('Dry run enabled. Identity file will not be updated.');
    return;
  }

  await fs.promises.writeFile(
    identity.path,
    JSON.stringify(identity.data, null, 2),
    'utf8'
  );
  console.log(`Updated identity metadata at ${identity.path}`);

  await notifyOrchestratorReload(label);
}

main().catch((err) => {
  console.error('Retraining script failed', err);
  process.exitCode = 1;
});
