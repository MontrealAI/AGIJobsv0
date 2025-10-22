import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';

import { buildStructuredLogRecord } from '../../../shared/structuredLogger';

type BetterSqlite3Constructor = typeof BetterSqlite3;

let betterSqlite3Module: BetterSqlite3Constructor | null = null;

function resolveDatabase(): BetterSqlite3Constructor | null {
  if (betterSqlite3Module !== null) {
    return betterSqlite3Module;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    betterSqlite3Module = require('better-sqlite3') as BetterSqlite3Constructor;
  } catch (error: any) {
    const reason = error?.message ?? error;
    console.warn('better-sqlite3 module unavailable; skipping indexer reads:', reason);
    betterSqlite3Module = null;
  }
  return betterSqlite3Module;
}

type ArtifactDatum = {
  id: string;
  kind: string;
  parentId: string | null;
  createdAt: number;
  influenceScore: number;
  citationCount: number;
  lineageDepth: number;
  title?: string | null;
};

type ScoreboardRound = {
  id: number;
  difficulty: number;
  difficultyDelta: number;
  successRate: number;
  status: string;
  winners: readonly string[];
  snapshotCid?: string;
  startedAt?: string;
  closedAt?: string;
  finalizedAt?: string;
};

type ScoreboardAgent = {
  address: string;
  rating: number;
  stats: { games: number; wins: number; losses: number; draws: number };
};

type ScoreboardSnapshot = {
  agents: readonly ScoreboardAgent[];
  rounds: readonly ScoreboardRound[];
  currentDifficulty: number;
  difficultyWindow: {
    minDifficulty?: number;
    maxDifficulty?: number;
    targetSuccessRate?: number;
  };
  updatedAt?: string;
};

type ModerationAudit = {
  timestamp: string;
  blocked: boolean;
  flaggedTerms: readonly string[];
  flaggedPassages: readonly string[];
};

type StructuredLog = {
  timestamp?: string;
  component?: string;
  action?: string;
  level?: string;
  details?: Record<string, unknown>;
};

type Period = {
  start: Date;
  end: Date;
};

type CliOptions = {
  intervalSeconds?: number;
  dryRunFixture?: string;
};

const EnvSchema = z.object({
  CULTURE_ANALYTICS_DB: z.string().optional(),
  CULTURE_ANALYTICS_OUTPUT: z.string().optional(),
  CULTURE_ORCHESTRATOR_URL: z.string().url().optional(),
  CULTURE_NETWORK_LABEL: z.string().optional(),
  CULTURE_ANALYTICS_ALERT_LOG: z.string().optional(),
  CULTURE_ORCHESTRATOR_LOG: z.string().optional(),
  CULTURE_ANALYTICS_BURST_THRESHOLD: z.string().optional(),
  CULTURE_ANALYTICS_BURST_WINDOW_HOURS: z.string().optional(),
  CULTURE_ANALYTICS_SLASH_THRESHOLD: z.string().optional(),
  CULTURE_ANALYTICS_SUCCESS_STREAK: z.string().optional(),
  CULTURE_ANALYTICS_FIXTURE: z.string().optional(),
  ORCHESTRATOR_MODERATION_AUDIT: z.string().optional(),
});

