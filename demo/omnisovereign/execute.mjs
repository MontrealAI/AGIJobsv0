import {
  amount,
  decimal,
  stages,
  boundary,
  json,
  canonical,
  sha256,
  makeTask,
  taskDigest,
  validateScenario,
} from './model.mjs';

export function produce(source, id, completed) {
  const sum = (rows, key) =>
    decimal(rows.reduce((n, row) => n + amount(row[key]), 0n));
  if (id === stages[0].id)
    return {
      workIds: source.work.map((w) => w.id),
      count: source.work.length,
      plannedRewardsUsdc: sum(source.work, 'rewardUsdc'),
      estimatedProviderCostUsdc: sum(source.work, 'estimatedCostUsdc'),
      ...boundary,
    };
  if (id === stages[1].id)
    return {
      regions: source.regions.map((r) => {
        const work = source.work.filter((w) => w.region === r.id);
        const required = work.reduce((n, w) => n + w.reviewMinutes, 0);
        return {
          id: r.id,
          workIds: work.map((w) => w.id),
          plannedRewardsUsdc: sum(work, 'rewardUsdc'),
          requiredReviewMinutes: required,
          availableReviewMinutes: r.reviewMinutes,
          shortfallMinutes: Math.max(0, required - r.reviewMinutes),
        };
      }),
      ...boundary,
    };
  if (id === stages[2].id) {
    const committed = completed[stages[0].id].plannedRewardsUsdc;
    const reserve = amount(source.budgetUsdc) - amount(committed);
    return {
      budgetUsdc: decimal(amount(source.budgetUsdc)),
      committedPlanUsdc: committed,
      unallocatedUsdc: decimal(reserve),
      minimumReserveUsdc: decimal(amount(source.minimumReserveUsdc)),
      reserveAdequate: reserve >= amount(source.minimumReserveUsdc),
      actualPaidUsdc: '0.000000',
      ...boundary,
    };
  }
  if (id === stages[3].id) {
    const regions = source.regions.map((r) => ({
      id: r.id,
      netMwh: r.generatedMwh - r.demandMwh,
    }));
    const generatedMwh = source.regions.reduce((n, r) => n + r.generatedMwh, 0);
    const demandMwh = source.regions.reduce((n, r) => n + r.demandMwh, 0);
    return {
      regions,
      generatedMwh,
      demandMwh,
      netMwh: generatedMwh - demandMwh,
      deficitRegions: regions.filter((r) => r.netMwh < 0).map((r) => r.id),
      transfersAssumed: false,
      ...boundary,
    };
  }
  if (id === stages[4].id) {
    const admittedWorkIds = [],
      deferredWorkIds = [];
    let usedMinutes = 0;
    for (const r of source.regions) {
      let left = r.reviewMinutes;
      for (const w of source.work.filter((w) => w.region === r.id)) {
        if (w.reviewMinutes <= left) {
          admittedWorkIds.push(w.id);
          left -= w.reviewMinutes;
          usedMinutes += w.reviewMinutes;
        } else deferredWorkIds.push(w.id);
      }
    }
    const requiredMinutes = source.work.reduce(
      (n, w) => n + w.reviewMinutes,
      0
    );
    return {
      admittedWorkIds,
      deferredWorkIds,
      availableMinutes: source.regions.reduce((n, r) => n + r.reviewMinutes, 0),
      usedMinutes,
      requiredMinutes,
      unmetMinutes: requiredMinutes - usedMinutes,
      independentlyReviewed: false,
      ...boundary,
    };
  }
  if (id === stages[5].id)
    return {
      workIds: source.work.map((w) => w.id),
      stageIds: stages.map((s) => s.id),
      plannedRewardsUsdc: completed[stages[0].id].plannedRewardsUsdc,
      reserveUsdc: completed[stages[2].id].unallocatedUsdc,
      energyNetMwh: completed[stages[3].id].netMwh,
      reviewDeferredCount: completed[stages[4].id].deferredWorkIds.length,
      evidenceClass: 'deterministic-simulation',
      physicalExecution: false,
      chainTransactions: 0,
      ...boundary,
    };
  throw new Error('Unknown execution stage.');
}

export async function execute(source, onStage = () => {}) {
  validateScenario(source);
  const completed = {},
    results = [];
  for (const stage of stages) {
    if (stage.dependencies.some((id) => !completed[id]))
      throw new Error('Dependency evidence is missing.');
    const task = await makeTask(source, stage.id);
    const content = json(produce(source, stage.id, completed));
    completed[stage.id] = JSON.parse(content);
    const result = {
      stageId: stage.id,
      dependencies: stage.dependencies,
      taskSha256: await taskDigest(task),
      artifact: {
        name: stage.file,
        mediaType: 'application/json',
        content,
        bytes: new TextEncoder().encode(content).length,
        sha256: await sha256(content),
      },
    };
    results.push(result);
    await onStage(result);
  }
  return {
    schemaVersion: 1,
    scenarioId: source.id,
    sourceSha256: await sha256(canonical(source)),
    evidenceClass: 'deterministic-simulation',
    providerCalls: 0,
    chainTransactions: 0,
    results,
    ...boundary,
  };
}

export function renderReport(bundle) {
  const result = Object.fromEntries(
    bundle.results.map((r) => [r.stageId, JSON.parse(r.artifact.content)])
  );
  const dossier = result['SOV-PUBLIC-DOSSIER'];
  return (
    '# OmniSovereign mission dossier\n\nEvidence: deterministic computation over synthetic inputs. No provider call, payment or infrastructure action occurred.\n\n' +
    `Planned work: ${dossier.plannedRewardsUsdc} USDC. Unallocated reserve: ${dossier.reserveUsdc} USDC. Energy balance: ${dossier.energyNetMwh} MWh. Work briefs deferred by review capacity: ${dossier.reviewDeferredCount}.\n\n` +
    bundle.results
      .map(
        (r) =>
          `- ${r.stageId}: ${r.artifact.name}, SHA-256 ${r.artifact.sha256}`
      )
      .join('\n') +
    '\n\nThese are six coordination analyses. The six underlying work briefs are planned examples, not completed customer jobs. Independent artifact checks do not prove provider provenance, substantive acceptance or settlement.\n'
  );
}
