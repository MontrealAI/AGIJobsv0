import { promises as fs } from 'fs';
import { dirname } from 'path';
import { CheckpointData } from './types';

export class CheckpointManager {
  constructor(private readonly path: string) {}

  async save(data: CheckpointData): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    const payload = JSON.stringify({ ...data, savedAt: new Date().toISOString() }, null, 2);
    await fs.writeFile(this.path, payload, 'utf8');
  }

  async load(): Promise<CheckpointData | undefined> {
    try {
      const raw = await fs.readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as CheckpointData;
      return parsed;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }
}
