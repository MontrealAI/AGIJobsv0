import fs from 'node:fs/promises';
import path from 'node:path';

export interface PersistenceAdapter<T> {
  readonly load: () => Promise<T>;
  readonly save: (data: T) => Promise<void>;
}

export function jsonFileAdapter<T>(relativePath: string, fallback: T): PersistenceAdapter<T> {
  const resolved = path.resolve(process.cwd(), relativePath);

  async function ensureDir(): Promise<void> {
    const dir = path.dirname(resolved);
    await fs.mkdir(dir, { recursive: true });
  }

  return {
    async load(): Promise<T> {
      try {
        const data = await fs.readFile(resolved, 'utf8');
        return JSON.parse(data) as T;
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          console.warn('Failed to load persistent state', resolved, error);
        }
        return structuredClone(fallback);
      }
    },
    async save(data: T): Promise<void> {
      await ensureDir();
      await fs.writeFile(resolved, JSON.stringify(data, null, 2), 'utf8');
    }
  };
}
