import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { renderDashboard } from './dashboard';
import { PlanetaryOrchestrator } from './orchestrator';
import type { OwnerCommandExecution, RunConfiguration } from './types';

export interface FabricRunResult {
  readonly summaryPath: string;
  readonly runLabel: string;
  readonly ownerCommands: ReadonlyArray<OwnerCommandExecution>;
}

export interface FabricRunOptions extends RunConfiguration {
  readonly scheduleOwnerCommands?: (params: {
    readonly tick: number;
    readonly orchestrator: PlanetaryOrchestrator;
  }) => void | Promise<void>;
}

export async function executeFabricRun(
  options: FabricRunOptions
): Promise<FabricRunResult> {
  const orchestrator = new PlanetaryOrchestrator(options);
  if (!options.resumeFromCheckpoint) {
    orchestrator.seedInitialJobs();
  }

  if (options.scheduleOwnerCommands) {
    await options.scheduleOwnerCommands({
      tick: orchestrator.relativeTick(),
      orchestrator,
    });
  }

  await orchestrator.run(
    options.stopAfterTicks,
    async ({ orchestrator: instance }) => {
      const relativeTick = instance.relativeTick();
      if (options.scheduleOwnerCommands) {
        await options.scheduleOwnerCommands({
          tick: relativeTick,
          orchestrator: instance,
        });
      }
      if (options.outageNodeId && relativeTick === 64) {
        instance.simulateOutage(options.outageNodeId);
      }
    }
  );

  const reportDir = join(
    'demo',
    'Planetary-Orchestrator-Fabric-v0',
    'reports',
    options.label
  );
  mkdirSync(reportDir, { recursive: true });
  const summary = orchestrator.generateSummary(reportDir);
  renderDashboard(reportDir, summary);
  return {
    summaryPath: join(reportDir, 'summary.json'),
    runLabel: options.label,
    ownerCommands: summary.ownerCommands.executed,
  };
}