const FixtureSchema = z.object({
  artifacts: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        parentId: z.string().nullable().optional(),
        createdAt: z.union([z.number(), z.string()]),
        influenceScore: z.number().default(0),
        citationCount: z.number().default(0),
        lineageDepth: z.number().default(0),
        title: z.string().optional(),
      })
    )
    .default([]),
  scoreboard: z
    .object({
      agents: z
        .array(
          z.object({
            address: z.string(),
            rating: z.number(),
            stats: z
              .object({
                games: z.number(),
                wins: z.number(),
                losses: z.number(),
                draws: z.number(),
              })
              .default({ games: 0, wins: 0, losses: 0, draws: 0 }),
          })
        )
        .default([]),
      rounds: z
        .array(
          z.object({
            id: z.number().default(0),
            difficulty: z.number().default(0),
            difficultyDelta: z.number().default(0),
            successRate: z.number().default(0),
            status: z.string().default('open'),
            winners: z.array(z.string()).default([]),
            snapshotCid: z.string().optional(),
            startedAt: z.string().optional(),
            closedAt: z.string().optional(),
            finalizedAt: z.string().optional(),
          })
        )
        .default([]),
      currentDifficulty: z.number().default(0),
      difficultyWindow: z
        .object({
          minDifficulty: z.number().optional(),
          maxDifficulty: z.number().optional(),
          targetSuccessRate: z.number().optional(),
        })
        .default({}),
      updatedAt: z.string().optional(),
    })
    .default({ agents: [], rounds: [], currentDifficulty: 0, difficultyWindow: {} }),
  logs: z.array(z.record(z.any())).default([]),
  moderation: z.array(z.record(z.any())).default([]),
  expected: z
    .object({
      cultureMaturityScore: z.number().optional(),
      selfPlayGrowth: z.number().optional(),
    })
    .optional(),
});

const DEFAULT_OUTPUT = path.resolve('demo/CULTURE-v0/data/analytics');
const DEFAULT_NETWORK = 'Anvil 31337';
const DEFAULT_LOG_PATH = path.resolve('demo/CULTURE-v0/logs/analytics.alerts.jsonl');
const DEFAULT_ORCHESTRATOR_LOG = path.resolve('demo/CULTURE-v0/logs/orchestrator.jsonl');
const DEFAULT_MODERATION_LOG = path.resolve('storage/validation/moderation.log');

