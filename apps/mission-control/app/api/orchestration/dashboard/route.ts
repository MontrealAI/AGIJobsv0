import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

import rawDashboard from '../../../../data/orchestration/dashboard.json';
import type { MissionControlDashboard } from '../../../../types/orchestration-dashboard';

const fallbackDashboard = rawDashboard as MissionControlDashboard;

const META_API_BASE = process.env.META_API_BASE_URL ?? 'http://localhost:8000';
const META_API_TOKEN = process.env.META_API_TOKEN;

interface AnalyticsReport {
  week?: string;
  cms?: {
    artifactCount?: number;
    citationDepth?: number;
    influenceDispersion?: number;
    reuse?: number;
  };
  spg?: {
    validatorHonesty?: number;
    difficultyTrend?: number;
  };
  culture?: {
    artifacts?: {
      created?: number;
      updated?: number;
    };
    influence?: {
      derivativeJobs?: number;
    };
  };
  arena?: {
    rounds?: {
      executed?: number;
      finalized?: number;
      difficultyDelta?: {
        mean?: number;
      };
    };
    operations?: {
      thermostat?: {
        successRate?: number;
      };
    };
  };
}

interface AnalyticsResponse {
  reports?: AnalyticsReport[];
}

const LOCAL_ANALYTICS_PATH = path.join(process.cwd(), 'storage', 'analytics', 'latest.json');

const numberFormatter = new Intl.NumberFormat('en-US');

function formatSigned(value: number) {
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${numberFormatter.format(Math.abs(value))}`;
}

async function fetchAnalytics(): Promise<{ latest?: AnalyticsReport; previous?: AnalyticsReport }> {
  let reports: AnalyticsReport[] = [];

  try {
    const res = await fetch(`${META_API_BASE.replace(/\/$/, '')}/analytics/latest`, {
      headers: META_API_TOKEN
        ? {
            Authorization: `Bearer ${META_API_TOKEN}`
          }
        : undefined,
      cache: 'no-store'
    });
    if (res.ok) {
      const payload = (await res.json()) as AnalyticsResponse;
      if (Array.isArray(payload.reports)) {
        reports = payload.reports;
      }
    }
  } catch (error) {
    console.warn('mission-control dashboard analytics remote fetch failed', error);
  }

  if (!reports.length) {
    try {
      const raw = await fs.readFile(LOCAL_ANALYTICS_PATH, 'utf8');
      const parsed = JSON.parse(raw) as AnalyticsReport[];
      if (Array.isArray(parsed)) {
        reports = parsed;
      }
    } catch (error) {
      console.warn('mission-control dashboard analytics local fallback failed', error);
    }
  }

  return {
    latest: reports.at(-1),
    previous: reports.length > 1 ? reports.at(-2) : undefined
  };
}

export async function GET() {
  const dashboard: MissionControlDashboard = JSON.parse(JSON.stringify(fallbackDashboard));

  const { latest, previous } = await fetchAnalytics();

  if (latest) {
    const minted = latest.culture?.artifacts?.created ?? latest.cms?.artifactCount ?? 0;
    const prevMinted = previous?.culture?.artifacts?.created ?? previous?.cms?.artifactCount ?? 0;
    const updated = latest.culture?.artifacts?.updated ?? 0;

    const finalized = latest.arena?.rounds?.finalized ?? 0;
    const executed = latest.arena?.rounds?.executed ?? finalized;
    const pending = Math.max(executed - finalized, 0);

    const honestyPct = (latest.spg?.validatorHonesty ?? 0) * 100;
    const prevHonestyPct = (previous?.spg?.validatorHonesty ?? 0) * 100;

    const difficulty = latest.arena?.rounds?.difficultyDelta?.mean ?? latest.spg?.difficultyTrend ?? 0;
    const thermostat = (latest.arena?.operations?.thermostat?.successRate ?? 0) * 100;

    dashboard.jobMetrics = [
      {
        label: 'Artifacts minted (week)',
        value: numberFormatter.format(minted),
        delta: `${formatSigned(minted - prevMinted)} vs prev • ${numberFormatter.format(updated)} updates`
      },
      {
        label: 'Arena rounds finalized',
        value: numberFormatter.format(finalized),
        delta: pending ? `${numberFormatter.format(pending)} pending resolution` : 'All settled'
      },
      {
        label: 'Validator honesty',
        value: `${honestyPct.toFixed(1)}%`,
        delta: `${formatSigned(honestyPct - prevHonestyPct)} pts vs prev`
      },
      {
        label: 'Difficulty delta',
        value: difficulty.toFixed(2),
        delta: `Thermostat success ${thermostat.toFixed(0)}%`
      }
    ];
  }

  return NextResponse.json(dashboard);
}
