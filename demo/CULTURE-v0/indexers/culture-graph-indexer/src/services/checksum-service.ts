import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export interface ChecksumResult {
  readonly key: string;
  readonly hash: string;
  readonly changed: boolean;
  readonly verifiedAt: Date;
}

export class ChecksumService {
  constructor(private readonly prisma: PrismaClient) {}

  async verify(): Promise<ChecksumResult[]> {
    const [artifactChecksum, citationChecksum] = await Promise.all([
      this.computeArtifactChecksum(),
      this.computeCitationChecksum(),
    ]);

    const combined = await this.combineChecksums([
      ['artifact', artifactChecksum],
      ['citation', citationChecksum],
    ]);

    return [artifactChecksum, citationChecksum, combined];
  }

  private async computeArtifactChecksum(): Promise<ChecksumResult> {
    const artifacts = await this.prisma.artifact.findMany({
      orderBy: [{ id: 'asc' }],
      select: { id: true, parentId: true, author: true, kind: true, cid: true },
    });

    const hash = createHash('sha256');
    for (const artifact of artifacts) {
      hash.update(`${artifact.id}|${artifact.parentId ?? ''}|${artifact.author}|${artifact.kind}|${artifact.cid}\n`);
    }

    return this.persistChecksum('artifact', hash.digest('hex'));
  }

  private async computeCitationChecksum(): Promise<ChecksumResult> {
    const citations = await this.prisma.citation.findMany({
      orderBy: [{ fromId: 'asc' }, { toId: 'asc' }, { blockNumber: 'asc' }, { logIndex: 'asc' }],
      select: { fromId: true, toId: true },
    });

    const hash = createHash('sha256');
    for (const citation of citations) {
      hash.update(`${citation.fromId}->${citation.toId}\n`);
    }

    return this.persistChecksum('citation', hash.digest('hex'));
  }

  private async combineChecksums(entries: readonly [string, ChecksumResult][]): Promise<ChecksumResult> {
    const hash = createHash('sha256');
    for (const [key, result] of entries) {
      hash.update(`${key}:${result.hash}\n`);
    }
    return this.persistChecksum('graph', hash.digest('hex'));
  }

  private async persistChecksum(key: string, hash: string): Promise<ChecksumResult> {
    const previous = await this.prisma.datasetChecksum.findUnique({ where: { key } });
    const changed = !previous || previous.hash !== hash;

    const record = await this.prisma.datasetChecksum.upsert({
      where: { key },
      create: { key, hash },
      update: { hash },
    });

    return {
      key,
      hash: record.hash,
      changed,
      verifiedAt: record.updatedAt,
    };
  }

}
