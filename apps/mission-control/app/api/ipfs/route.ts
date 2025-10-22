import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  const { name } = (await request.json()) as { name: string; content: string };
  const cid = randomUUID().replace(/-/g, '').slice(0, 46);
  return NextResponse.json({ cid, url: `https://ipfs.io/ipfs/${cid}?filename=${encodeURIComponent(name)}` });
}
