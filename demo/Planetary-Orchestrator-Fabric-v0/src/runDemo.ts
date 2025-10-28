#!/usr/bin/env node
import { join } from 'node:path';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { executeFabricRun } from './fabricRunner';
import type { FabricRunOptions } from './fabricRunner';

function buildOwnerSchedule() {
  const executed = new Set<string>();
  return ({
    tick,
    orchestrator,
  }: Parameters<NonNullable<FabricRunOptions['scheduleOwnerCommands']>>[0]) => {
    const { execute } = orchestrator.ownerCommands();
    if (tick === 8 && !executed.has('pause')) {
      execute('pauseFabric', { reason: 'Owner audit sampling' });
      executed.add('pause');
    }
    if (tick === 12 && !executed.has('resume')) {
      execute('resumeFabric');
      executed.add('resume');
    }
    if (tick === 48 && !executed.has('boost')) {
      execute('boostNodeCapacity', {
        nodeId: 'helios.gpu-array',
        multiplier: 1.5,
        duration: 50,
      });
      executed.add('boost');
    }
    if (tick === 72 && !executed.has('reroute')) {
      execute('rerouteShardTo', {
        origin: 'mars',
        destination: 'helios',
        percentage: 0.35,
      });
      executed.add('reroute');
    }
    if (tick === 96 && !executed.has('update-budget')) {
      execute('updateShardBudget', { shard: 'earth', budget: 0.35 });
      executed.add('update-budget');
    }
  };
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .scriptName('planetary-fabric')
    .option('label', {
      type: 'string',
      default: 'ci-latest',
      describe: 'Report label folder',
    })
    .option('jobs-high-load', {
      type: 'number',
      default: 2400,
      describe: 'Number of jobs to seed across shards',
    })
    .option('outage-node', {
      type: 'string',
      describe: 'Node to simulate outage for',
    })
    .option('restart-stop-after', {
      type: 'number',
      describe:
        'Ticks before simulating orchestrator crash to test checkpoint recovery',
    })
    .option('ci-mode', {
      type: 'boolean',
      default: false,
    })
    .option('allow-spillover', {
      type: 'boolean',
      default: true,
    })
    .strict()
    .help()
    .parseAsync();

  const baseOptions: FabricRunOptions = {
    label: argv.label,
    jobsHighLoad: argv['jobs-high-load'],
    outageNodeId: argv['outage-node'],
    restartStopAfter: argv['restart-stop-after'],
    ciMode: argv['ci-mode'],
    allowSpillover: argv['allow-spillover'],
    eventsPath: join(
      'demo',
      'Planetary-Orchestrator-Fabric-v0',
      'reports',
      argv.label,
      'events.ndjson'
    ),
    checkpointPath: join(
      'demo',
      'Planetary-Orchestrator-Fabric-v0',
      'storage',
      `${argv.label}.checkpoint.json`
    ),
    scheduleOwnerCommands: buildOwnerSchedule(),
  };

  if (
    typeof baseOptions.restartStopAfter === 'number' &&
    baseOptions.restartStopAfter > 0
  ) {
    await executeFabricRun({
      ...baseOptions,
      stopAfterTicks: baseOptions.restartStopAfter,
    });
    await executeFabricRun({
      ...baseOptions,
      resumeFromCheckpoint: true,
      stopAfterTicks: undefined,
    });
    return;
  }

  await executeFabricRun(baseOptions);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
