import { spawn } from 'child_process';
import path from 'path';

interface Args {
  [key: string]: string | boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function resolveBoolean(value: string | boolean | undefined): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalised)) return true;
    if (['false', '0', 'no', 'n'].includes(normalised)) return false;
  }
  return undefined;
}

function pushFlag(target: string[], flag: string, value?: string) {
  if (value && value.length > 0) {
    target.push(flag, value);
  }
}

async function main() {
  const args = parseArgs();

  const composePreference = resolveBoolean(args.compose);
  const skipCompose = resolveBoolean(args['no-compose']) ?? resolveBoolean(args['skip-compose']);
  const compose = skipCompose === true ? false : composePreference ?? true;

  const detachPreference = resolveBoolean(args.detach);
  const attachPreference = resolveBoolean(args.attach);
  const detach = attachPreference === true ? false : detachPreference ?? true;

  const wizardArgs = ['run', 'deploy:oneclick:wizard', '--', '--yes'];
  if (compose) {
    wizardArgs.push('--compose');
    if (!detach) {
      wizardArgs.push('--detach=false');
    }
  } else {
    wizardArgs.push('--no-compose');
  }

  const passthroughKeys: Array<[keyof Args, string]> = [
    ['config', '--config'],
    ['network', '--network'],
    ['env', '--env'],
    ['compose-file', '--compose-file'],
    ['deployment-output', '--deployment-output'],
  ];

  for (const [key, flag] of passthroughKeys) {
    const raw = args[key as string];
    if (typeof raw === 'string' && raw.length > 0) {
      const resolved = flag === '--config' || flag === '--env' || flag === '--compose-file' || flag === '--deployment-output'
        ? path.resolve(raw)
        : raw;
      pushFlag(wizardArgs, flag, resolved);
    }
  }

  const child = spawn('npm', wizardArgs, {
    stdio: 'inherit',
    env: process.env,
  });

  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm ${wizardArgs.join(' ')} exited with code ${code}`));
      }
    });
    child.on('error', (error) => reject(error));
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
