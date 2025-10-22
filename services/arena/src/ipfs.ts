import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import type { SnapshotArtifact } from './types.js';

export class Snapshotter {
  constructor(private readonly pinToDisk = false) {}

  async snapshot(payload: unknown): Promise<SnapshotArtifact> {
    const serialized = stringify(payload);
    const digest = crypto.createHash('sha256').update(serialized).digest();
    const cid = this.toCid(digest);

    if (this.pinToDisk) {
      const fs = await import('fs/promises');
      const path = `./snapshots/${cid}.json`;
      await fs.mkdir('./snapshots', { recursive: true });
      await fs.writeFile(path, serialized, 'utf8');
    }

    return {
      cid,
      bytes: Buffer.byteLength(serialized)
    };
  }

  private toCid(digest: Buffer): string {
    const multicodec = Buffer.from([0x01, 0x55]);
    const multihash = Buffer.concat([Buffer.from([0x12, digest.length]), digest]);
    const cidBytes = Buffer.concat([multicodec, multihash]);
    return `b${cidBytes.toString('base64url')}`;
  }
}
