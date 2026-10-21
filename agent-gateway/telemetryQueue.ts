import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { EnergySample } from '../shared/energyMonitor';
import type { OperatorSubmissionResult } from './operator';
import {
  copyEnergySample,
  EnergySampleInputError,
  validateEnergySample,
} from './telemetrySample';

const REJECT_SCHEMA = 'agijobs/telemetry-rejections/v1';
const MAX_REJECT_RECORDS = 128;
const MAX_REJECT_BYTES = 1024 * 1024;
const MAX_SAMPLE_BYTES = 32 * 1024;

interface RejectedSample {
  sha256: string;
  prefixSha256: string;
  rejectedAt: string;
  reason: string;
  originalBytes: number;
  truncated: boolean;
  sampleJsonPrefix: string;
}

interface RejectionJournal {
  schema: string;
  evicted: number;
  records: RejectedSample[];
}

function validRejection(record: RejectedSample): boolean {
  if (
    !record ||
    typeof record.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.sha256) ||
    typeof record.prefixSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.prefixSha256) ||
    typeof record.rejectedAt !== 'string' ||
    record.rejectedAt.length > 64 ||
    !Number.isFinite(Date.parse(record.rejectedAt)) ||
    typeof record.reason !== 'string' ||
    record.reason.length > 256 ||
    !Number.isSafeInteger(record.originalBytes) ||
    record.originalBytes < 0 ||
    typeof record.truncated !== 'boolean' ||
    typeof record.sampleJsonPrefix !== 'string'
  )
    return false;
  const prefix = Buffer.from(record.sampleJsonPrefix);
  return (
    prefix.length <= MAX_SAMPLE_BYTES &&
    crypto.createHash('sha256').update(prefix).digest('hex') ===
      record.prefixSha256 &&
    (record.truncated
      ? record.originalBytes > prefix.length
      : record.originalBytes === prefix.length &&
        crypto.createHash('sha256').update(prefix).digest('hex') ===
          record.sha256)
  );
}

export class TelemetryQueue {
  private queue: EnergySample[] = [];
  private loaded = false;
  private dirty = false;
  private flushing = false;
  private mutation: Promise<unknown> = Promise.resolve();
  private readonly outbox: string;
  private readonly rejects: string;

  constructor(
    private readonly directory: string,
    private readonly onLength: (length: number) => void = () => {}
  ) {
    this.outbox = path.join(directory, 'telemetry-queue.json');
    this.rejects = path.join(directory, 'telemetry-rejections.json');
  }

