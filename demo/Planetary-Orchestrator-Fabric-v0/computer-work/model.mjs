export function units(value) {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]{0,12})\.[0-9]{6}$/.test(value)
  )
    throw new Error('Use nonnegative USDC with exactly six decimal places');
  return BigInt(value.replace('.', ''));
}
export const money = (value) =>
  `${value / 1000000n}.${String(value % 1000000n).padStart(6, '0')}`;
const integer = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000000)
    throw new Error(`Invalid ${name}`);
};
export function validate(board) {
  if (board?.schemaVersion !== 1 || board.dataClass !== 'synthetic')
    throw new Error('Expected the synthetic board version 1');
  units(board.budgetUsdc);
  integer(board.reviewMinutes, 'review capacity');
  for (const key of ['workers', 'reviewers', 'jobs']) {
    if (
      !Array.isArray(board[key]) ||
      board[key].length > 1000 ||
      new Set(board[key].map((x) => x.id)).size !== board[key].length
    )
      throw new Error(`Invalid or duplicate ${key}`);
    for (const row of board[key])
      if (typeof row.id !== 'string' || !/^[a-z0-9-]+$/.test(row.id))
        throw new Error('Invalid row ID');
  }
  for (const person of [...board.workers, ...board.reviewers])
    if (
      !Array.isArray(person.skills) ||
      !person.skills.every((x) => typeof x === 'string') ||
      typeof person.operator !== 'string' ||
      !person.operator
    )
      throw new Error('Invalid skills/operator');
  for (const worker of board.workers) {
    integer(worker.maxJobs, 'worker slots');
    if (typeof worker.online !== 'boolean')
      throw new Error('Invalid worker availability');
  }
  for (const reviewer of board.reviewers)
    integer(reviewer.minutes, 'reviewer minutes');
  for (const job of board.jobs) {
    units(job.rewardUsdc);
    units(job.providerCostUsdc);
    units(job.reviewCostUsdc);
    integer(job.reviewMinutes, 'job review minutes');
    if (typeof job.category !== 'string' || !job.category || !job.reviewMinutes)
      throw new Error('Invalid job');
  }
}
export function plan(
  board,
  sourceSha256,
  {
    budgetUsdc = board.budgetUsdc,
    reviewMinutes = board.reviewMinutes,
    offline = [],
  } = {}
) {
  validate(board);
  integer(reviewMinutes, 'review capacity');
  if (!/^[a-f0-9]{64}$/.test(sourceSha256))
    throw new Error('Invalid source digest');
  if (
    !Array.isArray(offline) ||
    offline.some((id) => !board.workers.some((w) => w.id === id))
  )
    throw new Error('Unknown offline worker');
  let budget = units(budgetUsdc),
    used = 0n,
    cost = 0n,
    minutes = 0;
  const loads = new Map(),
    reviews = new Map();
  const jobs = board.jobs.map((job) => {
    const row = {
      jobId: job.id,
      status: 'held',
      reason: '',
      worker: null,
      reviewer: null,
      rewardUsdc: job.rewardUsdc,
    };
    if (
      !['public', 'licensed', 'synthetic'].includes(job.dataClass) ||
      job.rightsConfirmed !== true
    ) {
      row.reason = 'data-rights';
      return row;
    }
    const reward = units(job.rewardUsdc),
      expenses = units(job.providerCostUsdc) + units(job.reviewCostUsdc);
    if (reward <= expenses) {
      row.reason = 'margin';
      return row;
    }
    const worker = board.workers.find(
      (w) =>
        w.online &&
        !offline.includes(w.id) &&
        w.skills.includes(job.category) &&
        (loads.get(w.id) ?? 0) < w.maxJobs
    );
    if (!worker) {
      row.reason = 'worker-capacity';
      return row;
    }
    const reviewer = board.reviewers.find(
      (r) =>
        r.operator !== worker.operator &&
        r.skills.includes(job.category) &&
        (reviews.get(r.id) ?? 0) + job.reviewMinutes <= r.minutes
    );
    if (!reviewer || minutes + job.reviewMinutes > reviewMinutes) {
      row.reason = 'review-capacity';
      return row;
    }
    if (used + reward > budget) {
      row.reason = 'budget';
      return row;
    }
    loads.set(worker.id, (loads.get(worker.id) ?? 0) + 1);
    reviews.set(
      reviewer.id,
      (reviews.get(reviewer.id) ?? 0) + job.reviewMinutes
    );
    used += reward;
    cost += expenses;
    minutes += job.reviewMinutes;
    return {
      ...row,
      status: 'planned',
      reason: 'eligible',
      worker: worker.id,
      reviewer: reviewer.id,
    };
  });
  return {
    schemaVersion: 1,
    sourceSha256,
    evidenceMode: 'planning-only',
    policy: 'source-order-first-fit-v1',
    inputs: { budgetUsdc, reviewMinutes, offline: [...offline] },
    jobs,
    totals: {
      planned: jobs.filter((j) => j.status === 'planned').length,
      held: jobs.filter((j) => j.status === 'held').length,
      reservedUsdc: money(used),
      remainingUsdc: money(budget - used),
      estimatedCostUsdc: money(cost),
      estimatedMarginUsdc: money(used - cost),
      reviewMinutes: minutes,
    },
    dispatched: false,
    settlementApproved: false,
    productionApproved: false,
  };
}
export function brief(allocation) {
  return (
    `# Planetary work allocation\n\nSource SHA-256: ${allocation.sourceSha256}\n\n${allocation.totals.planned} planned; ${allocation.totals.held} held.\nReserved: ${allocation.totals.reservedUsdc} USDC.\nEstimated cost: ${allocation.totals.estimatedCostUsdc} USDC.\nReview: ${allocation.totals.reviewMinutes} minutes.\n\nPlanning only. No dispatch. No settlement. No production approval.\n\n` +
    allocation.jobs
      .map(
        (j) =>
          `- ${j.jobId}: ${j.status} (${j.reason}); worker ${
            j.worker ?? 'none'
          }; reviewer ${j.reviewer ?? 'none'}.`
      )
      .join('\n') +
    '\n'
  );
}
