import type { PrismaClient } from '@prisma/client';
import type { ChecksumResult } from './checksum-service.js';
import { ChecksumService } from './checksum-service.js';
import type { EventIngestionService } from './event-ingestion-service.js';

export interface DataIntegrityServiceOptions {
  readonly backfillIntervalMs?: number;
  readonly checksumIntervalMs?: number;
}

export interface IntegrityStatusSnapshot {
  readonly lastBackfill?: {
    readonly at: string;
    readonly durationMs: number;
    readonly error?: string;
  };
  readonly lastChecksum?: {
    readonly at: string;
    readonly results?: ChecksumResult[];
    readonly error?: string;
  };
}

export class DataIntegrityService {
  private readonly checksumService: ChecksumService;
  private readonly backfillIntervalMs: number;
  private readonly checksumIntervalMs: number;
  private backfillTimer: NodeJS.Timeout | null = null;
  private checksumTimer: NodeJS.Timeout | null = null;
  private status: IntegrityStatusSnapshot = {};

  constructor(
    private readonly ingestion: EventIngestionService,
    prisma: PrismaClient,
    options: DataIntegrityServiceOptions = {}
  ) {
    this.checksumService = new ChecksumService(prisma);
    this.backfillIntervalMs = options.backfillIntervalMs ?? 5 * 60 * 1000;
    this.checksumIntervalMs = options.checksumIntervalMs ?? 10 * 60 * 1000;
  }

  start(): void {
    if (!this.backfillTimer) {
      this.backfillTimer = setInterval(() => {
        void this.runBackfill().catch((error) => {
          console.error('Automated backfill failed', error);
        });
      }, this.backfillIntervalMs);
    }

    if (!this.checksumTimer) {
      this.checksumTimer = setInterval(() => {
        void this.runChecksums().catch((error) => {
          console.error('Checksum verification failed', error);
        });
      }, this.checksumIntervalMs);
    }
  }

  stop(): void {
    if (this.backfillTimer) {
      clearInterval(this.backfillTimer);
      this.backfillTimer = null;
    }
    if (this.checksumTimer) {
      clearInterval(this.checksumTimer);
      this.checksumTimer = null;
    }
  }

  async runBackfill(): Promise<void> {
    const started = Date.now();
    try {
      await this.ingestion.backfillHistoricalEvents({ force: true });
      this.status = {
        ...this.status,
        lastBackfill: {
          at: new Date(started).toISOString(),
          durationMs: Date.now() - started,
        },
      };
    } catch (error) {
      this.status = {
        ...this.status,
        lastBackfill: {
          at: new Date(started).toISOString(),
          durationMs: Date.now() - started,
          error: error instanceof Error ? error.message : 'Unknown backfill failure',
        },
      };
      throw error;
    }
  }

  async runChecksums(): Promise<ChecksumResult[]> {
    const started = Date.now();
    try {
      const results = await this.checksumService.verify();
      this.status = {
        ...this.status,
        lastChecksum: {
          at: new Date(started).toISOString(),
          results,
        },
      };
      return results;
    } catch (error) {
      this.status = {
        ...this.status,
        lastChecksum: {
          at: new Date(started).toISOString(),
          error: error instanceof Error ? error.message : 'Unknown checksum failure',
        },
      };
      throw error;
    }
  }

  getStatus(): IntegrityStatusSnapshot {
    return this.status;
  }
}
