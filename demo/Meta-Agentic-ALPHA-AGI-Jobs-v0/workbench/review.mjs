import {
  canonical,
  sha256,
  stages,
  stageById,
  makeTask,
  taskDigest,
  validateScenario,
} from './model.mjs';

// The checker intentionally uses its own loops and money conversion, not execute.mjs.
export function expectedArtifact(source, id) {
  validateScenario(source);
  stageById(id);
  const units = (value) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  };
  const display = (value) =>
    `${value / 1000000n}.${String(value % 1000000n).padStart(6, '0')}`;
  const workers = [],
    routes = [],
    contracts = [],
    decisions = [],
    ready = [],
    deferred = [];
  const pools = source.reviewPools.map((p) => ({
    id: p.id,
    availableMinutes: p.minutes,
    usedMinutes: 0,
  }));
  let total = 0n,
    requestedMinutes = 0,
    committed = 0n;
  for (const w of source.workers)
    workers.push({
      id: w.id,
      reviewed: w.reviewed,
      useful: w.useful,
      usefulBps: w.reviewed ? Math.floor((10000 * w.useful) / w.reviewed) : 0,
      qualified:
        w.reviewed >= source.minimumReviewed &&
        10000 * w.useful >= source.minimumUsefulBps * w.reviewed,
    });
  for (const job of source.work) {
    total += units(job.rewardUsdc);
    requestedMinutes += job.reviewMinutes;
    let best = null;
    for (let i = 0; i < source.workers.length; i++) {
      const w = source.workers[i];
      if (w.skill !== job.skill || !workers[i].qualified) continue;
      if (!best || w.useful * best.reviewed > best.useful * w.reviewed)
        best = w;
    }
    const workerId = best?.id ?? null;
    routes.push({ workId: job.id, workerId, reviewPool: job.skill });
    contracts.push({
      workId: job.id,
      workerId,
      deliverable: job.deliverable,
      acceptanceCriteria: job.acceptanceCriteria,
      rewardUsdc: display(units(job.rewardUsdc)),
      reviewPool: job.skill,
      reviewMinutes: job.reviewMinutes,
    });
    const pool = pools.find((p) => p.id === job.skill);
    let reason = 'reserved';
    if (!workerId) reason = 'no-qualified-worker';
    else if (
      committed + units(job.rewardUsdc) >
      units(source.budgetUsdc) - units(source.reserveUsdc)
    )
      reason = 'budget';
    else if (pool.usedMinutes + job.reviewMinutes > pool.availableMinutes)
      reason = 'review-capacity';
    const admitted = reason === 'reserved';
    if (admitted) {
      committed += units(job.rewardUsdc);
      pool.usedMinutes += job.reviewMinutes;
      ready.push(job.id);
    } else deferred.push(job.id);
    decisions.push({
      workId: job.id,
      status: admitted ? 'admitted' : 'deferred',
      reason,
    });
  }
  const outputs = {
    identify: {
      workIds: source.work.map((w) => w.id),
      count: source.work.length,
      plannedRewardsUsdc: display(total),
      reviewMinutes: requestedMinutes,
    },
    learn: { workers },
    think: { routes },
    design: { contracts },
    strategise: {
      decisions,
      committedUsdc: display(committed),
      unallocatedUsdc: display(units(source.budgetUsdc) - committed),
      reviewPools: pools,
    },
    execute: {
      readyWorkIds: ready,
      deferredWorkIds: deferred,
      committedUsdc: display(committed),
      unallocatedUsdc: display(units(source.budgetUsdc) - committed),
      customerJobsCompleted: 0,
      actualPaidUsdc: '0.000000',
      evidenceClass: 'deterministic-simulation',
    },
  };
  return {
    ...outputs[id],
    productionApproved: false,
    settlementApproved: false,
  };
}

