import {
  canonical,
  sha256,
  stages,
  stageById,
  makeTask,
  taskDigest,
  validateScenario,
} from './model.mjs';

// The reviewer derives expected values from source, never from execute.mjs.
export function expectedArtifact(source, id) {
  validateScenario(source);
  stageById(id);
  const toUnits = (v) => {
    const [a, b = ''] = v.split('.');
    return BigInt(a) * 1000000n + BigInt(b.padEnd(6, '0'));
  };
  const display = (v) => {
    const n = v < 0n ? -v : v;
    return `${v < 0n ? '-' : ''}${n / 1000000n}.${String(n % 1000000n).padStart(
      6,
      '0'
    )}`;
  };
  const all = source.work;
  let rewards = 0n,
    costs = 0n,
    required = 0,
    available = 0,
    used = 0,
    generated = 0,
    demand = 0;
  const admitted = [],
    deferred = [],
    regionValues = [],
    energy = [],
    deficits = [];
  for (const w of all) {
    rewards += toUnits(w.rewardUsdc);
    costs += toUnits(w.estimatedCostUsdc);
    required += w.reviewMinutes;
  }
  for (const r of source.regions) {
    let regionRewards = 0n,
      regionReview = 0,
      remaining = r.reviewMinutes;
    const ids = [];
    available += r.reviewMinutes;
    generated += r.generatedMwh;
    demand += r.demandMwh;
    energy.push({ id: r.id, netMwh: r.generatedMwh - r.demandMwh });
    if (r.demandMwh > r.generatedMwh) deficits.push(r.id);
    for (const w of all) {
      if (w.region !== r.id) continue;
      ids.push(w.id);
      regionRewards += toUnits(w.rewardUsdc);
      regionReview += w.reviewMinutes;
      if (remaining >= w.reviewMinutes) {
        admitted.push(w.id);
        remaining -= w.reviewMinutes;
        used += w.reviewMinutes;
      } else deferred.push(w.id);
    }
    regionValues.push({
      id: r.id,
      workIds: ids,
      plannedRewardsUsdc: display(regionRewards),
      requiredReviewMinutes: regionReview,
      availableReviewMinutes: r.reviewMinutes,
      shortfallMinutes: Math.max(0, regionReview - r.reviewMinutes),
    });
  }
  const reserve = toUnits(source.budgetUsdc) - rewards;
  const outputs = {
    'SOV-INGEST-NATIONAL': {
      workIds: all.map((w) => w.id),
      count: all.length,
      plannedRewardsUsdc: display(rewards),
      estimatedProviderCostUsdc: display(costs),
    },
    'SOV-CASCADE-REGIONAL': { regions: regionValues },
    'SOV-HARMONISE-TREASURY': {
      budgetUsdc: display(toUnits(source.budgetUsdc)),
      committedPlanUsdc: display(rewards),
      unallocatedUsdc: display(reserve),
      minimumReserveUsdc: display(toUnits(source.minimumReserveUsdc)),
      reserveAdequate: reserve >= toUnits(source.minimumReserveUsdc),
      actualPaidUsdc: '0.000000',
    },
    'SOV-THERMO-ALIGN': {
      regions: energy,
      generatedMwh: generated,
      demandMwh: demand,
      netMwh: generated - demand,
      deficitRegions: deficits,
      transfersAssumed: false,
    },
    'SOV-VALIDATOR-FUSION': {
      admittedWorkIds: admitted,
      deferredWorkIds: deferred,
      availableMinutes: available,
      usedMinutes: used,
      requiredMinutes: required,
      unmetMinutes: required - used,
      independentlyReviewed: false,
    },
    'SOV-PUBLIC-DOSSIER': {
      workIds: all.map((w) => w.id),
      stageIds: stages.map((s) => s.id),
      plannedRewardsUsdc: display(rewards),
      reserveUsdc: display(reserve),
      energyNetMwh: generated - demand,
      reviewDeferredCount: deferred.length,
      evidenceClass: 'deterministic-simulation',
      physicalExecution: false,
      chainTransactions: 0,
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
        receipt.workerProfile === 'omnisovereign' &&
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
