import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface PersistenceAdapter<T> {
  readonly load: () => Promise<T>;
  readonly save: (data: T) => Promise<void>;
}

export function jsonFileAdapter<T>(
  relativePath: string,
  fallback: T,
): PersistenceAdapter<T> {
  const resolved = path.resolve(process.cwd(), relativePath);
  let pendingSave = Promise.resolve();

  async function ensureDir(): Promise<void> {
    const dir = path.dirname(resolved);
    await fs.mkdir(dir, { recursive: true });
  }

  return {
    async load(): Promise<T> {
      try {
        const data = await fs.readFile(resolved, 'utf8');
        return JSON.parse(data) as T;
      } catch (error: unknown) {
        if (
          !(
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'ENOENT'
          )
        ) {
          throw new Error(`Cannot load persistent state at ${resolved}`, {
            cause: error,
          });
        }
        return structuredClone(fallback);
      }
    },
    save(data: T): Promise<void> {
      const serialized = JSON.stringify(data, null, 2);
      const writeSnapshot = async (): Promise<void> => {
        await ensureDir();
        const temporary = `${resolved}.${randomUUID()}.tmp`;
        try {
          const handle = await fs.open(temporary, 'wx', 0o600);
          try {
            await handle.writeFile(serialized, 'utf8');
            await handle.sync();
          } finally {
            await handle.close();
          }
          await fs.rename(temporary, resolved);
        } finally {
          await fs.rm(temporary, { force: true });
        }
      };
      const save = pendingSave.then(writeSnapshot);
      pendingSave = save.catch(() => undefined);
      return save;
    },
  };
}
