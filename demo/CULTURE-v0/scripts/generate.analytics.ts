import 'dotenv/config';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

type SqliteStatement<T = unknown> = {
  all(...params: unknown[]): T[];
};

type SqliteDatabase = {
  prepare<T = unknown>(sql: string): SqliteStatement<T>;
  close(): void;
};

type SqliteDatabaseConstructor = new (filename: string, options?: { readonly?: boolean }) => SqliteDatabase;
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface ArtifactRow {
  id?: number | string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  kind?: string;
  citations?: number;
  lineageDepth?: number;
  parentId?: unknown;
  derivative?: unknown;
  influenceScore?: number;
}

interface ArtifactMetrics {
  created: number;
  updated: number;
  derivatives: number;
  averageCitations: number;
  maxLineageDepth: number;
  influenceScores: number[];
  byKind: Record<string, number>;
  topArtifacts: ArtifactSummary[];
  timeline: { bucket: string; count: number }[];
}

interface ArtifactSummary {
  rank: number;
  id: number;
  title: string;
  kind: string;
  influence: number;
  citations: number;
}

interface ArenaRound {
  status: string;
  difficulty: number;
  successRate: number;
  slashes: number;
  completedAt?: string;
}

interface ArenaMetrics {
  rounds: ArenaRound[];
  thermostat: {
    min: number;
    max: number;
    current: number;
  };
  leaderboard: LeaderboardEntry[];
  streaks: StreakEntry[];
}

