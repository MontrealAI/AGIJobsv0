import path from 'node:path';

export const FIXTURE_ROOT = path.resolve(__dirname, '..', 'config');

export function fixturePath(fileName: string): string {
  return path.join(FIXTURE_ROOT, fileName);
}
