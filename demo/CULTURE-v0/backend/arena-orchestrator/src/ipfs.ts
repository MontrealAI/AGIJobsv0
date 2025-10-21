import crypto from 'node:crypto';

export interface PinResult {
  readonly cid: string;
}

export async function pinJSON(data: unknown): Promise<PinResult> {
  const serialized = JSON.stringify(data);
  const hash = crypto.createHash('sha256').update(serialized).digest('hex');
  const cid = `baguculture${hash.slice(0, 46)}`;
  return { cid };
}