interface LeaderboardEntry {
  address: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

interface StreakEntry {
  address: string;
  length: number;
  type: string;
}

interface ModerationSample {
  timestamp: string;
  blocked: boolean;
}

interface AlertRecord {
  type: 'validator_slash' | 'zero_success_streak' | 'artifact_burst';
  message: string;
  severity: 'warning' | 'critical';
  metadata?: Record<string, unknown>;
}

interface AnalyticsConfig {
  dbPath: string;
  orchestratorUrl: string;
  outputDir: string;
  alertLogPath: string;
  moderationLogPath: string;
  orchestratorLogPath: string;
  windowHours: number;
  slashThreshold: number;
  zeroSuccessThreshold: number;
  burstThreshold: number;
  burstWindowHours: number;
  network: string;
}

interface CultureSnapshot {
  week: string;
  network: string;
  generatedAt: string;
  artifacts: {
    created: number;
    updated: number;
    byKind: Record<string, number>;
    averageCitations: number;
    maxLineageDepth: number;
  };
  influence: {
    cultureMaturityScore: number;
    influenceGini: number;
    derivativeJobs: number;
  };
  topArtifacts: ArtifactSummary[];
  alerts: string[];
}

interface ArenaSnapshot {
  week: string;
  network: string;
  generatedAt: string;
  rounds: {
    executed: number;
    finalized: number;
    aborted: number;
    slashed: number;
    averageDifficulty: number;
    difficultyDelta: {
      mean: number;
      max: number;
    };
  };
  elo: {
    leaderboard: LeaderboardEntry[];
    streaks: StreakEntry[];
  };
  operations: {
    thermostat: {
      temperature: {
        min: number;
        max: number;
        current: number;
      };
      successRate: number;
    };
    safety: {
      contentWarnings: number;
      stakeLockFailures: number;
    };
  };
}

interface AnalyticsSnapshot {
  culture: CultureSnapshot;
  arena: ArenaSnapshot;
  alerts: AlertRecord[];
  metrics: {
    cms: number;
    spg: number;
  };
}

interface DryRunFixture {
  artifacts: ArtifactRow[];
  rounds: Partial<ArenaRound & { difficultyHistory?: number[] }>[];
  thermostat: Partial<ArenaMetrics['thermostat']>;
  leaderboard?: LeaderboardEntry[];
  streaks?: StreakEntry[];
  moderation?: ModerationSample[];
  expected?: {
    cms?: number;
    spg?: number;
  };
}

let DatabaseModule: SqliteDatabaseConstructor | null | undefined;

function getDatabaseModule(): SqliteDatabaseConstructor | null {
  if (DatabaseModule !== undefined) {
    return DatabaseModule;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const loaded = require('better-sqlite3') as SqliteDatabaseConstructor;
    DatabaseModule = loaded;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ better-sqlite3 unavailable (${message}); analytics will skip DB metrics.`);
    DatabaseModule = null;
  }
  return DatabaseModule;
}

const DEFAULT_CONFIG: AnalyticsConfig = {
  dbPath: process.env.CULTURE_ANALYTICS_DB ?? 'demo/CULTURE-v0/data/culture-graph.db',
  orchestratorUrl: process.env.CULTURE_ORCHESTRATOR_URL ?? 'http://localhost:4005',
  outputDir: process.env.CULTURE_ANALYTICS_OUTPUT ?? 'demo/CULTURE-v0/data/analytics',
  alertLogPath: process.env.CULTURE_ANALYTICS_ALERT_LOG ?? 'demo/CULTURE-v0/logs/analytics.alerts.jsonl',
  moderationLogPath: process.env.ORCHESTRATOR_MODERATION_AUDIT ?? 'storage/validation/moderation.log',
  orchestratorLogPath: process.env.CULTURE_ORCHESTRATOR_LOG ?? 'demo/CULTURE-v0/logs/orchestrator.jsonl',
  windowHours: Number(process.env.CULTURE_ANALYTICS_WINDOW_HOURS ?? 24),
  slashThreshold: Number(process.env.CULTURE_ANALYTICS_SLASH_THRESHOLD ?? 2),
  zeroSuccessThreshold: Number(process.env.CULTURE_ANALYTICS_SUCCESS_STREAK ?? 3),
  burstThreshold: Number(process.env.CULTURE_ANALYTICS_BURST_THRESHOLD ?? 10),
  burstWindowHours: Number(process.env.CULTURE_ANALYTICS_BURST_WINDOW_HOURS ?? 1),
  network: process.env.CULTURE_ANALYTICS_NETWORK ?? 'localnet'
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function gini(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((acc, value) => acc + value, 0) / sorted.length;
  if (mean === 0) {
    return 0;
  }
  let cumulative = 0;
  let weighted = 0;
  for (const value of sorted) {
    cumulative += value;
    weighted += cumulative;
  }
  return ((sorted.length + 1 - 2 * (weighted / cumulative)) / sorted.length) || 0;
}

function computeCms(metrics: ArtifactMetrics): number {
  const connectivity = clamp(metrics.averageCitations / 3);
  const depth = clamp(metrics.maxLineageDepth / 5);
  const adoption = metrics.created === 0 ? 0 : clamp(metrics.derivatives / metrics.created);
  const equity = metrics.influenceScores.length > 0 ? 1 - gini(metrics.influenceScores) : 1;
  return round(100 * (0.35 * connectivity + 0.3 * depth + 0.25 * adoption + 0.1 * equity), 1);
}

function computeSpg(arena: ArenaMetrics, slashRate: number, successRate: number): number {
  const difficultyRange = arena.thermostat.max - arena.thermostat.min || 1;
  const normalizedDifficulty = clamp((arena.thermostat.current - arena.thermostat.min) / difficultyRange);
  const penalty = clamp(slashRate);
  return round(100 * (0.5 * successRate + 0.35 * normalizedDifficulty + 0.15 * (1 - penalty)), 1);
}

function isoWeek(date: Date): { year: number; week: number } {
  const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  temp.setUTCDate(temp.getUTCDate() + 4 - ((temp.getUTCDay() || 7)));
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: temp.getUTCFullYear(), week };
}

function tableExists(db: SqliteDatabase, table: string): boolean {
  try {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").all(table);
    return result.length > 0;
  } catch (error) {
    console.warn(`Unable to verify table ${table}:`, error);
    return false;
  }
}

function detectColumn(db: SqliteDatabase, table: string, candidates: string[]): string | undefined {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    const names = new Set(rows.map((row: { name: string }) => row.name));
    for (const candidate of candidates) {
      if (names.has(candidate)) {
        return candidate;
      }
    }
  } catch (error) {
    console.warn(`Failed to inspect columns for ${table}:`, error);
  }
  return undefined;
}

function loadArtifactsFromDb(config: AnalyticsConfig, windowStartIso: string): ArtifactMetrics {
  if (!fs.existsSync(config.dbPath)) {
    console.warn(`⚠️ SQLite database not found at ${config.dbPath}; returning empty metrics.`);
    return {
      created: 0,
      updated: 0,
      derivatives: 0,
      averageCitations: 0,
      maxLineageDepth: 0,
      influenceScores: [],
      byKind: {},
      topArtifacts: [],
      timeline: []
    };
  }

  const DatabaseCtor = getDatabaseModule();
  if (!DatabaseCtor) {
    return {
      created: 0,
      updated: 0,
      derivatives: 0,
      averageCitations: 0,
      maxLineageDepth: 0,
      influenceScores: [],
      byKind: {},
      topArtifacts: [],
      timeline: []
    };
  }

  const db = new DatabaseCtor(config.dbPath, { readonly: true });
  try {
    if (!tableExists(db, 'artifacts')) {
      return {
        created: 0,
        updated: 0,
        derivatives: 0,
        averageCitations: 0,
        maxLineageDepth: 0,
        influenceScores: [],
        byKind: {},
        topArtifacts: [],
        timeline: []
      };
    }

    const createdColumn = detectColumn(db, 'artifacts', ['created_at', 'createdAt', 'created']);
    if (!createdColumn) {
      throw new Error('artifacts table missing created timestamp column');
    }
    const updatedColumn = detectColumn(db, 'artifacts', ['updated_at', 'updatedAt']);
    const kindColumn = detectColumn(db, 'artifacts', ['kind', 'type']);
    const citationColumn = detectColumn(db, 'artifacts', ['citation_count', 'citations']);
    const lineageColumn = detectColumn(db, 'artifacts', ['lineage_depth', 'depth']);
    const parentColumn = detectColumn(db, 'artifacts', ['parent_id', 'parentId']);
    const derivativeColumn = detectColumn(db, 'artifacts', ['is_derivative', 'derivative']);
    const influenceColumn = detectColumn(db, 'artifacts', ['influence_score', 'influence']);
    const titleColumn = detectColumn(db, 'artifacts', ['title', 'name']);
    const idColumn = detectColumn(db, 'artifacts', ['id', 'artifact_id']);

    const selectFields = [
      `${createdColumn} as createdAt`
    ];
    if (updatedColumn) selectFields.push(`${updatedColumn} as updatedAt`);
    if (kindColumn) selectFields.push(`${kindColumn} as kind`);
    if (citationColumn) selectFields.push(`${citationColumn} as citations`);
    else selectFields.push('NULL as citations');
    if (lineageColumn) selectFields.push(`${lineageColumn} as lineageDepth`);
    else selectFields.push('NULL as lineageDepth');
    if (parentColumn) selectFields.push(`${parentColumn} as parentId`);
    else selectFields.push('NULL as parentId');
    if (derivativeColumn) selectFields.push(`${derivativeColumn} as derivative`);
    else selectFields.push('NULL as derivative');
    if (influenceColumn) selectFields.push(`${influenceColumn} as influenceScore`);
    else selectFields.push('NULL as influenceScore');
    if (titleColumn) selectFields.push(`${titleColumn} as title`);
    else selectFields.push('NULL as title');
    if (idColumn) selectFields.push(`${idColumn} as id`);
    else selectFields.push('rowid as id');

    const rows: ArtifactRow[] = db
      .prepare<ArtifactRow>(`SELECT ${selectFields.join(', ')} FROM artifacts WHERE ${createdColumn} >= ?`)
      .all(windowStartIso);

    let created = 0;
    let updated = 0;
    let derivatives = 0;
    let citationTotal = 0;
    let citationCount = 0;
    let maxLineageDepth = 0;
    const byKind: Record<string, number> = {};
    const influenceScores: number[] = [];
    const timeline = new Map<string, number>();
    const candidateSummaries: ArtifactSummary[] = [];

    for (const row of rows) {
      created += 1;
      if (row.updatedAt) {
        const updatedAt = Date.parse(row.updatedAt);
        const createdAt = row.createdAt ? Date.parse(row.createdAt) : NaN;
        if (Number.isFinite(updatedAt) && Number.isFinite(createdAt) && updatedAt > createdAt) {
          updated += 1;
        }
      }

      const derivativeFlag = typeof row.derivative === 'number'
        ? row.derivative !== 0
        : typeof row.derivative === 'boolean'
          ? row.derivative
          : row.parentId != null && row.parentId !== '';
      if (derivativeFlag) {
        derivatives += 1;
      }

      if (typeof row.citations === 'number') {
        citationTotal += row.citations;
        citationCount += 1;
      }
      if (typeof row.lineageDepth === 'number') {
        maxLineageDepth = Math.max(maxLineageDepth, row.lineageDepth);
      }
      if (typeof row.influenceScore === 'number') {
        influenceScores.push(row.influenceScore);
      }
      const kind = row.kind ?? 'unknown';
      byKind[kind] = (byKind[kind] ?? 0) + 1;

      if (row.createdAt) {
        const createdTime = Date.parse(row.createdAt);
        if (Number.isFinite(createdTime)) {
          const bucket = new Date(Math.floor(createdTime / 3600000) * 3600000).toISOString();
          timeline.set(bucket, (timeline.get(bucket) ?? 0) + 1);
        }
      }

      if (typeof row.influenceScore === 'number') {
        candidateSummaries.push({
          rank: 0,
          id: typeof row.id === 'number' ? row.id : Number.parseInt(String(row.id ?? 0), 10) || 0,
          title: row.title ?? `Artifact ${row.id ?? '?'}`,
          kind,
          influence: row.influenceScore,
          citations: typeof row.citations === 'number' ? row.citations : 0
        });
      }
    }

    const topArtifacts = candidateSummaries
      .sort((a, b) => b.influence - a.influence)
      .slice(0, 5)
      .map((artifact, index) => ({ ...artifact, rank: index + 1 }));

    return {
      created,
      updated,
      derivatives,
      averageCitations: citationCount > 0 ? citationTotal / citationCount : 0,
      maxLineageDepth,
      influenceScores,
      byKind,
      topArtifacts,
      timeline: Array.from(timeline.entries())
        .sort(([a], [b]) => (a > b ? 1 : -1))
        .map(([bucket, count]) => ({ bucket, count }))
    };
  } finally {
    db.close();
  }
}

async function loadArenaMetrics(config: AnalyticsConfig): Promise<ArenaMetrics> {
  const baseUrl = config.orchestratorUrl.replace(/\/$/, '');
  try {
    const response = await fetch(`${baseUrl}/arena/scoreboard`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) {
      throw new Error(`Scoreboard responded with ${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;

    const rounds = Array.isArray(payload.rounds)
      ? (payload.rounds as Record<string, unknown>[]) : Array.isArray(payload.history)
        ? (payload.history as Record<string, unknown>[]) : [];

    const thermostatPayload = (payload.thermostat ?? payload.temperature ?? {}) as Record<string, unknown>;

    const mapRound = (round: Record<string, unknown>): ArenaRound => {
      const status = String(round.status ?? round.state ?? 'unknown');
      const difficulty = Number(round.difficulty ?? round.temperature ?? 0);
      const successRate = Number(
        round.successRate ?? round.success_rate ??
          (typeof round.successes === 'number' && typeof round.attempts === 'number' && round.attempts > 0
            ? round.successes / round.attempts
            : 0)
      );
      const slashes = Number(round.slashes ?? round.slashCount ?? round.penalties ?? 0);
      const completedAt = typeof round.completedAt === 'string' ? round.completedAt : undefined;
      return { status, difficulty, successRate: clamp(successRate), slashes: Math.max(slashes, 0), completedAt };
    };

    const mappedRounds = rounds.map((round) => mapRound(round as Record<string, unknown>));

    const thermostat = {
      min: Number(thermostatPayload.min ?? thermostatPayload.minimum ?? 0),
      max: Number(thermostatPayload.max ?? thermostatPayload.maximum ?? 1),
      current: Number(thermostatPayload.current ?? thermostatPayload.value ?? thermostatPayload.temperature ?? 0)
    };

    const leaderboard = Array.isArray((payload.elo as Record<string, unknown> | undefined)?.leaderboard)
      ? ((payload.elo as Record<string, unknown>).leaderboard as Record<string, unknown>[])
          .map((entry) => ({
            address: String(entry.address ?? entry.agent ?? 'unknown'),
            rating: Number(entry.rating ?? entry.score ?? 0),
            wins: Number(entry.wins ?? 0),
            losses: Number(entry.losses ?? 0),
            draws: Number(entry.draws ?? entry.ties ?? 0)
          }))
      : [];

    const streaks = Array.isArray((payload.elo as Record<string, unknown> | undefined)?.streaks)
      ? ((payload.elo as Record<string, unknown>).streaks as Record<string, unknown>[])
          .map((entry) => ({
            address: String(entry.address ?? 'unknown'),
            length: Number(entry.length ?? entry.count ?? 0),
            type: String(entry.type ?? 'streak')
          }))
      : [];

    return {
      rounds: mappedRounds,
      thermostat: {
        min: Number.isFinite(thermostat.min) ? thermostat.min : 0,
        max: Number.isFinite(thermostat.max) ? thermostat.max : 1,
        current: Number.isFinite(thermostat.current) ? thermostat.current : 0
      },
      leaderboard,
      streaks
    };
  } catch (error) {
    console.warn('⚠️ Unable to query orchestrator scoreboard:', error);
    return {
      rounds: [],
      thermostat: { min: 0, max: 1, current: 0 },
      leaderboard: [],
      streaks: []
    };
  }
}

async function readModerationSamples(pathname: string, windowStart: Date): Promise<ModerationSample[]> {
  if (!fs.existsSync(pathname)) {
    return [];
  }
  const content = await fsp.readFile(pathname, 'utf-8');
  const samples: ModerationSample[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : undefined;
      const blocked = Boolean(entry.blocked);
      if (timestamp) {
        const time = Date.parse(timestamp);
        if (Number.isFinite(time) && time >= windowStart.getTime()) {
          samples.push({ timestamp, blocked });
        }
      }
    } catch (error) {
      console.warn('Failed to parse moderation audit line:', error);
    }
  }
  return samples;
}

function evaluateAlerts(config: AnalyticsConfig, metrics: {
  arena: ArenaMetrics;
  artifacts: ArtifactMetrics;
}): AlertRecord[] {
  const alerts: AlertRecord[] = [];
  const totalRounds = metrics.arena.rounds.length;
  const totalSlashes = metrics.arena.rounds.reduce((sum, round) => sum + round.slashes, 0);
  if (totalSlashes >= config.slashThreshold && totalRounds > 0) {
    alerts.push({
      type: 'validator_slash',
      message: `Validator slash threshold exceeded (${totalSlashes} slashes in ${totalRounds} rounds).`,
      severity: totalSlashes >= config.slashThreshold * 2 ? 'critical' : 'warning',
      metadata: { totalSlashes, totalRounds }
    });
  }

  let currentStreak = 0;
  let longestStreak = 0;
  const sortedRounds = [...metrics.arena.rounds].sort((a, b) => {
    const aTime = a.completedAt ? Date.parse(a.completedAt) : 0;
    const bTime = b.completedAt ? Date.parse(b.completedAt) : 0;
    return aTime - bTime;
  });
  for (const round of sortedRounds) {
    if (round.successRate === 0) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  if (longestStreak >= config.zeroSuccessThreshold && longestStreak > 0) {
    alerts.push({
      type: 'zero_success_streak',
      message: `Validator success streak reset required (observed ${longestStreak} zero-success rounds).`,
      severity: longestStreak >= config.zeroSuccessThreshold * 2 ? 'critical' : 'warning',
      metadata: { longestStreak }
    });
  }

  const bucketWindowMs = config.burstWindowHours * 3600 * 1000;
  const timeline = metrics.artifacts.timeline;
  for (let i = 0; i < timeline.length; i += 1) {
    const start = Date.parse(timeline[i].bucket);
    let count = 0;
    for (let j = i; j < timeline.length; j += 1) {
      const bucketTime = Date.parse(timeline[j].bucket);
      if (bucketTime - start > bucketWindowMs) {
        break;
      }
      count += timeline[j].count;
    }
    if (count >= config.burstThreshold) {
      alerts.push({
        type: 'artifact_burst',
        message: `Artifact burst detected (${count} artifacts within ${config.burstWindowHours}h window).`,
        severity: count >= config.burstThreshold * 2 ? 'critical' : 'warning',
        metadata: { bucket: timeline[i].bucket, count }
      });
      break;
    }
  }

  return alerts;
}

async function appendAlertLog(pathname: string, alerts: AlertRecord[], generatedAt: string): Promise<void> {
  if (alerts.length === 0) {
    return;
  }
  await fsp.mkdir(path.dirname(pathname), { recursive: true });
  const lines = alerts.map((alert) => JSON.stringify({
    timestamp: generatedAt,
    component: 'culture-analytics',
    action: 'anomaly',
    severity: alert.severity,
    alert: alert.type,
    message: alert.message,
    metadata: alert.metadata ?? {}
  }));
  await fsp.appendFile(pathname, `${lines.join('\n')}\n`, 'utf-8');
}

function buildCultureSnapshot(
  config: AnalyticsConfig,
  generatedAt: string,
  week: string,
  metrics: ArtifactMetrics,
  alerts: AlertRecord[],
  cms: number
): CultureSnapshot {
  return {
    week,
    network: config.network,
    generatedAt,
    artifacts: {
      created: metrics.created,
      updated: metrics.updated,
      byKind: metrics.byKind,
      averageCitations: metrics.averageCitations,
      maxLineageDepth: metrics.maxLineageDepth
    },
    influence: {
      cultureMaturityScore: cms,
      influenceGini: round(gini(metrics.influenceScores), 2),
      derivativeJobs: metrics.derivatives
    },
    topArtifacts: metrics.topArtifacts,
    alerts: alerts.map((alert) => alert.message)
  };
}

function buildArenaSnapshot(config: AnalyticsConfig, generatedAt: string, week: string, arena: ArenaMetrics, moderationSamples: ModerationSample[]): ArenaSnapshot {
  const executed = arena.rounds.length;
  const finalized = arena.rounds.filter((round) => round.status === 'finalized').length;
  const aborted = arena.rounds.filter((round) => round.status === 'aborted').length;
  const slashed = arena.rounds.reduce((sum, round) => sum + round.slashes, 0);
  const avgDifficulty = executed > 0 ? arena.rounds.reduce((sum, round) => sum + round.difficulty, 0) / executed : 0;
  const difficulties = arena.rounds.map((round) => round.difficulty);
  const meanDelta = difficulties.length > 1
    ? difficulties
        .slice(1)
        .reduce((acc, value, index) => acc + Math.abs(value - difficulties[index]), 0) /
      (difficulties.length - 1)
    : 0;
  const maxDelta = difficulties.length > 1
    ? difficulties
        .slice(1)
        .reduce((max, value, index) => Math.max(max, Math.abs(value - difficulties[index])), 0)
    : 0;
  const successRate = executed > 0 ? arena.rounds.reduce((sum, round) => sum + round.successRate, 0) / executed : 0;

  const contentWarnings = moderationSamples.filter((sample) => sample.blocked).length;

  return {
    week,
    network: config.network,
    generatedAt,
    rounds: {
      executed,
      finalized,
      aborted,
      slashed,
      averageDifficulty: round(avgDifficulty, 2),
      difficultyDelta: {
        mean: round(meanDelta, 2),
        max: round(maxDelta, 2)
      }
    },
    elo: {
      leaderboard: arena.leaderboard,
      streaks: arena.streaks
    },
    operations: {
      thermostat: {
        temperature: {
          min: arena.thermostat.min,
          max: arena.thermostat.max,
          current: arena.thermostat.current
        },
        successRate: clamp(successRate)
      },
      safety: {
        contentWarnings,
        stakeLockFailures: 0
      }
    }
  };
}

async function writeSnapshots(config: AnalyticsConfig, snapshot: AnalyticsSnapshot): Promise<void> {
  await fsp.mkdir(config.outputDir, { recursive: true });
  const generatedAt = snapshot.culture.generatedAt;
  const [year, week] = snapshot.culture.week.split('-W');
  const culturePath = path.join(config.outputDir, `culture-week-${year}-W${week}.json`);
  const arenaPath = path.join(config.outputDir, `arena-week-${year}-W${week}.json`);
  await fsp.writeFile(culturePath, `${JSON.stringify(snapshot.culture, null, 2)}\n`, 'utf-8');
  await fsp.writeFile(arenaPath, `${JSON.stringify(snapshot.arena, null, 2)}\n`, 'utf-8');
  console.log(
    `💾 Wrote analytics snapshots for week ${snapshot.culture.week} (CMS ${snapshot.metrics.cms.toFixed(1)}, SPG ${snapshot.metrics.spg.toFixed(1)}) to ${config.outputDir}`
  );
}

function calculateWeek(date: Date): string {
  const { year, week } = isoWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function computeSlashRate(arena: ArenaMetrics): number {
  const totalRounds = arena.rounds.length;
  if (totalRounds === 0) {
    return 0;
  }
  const totalSlashes = arena.rounds.reduce((sum, round) => sum + round.slashes, 0);
  return totalSlashes / totalRounds;
}

function computeAverageSuccessRate(arena: ArenaMetrics): number {
  const totalRounds = arena.rounds.length;
  if (totalRounds === 0) {
    return 0;
  }
  return clamp(arena.rounds.reduce((sum, round) => sum + round.successRate, 0) / totalRounds);
}

function computeArenaSpg(arena: ArenaMetrics): number {
  return computeSpg(arena, computeSlashRate(arena), computeAverageSuccessRate(arena));
}

async function runLive(config: AnalyticsConfig, windowStart: Date): Promise<AnalyticsSnapshot> {
  const windowStartIso = windowStart.toISOString();
  const artifactMetrics = loadArtifactsFromDb(config, windowStartIso);
  const arenaMetrics = await loadArenaMetrics(config);
  const moderationSamples = await readModerationSamples(config.moderationLogPath, windowStart);
  const alerts = evaluateAlerts(config, { arena: arenaMetrics, artifacts: artifactMetrics });
  const generatedAt = new Date().toISOString();
  const week = calculateWeek(new Date());
  const cms = computeCms(artifactMetrics);
  const spg = computeArenaSpg(arenaMetrics);
  const culture = buildCultureSnapshot(config, generatedAt, week, artifactMetrics, alerts, cms);
  const arena = buildArenaSnapshot(config, generatedAt, week, arenaMetrics, moderationSamples);
  await appendAlertLog(config.alertLogPath, alerts, generatedAt);
  return { culture, arena, alerts, metrics: { cms, spg } };
}

function buildMetricsFromFixture(config: AnalyticsConfig, fixture: DryRunFixture): AnalyticsSnapshot {
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() - config.windowHours);
  const artifactMetrics = (() => {
    let derivatives = 0;
    let citationTotal = 0;
    let citationCount = 0;
    let maxLineageDepth = 0;
    const influenceScores: number[] = [];
    const byKind: Record<string, number> = {};
    const timeline = new Map<string, number>();
    const summaries: ArtifactSummary[] = [];

    for (const artifact of fixture.artifacts) {
      if (artifact.createdAt) {
        const createdTime = Date.parse(artifact.createdAt);
        if (Number.isFinite(createdTime) && createdTime >= windowStart.getTime()) {
          const bucket = new Date(Math.floor(createdTime / 3600000) * 3600000).toISOString();
          timeline.set(bucket, (timeline.get(bucket) ?? 0) + 1);
        }
      }
      if (artifact.updatedAt) {
        const updatedTime = Date.parse(artifact.updatedAt);
        const createdTime = artifact.createdAt ? Date.parse(artifact.createdAt) : NaN;
        if (Number.isFinite(updatedTime) && Number.isFinite(createdTime) && updatedTime > createdTime) {
          // count will be recomputed below; placeholder to keep parity with DB loader
        }
      }
      const derivativeFlag = artifact.derivative ?? (artifact.parentId != null && artifact.parentId !== '');
      if (derivativeFlag) derivatives += 1;
      if (typeof artifact.citations === 'number') {
        citationTotal += artifact.citations;
        citationCount += 1;
      }
      if (typeof artifact.lineageDepth === 'number') {
        maxLineageDepth = Math.max(maxLineageDepth, artifact.lineageDepth);
      }
      if (typeof artifact.influenceScore === 'number') {
        influenceScores.push(artifact.influenceScore);
        summaries.push({
          rank: 0,
          id: typeof artifact.id === 'number' ? artifact.id : Number.parseInt(String(artifact.id ?? 0), 10) || 0,
          title: artifact.title ?? `Artifact ${artifact.id ?? '?'}`,
          kind: artifact.kind ?? 'unknown',
          influence: artifact.influenceScore,
          citations: typeof artifact.citations === 'number' ? artifact.citations : 0
        });
      }
      const kind = artifact.kind ?? 'unknown';
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }

    const created = fixture.artifacts.length;
    const updated = fixture.artifacts.filter((artifact) => {
      if (!artifact.updatedAt || !artifact.createdAt) return false;
      const updatedTime = Date.parse(artifact.updatedAt);
      const createdTime = Date.parse(artifact.createdAt);
      return Number.isFinite(updatedTime) && Number.isFinite(createdTime) && updatedTime > createdTime;
    }).length;

    const topArtifacts = summaries
      .sort((a, b) => b.influence - a.influence)
      .slice(0, 5)
      .map((artifact, index) => ({ ...artifact, rank: index + 1 }));

    return {
      created,
      updated,
      derivatives,
      averageCitations: citationCount > 0 ? citationTotal / citationCount : 0,
      maxLineageDepth,
      influenceScores,
      byKind,
      topArtifacts,
      timeline: Array.from(timeline.entries())
        .sort(([a], [b]) => (a > b ? 1 : -1))
        .map(([bucket, count]) => ({ bucket, count }))
    };
  })();

  const arenaMetrics: ArenaMetrics = {
    rounds: fixture.rounds.map((round) => ({
      status: String(round.status ?? 'finalized'),
      difficulty: Number(round.difficulty ?? 0.5),
      successRate: clamp(Number(round.successRate ?? 0.75)),
      slashes: Math.max(Number(round.slashes ?? 0), 0),
      completedAt: typeof round.completedAt === 'string' ? round.completedAt : undefined
    })),
    thermostat: {
      min: Number(fixture.thermostat.min ?? 0.2),
      max: Number(fixture.thermostat.max ?? 1),
      current: Number(fixture.thermostat.current ?? 0.6)
    },
    leaderboard: fixture.leaderboard ?? [],
    streaks: fixture.streaks ?? []
  };

  const moderationSamples = fixture.moderation ?? [];
  const alerts = evaluateAlerts(config, { arena: arenaMetrics, artifacts: artifactMetrics });
  const generatedAt = new Date().toISOString();
  const week = calculateWeek(new Date());
  const cms = computeCms(artifactMetrics);
  const spg = computeArenaSpg(arenaMetrics);
  const culture = buildCultureSnapshot(config, generatedAt, week, artifactMetrics, alerts, cms);
  const arena = buildArenaSnapshot(config, generatedAt, week, arenaMetrics, moderationSamples);
  return { culture, arena, alerts, metrics: { cms, spg } };
}

async function runDryRun(config: AnalyticsConfig, fixturePath: string): Promise<void> {
  const absolute = path.resolve(fixturePath);
  const fixture = JSON.parse(await fsp.readFile(absolute, 'utf-8')) as DryRunFixture;
  const snapshot = buildMetricsFromFixture(config, fixture);
  await fsp.mkdir(config.outputDir, { recursive: true });
  const culturePath = path.join(config.outputDir, 'dry-run-culture.json');
  const arenaPath = path.join(config.outputDir, 'dry-run-arena.json');
  await fsp.writeFile(culturePath, `${JSON.stringify(snapshot.culture, null, 2)}\n`, 'utf-8');
  await fsp.writeFile(arenaPath, `${JSON.stringify(snapshot.arena, null, 2)}\n`, 'utf-8');

  if (fixture.expected?.cms !== undefined) {
    const delta = snapshot.metrics.cms - fixture.expected.cms;
    console.log(
      `Δ CMS: ${delta.toFixed(2)} (expected ${fixture.expected.cms.toFixed(1)}, actual ${snapshot.metrics.cms.toFixed(1)})`
    );
  }
  if (fixture.expected?.spg !== undefined) {
    const delta = snapshot.metrics.spg - fixture.expected.spg;
    console.log(
      `Δ SPG: ${delta.toFixed(2)} (expected ${fixture.expected.spg.toFixed(1)}, actual ${snapshot.metrics.spg.toFixed(1)})`
    );
  }
  console.log(`🧪 Dry-run snapshots written to ${config.outputDir}`);
}

async function runOnce(config: AnalyticsConfig, dryRunPath?: string): Promise<void> {
  if (dryRunPath) {
    await runDryRun(config, dryRunPath);
    return;
  }
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() - config.windowHours);
  const snapshot = await runLive(config, windowStart);
  await writeSnapshots(config, snapshot);
  console.log(
    `✅ Analytics completed: CMS ${snapshot.metrics.cms.toFixed(1)} | SPG ${snapshot.metrics.spg.toFixed(1)} | alerts: ${snapshot.alerts.length}`
  );
}

async function schedule(config: AnalyticsConfig, intervalSeconds: number, dryRunPath?: string): Promise<void> {
  if (intervalSeconds <= 0) {
    await runOnce(config, dryRunPath);
    return;
  }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const started = Date.now();
    await runOnce(config, dryRunPath);
    const elapsed = Date.now() - started;
    const waitTime = Math.max(intervalSeconds * 1000 - elapsed, 0);
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('dry-run', {
      type: 'string',
      describe: 'Run against a deterministic fixture instead of live data.'
    })
    .option('interval', {
      type: 'number',
      describe: 'Run continuously every N seconds.'
    })
    .option('window-hours', {
      type: 'number',
      describe: 'Override the sliding analytics window in hours.'
    })
    .help()
    .parseAsync();

  const config: AnalyticsConfig = {
    ...DEFAULT_CONFIG,
    windowHours: Number.isFinite(argv['window-hours']) && argv['window-hours'] !== undefined
      ? Number(argv['window-hours'])
      : DEFAULT_CONFIG.windowHours
  };

  const interval = typeof argv.interval === 'number' && Number.isFinite(argv.interval) ? argv.interval : 0;
  await schedule(config, interval, argv['dry-run']);
}

main().catch((error) => {
  console.error('Culture analytics generator failed:', error);
  process.exitCode = 1;
});
