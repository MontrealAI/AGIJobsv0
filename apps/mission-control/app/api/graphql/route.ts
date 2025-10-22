import { NextResponse } from 'next/server';

const SCOREBOARD = {
  artifacts: [
    { id: 'artifact-zenith', name: 'Zenith Playbook', elo: 1850, difficultyTrend: [82, 85, 88, 90, 94], successRate: 0.74 },
    { id: 'artifact-orion', name: 'Orion Validator Primer', elo: 1785, difficultyTrend: [65, 70, 76, 80, 82], successRate: 0.67 },
    { id: 'artifact-nebula', name: 'Nebula Recovery Codex', elo: 1920, difficultyTrend: [90, 92, 94, 95, 97], successRate: 0.81 }
  ],
  validatorHonesty: {
    median: 0.96,
    latestSample: [
      { label: 'Validator A', honesty: 0.97 },
      { label: 'Validator B', honesty: 0.95 },
      { label: 'Validator C', honesty: 0.94 },
      { label: 'Validator D', honesty: 0.98 }
    ]
  }
};

export async function POST(request: Request) {
  const { query } = (await request.json()) as { query: string };

  if (query.includes('artifacts')) {
    return NextResponse.json({ data: SCOREBOARD });
  }

  return NextResponse.json({ data: {} });
}
