#!/usr/bin/env ts-node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

type RunScriptOptions = {
  script: string;
  label: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  dryRun?: boolean;
};

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runScript({ script, label, args = [], env, dryRun }: RunScriptOptions) {
  const command = [npmCommand, 'run', script, ...args];
  if (dryRun) {
    console.log(`• [dry-run] ${label}: ${command.join(' ')}`);
    return;
  }

  console.log(`• ${label}`);
  const result = spawnSync(npmCommand, ['run', script, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: npm run ${script}`);
  }
}

yargs(hideBin(process.argv))
  .scriptName('mission-control:ops')
  .usage('$0 <command> [options]')
  .command(
    'deploy',
    'Deploy or refresh orchestrator infrastructure.',
    (cmd) =>
      cmd
        .option('network', {
          alias: 'n',
          type: 'string',
          description: 'Target network or environment.',
          choices: ['sepolia', 'mainnet', 'wizard'] as const,
          default: 'sepolia'
        })
        .option('dry-run', {
          type: 'boolean',
          default: false,
          description: 'Print the commands without executing.'
        })
        .option('with-telemetry', {
          type: 'boolean',
          default: true,
          description: 'Seed observability wiring after deployment.'
        }),
    (argv) => {
      const dryRun = argv['dry-run'] ?? false;
      const network = argv.network as 'sepolia' | 'mainnet' | 'wizard';
      const compileScript = `compile:${network}`;
      const migrateScript = `migrate:${network}`;

      runScript({ script: compileScript, label: 'Compile artifacts', dryRun });
      runScript({ script: migrateScript, label: `Migrate contracts (${network})`, dryRun });

      if (argv['with-telemetry']) {
        runScript({ script: 'monitoring:sentinels', label: 'Render sentinel dashboards', dryRun });
        runScript({ script: 'monitoring:validate', label: 'Validate sentinel configuration', dryRun });
      }

      console.log('✅ Deployment pipeline completed.');
    }
  )
  .command(
    'upgrade',
    'Queue, execute, or review upgrade waves.',
    (cmd) =>
      cmd
        .option('mode', {
          alias: 'm',
          type: 'string',
          description: 'Upgrade operation to run.',
          choices: ['queue', 'status', 'apply'] as const,
          default: 'queue'
        })
        .option('proposal', {
          type: 'string',
          description: 'Optional path to upgrade manifest JSON.'
        })
        .option('dry-run', {
          type: 'boolean',
          default: false,
          description: 'Preview commands without executing.'
        }),
    (argv) => {
      const dryRun = argv['dry-run'] ?? false;
      const mode = argv.mode as 'queue' | 'status' | 'apply';
      const manifest = argv.proposal ? path.resolve(process.cwd(), argv.proposal) : undefined;

      if (manifest && !existsSync(manifest)) {
        throw new Error(`Manifest not found at ${manifest}`);
      }

      const scriptMap: Record<typeof mode, { script: string; label: string; extraArgs?: string[] }> = {
        queue: {
          script: 'owner:upgrade',
          label: 'Queue upgrade bundle',
          extraArgs: manifest ? ['--', `--proposal=${manifest}`] : []
        },
        status: {
          script: 'owner:upgrade-status',
          label: 'Review queued upgrades'
        },
        apply: {
          script: 'owner:update-all',
          label: 'Execute and broadcast upgrade wave'
        }
      };

      const { script, label, extraArgs = [] } = scriptMap[mode];
      runScript({ script, label, args: extraArgs, dryRun });
      console.log('✅ Upgrade operation completed.');
    }
  )
  .command(
    'policy <action>',
    'Render or apply policy updates with guardrails.',
    (cmd) =>
      cmd
        .positional('action', {
          type: 'string',
          choices: ['render', 'apply', 'audit'] as const,
          describe: 'Policy workflow to run.'
        })
        .option('file', {
          alias: 'f',
          type: 'string',
          describe: 'Path to the policy definition file.'
        })
        .option('dry-run', {
          type: 'boolean',
          default: false,
          describe: 'Preview commands only.'
        }),
    (argv) => {
      const action = argv.action as 'render' | 'apply' | 'audit';
      const dryRun = argv['dry-run'] ?? false;
      const fileArg = argv.file ? path.resolve(process.cwd(), argv.file as string) : undefined;

      if (fileArg && !existsSync(fileArg)) {
        throw new Error(`Policy file not found at ${fileArg}`);
      }

      if (action === 'render') {
        runScript({ script: 'owner:parameters', label: 'Render parameter blueprint', dryRun });
        runScript({ script: 'owner:dashboard', label: 'Open governance dashboard snapshot', dryRun });
      }

      if (action === 'apply') {
        const args = fileArg ? ['--', `--policy=${fileArg}`] : [];
        runScript({ script: 'owner:command-center', label: 'Apply policy set', args, dryRun });
      }

      if (action === 'audit') {
        runScript({ script: 'owner:audit', label: 'Policy audit trail', dryRun });
      }

      console.log('✅ Policy workflow completed.');
    }
  )
  .demandCommand(1)
  .strict()
  .help()
  .wrap(Math.min(120, yargs.terminalWidth()))
  .parse();
