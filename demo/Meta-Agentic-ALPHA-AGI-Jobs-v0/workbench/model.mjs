export const json = (value) => JSON.stringify(value, null, 2) + '\n';
export const canonical = (value) =>
  Array.isArray(value)
    ? '[' + value.map(canonical).join(',') + ']'
    : value && typeof value === 'object'
    ? '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
        .join(',') +
      '}'
    : JSON.stringify(value);
export async function sha256(value) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    ),
  ]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export function amount(value) {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(value)
  )
    throw new Error(
      'Use a non-negative USDC decimal with at most six fractional places.'
    );
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
export function decimal(value) {
  const n = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${n / 1000000n}.${String(
    n % 1000000n
  ).padStart(6, '0')}`;
}
export const boundary = {
  productionApproved: false,
  settlementApproved: false,
};
export const stages = [
  [
    'identify',
    'Identify',
    'inventory.json',
    'Inventory all twelve substantial work briefs and sum their planned rewards and review demand.',
  ],
  [
    'learn',
    'Out-Learn',
    'qualification.json',
    'Evaluate every worker from the supplied historical observations: reviewed count must meet minimumReviewed, and useful/reviewed must meet minimumUsefulBps/10000. These are synthetic observations, not predictions.',
  ],
  [
    'think',
    'Out-Think',
    'routing.json',
    'For each brief, select a qualified worker of the matching skill with the highest useful/reviewed ratio; break ties by worker source order. Use null if none qualifies.',
  ],
  [
    'design',
    'Out-Design',
    'contracts.json',
    'Create a complete deliverable and acceptance contract for every brief, carrying its chosen worker and review pool. Do not claim the proposed customer deliverable is complete.',
  ],
  [
    'strategise',
    'Out-Strategise',
    'admission.json',
    'Visit briefs in source order. Admit only with a qualified worker, sufficient remaining reward budget after reserve, and enough minutes in the matching review pool. Defer with the first applicable reason in that order.',
  ],
  [
    'execute',
    'Out-Execute',
    'delivery-dossier.json',
    'Assemble the resulting review-ready work orders and exact reconciliation. This executes the portfolio evaluation and prepares work orders; it does not execute the proposed customer jobs or pay anyone.',
  ],
].map(([id, short, file, goal], index, all) => ({
  id,
  short,
  title: short,
  file,
  goal,
  dependencies: index ? [all[index - 1][0]] : [],
}));
export const stageById = (id) => {
  const stage = stages.find((x) => x.id === id);
  if (!stage) throw new Error('Select one of the six known phase IDs.');
  return stage;
};
function keys(value, expected) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    canonical(Object.keys(value).sort()) !== canonical([...expected].sort())
  )
    throw new Error('Unexpected source fields.');
}
function integer(value, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max)
    throw new Error('Invalid bounded integer.');
}
function text(value, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error('Invalid source text.');
}
export function validateScenario(s) {
  keys(s, [
    'schemaVersion',
    'id',
    'dataClass',
    'budgetUsdc',
    'reserveUsdc',
    'minimumUsefulBps',
    'minimumReviewed',
    'reviewPools',
    'workers',
    'work',
  ]);
  if (
    s.schemaVersion !== 1 ||
    s.id !== 'meta-agentic-delivery-v1' ||
    s.dataClass !== 'synthetic'
  )
    throw new Error('Unsupported synthetic source.');
  if (amount(s.reserveUsdc) > amount(s.budgetUsdc))
    throw new Error('Reserve exceeds budget.');
  integer(s.minimumUsefulBps, 10000);
  integer(s.minimumReviewed);
  if (!s.minimumReviewed) throw new Error('Minimum reviewed must be positive.');
  if (
    !Array.isArray(s.reviewPools) ||
    s.reviewPools.length !== 3 ||
    !Array.isArray(s.workers) ||
    !s.workers.length ||
    s.workers.length > 20 ||
    !Array.isArray(s.work) ||
    s.work.length !== 12
  )
    throw new Error(
      'Expected three review pools, one to twenty workers, and twelve work briefs.'
    );
  const pools = new Set(),
    workers = new Set(),
    jobs = new Set();
  for (const p of s.reviewPools) {
    keys(p, ['id', 'minutes']);
    if (!['software', 'research', 'design'].includes(p.id) || pools.has(p.id))
      throw new Error('Invalid review pool.');
    pools.add(p.id);
    integer(p.minutes);
  }
  for (const w of s.workers) {
    keys(w, ['id', 'skill', 'reviewed', 'useful']);
    if (
      !/^[a-z][a-z0-9-]{0,39}$/.test(w.id) ||
      workers.has(w.id) ||
      !pools.has(w.skill)
    )
      throw new Error('Invalid worker.');
    workers.add(w.id);
    integer(w.reviewed);
    integer(w.useful);
    if (w.useful > w.reviewed)
      throw new Error('Useful observations exceed reviewed observations.');
  }
  for (const w of s.work) {
    keys(w, [
      'id',
      'skill',
      'title',
      'deliverable',
      'rewardUsdc',
      'reviewMinutes',
      'acceptanceCriteria',
    ]);
    if (
      !/^ALPHA-0(0[1-9]|1[0-2])$/.test(w.id) ||
      jobs.has(w.id) ||
      !pools.has(w.skill)
    )
      throw new Error('Invalid work identity.');
    jobs.add(w.id);
    text(w.title);
    text(w.deliverable);
    if (!amount(w.rewardUsdc)) throw new Error('Reward must be positive.');
    integer(w.reviewMinutes);
    if (!w.reviewMinutes) throw new Error('Review minutes must be positive.');
    if (
      !Array.isArray(w.acceptanceCriteria) ||
      w.acceptanceCriteria.length !== 3
    )
      throw new Error('Three acceptance criteria are required.');
    w.acceptanceCriteria.forEach((x) => text(x));
  }
  return s;
}
export const outputContracts = {
  identify: {
    workIds: 'all IDs in source order',
    count: '12',
    plannedRewardsUsdc: 'sum of rewards, six decimal places',
    reviewMinutes: 'sum of requested minutes',
    ...boundary,
  },
  learn: {
    workers: [
      {
        id: 'worker ID',
        reviewed: 'source count',
        useful: 'source count',
        usefulBps: 'floor(useful*10000/reviewed), or 0 when none reviewed',
        qualified:
          'reviewed >= minimum AND useful*10000 >= reviewed*minimumUsefulBps',
      },
    ],
    ...boundary,
  },
  think: {
    routes: [
      {
        workId: 'brief ID',
        workerId: 'best qualified matching worker ID or null',
        reviewPool: 'skill',
      },
    ],
    ...boundary,
  },
  design: {
    contracts: [
      {
        workId: 'brief ID',
        workerId: 'selected worker or null',
        deliverable: 'source deliverable',
        acceptanceCriteria: 'source criteria array',
        rewardUsdc: 'six decimal places',
        reviewPool: 'skill',
        reviewMinutes: 'source minutes',
      },
    ],
    ...boundary,
  },
  strategise: {
    decisions: [
      {
        workId: 'brief ID',
        status: 'admitted or deferred',
        reason: 'reserved, no-qualified-worker, budget, or review-capacity',
      },
    ],
    committedUsdc: 'sum of admitted rewards',
    unallocatedUsdc: 'budget minus committed (includes reserve)',
    reviewPools: [
      {
        id: 'pool ID',
        availableMinutes: 'source minutes',
        usedMinutes: 'admitted minutes',
      },
    ],
    ...boundary,
  },
  execute: {
    readyWorkIds: 'admitted IDs in source order',
    deferredWorkIds: 'deferred IDs in source order',
    committedUsdc: 'admitted rewards',
    unallocatedUsdc: 'budget minus committed',
    customerJobsCompleted: 0,
    actualPaidUsdc: '0.000000',
    evidenceClass: 'deterministic-simulation',
    ...boundary,
  },
};
export async function makeTask(source, id) {
  validateScenario(source);
  const stage = stageById(id);
  return {
    schemaVersion: 1,
    workerProfile: 'meta-agentic-alpha',
    goal: stage.goal,
    inputText: `Source SHA-256 (canonical sorted-key JSON): ${await sha256(
      canonical(source)
    )}\n${json(source)}\nContract: ${json(
      outputContracts[id]
    )}\nAll phases use the same source. Money uses integer micro-USDC; normalize decimal outputs to six places. Preserve source order. Compute qualification and routing as described by these phase definitions: ${json(
      stages
    )}\nOnly synthetic analysis in an isolated workspace is authorized. No external publication, purchases, signing, credential access, or customer-job execution. Computer tools require separately granted permissions.`,
    dataClass: 'synthetic',
    allowedOrigins: ['http://127.0.0.1:4191'],
    acceptanceCriteria: [
      'Return exactly the declared JSON object, independently computed from this source.',
      'Preserve IDs, complete coverage, source order and exact decimal arithmetic.',
      'Set productionApproved and settlementApproved to false; do not claim proposed jobs are completed.',
    ],
    deliverables: [{ name: stage.file, mediaType: 'application/json' }],
  };
}
export const taskDigest = (task) => sha256(JSON.stringify(task));
export function capacity({
  agents,
  jobsPerDay,
  usefulPercent,
  reviewHours,
  minutesPerJob,
  priceUsdc,
}) {
  const values = [
      agents,
      jobsPerDay,
      usefulPercent,
      reviewHours,
      minutesPerJob,
      priceUsdc,
    ],
    limits = [1e9, 1e4, 100, 1e9, 1e6, 1e9];
  if (
    values.some(
      (x, i) =>
        typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > limits[i]
    ) ||
    minutesPerJob <= 0 ||
    priceUsdc <= 0
  )
    throw new Error(
      'Enter finite non-negative assumptions; price and review minutes must be positive.'
    );
  const workers = (agents * jobsPerDay * usefulPercent) / 100,
    reviewers = (reviewHours * 60) / minutesPerJob,
    market = 40e12 / priceUsdc / 365,
    jobs = Math.min(workers, reviewers, market);
  return {
    jobsPerDay: jobs,
    annualVolumeUsdc: jobs * 365 * priceUsdc,
    bottleneck:
      jobs === 0
        ? 'No capacity'
        : jobs === market
        ? 'Assumed market ceiling'
        : jobs === reviewers
        ? 'Independent review'
        : 'Useful worker output',
    marketAssumptionUsd: 40e12,
    milestoneUsdc: 40e9,
    forecast: false,
  };
}
