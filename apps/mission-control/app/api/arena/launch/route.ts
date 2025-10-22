import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  const payload = (await request.json()) as { artifactName: string; cohort: string; targetSuccessRate: number };
  return NextResponse.json({ arenaId: `arena-${payload.cohort}-${randomUUID().slice(0, 8)}` });
}
