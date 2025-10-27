import fs from 'node:fs';
import path from 'node:path';
import { FabricStateSnapshot } from './types.js';

export class CheckpointStore {
  constructor(private readonly directory: string, private readonly retain: number) {
    fs.mkdirSync(directory, { recursive: true });
  }

  persist(snapshot: FabricStateSnapshot): string {
    const fileName = `${String(snapshot.tick).padStart(6, '0')}-${snapshot.configHash}.json`;
    const filePath = path.join(this.directory, fileName);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
    this.trim();
    return filePath;
  }

  latest(): FabricStateSnapshot | undefined {
    const entries = fs
      .readdirSync(this.directory)
      .filter((file) => file.endsWith('.json'))
      .sort();
    const latestFile = entries.at(-1);
    if (!latestFile) {
      return undefined;
    }
    const data = fs.readFileSync(path.join(this.directory, latestFile), 'utf8');
    return JSON.parse(data) as FabricStateSnapshot;
  }

  private trim(): void {
    const entries = fs
      .readdirSync(this.directory)
      .filter((file) => file.endsWith('.json'))
      .sort();
    if (entries.length <= this.retain) {
      return;
    }
    for (const file of entries.slice(0, entries.length - this.retain)) {
      fs.rmSync(path.join(this.directory, file));
    }
  }

  clear(): void {
    for (const file of fs.readdirSync(this.directory)) {
      if (file.endsWith('.json')) {
        fs.rmSync(path.join(this.directory, file));
      }
    }
  }
}
