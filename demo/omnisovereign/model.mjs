export const json = (value) => JSON.stringify(value, null, 2) + '\n';
export const canonical = (value) => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
};
export async function sha256(text) {
  const hash = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function amount(text) {
  if (typeof text !== 'string' || !/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(text))
    throw new Error(
      'Use a non-negative decimal amount with at most six fractional places.'
    );
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
export function decimal(micros) {
  const sign = micros < 0n ? '-' : '';
  const n = micros < 0n ? -micros : micros;
  return `${sign}${n / 1000000n}.${String(n % 1000000n).padStart(6, '0')}`;
}
export const stages = [
  {
    id: 'SOV-INGEST-NATIONAL',
    title: 'Ingest national work',
    short: 'Inventory',
    file: 'national-inventory.json',
    dependencies: [],
    goal: 'Normalize all six synthetic work briefs into an exact inventory; reconcile total planned rewards and provider cost estimates.',
  },
  {
    id: 'SOV-CASCADE-REGIONAL',
    title: 'Coordinate regional capacity',
    short: 'Coordination',
    file: 'regional-allocation.json',
    dependencies: ['SOV-INGEST-NATIONAL'],
    goal: 'Group all work by region and reconcile job coverage, rewards, review demand and reviewer shortfalls.',
  },
  {
    id: 'SOV-HARMONISE-TREASURY',
    title: 'Reconcile the reserve',
    short: 'Treasury',
    file: 'treasury-reconciliation.json',
    dependencies: ['SOV-CASCADE-REGIONAL'],
    goal: 'Reconcile planned rewards against the synthetic budget and minimum reserve, using exact USDC decimal arithmetic. Provider cost is a separate estimate, not extra employer liability.',
  },
  {
    id: 'SOV-THERMO-ALIGN',
    title: 'Analyze energy constraints',
    short: 'Energy',
    file: 'energy-analysis.json',
    dependencies: ['SOV-INGEST-NATIONAL'],
    goal: 'Calculate every region’s energy balance, aggregate generation and demand, and identify deficits. Do not infer transfer capacity or operate physical infrastructure.',
  },
  {
    id: 'SOV-VALIDATOR-FUSION',
    title: 'Reserve independent review',
    short: 'Review',
    file: 'review-capacity.json',
    dependencies: ['SOV-CASCADE-REGIONAL', 'SOV-THERMO-ALIGN'],
    goal: 'Allocate each region’s reviewer minutes greedily in source order; defer any brief that does not fit. Report admitted/deferred IDs and available, used and unmet minutes. This is planning admission only.',
  },
  {
    id: 'SOV-PUBLIC-DOSSIER',
    title: 'Assemble the mission dossier',
    short: 'Dossier',
    file: 'mission-dossier.json',
    dependencies: ['SOV-HARMONISE-TREASURY', 'SOV-VALIDATOR-FUSION'],
    goal: 'Produce a local dossier covering all work IDs and all six coordination stages, with exact budget, review and energy totals and explicit evidence boundaries. Prepare an artifact; do not publish externally.',
  },
];
export function validateScenario(s) {
  if (
    !s ||
    s.schemaVersion !== 1 ||
    s.id !== 'omnisovereign-screen-work-v1' ||
    s.dataClass !== 'synthetic'
  )
    throw new Error('Unsupported synthetic scenario.');
  amount(s.budgetUsdc);
  amount(s.minimumReserveUsdc);
  if (
    !Array.isArray(s.regions) ||
    s.regions.length !== 3 ||
    !Array.isArray(s.work) ||
    s.work.length !== 6
  )
    throw new Error('Expected three regions and six work briefs.');
  const ids = new Set();
  const integer = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000000;
  for (const r of s.regions) {
    if (
      !['CITY-STATES', 'REGIONAL-COUNCILS', 'PLANETARY-RESERVE'].includes(
        r.id
      ) ||
      ids.has(r.id) ||
      ![r.reviewMinutes, r.generatedMwh, r.demandMwh].every(integer)
    )
      throw new Error('Invalid or duplicate region.');
    ids.add(r.id);
  }
  const work = new Set();
  for (const w of s.work) {
    if (
      !/^OMNI-00[1-6]$/.test(w.id) ||
      work.has(w.id) ||
      !ids.has(w.region) ||
      !integer(w.reviewMinutes) ||
      w.reviewMinutes < 1 ||
      ![w.title, w.deliverable].every(
        (v) => typeof v === 'string' && v.length > 0 && v.length <= 300
      )
    )
      throw new Error('Invalid or duplicate work brief.');
    amount(w.rewardUsdc);
    amount(w.estimatedCostUsdc);
    work.add(w.id);
  }
  return s;
}
export function stageById(id) {
  const stage = stages.find((s) => s.id === id);
  if (!stage) throw new Error('Select one of the six known stage IDs.');
  return stage;
}
export async function makeTask(source, id) {
  validateScenario(source);
  const stage = stageById(id);
  return {
    schemaVersion: 1,
    workerProfile: 'omnisovereign',
    goal: stage.goal,
    inputText: `Source SHA-256 (canonical sorted-key JSON): ${await sha256(
      canonical(source)
    )}\n${json(source)}\nOutput contract: ${json(
      outputContracts[id]
    )}\nCompute this stage from the exact source. USDC fields are decimal strings with six fractional places. Keep source order for arrays. Scope: synthetic analysis in an isolated workspace only. No purchases, network actions, external publication, credential access, infrastructure control or signing. Browser/computer tools require separately granted permissions.`,
    dataClass: 'synthetic',
    allowedOrigins: ['http://127.0.0.1:4190'],
    acceptanceCriteria: [
      'Return exactly the JSON object specified by the output contract, with independently recomputed values.',
      'Preserve all relevant work and region IDs; use exact decimal arithmetic.',
      'Set productionApproved and settlementApproved to false. An artifact check is not payment authorization.',
    ],
    deliverables: [{ name: stage.file, mediaType: 'application/json' }],
  };
}
export const taskDigest = (task) => sha256(JSON.stringify(task));
export const boundary = {
  productionApproved: false,
  settlementApproved: false,
};
export const outputContracts = {
  'SOV-INGEST-NATIONAL': {
    workIds: 'all work IDs',
    count: 'work count',
    plannedRewardsUsdc: 'sum of rewards',
    estimatedProviderCostUsdc: 'sum of estimated costs',
    ...boundary,
  },
  'SOV-CASCADE-REGIONAL': {
    regions: [
      {
        id: 'region ID',
        workIds: 'work IDs in this region',
        plannedRewardsUsdc: 'sum',
        requiredReviewMinutes: 'sum',
        availableReviewMinutes: 'capacity',
        shortfallMinutes: 'max(0, required-available)',
      },
    ],
    ...boundary,
  },
  'SOV-HARMONISE-TREASURY': {
    budgetUsdc: 'source budget',
    committedPlanUsdc: 'sum of all rewards',
    unallocatedUsdc: 'budget minus rewards',
    minimumReserveUsdc: 'source reserve',
    reserveAdequate: 'unallocated >= minimum',
    actualPaidUsdc: '0.000000',
    ...boundary,
  },
  'SOV-THERMO-ALIGN': {
    regions: [{ id: 'region ID', netMwh: 'generated minus demand' }],
    generatedMwh: 'sum generated',
    demandMwh: 'sum demand',
    netMwh: 'generated minus demand',
    deficitRegions: 'region IDs where net is negative',
    transfersAssumed: false,
    ...boundary,
  },
  'SOV-VALIDATOR-FUSION': {
    admittedWorkIds:
      'greedy fit within each region; region order then source order',
    deferredWorkIds: 'non-fitting IDs in the same order',
    availableMinutes: 'total region capacity',
    usedMinutes: 'minutes of admitted work',
    requiredMinutes: 'minutes of all work',
    unmetMinutes: 'minutes of deferred work',
    independentlyReviewed: false,
    ...boundary,
  },
  'SOV-PUBLIC-DOSSIER': {
    workIds: 'all six work IDs',
    stageIds: stages.map((s) => s.id),
    plannedRewardsUsdc: 'sum of all rewards',
    reserveUsdc: 'budget minus rewards',
    energyNetMwh: 'total generated minus demand',
    reviewDeferredCount: 'count from greedy reviewer admission',
    evidenceClass: 'deterministic-simulation',
    physicalExecution: false,
    chainTransactions: 0,
    ...boundary,
  },
};
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
  ];
  const max = [1e9, 1e4, 100, 1e9, 1e6, 1e9];
  if (
    values.some(
      (v, i) =>
        typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max[i]
    ) ||
    minutesPerJob <= 0 ||
    priceUsdc <= 0
  )
    throw new Error(
      'Enter finite non-negative assumptions; price and review minutes must be positive.'
    );
  const workers = (agents * jobsPerDay * usefulPercent) / 100;
  const reviewers = (reviewHours * 60) / minutesPerJob;
  const market = 40e12 / priceUsdc / 365;
  const jobs = Math.min(workers, reviewers, market);
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