function parseCliOptions(argv: readonly string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--interval' && index + 1 < argv.length) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.intervalSeconds = parsed;
      }
      index += 1;
    } else if (token === '--dry-run' && index + 1 < argv.length) {
      options.dryRunFixture = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function isoWeekLabel(date: Date): { label: string; week: number; year: number } {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const label = `${utc.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
  return { label, week, year: utc.getUTCFullYear() };
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function computeGini(values: readonly number[]): number {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return 0;
  }
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return 0;
  }
  let cumulative = 0;
  let weightedSum = 0;
  for (let index = 0; index < n; index += 1) {
    cumulative += sorted[index];
    weightedSum += cumulative;
  }
  return (n + 1 - (2 * weightedSum) / total) / n;
}

async function loadModerationLog(pathname: string): Promise<ModerationAudit[]> {
  try {
    const raw = await fs.readFile(pathname, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line))
      .map((entry) => ({
        timestamp: String(entry.timestamp ?? ''),
        blocked: Boolean(entry.blocked),
        flaggedTerms: Array.isArray(entry.flaggedTerms) ? entry.flaggedTerms : [],
        flaggedPassages: Array.isArray(entry.flaggedPassages) ? entry.flaggedPassages : [],
      }));
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.warn('Unable to read moderation audit log:', error);
    }
    return [];
  }
}

async function loadStructuredLogs(pathname: string): Promise<StructuredLog[]> {
  try {
    const raw = await fs.readFile(pathname, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as StructuredLog);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.warn('Unable to read orchestrator logs:', error);
    }
    return [];
  }
}

async function loadFixture(filePath: string): Promise<{
  artifacts: ArtifactDatum[];
  scoreboard: ScoreboardSnapshot;
  logs: StructuredLog[];
  moderation: ModerationAudit[];
  expected?: { cultureMaturityScore?: number; selfPlayGrowth?: number };
}> {
  const parsed = FixtureSchema.parse(JSON.parse(await fs.readFile(filePath, 'utf8')));
  const artifacts: ArtifactDatum[] = parsed.artifacts.map((artifact) => ({
    id: artifact.id,
    kind: artifact.kind,
    parentId: artifact.parentId ?? null,
    createdAt: typeof artifact.createdAt === 'string' ? Date.parse(artifact.createdAt) : artifact.createdAt,
    influenceScore: artifact.influenceScore ?? 0,
    citationCount: artifact.citationCount ?? 0,
    lineageDepth: artifact.lineageDepth ?? 0,
    title: artifact.title,
  }));
  const scoreboard: ScoreboardSnapshot = {
    agents: parsed.scoreboard.agents.map((agent) => ({
      address: agent.address,
      rating: agent.rating,
      stats: {
        games: agent.stats?.games ?? 0,
        wins: agent.stats?.wins ?? 0,
        losses: agent.stats?.losses ?? 0,
        draws: agent.stats?.draws ?? 0,
      },
    })),
    rounds: parsed.scoreboard.rounds.map((round) => ({
      id: round.id,
      difficulty: round.difficulty,
      difficultyDelta: round.difficultyDelta,
      successRate: round.successRate,
      status: round.status,
      winners: round.winners,
      snapshotCid: round.snapshotCid,
      startedAt: round.startedAt,
      closedAt: round.closedAt,
      finalizedAt: round.finalizedAt,
    })),
    currentDifficulty: parsed.scoreboard.currentDifficulty,
    difficultyWindow: parsed.scoreboard.difficultyWindow ?? {},
    updatedAt: parsed.scoreboard.updatedAt,
  };
  const logs = parsed.logs as StructuredLog[];
  const moderation = parsed.moderation.map((entry) => ({
    timestamp: String(entry.timestamp ?? ''),
    blocked: Boolean(entry.blocked),
    flaggedTerms: Array.isArray(entry.flaggedTerms) ? entry.flaggedTerms : [],
    flaggedPassages: Array.isArray(entry.flaggedPassages) ? entry.flaggedPassages : [],
  }));
  return { artifacts, scoreboard, logs, moderation, expected: parsed.expected ?? undefined };
}

async function loadLiveData(env: z.infer<typeof EnvSchema>, period: Period): Promise<{
  artifacts: ArtifactDatum[];
  scoreboard: ScoreboardSnapshot;
  logs: StructuredLog[];
  moderation: ModerationAudit[];
}> {
  const dbPath = env.CULTURE_ANALYTICS_DB ?? path.resolve('demo/CULTURE-v0/data/culture-graph.db');
  const artifacts: ArtifactDatum[] = [];
  const Database = resolveDatabase();
  if (Database) {
    try {
      const db = new Database(dbPath, { readonly: true });
      const stmt = db.prepare(
        `SELECT a.id, a.kind, a.parent_id AS parentId, a.created_at AS createdAt,
                COALESCE(i.score, 0) AS influenceScore,
                COALESCE(i.citation_count, 0) AS citationCount,
                COALESCE(i.lineage_depth, 0) AS lineageDepth
           FROM artifacts a
           LEFT JOIN influence_scores i ON i.artifact_id = a.id
          WHERE a.created_at BETWEEN ? AND ?
          ORDER BY a.created_at ASC`
      );
      const rows = stmt.all(period.start.getTime(), period.end.getTime()) as Array<{
        id: string;
        kind: string;
        parentId: string | null;
        createdAt: number;
        influenceScore: number;
        citationCount: number;
        lineageDepth: number;
      }>;
      for (const row of rows) {
        artifacts.push({
          id: row.id,
          kind: row.kind,
          parentId: row.parentId,
          createdAt: row.createdAt,
          influenceScore: row.influenceScore,
          citationCount: row.citationCount,
          lineageDepth: row.lineageDepth,
        });
      }
      db.close();
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.warn('Failed to read indexer database:', error);
      }
    }
  }

  let scoreboard: ScoreboardSnapshot = { agents: [], rounds: [], currentDifficulty: 0, difficultyWindow: {} };
  const baseUrl = env.CULTURE_ORCHESTRATOR_URL ?? 'http://localhost:4005';
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/arena/scoreboard`, { cache: 'no-store' });
    if (response.ok) {
      const payload = (await response.json()) as any;
      scoreboard = {
        agents: Array.isArray(payload?.agents)
          ? payload.agents.map((agent: any) => ({
              address: String(agent.address ?? ''),
              rating: Number(agent.rating ?? agent?.stats?.rating ?? 0),
              stats: {
                games: Number(agent?.stats?.games ?? 0),
                wins: Number(agent?.stats?.wins ?? 0),
                losses: Number(agent?.stats?.losses ?? 0),
                draws: Number(agent?.stats?.draws ?? 0),
              },
            }))
          : [],
        rounds: Array.isArray(payload?.rounds)
          ? payload.rounds.map(
              (round: any): ScoreboardRound => ({
                id: Number(round.id ?? 0),
                difficulty: Number(round.difficulty ?? 0),
                difficultyDelta: Number(round.difficultyDelta ?? 0),
                successRate: Number(round.successRate ?? 0),
                status: String(round.status ?? 'open'),
                winners: Array.isArray(round.winners) ? round.winners.map((value: any) => String(value)) : [],
                snapshotCid: round.snapshotCid ? String(round.snapshotCid) : undefined,
                startedAt: round.startedAt ? String(round.startedAt) : undefined,
                closedAt: round.closedAt ? String(round.closedAt) : undefined,
                finalizedAt: round.finalizedAt ? String(round.finalizedAt) : undefined,
              })
            )
          : [],
        currentDifficulty: Number(payload?.currentDifficulty ?? 0),
        difficultyWindow: payload?.difficultyWindow ?? {},
        updatedAt: payload?.updatedAt ? String(payload.updatedAt) : undefined,
      };
    }
  } catch (error: any) {
    console.warn('Unable to fetch orchestrator scoreboard:', error?.message ?? error);
  }

  const logPath = env.CULTURE_ORCHESTRATOR_LOG ?? DEFAULT_ORCHESTRATOR_LOG;
  const logs = await loadStructuredLogs(logPath);
  const moderationLog = env.ORCHESTRATOR_MODERATION_AUDIT ?? DEFAULT_MODERATION_LOG;
  const moderation = await loadModerationLog(moderationLog);

  return { artifacts, scoreboard, logs, moderation };
}

