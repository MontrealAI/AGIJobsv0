import {
  digest,
  json,
  MAX_BYTES,
  parseSource,
  reportCsv,
  reportMarkdown,
} from './core.mjs';

// Separate arithmetic and graph implementation: never call analyze() or schedule().
function recompute(plan) {
  let allocated = 0n,
    rewards = 0n;
  for (const value of Object.values(plan.budget.allocations))
    allocated += BigInt(value);
  const sums = new Map(
    plan.regions.map((r) => [r.id, { count: 0, total: 0n }])
  );
  for (const j of plan.jobs) {
    rewards += BigInt(j.reward);
    const sum = sums.get(j.region);
    sum.count++;
    sum.total += BigInt(j.reward);
  }
  const regions = plan.regions.map((r) => ({
    id: r.id,
    name: r.name,
    jobs: sums.get(r.id).count,
    allocation: plan.budget.allocations[r.name],
    rewards: String(sums.get(r.id).total),
    headroom: String(
      BigInt(plan.budget.allocations[r.name]) - sums.get(r.id).total
    ),
  }));
  const finish = new Map();
  // Repeated relaxation is deliberately different from the producer's DAG traversal.
  for (let iteration = 0; iteration < plan.jobs.length; iteration++) {
    for (const job of plan.jobs) {
      const start = job.dependencies.reduce(
        (max, dep) => Math.max(max, finish.get(dep) ?? 0),
        0
      );
      finish.set(job.id, start + job.deadlineDays);
    }
  }
  const timeline = plan.jobs.map((j) => ({
    id: j.id,
    region: j.region,
    startDay: finish.get(j.id) - j.deadlineDays,
    durationDays: j.deadlineDays,
    finishDay: finish.get(j.id),
  }));
  const findings = [];
  if (allocated !== BigInt(plan.budget.total))
    findings.push('ALLOCATION_TOTAL_MISMATCH');
  if (rewards > BigInt(plan.budget.total))
    findings.push('REWARDS_EXCEED_TOTAL');
  for (const r of regions)
    if (BigInt(r.headroom) < 0n) findings.push('REGION_OVER_BUDGET:' + r.id);
  if (plan.timingPolicy !== 'duration-after-dependencies')
    findings.push('TIMING_POLICY_UNSPECIFIED');
  return {
    schema: 'hypernova-analysis/v1',
    mode: 'scenario-analysis',
    currency: plan.budget.currency,
    budget: {
      total: plan.budget.total,
      allocated: String(allocated),
      unallocated: String(BigInt(plan.budget.total) - allocated),
      rewards: String(rewards),
      remainingAfterRewards: String(BigInt(plan.budget.total) - rewards),
    },
    regions,
    timeline,
    criticalPathDays: Math.max(...finish.values()),
    findings,
    readiness: findings.length ? 'needs-correction' : 'scenario-consistent',
    physicalWorkExecuted: false,
    providerCalled: false,
    settlementExecuted: false,
  };
}
export async function reviewEvidence(bundle, sourceText) {
  const checks = [],
    check = (name, passed) => checks.push({ name, passed: Boolean(passed) });
  try {
    if (new TextEncoder().encode(json(bundle)).length > MAX_BYTES)
      throw new Error('Evidence exceeds 1 MiB.');
    const plan = parseSource(sourceText);
    check(
      'Only documented evidence fields',
      bundle &&
        Object.keys(bundle).sort().join(',') ===
          [
            'schema',
            'version',
            'mode',
            'sourceSha256',
            'artifacts',
            'providerCalls',
            'blockchainTransactions',
            'independentReviewerAuthenticated',
            'buyerAccepted',
            'settlementExecuted',
          ]
            .sort()
            .join(',')
    );
    check(
      'Supported local evidence format',
      bundle?.schema === 'hypernova-evidence/v1' &&
        bundle.version === '1.0.0' &&
        bundle.mode === 'local-deterministic-analysis'
    );
    check(
      'Exact approved source bytes',
      bundle?.sourceSha256 === (await digest(sourceText))
    );
    check(
      'Execution and acceptance claims remain unasserted',
      bundle?.providerCalls === 0 &&
        bundle.blockchainTransactions === 0 &&
        bundle.independentReviewerAuthenticated === false &&
        bundle.buyerAccepted === false &&
        bundle.settlementExecuted === false
    );
    const artifacts = bundle?.artifacts;
    check(
      'Exactly three named deliverables',
      Array.isArray(artifacts) &&
        artifacts.length === 3 &&
        artifacts.every(
          (a) => a && Object.keys(a).sort().join(',') === 'content,name,sha256'
        ) &&
        new Set(artifacts.map((a) => a?.name)).size === 3 &&
        ['analysis.json', 'allocations.csv', 'report.md'].every((n) =>
          artifacts.some((a) => a?.name === n)
        )
    );
    if (!checks.at(-1).passed) return { passed: false, checks };
    for (const a of artifacts)
      check(
        `${a.name}: byte integrity`,
        typeof a.content === 'string' && a.sha256 === (await digest(a.content))
      );
    const expected = recompute(plan);
    const get = (name) => artifacts.find((a) => a.name === name).content;
    check(
      'Independent arithmetic and dependency calculations',
      get('analysis.json') === json(expected)
    );
    check(
      'CSV agrees with checked calculations',
      get('allocations.csv') === reportCsv(expected)
    );
    check(
      'Readable report agrees with checked calculations',
      get('report.md') === reportMarkdown(expected)
    );
  } catch (error) {
    check('Valid source and evidence structure: ' + error.message, false);
  }
  return { passed: checks.every((c) => c.passed), checks };
}
