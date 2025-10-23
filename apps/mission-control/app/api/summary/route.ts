import { NextResponse } from 'next/server';

type AnalyticsResponse = {
  lastUpdated: string | null;
  reports: Array<{
    week: string;
    cms: { artifactCount: number; citationDepth: number; influenceDispersion: number; reuse: number };
    spg: { validatorHonesty: number; difficultyTrend: number };
    arena?: { rounds?: { finalized?: number } };
  }>;
};

const META_API_BASE = process.env.META_API_BASE_URL ?? 'http://localhost:8000';
const META_API_TOKEN = process.env.META_API_TOKEN;

export async function GET() {
  const res = await fetch(`${META_API_BASE.replace(/\/$/, '')}/analytics/latest`, {
    headers: META_API_TOKEN
      ? {
          Authorization: `Bearer ${META_API_TOKEN}`
        }
      : undefined,
    cache: 'no-store'
  });

  if (!res.ok) {
    return NextResponse.json(
      {
        error: 'Analytics unavailable'
      },
      { status: 503 }
    );
  }

  const payload = (await res.json()) as AnalyticsResponse;
  const reports = Array.isArray(payload.reports) ? payload.reports : [];
  const latest = reports.at(-1);
  const previous = reports.length > 1 ? reports.at(-2) : undefined;

  const artifactCount = latest?.cms?.artifactCount ?? 0;
  const previousArtifacts = previous?.cms?.artifactCount ?? 0;
  const artifactDelta = artifactCount - previousArtifacts;

  const validatorHonesty = (latest?.spg?.validatorHonesty ?? 0) * 100;
  const prevHonesty = (previous?.spg?.validatorHonesty ?? 0) * 100;
  const honestyDelta = validatorHonesty - prevHonesty;

  const finalizedRounds = latest?.arena?.rounds?.finalized ?? 0;

  return NextResponse.json({
    week: latest?.week ?? 'n/a',
    artifactCount,
    artifactDelta,
    citationDepth: latest?.cms?.citationDepth ?? 0,
    influenceDispersion: latest?.cms?.influenceDispersion ?? 0,
    reuse: latest?.cms?.reuse ?? 0,
    finalizedRounds,
    validatorHonesty,
    honestyDelta,
    difficultyTrend: latest?.spg?.difficultyTrend ?? 0,
    paused: validatorHonesty < 70
  });
}
