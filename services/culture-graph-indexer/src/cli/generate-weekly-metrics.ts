import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { prisma } from '../db/prisma.js';
import { loadConfig } from '../config.js';
import { InfluenceService } from '../services/influence-service.js';
import { NetworkXInfluenceValidator } from '../services/networkx-validator.js';

interface WeeklyMetrics {
  readonly week: string;
  readonly network: string;
  readonly generatedAt: string;
  readonly artifacts: {
    readonly total: number;
    readonly mintedLast7Days: number;
    readonly derivatives: number;
    readonly averageCitations: number;
    readonly maxLineageDepth: number;
    readonly byKind: Record<string, number>;
  };
  readonly influence: {
    readonly cultureMaturityScore: number;
    readonly influenceGini: number;
  };
  readonly topArtifacts: readonly {
    readonly rank: number;
    readonly id: string;
    readonly kind: string;
    readonly author: string;
    readonly cid: string;
    readonly influence: number;
    readonly citations: number;
  }[];
  readonly rounds: {
    readonly finalizedThisWeek: number;
    readonly latestFinalizedAt: string | null;
  };
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('output', {
      type: 'string',
      describe: 'Output path for weekly metrics JSON file',
    })
    .help()
    .parseAsync();

  const config = loadConfig();
  const influence = new InfluenceService(prisma, {}, new NetworkXInfluenceValidator());
  await influence.recompute();

  const outputPath = resolve(argv.output ?? config.weeklyMetricsOutput);
  const metrics = await computeMetrics(config.networkName);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(metrics, null, 2));
  console.log(`✅ wrote culture weekly metrics to ${outputPath}`);
  await prisma.$disconnect();
}

async function computeMetrics(network: string): Promise<WeeklyMetrics> {
  const now = new Date();
  const { year, week } = isoWeek(now);
  const weekString = `${year}-W${String(week).padStart(2, '0')}`;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);

  const [totalArtifacts, mintedLast7Days, derivatives, influenceAggregate, kindGroups, topArtifacts, roundStats] =
    await Promise.all([
      prisma.artifact.count(),
      prisma.artifact.count({ where: { timestamp: { gte: weekStart } } }),
      prisma.artifact.count({ where: { parentId: { not: null } } }),
      prisma.influenceMetric.aggregate({ _avg: { citationCount: true }, _max: { lineageDepth: true } }),
      prisma.artifact.groupBy({ by: ['kind'], _count: { kind: true } }),
      prisma.artifact.findMany({
        take: 10,
        orderBy: { influence: { score: 'desc' } },
        include: { influence: true },
      }),
      prisma.roundFinalization.findMany({
        where: { finalizedAt: { gte: weekStart } },
        orderBy: { finalizedAt: 'desc' },
      }),
    ]);

  const scores = topArtifacts.map((artifact) => artifact.influence?.score ?? 0);
  const gini = scores.length > 0 ? giniCoefficient(scores) : 0;
  const avgCitations = influenceAggregate._avg.citationCount ?? 0;
  const maxLineage = influenceAggregate._max.lineageDepth ?? 0;
  const cultureMaturityScore = Math.min(100, avgCitations * 20 + maxLineage * 10);

  const latestRound = roundStats[0]?.finalizedAt ?? null;

  const metrics: WeeklyMetrics = {
    week: weekString,
    network,
    generatedAt: now.toISOString(),
    artifacts: {
      total: totalArtifacts,
      mintedLast7Days,
      derivatives,
      averageCitations: avgCitations,
      maxLineageDepth: maxLineage,
      byKind: Object.fromEntries(kindGroups.map((group) => [group.kind, group._count.kind])),
    },
    influence: {
      cultureMaturityScore,
      influenceGini: gini,
    },
    topArtifacts: topArtifacts.map((artifact, index) => ({
      rank: index + 1,
      id: artifact.id,
      kind: artifact.kind,
      author: artifact.author,
      cid: artifact.cid,
      influence: artifact.influence?.score ?? 0,
      citations: artifact.influence?.citationCount ?? 0,
    })),
    rounds: {
      finalizedThisWeek: roundStats.length,
      latestFinalizedAt: latestRound ? latestRound.toISOString() : null,
    },
  };

  return metrics;
}

function giniCoefficient(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return 0;
  }
  let cumulative = 0;
  let weightedSum = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    cumulative += sorted[index];
    weightedSum += cumulative;
  }
  const gini = (sorted.length + 1 - (2 * weightedSum) / total) / sorted.length;
  return Math.max(0, Math.min(1, gini));
}

function isoWeek(date: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: target.getUTCFullYear(), week };
}

main().catch(async (error) => {
  console.error('Failed to generate weekly metrics', error);
  await prisma.$disconnect();
  process.exit(1);
});
