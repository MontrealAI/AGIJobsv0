import { resolve } from 'node:path';

export function databaseUrl(env, root) {
  const value =
    env.DATABASE_URL ??
    (env.SQLITE_PATH
      ? `file:${resolve(root, env.SQLITE_PATH.replace(/^file:/, ''))}`
      : `file:${resolve(root, 'data/culture-graph.db')}`);
  if (!value.startsWith('file:/')) {
    throw new Error('Use an absolute SQLite file URL in DATABASE_URL');
  }
  return value;
}
