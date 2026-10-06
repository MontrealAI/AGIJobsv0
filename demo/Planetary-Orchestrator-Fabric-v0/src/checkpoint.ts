import { promises as fs } from 'fs';
import { dirname } from 'path';
import { createHash, randomUUID } from 'crypto';
import { CheckpointData } from './types';
import { validateFabricConfig } from './validation';

const digest = (data: unknown): string =>
  createHash('sha256').update(JSON.stringify(data)).digest('hex');
export class CheckpointManager {
  constructor(private path: string) {}
  getPath(): string {
    return this.path;
  }
  setPath(path: string): void {
    this.path = path;
  }
  async save(data: CheckpointData): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    const payload = {
      ...data,
      formatVersion: 1,
      savedAt: new Date().toISOString(),
    };
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(
          JSON.stringify({ ...payload, sha256: digest(payload) }),
          'utf8'
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temporary, this.path);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  async load(): Promise<CheckpointData | undefined> {
    let raw: string;
    try {
      raw = await fs.readFile(this.path, 'utf8');
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    const { sha256, ...payload } = JSON.parse(raw);
    if (
      payload.formatVersion !== 1 ||
      typeof sha256 !== 'string' ||
      digest(payload) !== sha256
    )
      throw new Error(
        'Checkpoint integrity/version mismatch; preserve it and start a separately labeled simulation'
      );
    if (
      !Number.isSafeInteger(payload.tick) ||
      payload.tick < 0 ||
      !Array.isArray(payload.pausedShards) ||
      !Array.isArray(payload.events) ||
      !Array.isArray(payload.deterministicLog) ||
      typeof payload.systemPaused !== 'boolean'
    )
      throw new Error('Invalid checkpoint structure');
    validateFabricConfig({
      owner: {
        name: '',
        address: '',
        multisig: '',
        pauseRole: '',
        commandDeck: [],
      },
      shards: Object.values(payload.shards).map((s: any) => s.config),
      nodes: Object.values(payload.nodes).map((n: any) => n.definition),
      checkpoint: { path: this.path, intervalTicks: 1 },
      reporting: payload.reporting ?? {
        directory: '.',
        defaultLabel: 'restored',
      },
    });
    return payload as CheckpointData;
  }
}
