import { Script } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CheckpointManager } from '../src/checkpoint';
import { PlanetaryOrchestrator } from '../src/orchestrator';
import { runSimulation } from '../src/simulation';
import { expandJobBlueprint } from '../src/job-blueprint';
import { loadMissionPlan } from '../src/config-loader';
import type { FabricConfig } from '../src/types';
const demo = resolve(__dirname, '..');
async function setup(t: any) {
  const dir = await mkdtemp(join(tmpdir(), 'planetary-guard-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config: FabricConfig = {
    owner: {
      name: 'Owner',
      address: 'simulation',
      multisig: 'simulation',
      pauseRole: 'simulation',
      commandDeck: [],
    },
    shards: [
      {
        id: 'earth',
        displayName: 'Earth',
        latencyBudgetMs: 100,
        spilloverTargets: [],
        maxQueue: 100,
      },
    ],
    nodes: [
      {
        id: 'earth.worker',
        region: 'earth',
        capacity: 1,
        maxConcurrency: 1,
        specialties: ['code'],
        heartbeatIntervalSec: 10,
      },
    ],
    checkpoint: { path: join(dir, 'checkpoint.json'), intervalTicks: 2 },
    reporting: { directory: join(dir, 'reports'), defaultLabel: 'test' },
  };
  return { dir, config };
}
const job = {
  id: 'one',
  shard: 'earth',
  requiredSkills: ['code'],
  estimatedDurationTicks: 2,
  submissionTick: 0,
  value: 100,
};
test('future jobs cannot execute before their submission tick', async (t) => {
  const { config } = await setup(t);
  const o = new PlanetaryOrchestrator(
    config,
    new CheckpointManager(config.checkpoint.path)
  );
  o.submitJob({ ...job, submissionTick: 5 });
  for (let tick = 1; tick < 5; tick++)
    assert.equal(o.processTick({ tick }).length, 0);
  assert.equal(o.processTick({ tick: 5 }).length, 1);
});
test('unserviceable job with no spillover does not hang', async (t) => {
  const { config } = await setup(t);
  const o = new PlanetaryOrchestrator(
    config,
    new CheckpointManager(config.checkpoint.path)
  );
  o.submitJob({ ...job, requiredSkills: ['gpu'] });
  assert.equal(o.processTick({ tick: 1 }).length, 0);
  assert.equal(o.getShardSnapshots().earth.queueDepth, 1);
});
test('duplicate IDs are rejected including after cancellation and checkpoint restore', async (t) => {
  const { config } = await setup(t);
  const o = new PlanetaryOrchestrator(
    config,
    new CheckpointManager(config.checkpoint.path)
  );
  o.submitJob(job);
  assert.throws(() => o.submitJob(job), /Duplicate/);
  await o.applyOwnerCommand({ type: 'job.cancel', jobId: 'one' });
  assert.throws(() => o.submitJob(job), /Duplicate/);
  await o.saveCheckpoint();
  const restored = new PlanetaryOrchestrator(
    config,
    new CheckpointManager(config.checkpoint.path)
  );
  await restored.restoreFromCheckpoint();
  assert.throws(() => restored.submitJob(job), /Duplicate/);
});
test('checkpoint corruption and legacy unsigned snapshots fail closed', async (t) => {
  const { config } = await setup(t);
  const manager = new CheckpointManager(config.checkpoint.path),
    o = new PlanetaryOrchestrator(config, manager);
  o.submitJob(job);
  await o.saveCheckpoint();
  const data = JSON.parse(await readFile(config.checkpoint.path, 'utf8'));
  assert.equal((await manager.load())?.tick, 0);
  data.tick = 10;
  await writeFile(config.checkpoint.path, JSON.stringify(data));
  await assert.rejects(manager.load(), /integrity/);
  delete data.formatVersion;
  await writeFile(config.checkpoint.path, JSON.stringify(data));
  await assert.rejects(manager.load(), /integrity/);
});
for (const mode of ['spillover', 'cancel'] as const) {
  test(`shard retirement remains restorable with incoming policies and nodes (${mode})`, async (t) => {
    const { config } = await setup(t);
    config.shards[0].spilloverTargets = ['edge'];
    config.shards[0].router = {
      spilloverPolicies: [{ target: 'edge', threshold: 1 }],
    };
    config.shards.push({
      ...config.shards[0],
      id: 'edge',
      displayName: 'Edge',
      spilloverTargets: ['earth'],
      router: undefined,
    });
    config.nodes.push({
      ...config.nodes[0],
      id: 'edge.worker',
      region: 'edge',
    });
    const o = new PlanetaryOrchestrator(
      config,
      new CheckpointManager(config.checkpoint.path)
    );
    o.submitJob({ ...job, shard: 'edge' });
    o.processTick({ tick: 1 });
    await assert.rejects(
      o.applyOwnerCommand({
        type: 'shard.deregister',
        shard: 'edge',
        redistribution: { mode: 'spillover', targetShard: 'missing' },
      }),
      /existing, different/
    );
    assert.equal(o.getShardSnapshots().edge.inFlight, 1);
    await o.applyOwnerCommand({
      type: 'shard.deregister',
      shard: 'edge',
      redistribution:
        mode === 'spillover' ? { mode, targetShard: 'earth' } : { mode },
    });
    await o.saveCheckpoint();
    const checkpoint = await new CheckpointManager(
      config.checkpoint.path
    ).load();
    assert.deepEqual(checkpoint!.shards.earth.config.spilloverTargets, []);
    assert.deepEqual(
      checkpoint!.shards.earth.config.router!.spilloverPolicies,
      []
    );
    assert.equal(checkpoint!.nodes['edge.worker'], undefined);
    const restored = new PlanetaryOrchestrator(
      config,
      new CheckpointManager(config.checkpoint.path)
    );
    assert.equal(await restored.restoreFromCheckpoint(), true);
    assert.equal(restored.getShardSnapshots().edge, undefined);
    assert.throws(() => restored.submitJob(job), /Duplicate/);
    if (mode === 'spillover') {
      for (let tick = 2; tick <= 5; tick++) restored.processTick({ tick });
      assert.equal(restored.fabricMetrics.jobsCompleted, 1);
    } else assert.equal(restored.fabricMetrics.jobsCancelled, 1);
  });
}
test('reject final-shard retirement before changing queued work', async (t) => {
  const { config } = await setup(t);
  const o = new PlanetaryOrchestrator(
    config,
    new CheckpointManager(config.checkpoint.path)
  );
  o.submitJob(job);
  await assert.rejects(
    o.applyOwnerCommand({
      type: 'shard.deregister',
      shard: 'earth',
      redistribution: { mode: 'cancel' },
    }),
    /final shard/
  );
  assert.equal(o.getShardSnapshots().earth.queueDepth, 1);
  await o.saveCheckpoint();
  assert.ok(await new CheckpointManager(config.checkpoint.path).load());
});
test('resume requires an existing checkpoint and leaves reports untouched', async (t) => {
  const { config } = await setup(t);
  await mkdir(join(config.reporting.directory, 'test'), { recursive: true });
  const file = join(config.reporting.directory, 'test', 'summary.json');
  await writeFile(file, 'preserved');
  await assert.rejects(
    runSimulation(config, { jobs: 1, resume: true }),
    /checkpoint is missing/
  );
  assert.equal(await readFile(file, 'utf8'), 'preserved');
});
for (const label of ['..', '../outside', '/tmp/out', 'a/b', 'a\\b', ''])
  test(`report label rejected before writing: ${JSON.stringify(
    label
  )}`, async (t) => {
    const { config } = await setup(t);
    await assert.rejects(
      runSimulation(config, { jobs: 1, outputLabel: label })
    );
  });
for (const count of [NaN, Infinity, 0, -1, 1.2, 1000001])
  test(`invalid job count rejected: ${count}`, async (t) => {
    const { config } = await setup(t);
    await assert.rejects(runSimulation(config, { jobs: count }));
  });
test('invalid inline blueprints, duplicates and unknown regions reject', async (t) => {
  const { config, dir } = await setup(t);
  assert.throws(
    () => expandJobBlueprint({ jobs: [job, job] }, config),
    /Duplicate/
  );
  assert.throws(() =>
    expandJobBlueprint({ jobs: [{ ...job, count: -1 }] }, config)
  );
  const file = join(dir, 'plan.json');
  await writeFile(
    file,
    JSON.stringify({ config, jobBlueprint: { jobs: [{ ...job, count: -1 }] } })
  );
  await assert.rejects(loadMissionPlan(file));
});
test('invalid config and scheduled output traversal reject before report changes', async (t) => {
  const { config } = await setup(t);
  await assert.rejects(
    runSimulation(
      { ...config, checkpoint: { ...config.checkpoint, intervalTicks: 0 } },
      { jobs: 1 }
    )
  );
  await assert.rejects(
    runSimulation(config, {
      jobs: 1,
      ownerCommands: [
        {
          tick: 1,
          command: {
            type: 'reporting.configure',
            update: { defaultLabel: '../outside' },
          },
        },
      ],
    })
  );
});
test('unrelated report files survive reruns; report symlinks reject', async (t) => {
  const { config, dir } = await setup(t);
  const report = join(config.reporting.directory, 'test');
  await mkdir(report, { recursive: true });
  await writeFile(join(report, 'operator-notes.txt'), 'keep');
  await runSimulation(config, { jobs: 1 });
  assert.equal(
    await readFile(join(report, 'operator-notes.txt'), 'utf8'),
    'keep'
  );
  await writeFile(join(dir, 'outside.txt'), 'safe');
  await symlink(join(dir, 'outside.txt'), join(report, 'summary-link'));
  await assert.rejects(runSimulation(config, { jobs: 1 }), /symlink/);
  assert.equal(await readFile(join(dir, 'outside.txt'), 'utf8'), 'safe');
});
test('launcher and restart drill work outside repository and finish plan stop limit', async (t) => {
  const { config, dir } = await setup(t);
  const file = join(dir, 'plan.json');
  await writeFile(
    file,
    JSON.stringify({
      config,
      ownerCommands: [],
      run: { jobs: 20, stopAfterTicks: 1 },
    })
  );
  const args = ['--plan', file, '--outage', ''];
  const run = spawnSync(
    'bash',
    [join(demo, 'bin/run-restart-drill.sh'), ...args],
    { cwd: dir, encoding: 'utf8', timeout: 60000, maxBuffer: 1048576 }
  );
  assert.equal(run.status, 0, run.stderr);
  const summary = JSON.parse(
    await readFile(
      join(config.reporting.directory, 'test', 'summary.json'),
      'utf8'
    )
  );
  assert.equal(summary.metrics.jobsCompleted, 20);
  assert.equal(summary.run.checkpointRestored, true);
  assert.equal(summary.run.stoppedEarly, false);
  assert.equal(summary.evidence.actualProvider, false);
  const launch = spawnSync(
    'bash',
    [join(demo, 'bin/run-demo.sh'), '--plan', file, '--finish'],
    { cwd: dir, encoding: 'utf8', timeout: 30000 }
  );
  assert.equal(launch.status, 0, launch.stderr);
});

test('generated and sample dashboards contain executable JavaScript', async (t) => {
  const { config } = await setup(t);
  const result = await runSimulation(config, { jobs: 1 });
  for (const file of [
    result.artifacts.dashboardPath,
    result.artifacts.missionGraphHtmlPath,
    join(demo, 'ui/dashboard.html'),
  ]) {
    const html = await readFile(file, 'utf8');
    for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))
      new Script(match[1], { filename: file });
  }
});
