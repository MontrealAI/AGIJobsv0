import { copyFile, chmod, access, appendFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args.length === 1 && !['--down', '--logs'].includes(args[0]))
  )
    throw new Error('Usage: node scripts/run-local-stack.mjs [--down|--logs]');
  if (args[0] === '--logs') {
    // Use the same sanitized environment and project as startup. Never create
    // fixture state or a new API token while collecting read-only diagnostics.
    compose('ps', '--all');
    compose('logs', '--no-color');
  } else {
    try {
      await access(path.join(root, file));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await copyFile(path.join(root, '.env.example'), path.join(root, file));
      await chmod(path.join(root, file), 0o600);
    }
    if (
      !/^ORCHESTRATOR_API_TOKEN=.+$/m.test(
        readFileSync(path.join(root, file), 'utf8')
      )
    ) {
      await chmod(path.join(root, file), 0o600);
      await appendFile(
        path.join(root, file),
        `\nORCHESTRATOR_API_TOKEN=${randomBytes(32).toString('hex')}\n`,
        { mode: 0o600 }
      );
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
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
