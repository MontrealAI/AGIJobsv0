import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';

interface DeployConfig {
  network?: string;
  governance?: string;
  output?: string;
}

type Args = Record<string, string | boolean>;

type RunCommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

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

async function readJson<T>(filePath: string): Promise<T> {
  const absolute = path.resolve(filePath);
  const raw = await fs.readFile(absolute, 'utf8');
  return JSON.parse(raw) as T;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function ensureEnvFile(envPath: string) {
  const resolved = path.resolve(envPath);
  if (await fileExists(resolved)) {
    return;
  }

  const directory = path.dirname(resolved);
  const base = path.basename(resolved);
  const candidates = [
    `${resolved}.example`,
    path.join(directory, `${base}.example`),
    path.join(directory, 'oneclick.env.example'),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (await fileExists(candidate)) {
      await fs.copyFile(candidate, resolved);
      console.log(`📄 Created ${resolved} from ${candidate}`);
      return;
    }
  }

  throw new Error(
    `Environment file ${resolved} is missing and no template was found. Check deployment-config/oneclick.env.example.`,
  );
}

async function confirm(question: string, autoYes: boolean, defaultValue = false): Promise<boolean> {
  if (autoYes) {
    return true;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ' [Y/n] ' : ' [y/N] ';
  const answer: string = await new Promise((resolve) => {
    rl.question(`${question}${suffix}`, resolve);
  });
  rl.close();

  const normalised = answer.trim().toLowerCase();
  if (!normalised) {
    return defaultValue;
  }
  return ['y', 'yes'].includes(normalised);
}

async function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env },
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });

    child.on('error', (error) => reject(error));
  });
}

function resolveBool(arg: string | boolean | undefined): boolean | undefined {
  if (typeof arg === 'boolean') {
    return arg;
  }
  if (typeof arg === 'string') {
    const lowered = arg.toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(lowered)) return true;
    if (['false', 'no', 'n', '0'].includes(lowered)) return false;
  }
  return undefined;
}

async function main() {
  const args = parseArgs();

  const configPath = (args.config as string) ?? path.join('deployment-config', 'deployer.sample.json');
  if (!(await fileExists(configPath))) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const config = await readJson<DeployConfig>(configPath);
  const network = (args.network as string) ?? config.network ?? 'sepolia';
  const envFile = (args.env as string) ?? path.join('deployment-config', 'oneclick.env');
  const composeFile = (args.composeFile as string) ?? 'compose.yaml';
  const deploymentOutput = (args['deployment-output'] as string) ?? config.output ?? path.join('deployment-config', 'latest-deployment.json');

  const autoYes = Boolean(resolveBool(args.yes) ?? resolveBool(args['non-interactive']));
  const forceCompose = Boolean(resolveBool(args.compose));
  const skipCompose = Boolean(resolveBool(args['no-compose']) ?? resolveBool(args['skip-compose']));

  console.log('🔧 One-click deployment wizard');
  console.log(`  • Config file:       ${path.resolve(configPath)}`);
  console.log(`  • Target network:    ${network}`);
  console.log(`  • Env file:          ${path.resolve(envFile)}`);
  console.log(`  • Compose file:      ${path.resolve(composeFile)}`);
  console.log(`  • Address artefacts: ${path.resolve(deploymentOutput)}`);
  if (config.governance) {
    console.log(`  • Governance:        ${config.governance}`);
  }

  await ensureEnvFile(envFile);

  const proceed = await confirm('Deploy contracts with npm run deploy:oneclick?', autoYes);
  if (!proceed) {
    console.log('🚫 Deployment aborted by user');
    return;
  }

  await runCommand('npm', ['run', 'deploy:oneclick', '--', '--config', path.resolve(configPath), '--network', network, '--yes']);

  const envArgs = ['run', 'deploy:env', '--', '--input', path.resolve(deploymentOutput), '--template', path.resolve(envFile), '--output', path.resolve(envFile), '--force'];
  console.log('📝 Updating environment file with deployed addresses');
  await runCommand('npm', envArgs);

  let startCompose = forceCompose;
  if (!forceCompose && !skipCompose) {
    startCompose = await confirm('Launch Docker Compose stack now?', autoYes);
  }

  if (startCompose) {
    const composeArgs = ['compose', '--env-file', path.resolve(envFile), '-f', path.resolve(composeFile), 'up', '--build'];
    const detach = resolveBool(args.detach);
    if (detach !== false) {
      composeArgs.push('--detach');
    }
    try {
      await runCommand('docker', composeArgs);
      console.log('🚀 Docker Compose stack is starting...');
    } catch (error) {
      console.error('⚠️  Failed to launch Docker Compose stack:', error instanceof Error ? error.message : error);
      console.error('You can launch it manually with:');
      console.error(`  docker compose --env-file ${path.resolve(envFile)} -f ${path.resolve(composeFile)} up --build${(resolveBool(args.detach) !== false) ? ' --detach' : ''}`);
    }
  } else {
    console.log('ℹ️  Skipping Docker Compose launch. Start manually when ready.');
  }

  console.log('✅ One-click workflow completed. Review the generated artefacts before unpausing the protocol.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