function summariseArtifacts(artifacts: readonly ArtifactDatum[]): {
  created: number;
  updated: number;
  byKind: Record<string, number>;
  averageCitations: number;
  maxLineageDepth: number;
  derivativeJobs: number;
} {
  const byKind = new Map<string, number>();
  let citationsTotal = 0;
  let maxLineageDepth = 0;
  let derivatives = 0;
  for (const artifact of artifacts) {
    byKind.set(artifact.kind, (byKind.get(artifact.kind) ?? 0) + 1);
    citationsTotal += Number(artifact.citationCount ?? 0);
    maxLineageDepth = Math.max(maxLineageDepth, Number(artifact.lineageDepth ?? 0));
    if (artifact.parentId) {
      derivatives += 1;
    }
  }
  const created = artifacts.length;
  const averageCitations = created === 0 ? 0 : citationsTotal / created;
  const byKindRecord: Record<string, number> = {};
  for (const [kind, count] of byKind.entries()) {
    byKindRecord[kind] = count;
  }
  return {
    created,
    updated: derivatives,
    byKind: byKindRecord,
    averageCitations,
    maxLineageDepth,
    derivativeJobs: derivatives,
  };
}

function computeCms(summary: ReturnType<typeof summariseArtifacts>, gini: number): number {
  if (summary.created === 0) {
    return 0;
  }
  const connectivity = clamp(summary.averageCitations / 3);
  const maturity = clamp(summary.maxLineageDepth / 5);
  const adoption = clamp(summary.derivativeJobs / Math.max(summary.created, 1));
  const equality = clamp(1 - gini);
  const score = 0.35 * connectivity + 0.3 * maturity + 0.25 * adoption + 0.1 * equality;
  return Number((score * 100).toFixed(1));
}

function computeSpg(scoreboard: ScoreboardSnapshot, slashCount: number): number {
  if (scoreboard.rounds.length === 0) {
    return 0;
  }
  const averageSuccess = clamp(
    scoreboard.rounds.reduce((sum, round) => sum + (Number.isFinite(round.successRate) ? round.successRate : 0), 0) /
      Math.max(scoreboard.rounds.length, 1)
  );
  const diffWindow = scoreboard.difficultyWindow ?? {};
  const minDifficulty = Number(diffWindow.minDifficulty ?? 1);
  const maxDifficulty = Number(diffWindow.maxDifficulty ?? minDifficulty + 1);
  const range = Math.max(maxDifficulty - minDifficulty, 1);
  const difficultyScore = clamp((scoreboard.currentDifficulty - minDifficulty) / range);
  const stabilityPenalty = clamp(slashCount / Math.max(scoreboard.rounds.length, 1));
  const score = 0.5 * averageSuccess + 0.35 * difficultyScore + 0.15 * (1 - stabilityPenalty);
  return Number((score * 100).toFixed(1));
}

