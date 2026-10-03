import { copyFile, chmod, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { localStackEnv } from './local-stack-env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = '.env.local';
const compose = (...args) => {
  const result = spawnSync('docker', ['compose', '--env-file', file, ...args], {
    cwd: root,
    env: localStackEnv(
      process.env,
      readFileSync(path.join(root, '.env.example'), 'utf8'),
      readFileSync(path.join(root, file), 'utf8'),
      readFileSync(path.join(root, 'docker-compose.yml'), 'utf8')
    ),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Docker Compose failed (${result.status})`);
};

try {
  try {
    await access(path.join(root, file));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await copyFile(path.join(root, '.env.example'), path.join(root, file));
    await chmod(path.join(root, file), 0o600);
  }
  if (process.argv.includes('--down')) {
    compose('down');
  } else {
    compose(
      '--profile',
      'setup',
      'up',
      '-d',
      '--wait',
      'culture-chain',
      'culture-ipfs'
    );
    compose('--profile', 'setup', 'run', '--rm', 'culture-contracts');
    compose(
      'up',
      '--build',
      '-d',
      '--wait',
      '--wait-timeout',
      '180',
      'culture-orchestrator',
      'culture-indexer',
      'culture-studio'
    );
    console.log(
      'Local fixture stack ready at http://localhost:4173. Test doubles do not prove mainnet settlement.'
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
