import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  ClassificationResult,
  JobSpec,
  ChainJobSummary,
} from './jobClassifier';
import type { JobRunResult } from './execution';

export interface PendingSettlement {
  schemaVersion?: 1;
  jobId: string;
  agentAddress: string;
  fromBlock: number;
  classification: ClassificationResult;
  spec: JobSpec | null;
  summary: ChainJobSummary;
  execution: {
    runResult: JobRunResult;
    resultRef: string;
    chainJob: Record<string, unknown>;
  };
}

// A durable, operator-owned volume is required. Claims deliberately survive a
// crash during learning/subtask creation: external effects cannot be made atomic
// with this journal and must be reconciled, never blindly replayed.
export class SettlementJournal {
  private readonly directory: string;
  constructor(root: string, scope: string) {
    if (!path.isAbsolute(root))
      throw new Error('Settlement journal path must be absolute');
    this.directory = path.join(
      root,
      createHash('sha256').update(scope).digest('hex')
    );
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }
  private file(jobId: string, suffix: string): string {
    return path.join(
      this.directory,
      createHash('sha256').update(jobId).digest('hex') + suffix
    );
  }
  private create(file: string, value: unknown): boolean {
    const serialized = JSON.stringify(value, (_, item) =>
      typeof item === 'bigint' ? item.toString() : item
    );
    if (Buffer.byteLength(serialized) > 8 * 1024 * 1024)
      throw new Error('Settlement record exceeds 8 MiB limit');
    let fd: number;
    try {
      fd = fs.openSync(file, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
    try {
      // Intentional data storage: JSON only, bounded size, operator-owned directory, fixed hashed filename, no execution.
      fs.writeFileSync(fd, serialized);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    const directoryFd = fs.openSync(this.directory, 'r');
    try {
      fs.fsyncSync(directoryFd);
    } finally {
      fs.closeSync(directoryFd);
    }
    return true;
  }
  save(record: PendingSettlement): void {
    if (
      !this.create(this.file(record.jobId, '.pending.json'), {
        ...record,
        schemaVersion: 1,
      })
    )
      throw new Error(
        'Settlement handoff already exists; reconcile before resubmitting'
      );
  }
  pending(): PendingSettlement[] {
    return fs
      .readdirSync(this.directory)
      .filter((name) => name.endsWith('.pending.json'))
      .map((name) => {
        const record = JSON.parse(
          fs.readFileSync(path.join(this.directory, name), 'utf8')
        ) as PendingSettlement;
        if (
          record.schemaVersion !== 1 ||
          !record.jobId ||
          !record.agentAddress ||
          !record.execution ||
          !Number.isSafeInteger(record.fromBlock) ||
          record.fromBlock < 0
        )
          throw new Error(
            'Invalid settlement journal; operator reconciliation required'
          );
        return record;
      })
      .filter(
        (record) => !fs.existsSync(this.file(record.jobId, '.done.json'))
      );
  }
  claimSubmission(jobId: string): boolean {
    return this.create(this.file(jobId, '.submission.json'), {
      jobId,
      startedAt: new Date().toISOString(),
    });
  }
  claim(jobId: string, success: boolean): boolean {
    return this.create(this.file(jobId, '.claim.json'), {
      jobId,
      success,
      claimedAt: new Date().toISOString(),
    });
  }
  complete(jobId: string): void {
    this.create(this.file(jobId, '.done.json'), {
      jobId,
      completedAt: new Date().toISOString(),
    });
  }
}