function computeWinningStreaks(rounds: readonly ScoreboardRound[]): Array<{ address: string; length: number; type: string }> {
  const active = new Map<string, number>();
  const best = new Map<string, number>();
  for (const round of rounds) {
    const winners = new Set(round.winners.map((address) => address.toLowerCase()));
    for (const [address, streak] of active.entries()) {
      if (!winners.has(address)) {
        active.set(address, 0);
      }
    }
    for (const winner of winners) {
      const current = (active.get(winner) ?? 0) + 1;
      active.set(winner, current);
      best.set(winner, Math.max(best.get(winner) ?? 0, current));
    }
  }
  return Array.from(best.entries())
    .filter(([, length]) => length >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([address, length]) => ({ address, length, type: 'win' }));
}

function parseTimestamp(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function countValidatorSlashes(logs: readonly StructuredLog[]): number {
  return logs.filter(
    (log) =>
      log.component === 'stake-manager' &&
      log.action === 'slash' &&
      typeof log.details?.role === 'string' &&
      String(log.details.role).toLowerCase() === 'validator'
  ).length;
}

function detectZeroSuccessStreak(rounds: readonly ScoreboardRound[]): number {
  let longest = 0;
  let current = 0;
  for (const round of rounds) {
    if (round.successRate <= 0.01) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function countRecentArtifacts(artifacts: readonly ArtifactDatum[], end: Date, windowHours: number): number {
  const windowStart = end.getTime() - windowHours * 3_600_000;
  return artifacts.filter((artifact) => artifact.createdAt >= windowStart).length;
}

function summariseModeration(moderation: readonly ModerationAudit[]): { warnings: number; blocked: number } {
  let warnings = 0;
  let blocked = 0;
  for (const entry of moderation) {
    const hasFlags = (entry.flaggedTerms?.length ?? 0) > 0 || (entry.flaggedPassages?.length ?? 0) > 0;
    if (entry.blocked) {
      blocked += 1;
    } else if (hasFlags) {
      warnings += 1;
    }
  }
  return { warnings, blocked };
}

async function appendStructuredLogs(records: readonly ReturnType<typeof buildStructuredLogRecord>[], logPath: string): Promise<void> {
  if (records.length === 0) {
    return;
  }
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  const lines = records.map((record) => JSON.stringify(record));
  await fs.appendFile(logPath, `${lines.join('\n')}\n`, 'utf8');
}

function buildAlertLogs(alerts: readonly string[], context: Record<string, unknown>): ReturnType<typeof buildStructuredLogRecord>[] {
  return alerts.map((message) =>
    buildStructuredLogRecord({
      component: 'culture-analytics',
      action: 'anomaly',
      level: 'warn',
      details: { message, ...context },
    })
  );
}

async function writeSnapshot(outputDir: string, prefix: string, weekLabel: string, payload: unknown): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const filename = `${prefix}-${weekLabel}.json`;
  const destination = path.join(outputDir, filename);
  await fs.writeFile(destination, JSON.stringify(payload, null, 2));
  return destination;
}

async function runOnce(
  env: z.infer<typeof EnvSchema>,
  period: Period,
  options: CliOptions
): Promise<{ culturePath: string; arenaPath: string; cms: number; spg: number; alerts: string[] }> {
  let artifacts: ArtifactDatum[] = [];
  let scoreboard: ScoreboardSnapshot = { agents: [], rounds: [], currentDifficulty: 0, difficultyWindow: {} };
  let logs: StructuredLog[] = [];
  let moderation: ModerationAudit[] = [];
  let expected: { cultureMaturityScore?: number; selfPlayGrowth?: number } | undefined;

  if (options.dryRunFixture) {
    const data = await loadFixture(options.dryRunFixture);
    artifacts = data.artifacts;
    scoreboard = data.scoreboard;
    logs = data.logs;
    moderation = data.moderation;
    expected = data.expected;
  } else {
    const live = await loadLiveData(env, period);
    artifacts = live.artifacts;
    scoreboard = live.scoreboard;
    logs = live.logs;
    moderation = live.moderation;
  }

  const summary = summariseArtifacts(artifacts);
  const gini = computeGini(artifacts.map((artifact) => artifact.influenceScore ?? 0));
  const cms = computeCms(summary, gini);

  const slashThreshold = Number(env.CULTURE_ANALYTICS_SLASH_THRESHOLD ?? '2');
  const slashCount = countValidatorSlashes(logs);
  const spg = computeSpg(scoreboard, slashCount);

  const zeroSuccessThreshold = Number(env.CULTURE_ANALYTICS_SUCCESS_STREAK ?? '3');
  const zeroStreak = detectZeroSuccessStreak(scoreboard.rounds);

  const burstWindowHours = Number(env.CULTURE_ANALYTICS_BURST_WINDOW_HOURS ?? '1');
  const burstThreshold = Number(env.CULTURE_ANALYTICS_BURST_THRESHOLD ?? '10');
  const recentArtifacts = countRecentArtifacts(artifacts, period.end, burstWindowHours);

  const alerts: string[] = [];
  if (slashCount >= slashThreshold && slashCount > 0) {
    alerts.push(`Validator slashes spiked to ${slashCount} within the window.`);
  }
  if (zeroStreak >= zeroSuccessThreshold && zeroSuccessThreshold > 0) {
    alerts.push(`Arena recorded ${zeroStreak} consecutive zero-success rounds.`);
  }
  if (recentArtifacts >= burstThreshold && burstThreshold > 0) {
    alerts.push(`Artifact minting burst detected (${recentArtifacts} in the last ${burstWindowHours}h).`);
  }

  const moderationSummary = summariseModeration(moderation);

  const streaks = computeWinningStreaks(scoreboard.rounds).slice(0, 5);
  const leaderboard = scoreboard.agents
    .map((agent) => ({
      address: agent.address,
      rating: agent.rating,
      wins: agent.stats.wins,
      losses: agent.stats.losses,
      draws: agent.stats.draws,
    }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 10);

  const roundsExecuted = scoreboard.rounds.length;
  const roundsFinalized = scoreboard.rounds.filter((round) => round.status === 'finalized').length;
  const roundsAborted = scoreboard.rounds.filter((round) => round.status === 'failed').length;
  const averageDifficulty = roundsExecuted
    ? scoreboard.rounds.reduce((sum, round) => sum + round.difficulty, 0) / roundsExecuted
    : 0;
  const difficultyDeltas = scoreboard.rounds.map((round) => Math.abs(round.difficultyDelta ?? 0));
  const deltaMean = difficultyDeltas.length
    ? difficultyDeltas.reduce((sum, value) => sum + value, 0) / difficultyDeltas.length
    : 0;
  const deltaMax = difficultyDeltas.length ? Math.max(...difficultyDeltas) : 0;

  const successRateMean = roundsExecuted
    ? scoreboard.rounds.reduce((sum, round) => sum + round.successRate, 0) / roundsExecuted
    : 0;

  const { warnings: moderationWarnings, blocked: moderationBlocks } = moderationSummary;

  const cultureSnapshot = {
    week: isoWeekLabel(period.end).label,
    network: env.CULTURE_NETWORK_LABEL ?? DEFAULT_NETWORK,
    generatedAt: new Date().toISOString(),
    artifacts: {
      created: summary.created,
      updated: summary.updated,
      byKind: summary.byKind,
      averageCitations: Number(summary.averageCitations.toFixed(2)),
      maxLineageDepth: summary.maxLineageDepth,
    },
    influence: {
      cultureMaturityScore: cms,
      influenceGini: Number(gini.toFixed(3)),
      derivativeJobs: summary.derivativeJobs,
    },
    topArtifacts: artifacts
      .slice()
      .sort((a, b) => b.influenceScore - a.influenceScore)
      .slice(0, 10)
      .map((artifact, index) => ({
        rank: index + 1,
        id: Number.parseInt(artifact.id, 10) || Number(index + 1),
        title: artifact.title ?? `Artifact #${artifact.id}`,
        kind: artifact.kind,
        influence: Number(artifact.influenceScore.toFixed(3)),
        citations: artifact.citationCount,
      })),
    alerts,
  };

  const arenaSnapshot = {
    week: isoWeekLabel(period.end).label,
    network: env.CULTURE_NETWORK_LABEL ?? DEFAULT_NETWORK,
    generatedAt: new Date().toISOString(),
    rounds: {
      executed: roundsExecuted,
      finalized: roundsFinalized,
      aborted: roundsAborted,
      slashed: slashCount,
      averageDifficulty: Number(averageDifficulty.toFixed(2)),
      difficultyDelta: {
        mean: Number(deltaMean.toFixed(2)),
        max: Number(deltaMax.toFixed(2)),
      },
    },
    elo: {
      leaderboard,
      streaks,
    },
    operations: {
      thermostat: {
        temperature: {
          min: Number((scoreboard.difficultyWindow?.minDifficulty ?? scoreboard.currentDifficulty).toFixed(2)),
          max: Number((scoreboard.difficultyWindow?.maxDifficulty ?? scoreboard.currentDifficulty).toFixed(2)),
          current: Number(scoreboard.currentDifficulty.toFixed(2)),
        },
        successRate: Number(successRateMean.toFixed(3)),
      },
      safety: {
        contentWarnings: moderationWarnings + moderationBlocks,
        stakeLockFailures: logs.filter(
          (log) => log.component === 'stake-manager' && log.action === 'lock' && String(log.level).toLowerCase() === 'error'
        ).length,
      },
    },
  };

  const outputDir = env.CULTURE_ANALYTICS_OUTPUT ?? DEFAULT_OUTPUT;
  const { label } = isoWeekLabel(period.end);
  const culturePath = await writeSnapshot(outputDir, 'culture-week', label, cultureSnapshot);
  const arenaPath = await writeSnapshot(outputDir, 'arena-week', label, arenaSnapshot);

  if (expected) {
    if (typeof expected.cultureMaturityScore === 'number') {
      console.log(
        `[dry-run] CMS delta: ${(cms - expected.cultureMaturityScore).toFixed(2)} (expected ${expected.cultureMaturityScore})`
      );
    }
    if (typeof expected.selfPlayGrowth === 'number') {
      console.log(
        `[dry-run] SPG delta: ${(spg - expected.selfPlayGrowth).toFixed(2)} (expected ${expected.selfPlayGrowth})`
      );
    }
  }

  const alertLogPath = env.CULTURE_ANALYTICS_ALERT_LOG ?? DEFAULT_LOG_PATH;
  const structured = buildAlertLogs(alerts, {
    cms,
    spg,
    slashCount,
    zeroSuccessStreak: zeroStreak,
    recentArtifacts,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
  });
  await appendStructuredLogs(structured, alertLogPath);

  return { culturePath, arenaPath, cms, spg, alerts };
}

async function main() {
  const options = parseCliOptions(process.argv);
  const env = EnvSchema.parse(process.env);

  if (!options.dryRunFixture && env.CULTURE_ANALYTICS_FIXTURE) {
    options.dryRunFixture = env.CULTURE_ANALYTICS_FIXTURE;
  }

  const run = async () => {
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const period: Period = { start, end: now };
    const result = await runOnce(env, period, options);
    console.log(`📈 Culture snapshot -> ${result.culturePath}`);
    console.log(`🏟️ Arena snapshot  -> ${result.arenaPath}`);
    console.log(`   CMS ${result.cms.toFixed(1)} | SPG ${result.spg.toFixed(1)} | alerts: ${result.alerts.length}`);
  };

  if (options.intervalSeconds && options.intervalSeconds > 0) {
    while (true) {
      await run();
      await delay(options.intervalSeconds * 1000);
    }
  } else {
    await run();
  }
}

main().catch((error) => {
  console.error('Analytics generation failed:', error);
  process.exitCode = 1;
});

