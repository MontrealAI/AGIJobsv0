import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { executeFabricRun } from '../src/fabricRunner';
import type { ReportSummary } from '../src/types';

test('planetary orchestrator fabric completes mission workloads', async () => {
  const label = 'unit-ci';
  const reportDir = join(
    'demo',
    'Planetary-Orchestrator-Fabric-v0',
    'reports',
    label
  );
  rmSync(reportDir, { force: true, recursive: true });
  const checkpointPath = join(
    'demo',
    'Planetary-Orchestrator-Fabric-v0',
    'storage',
    `${label}.checkpoint.json`
  );
  rmSync(checkpointPath, { force: true });

  const result = await executeFabricRun({
    label,
    jobsHighLoad: 320,
    allowSpillover: true,
    ciMode: true,
    eventsPath: join(reportDir, 'events.ndjson'),
    checkpointPath,
    scheduleOwnerCommands: ({ tick, orchestrator }) => {
      if (tick === 0) {
        orchestrator.ownerCommands().execute('pauseFabric', {
          reason: 'unit-test-audit',
        });
      }
      if (tick === 1) {
        orchestrator.ownerCommands().execute('resumeFabric');
      }
    },
  });

  const summary = JSON.parse(
    readFileSync(result.summaryPath, 'utf8')
  ) as ReportSummary;
  assert.equal(summary.checkpoint.jobsSeedCount, 320);
  assert.ok(
    summary.metrics.jobsCompleted >= 300,
    'expected high completion count'
  );
  assert.ok(summary.metrics.dropRate < 0.02, 'drop rate should be under 2%');
  assert.ok(
    summary.ownerCommands.executed.length >= 3,
    'owner commands should be recorded'
  );
});

test('checkpoint resume restores shard state and completes run', async () => {
  const label = 'unit-restart';
  const reportDir = join(
    'demo',
    'Planetary-Orchestrator-Fabric-v0',
    'reports',
    label
  );
  rmSync(reportDir, { force: true, recursive: true });
  const checkpointPath = join(
    'demo',
    'Planetary-Orchestrator-Fabric-v0',
    'storage',
    `${label}.checkpoint.json`
  );
  rmSync(checkpointPath, { force: true });

  await executeFabricRun({
    label,
    jobsHighLoad: 420,
    stopAfterTicks: 90,
    restartStopAfter: 90,
    allowSpillover: true,
    ciMode: true,
    eventsPath: join(reportDir, 'events.ndjson'),
    checkpointPath,
    scheduleOwnerCommands: ({ tick, orchestrator }) => {
      if (tick === 0) {
        orchestrator.ownerCommands().execute('pauseFabric', {
          reason: 'pre-checkpoint',
        });
      }
    },
  });

  assert.ok(existsSync(checkpointPath), 'checkpoint should be persisted');

  const final = await executeFabricRun({
    label,
    jobsHighLoad: 420,
    resumeFromCheckpoint: true,
    allowSpillover: true,
    ciMode: true,
    eventsPath: join(reportDir, 'events.ndjson'),
    checkpointPath,
    scheduleOwnerCommands: ({ tick, orchestrator }) => {
      if (tick === 1) {
        orchestrator.ownerCommands().execute('resumeFabric');
      }
    },
  });

  const summary = JSON.parse(
    readFileSync(final.summaryPath, 'utf8')
  ) as ReportSummary;
  assert.equal(summary.metrics.jobsSubmitted, 420);
  assert.equal(summary.checkpoint.jobsSeedCount, 420);
  assert.ok(
    summary.metrics.jobsCompleted >= 411,
    'resume run should complete majority of jobs'
  );
  assert.ok(
    summary.metrics.dropRate < 0.02,
    'drop rate must remain below threshold'
  );
});