function reviewer() {
  const checks = [];
  return {
    checks,
    check(label, passed) {
      checks.push({ label, passed: Boolean(passed) });
      if (!passed) throw new Error(label);
    },
    result(error, count = 0) {
      return {
        accepted: !error,
        checks,
        error: error?.message ?? null,
        verifiedArtifacts: count,
        providerExecution: 'not assessed',
        productionApproved: false,
        settlementApproved: false,
      };
    },
  };
}
async function verifyArtifact(r, artifact, source, stage) {
  r.check(
    `${stage.short}: exact artifact contract`,
    artifact &&
      canonical(Object.keys(artifact).sort()) ===
        canonical(['bytes', 'content', 'mediaType', 'name', 'sha256']) &&
      artifact.name === stage.file &&
      artifact.mediaType === 'application/json'
  );
  r.check(
    `${stage.short}: bounded UTF-8 content`,
    typeof artifact.content === 'string' &&
      new TextEncoder().encode(artifact.content).length <= 128000
  );
  r.check(
    `${stage.short}: byte count and SHA-256`,
    artifact.bytes === new TextEncoder().encode(artifact.content).length &&
      artifact.sha256 === (await sha256(artifact.content))
  );
  r.check(
    `${stage.short}: independent arithmetic and complete output`,
    canonical(JSON.parse(artifact.content)) ===
      canonical(expectedArtifact(source, stage.id))
  );
}
export async function reviewBundle(bundle, source) {
  const r = reviewer();
  let count = 0;
  try {
    validateScenario(source);
    r.check(
      'Bounded evidence bundle',
      bundle &&
        typeof bundle === 'object' &&
        new TextEncoder().encode(JSON.stringify(bundle)).length <= 1048576
    );
    r.check(
      'Exact bundle schema',
      canonical(Object.keys(bundle).sort()) ===
        canonical([
          'chainTransactions',
          'evidenceClass',
          'productionApproved',
          'providerCalls',
          'results',
          'scenarioId',
          'schemaVersion',
          'settlementApproved',
          'sourceSha256',
        ])
    );
    r.check(
      'Source identity and hash',
      bundle.schemaVersion === 1 &&
        bundle.scenarioId === source.id &&
        bundle.sourceSha256 === (await sha256(canonical(source)))
    );
    r.check(
      'Honest execution and approval boundary',
      bundle.evidenceClass === 'deterministic-simulation' &&
        bundle.providerCalls === 0 &&
        bundle.chainTransactions === 0 &&
        bundle.productionApproved === false &&
        bundle.settlementApproved === false
    );
    r.check(
      'Exactly six ordered stages',
      Array.isArray(bundle.results) && bundle.results.length === stages.length
    );
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i],
        row = bundle.results[i];
      r.check(
        `${stage.short}: dependency and task binding`,
        row &&
          canonical(Object.keys(row).sort()) ===
            canonical(['artifact', 'dependencies', 'stageId', 'taskSha256']) &&
          row.stageId === stage.id &&
          canonical(row.dependencies) === canonical(stage.dependencies) &&
          row.taskSha256 ===
            (await taskDigest(await makeTask(source, stage.id)))
      );
      await verifyArtifact(r, row.artifact, source, stage);
      count++;
    }
    return r.result(null, count);
  } catch (error) {
    return r.result(error, count);
  }
}

export async function reviewReceipt(
  receipt,
  source,
  stageId,
  expectedJobId,
  expectedDeploymentId
) {
  const r = reviewer();
  try {
    const stage = stageById(stageId),
      task = await makeTask(source, stageId);
    r.check(
      'Expected binding supplied independently',
      typeof expectedJobId === 'string' &&
        /^[1-9][0-9]{0,79}$/.test(expectedJobId) &&
        typeof expectedDeploymentId === 'string' &&
        expectedDeploymentId.trim().length > 0 &&
        expectedDeploymentId.length <= 200
    );
    r.check(
      'Bounded adapter receipt',
      receipt &&
        typeof receipt === 'object' &&
        new TextEncoder().encode(JSON.stringify(receipt)).length <= 1048576
    );
    r.check(
      'Exact task and admitted job/deployment',
      receipt.jobId === expectedJobId &&
        receipt.deploymentId === expectedDeploymentId &&
        receipt.workerProfile === 'meta-agentic-alpha' &&
        receipt.taskSha256 === (await taskDigest(task)) &&
        canonical(receipt.task) === canonical(task)
    );
    r.check(
      'Completed evidence without approval claims',
      receipt.schemaVersion === 1 &&
        receipt.provider === 'openclaw-responses' &&
        receipt.status === 'evidence-ready' &&
        typeof receipt.simulated === 'boolean' &&
        receipt.productionApproved === false &&
        receipt.settlementApproved === false
    );
    r.check(
      'Exactly one candidate artifact',
      Array.isArray(receipt.artifacts) && receipt.artifacts.length === 1
    );
    await verifyArtifact(r, receipt.artifacts[0], source, stage);
    return {
      ...r.result(null, 1),
      declaredWorkerMode: receipt.simulated ? 'fixture' : 'live',
    };
  } catch (error) {
    return r.result(error);
  }
}

export async function reviewCandidate(content, source, stageId) {
  const r = reviewer();
  try {
    const stage = stageById(stageId);
    r.check(
      'Bounded UTF-8 candidate',
      typeof content === 'string' &&
        new TextEncoder().encode(content).length <= 128000
    );
    r.check(
      `${stage.short}: independent arithmetic and complete output`,
      canonical(JSON.parse(content)) ===
        canonical(expectedArtifact(source, stageId))
    );
    return {
      ...r.result(null, 1),
      artifact: {
        name: stage.file,
        bytes: new TextEncoder().encode(content).length,
        sha256: await sha256(content),
      },
      sourceSha256: await sha256(canonical(source)),
      provenance:
        'Candidate bytes supplied by operator; no adapter binding assessed',
    };
  } catch (error) {
    return r.result(error);
  }
}
