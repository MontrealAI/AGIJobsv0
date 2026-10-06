import {
  validateScenario,
  amount,
  decimal,
  boundary,
  stages,
  canonical,
  sha256,
  json,
  makeTask,
  taskDigest,
} from './model.mjs';

export function evaluate(source) {
  validateScenario(source);
  const workers = source.workers.map((w) => ({
    ...w,
    qualified:
      w.reviewed >= source.minimumReviewed &&
      w.useful * 10000 >= w.reviewed * source.minimumUsefulBps,
  }));
  const routes = source.work.map((w) => ({
    workId: w.id,
    workerId:
      workers
        .filter((x) => x.skill === w.skill && x.qualified)
        .sort((a, b) => b.useful * a.reviewed - a.useful * b.reviewed)[0]?.id ??
      null,
    reviewPool: w.skill,
  }));
  const contracts = source.work.map((w, i) => ({
    workId: w.id,
    workerId: routes[i].workerId,
    deliverable: w.deliverable,
    acceptanceCriteria: w.acceptanceCriteria,
    rewardUsdc: decimal(amount(w.rewardUsdc)),
    reviewPool: w.skill,
    reviewMinutes: w.reviewMinutes,
  }));
  let remaining = amount(source.budgetUsdc) - amount(source.reserveUsdc),
    committed = 0n;
  const pools = source.reviewPools.map((p) => ({
    id: p.id,
    availableMinutes: p.minutes,
    usedMinutes: 0,
  }));
  const decisions = contracts.map((c) => {
    const pool = pools.find((p) => p.id === c.reviewPool),
      cost = amount(c.rewardUsdc);
    const reason = !c.workerId
      ? 'no-qualified-worker'
      : cost > remaining
      ? 'budget'
      : pool.availableMinutes - pool.usedMinutes < c.reviewMinutes
      ? 'review-capacity'
      : 'reserved';
    if (reason === 'reserved') {
      remaining -= cost;
      committed += cost;
      pool.usedMinutes += c.reviewMinutes;
    }
    return {
      workId: c.workId,
      status: reason === 'reserved' ? 'admitted' : 'deferred',
      reason,
    };
  });
  return {
    identify: {
      workIds: source.work.map((w) => w.id),
      count: source.work.length,
      plannedRewardsUsdc: decimal(
        source.work.reduce((n, w) => n + amount(w.rewardUsdc), 0n)
      ),
      reviewMinutes: source.work.reduce((n, w) => n + w.reviewMinutes, 0),
      ...boundary,
    },
    learn: {
      workers: workers.map((w) => ({
        id: w.id,
        reviewed: w.reviewed,
        useful: w.useful,
        usefulBps: w.reviewed ? Math.floor((w.useful * 10000) / w.reviewed) : 0,
        qualified: w.qualified,
      })),
      ...boundary,
    },
    think: { routes, ...boundary },
    design: { contracts, ...boundary },
    strategise: {
      decisions,
      committedUsdc: decimal(committed),
      unallocatedUsdc: decimal(amount(source.budgetUsdc) - committed),
      reviewPools: pools,
      ...boundary,
    },
    execute: {
      readyWorkIds: decisions
        .filter((x) => x.status === 'admitted')
        .map((x) => x.workId),
      deferredWorkIds: decisions
        .filter((x) => x.status === 'deferred')
        .map((x) => x.workId),
      committedUsdc: decimal(committed),
      unallocatedUsdc: decimal(amount(source.budgetUsdc) - committed),
      customerJobsCompleted: 0,
      actualPaidUsdc: '0.000000',
      evidenceClass: 'deterministic-simulation',
      ...boundary,
    },
  };
}
export async function execute(source) {
  const outputs = evaluate(source),
    results = [];
  for (const stage of stages) {
    for (const dep of stage.dependencies)
      if (!results.some((x) => x.stageId === dep))
        throw new Error('Missing phase dependency.');
    const content = json(outputs[stage.id]);
    results.push({
      stageId: stage.id,
      dependencies: stage.dependencies,
      taskSha256: await taskDigest(await makeTask(source, stage.id)),
      artifact: {
        name: stage.file,
        mediaType: 'application/json',
        content,
        bytes: new TextEncoder().encode(content).length,
        sha256: await sha256(content),
      },
    });
  }
  return {
    schemaVersion: 1,
    scenarioId: source.id,
    sourceSha256: await sha256(canonical(source)),
    evidenceClass: 'deterministic-simulation',
    providerCalls: 0,
    chainTransactions: 0,
    ...boundary,
    results,
  };
}
export function renderReport(bundle) {
  const d = JSON.parse(bundle.results.at(-1).artifact.content);
  return `# Meta-Agentic ALPHA — delivery evaluation\n\nSource SHA-256: ${
    bundle.sourceSha256
  }\n\n${d.readyWorkIds.length} review-ready work orders; ${
    d.deferredWorkIds.length
  } deferred. Planned commitment: ${
    d.committedUsdc
  } USDC. Unallocated (including reserve): ${
    d.unallocatedUsdc
  } USDC.\n\nReady: ${
    d.readyWorkIds.join(', ') || 'none'
  }.\n\nSix local evaluation phases completed. Proposed customer jobs completed: 0. Provider calls: 0. Transactions: 0. No production or settlement approval.\n\n${bundle.results
    .map(
      (r) => `- ${r.stageId}: ${r.artifact.name} — SHA-256 ${r.artifact.sha256}`
    )
    .join(
      '\n'
    )}\n\nA passing content check does not establish provider provenance, independent human acceptance, job fulfillment or payment authority.\n`;
}
