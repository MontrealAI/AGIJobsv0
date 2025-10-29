import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadOwnerControls } from './rewardComposer';
import { OwnerControlState, RewardConfig } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CliArgs {
  exploration?: number;
  pause?: boolean;
  successBonus?: number;
  failurePenalty?: number;
  gmvWeight?: number;
  latencyWeight?: number;
  costWeight?: number;
  ratingWeight?: number;
  sustainabilityWeight?: number;
  latencyReferenceHours?: number;
  notes?: string;
  controls: string;
}

function renderDiff(before: OwnerControlState, after: OwnerControlState): string {
  const lines: string[] = [];
  if (before.exploration !== after.exploration) {
    lines.push(`exploration: ${before.exploration} → ${after.exploration}`);
  }
  if (before.paused !== after.paused) {
    lines.push(`paused: ${before.paused} → ${after.paused}`);
  }
  const beforeRewards = before.rewardOverrides ?? {};
  const afterRewards = after.rewardOverrides ?? {};
  const rewardKeys = new Set([...Object.keys(beforeRewards), ...Object.keys(afterRewards)]);
  for (const key of rewardKeys) {
    if (beforeRewards[key as keyof RewardConfig] !== afterRewards[key as keyof RewardConfig]) {
      lines.push(
        `${key}: ${beforeRewards[key as keyof RewardConfig] ?? 'unset'} → ${afterRewards[key as keyof RewardConfig] ?? 'unset'}`,
      );
    }
  }
  if (before.notes !== after.notes) {
    lines.push(`notes updated.`);
  }
  return lines.length > 0 ? lines.join('\n') : 'No changes applied.';
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('controls', {
      type: 'string',
      default: 'config/owner-controls.json',
      describe: 'Path to the owner controls file',
    })
    .option('exploration', {
      type: 'number',
      describe: 'Exploration percentage in decimal form (e.g. 0.1 for 10%)',
    })
    .option('pause', {
      type: 'boolean',
      describe: 'Set to true to pause learning, false to resume',
    })
    .option('successBonus', { type: 'number', describe: 'Override success bonus coefficient' })
    .option('failurePenalty', { type: 'number', describe: 'Override failure penalty coefficient' })
    .option('gmvWeight', { type: 'number', describe: 'Override GMV weight' })
    .option('latencyWeight', { type: 'number', describe: 'Override latency weight' })
    .option('costWeight', { type: 'number', describe: 'Override cost weight' })
    .option('ratingWeight', { type: 'number', describe: 'Override rating weight' })
    .option('sustainabilityWeight', { type: 'number', describe: 'Override sustainability weight' })
    .option('latencyReferenceHours', { type: 'number', describe: 'Override latency reference hours' })
    .option('notes', { type: 'string', describe: 'Update operator notes attached to this configuration' })
    .help()
    .parseAsync();

  const absolute = path.isAbsolute(argv.controls) ? argv.controls : path.join(__dirname, '..', argv.controls);
  const before = await loadOwnerControls(absolute);
  const after: OwnerControlState = {
    ...before,
    exploration: argv.exploration ?? before.exploration,
    paused: typeof argv.pause === 'boolean' ? argv.pause : before.paused,
    rewardOverrides: {
      ...before.rewardOverrides,
    },
  };

  const rewardKeys: Array<keyof RewardConfig> = [
    'successBonus',
    'failurePenalty',
    'gmvWeight',
    'latencyWeight',
    'costWeight',
    'ratingWeight',
    'sustainabilityWeight',
    'latencyReferenceHours',
  ];

  for (const key of rewardKeys) {
    const argKey = key as keyof CliArgs;
    const value = argv[argKey];
    if (typeof value === 'number' && !Number.isNaN(value)) {
      if (!after.rewardOverrides) {
        after.rewardOverrides = {};
      }
      after.rewardOverrides[key] = value;
    }
  }

  if (typeof argv.notes === 'string') {
    after.notes = argv.notes;
  }

  await writeFile(absolute, `${JSON.stringify(after, null, 2)}\n`, 'utf8');
  console.log('Owner controls updated. Diff:\n');
  console.log(renderDiff(before, after));
}

if (import.meta.url === `file://${__filename}`) {
  main().catch((error) => {
    console.error('Failed to update owner controls:', error);
    process.exitCode = 1;
  });
}