  get length(): number {
    return this.queue.length;
  }

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const pending = this.mutation.then(action);
    this.mutation = pending.catch(() => {});
    return pending;
  }

  private async loadUnlocked(): Promise<void> {
    if (this.loaded) return;
    try {
      const value: unknown = JSON.parse(
        await fs.promises.readFile(this.outbox, 'utf8')
      );
      if (!Array.isArray(value))
        throw new Error('Telemetry outbox must be an array');
      this.queue = value as EnergySample[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    this.loaded = true;
    this.onLength(this.queue.length);
  }

  async load(): Promise<void> {
    await this.serial(() => this.loadUnlocked());
  }

  private async ensureDurableDirectory(directory: string): Promise<void> {
    await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
    // Existing entries may be from an earlier failed checkpoint. Repeat the
    // entire parent chain on retries and after a process restart.
    let parent = path.dirname(path.resolve(directory));
    for (;;) {
      const handle = await fs.promises.open(parent, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      const next = path.dirname(parent);
      if (next === parent) break;
      parent = next;
    }
  }

  private async writeAtomic(file: string, text: string): Promise<void> {
    await this.ensureDurableDirectory(this.directory);
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      const handle = await fs.promises.open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(text, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.promises.rename(temporary, file);
      const directory = await fs.promises.open(this.directory, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await fs.promises
        .unlink(temporary)
        .catch((err: NodeJS.ErrnoException) => {
          if (err.code !== 'ENOENT') throw err;
        });
    }
  }

  private async persistDirty(): Promise<void> {
    if (!this.dirty) return;
    await this.writeAtomic(this.outbox, JSON.stringify(this.queue, null, 2));
    this.dirty = false;
  }

  async enqueue(input: EnergySample): Promise<void> {
    const sample = copyEnergySample(input);
    await this.serial(async () => {
      await this.loadUnlocked();
      await this.persistDirty();
      const next = [...this.queue, sample];
      await this.writeAtomic(this.outbox, JSON.stringify(next, null, 2));
      this.queue = next;
      this.onLength(this.queue.length);
    });
  }

  private async acknowledge(samples: EnergySample[]): Promise<void> {
    await this.serial(async () => {
      if (!samples.every((sample, index) => this.queue[index] === sample)) {
        throw new Error(
          'Telemetry acknowledgement does not match queue prefix'
        );
      }
      this.queue = this.queue.slice(samples.length);
      this.dirty = true;
      this.onLength(this.queue.length);
      await this.persistDirty();
    });
  }

  private async quarantine(
    sample: EnergySample,
    error: unknown
  ): Promise<void> {
    await this.serial(async () => {
      await this.persistDirty();
      if (this.queue[0] !== sample)
        throw new Error('Telemetry rejection is not at queue head');
      let journal: RejectionJournal = {
        schema: REJECT_SCHEMA,
        evicted: 0,
        records: [],
      };
      try {
        const handle = await fs.promises.open(this.rejects, 'r');
        const bytes = Buffer.alloc(MAX_REJECT_BYTES + 1);
        let length = 0;
        try {
          while (length < bytes.length) {
            const { bytesRead } = await handle.read(
              bytes,
              length,
              bytes.length - length,
              null
            );
            if (bytesRead === 0) break;
            length += bytesRead;
          }
        } finally {
          await handle.close();
        }
        if (length > MAX_REJECT_BYTES)
          throw new Error('Telemetry rejection journal exceeds its bound');
        journal = JSON.parse(bytes.subarray(0, length).toString('utf8'));
        if (
          journal.schema !== REJECT_SCHEMA ||
          !Number.isSafeInteger(journal.evicted) ||
          journal.evicted < 0 ||
          !Array.isArray(journal.records) ||
          journal.records.length > MAX_REJECT_RECORDS ||
          !journal.records.every(validRejection)
        )
          throw new Error('Invalid telemetry rejection journal');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
      const raw = Buffer.from(
        JSON.stringify(sample, (_key, value) =>
          typeof value === 'number' && !Number.isFinite(value)
            ? { rejectedNumber: String(value) }
            : value
        )
      );
      const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
      if (!journal.records.some((record) => record.sha256 === sha256)) {
        const sampleJsonPrefix = new TextDecoder().decode(
          raw.subarray(0, MAX_SAMPLE_BYTES),
          { stream: raw.length > MAX_SAMPLE_BYTES }
        );
        journal.records.push({
          sha256,
          prefixSha256: crypto
            .createHash('sha256')
            .update(sampleJsonPrefix)
            .digest('hex'),
          rejectedAt: new Date().toISOString(),
          reason:
            error instanceof EnergySampleInputError
              ? error.message
              : 'Telemetry attestation conversion failed',
          originalBytes: raw.length,
          truncated: raw.length > MAX_SAMPLE_BYTES,
          sampleJsonPrefix,
        });
      }
      const before = journal.evicted;
      while (
        journal.records.length > MAX_REJECT_RECORDS ||
        Buffer.byteLength(JSON.stringify(journal)) > MAX_REJECT_BYTES
      ) {
        journal.records.shift();
        journal.evicted += 1;
      }
      await this.writeAtomic(this.rejects, JSON.stringify(journal));
      console.error('Telemetry sample quarantined', {
        sha256,
        reason:
          error instanceof EnergySampleInputError
            ? error.message
            : 'conversion',
        evicted: journal.evicted - before,
      });
      this.queue = this.queue.slice(1);
      this.dirty = true;
      this.onLength(this.queue.length);
      await this.persistDirty();
    });
  }

  async flush(
    submit: (samples: EnergySample[]) => Promise<OperatorSubmissionResult>
  ): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      let remaining = await this.serial(async () => {
        await this.loadUnlocked();
        await this.persistDirty();
        return [...this.queue];
      });
      while (remaining.length) {
        let validCount = remaining.length;
        let invalid: unknown;
        for (let index = 0; index < remaining.length; index++) {
          try {
            validateEnergySample(remaining[index]);
          } catch (err) {
            validCount = index;
            invalid = err;
            break;
          }
        }
        if (validCount === 0) {
          await this.quarantine(remaining[0], invalid);
          remaining = remaining.slice(1);
          continue;
        }
        const batch = remaining.slice(0, validCount);
        const result = await submit(batch);
        if (
          !Number.isSafeInteger(result.processed) ||
          result.processed < 0 ||
          result.processed > batch.length
        ) {
          throw new Error('Invalid telemetry processed-prefix result');
        }
        if (result.processed > 0)
          await this.acknowledge(batch.slice(0, result.processed));
        remaining = remaining.slice(result.processed);
        if (result.rejected) {
          if (
            result.success ||
            result.rejected.index !== result.processed ||
            result.processed >= batch.length
          ) {
            throw new Error('Invalid telemetry rejected-record result');
          }
          await this.quarantine(remaining[0], result.rejected.error);
          remaining = remaining.slice(1);
        } else if (!result.success || result.processed !== batch.length) {
          throw result.error ?? new Error('Telemetry submission incomplete');
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}
