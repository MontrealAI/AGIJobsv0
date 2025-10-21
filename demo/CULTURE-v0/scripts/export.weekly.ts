import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const EnvSchema = z.object({
  CULTURE_REPORT_OUTPUT: z.string().optional()
});

const CultureSnapshotSchema = z.object({
  week: z.string(),
  network: z.string(),
  generatedAt: z.string(),
  artifacts: z.object({
    created: z.number(),
    updated: z.number(),
    byKind: z.record(z.number()),
    averageCitations: z.number(),
    maxLineageDepth: z.number()
  }),
  influence: z.object({
    cultureMaturityScore: z.number(),
    influenceGini: z.number(),
    derivativeJobs: z.number()
  }),
  topArtifacts: z
    .array(
      z.object({
        rank: z.number(),
        id: z.number(),
        title: z.string(),
        kind: z.string(),
        influence: z.number(),
        citations: z.number()
      })
    )
    .default([]),
  alerts: z.array(z.string()).default([])
});

const ArenaSnapshotSchema = z.object({
  week: z.string(),
  network: z.string(),
  generatedAt: z.string(),
  rounds: z.object({
    executed: z.number(),
    finalized: z.number(),
    aborted: z.number(),
    slashed: z.number(),
    averageDifficulty: z.number(),
    difficultyDelta: z.object({
      mean: z.number(),
      max: z.number()
    })
  }),
  elo: z.object({
    leaderboard: z
      .array(
        z.object({
          address: z.string(),
          rating: z.number(),
          wins: z.number(),
          losses: z.number(),
          draws: z.number()
        })
      )
      .default([]),
    streaks: z
      .array(
        z.object({
          address: z.string(),
          length: z.number(),
          type: z.string()
        })
      )
      .default([])
  }),
  operations: z.object({
    thermostat: z.object({
      temperature: z.object({
        min: z.number(),
        max: z.number(),
        current: z.number()
      }),
      successRate: z.number()
    }),
    safety: z.object({
      contentWarnings: z.number(),
      stakeLockFailures: z.number()
    })
  })
});

async function readJson<T>(filePath: string, schema: z.ZodSchema<T>): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8');
  return schema.parse(JSON.parse(content));
}

async function latestSnapshot(prefix: string): Promise<string> {
  const directory = path.resolve('demo/CULTURE-v0/data/analytics');
  const files = await fs.readdir(directory);
  const candidates = files
    .filter((file) => file.startsWith(prefix) && file.endsWith('.json'))
    .sort();
  if (candidates.length === 0) {
    throw new Error(`No snapshot files found matching prefix ${prefix}`);
  }
  return path.join(directory, candidates[candidates.length - 1]);
}

function renderCultureReport(snapshot: z.infer<typeof CultureSnapshotSchema>): string {
  const kindBreakdown = Object.entries(snapshot.artifacts.byKind)
    .map(([kind, count]) => `  - ${kind}: ${count}`)
    .join('\n');
  const topTable = snapshot.topArtifacts.length
    ? ['| Rank | Artifact | Kind | Influence Score | Citations |', '| --- | --- | --- | --- | --- |',
        ...snapshot.topArtifacts.map((entry) =>
          `| ${entry.rank} | #${entry.id} — "${entry.title}" | ${entry.kind} | ${entry.influence.toFixed(3)} | ${entry.citations} |`
        )
      ].join('\n')
    : '_No ranked artifacts for this interval._';
  const alerts = snapshot.alerts.length
    ? snapshot.alerts.map((alert) => `- ${alert}`).join('\n')
    : '- None';
  return `# Culture Weekly Report\n\n**Week:** ${snapshot.week}\n**Network:** ${snapshot.network}\n**Generated:** ${snapshot.generatedAt}\n\n## Highlights\n\n- ${snapshot.artifacts.created} new artifacts minted (${snapshot.artifacts.updated} updates).\n- Average citations per artifact: ${snapshot.artifacts.averageCitations.toFixed(1)}\n- Maximum lineage depth: ${snapshot.artifacts.maxLineageDepth}\n- Culture Maturity Score (CMS): ${snapshot.influence.cultureMaturityScore.toFixed(1)}\n\n### Artifact Mix\n${kindBreakdown}\n\n## Top Influential Artifacts\n\n${topTable}\n\n## Culture Graph Snapshot\n\n- Total derivatives launched: ${snapshot.influence.derivativeJobs}\n- Influence Gini coefficient: ${snapshot.influence.influenceGini.toFixed(2)}\n\n## Alerts & Notes\n\n${alerts}\n`;
}

function renderArenaReport(snapshot: z.infer<typeof ArenaSnapshotSchema>): string {
  const leaderboard = snapshot.elo.leaderboard.length
    ? ['| Rank | Agent | Rating | W | L | D |', '| --- | --- | --- | --- | --- | --- |',
        ...snapshot.elo.leaderboard.map(
          (entry, index) => `| ${index + 1} | \`${entry.address}\` | ${entry.rating} | ${entry.wins} | ${entry.losses} | ${entry.draws} |`
        )
      ].join('\n')
    : '_No matches recorded._';
  const streaks = snapshot.elo.streaks.length
    ? snapshot.elo.streaks.map((streak) => `- ${streak.type} streak of ${streak.length} by \`${streak.address}\``).join('\n')
    : '- None';
  return `# Arena Weekly Report\n\n**Week:** ${snapshot.week}\n**Network:** ${snapshot.network}\n**Generated:** ${snapshot.generatedAt}\n\n## Round Summary\n\n- Rounds executed: ${snapshot.rounds.executed}\n- Finalized: ${snapshot.rounds.finalized} | Aborted: ${snapshot.rounds.aborted} | Slashed: ${snapshot.rounds.slashed}\n- Average difficulty: ${snapshot.rounds.averageDifficulty.toFixed(2)} (Δ mean ${snapshot.rounds.difficultyDelta.mean.toFixed(2)}, max ${snapshot.rounds.difficultyDelta.max.toFixed(2)})\n\n## Elo Leaderboard\n\n${leaderboard}\n\n### Notable Streaks\n${streaks}\n\n## Thermostat & Safety\n\n- Temperature window: ${snapshot.operations.thermostat.temperature.min.toFixed(1)} → ${snapshot.operations.thermostat.temperature.max.toFixed(1)} (current ${snapshot.operations.thermostat.temperature.current.toFixed(1)})\n- Observed success rate: ${(snapshot.operations.thermostat.successRate * 100).toFixed(1)}%\n- Content warnings: ${snapshot.operations.safety.contentWarnings}\n- Stake lock failures: ${snapshot.operations.safety.stakeLockFailures}\n`;
}

async function main() {
  const env = EnvSchema.parse(process.env);
  const culturePath = await latestSnapshot('culture-week');
  const arenaPath = await latestSnapshot('arena-week');
  const culture = await readJson(culturePath, CultureSnapshotSchema);
  const arena = await readJson(arenaPath, ArenaSnapshotSchema);
  const outputDir = env.CULTURE_REPORT_OUTPUT ? path.resolve(env.CULTURE_REPORT_OUTPUT) : path.resolve('demo/CULTURE-v0/reports');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'culture-weekly.md'), renderCultureReport(culture));
  await fs.writeFile(path.join(outputDir, 'arena-weekly.md'), renderArenaReport(arena));
  console.log(`📝 Wrote culture and arena reports for ${culture.week} to ${outputDir}`);
}

main().catch((error) => {
  console.error('Report export failed:', error);
  process.exitCode = 1;
});
