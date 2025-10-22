import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    activeArenas: 3,
    mintedArtifacts: 152,
    validatorHonesty: 96,
    paused: false
  });
}
