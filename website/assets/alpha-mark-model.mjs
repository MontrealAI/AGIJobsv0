import { createDraft, usdcUnits } from './work-model.mjs';

const prerequisites = [
  [
    'authorityPlanned',
    'Define the buyer’s authority, permitted actions and exclusions.',
  ],
  [
    'inputsPlanned',
    'Verify source rights, permitted origins and the exclusion of private data.',
  ],
  [
    'reviewPlanned',
    'Assign a reviewer independent of the worker and agree acceptance criteria.',
  ],
];

function integer(value, label, maximum) {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    Number(value) > maximum
  )
    throw new Error(
      `${label} must be a whole number from 1 to ${maximum.toLocaleString(
        'en-US'
      )}.`
    );
  return Number(value);
}

export function modelCapacity(input) {
  const reward = BigInt(usdcUnits(input.reward));
  let budget;
  try {
    budget = BigInt(usdcUnits(input.dailyBudget));
  } catch {
    throw new Error(
      'Daily reward budget must be from 0.000001 to 1,000,000 USDC, with at most six decimal places.'
    );
  }
  const workers = integer(input.workers, 'Workers', 10000);
  const jobsPerWorker = integer(
    input.jobsPerWorker,
    'Candidate jobs per worker',
    1000
  );
  const reviewers = integer(input.reviewers, 'Reviewers', 10000);
  const minutesPerReviewer = integer(
    input.minutesPerReviewer,
    'Daily minutes per reviewer',
    480
  );
  const minutesPerJob = integer(
    input.reviewerMinutes,
    'Review minutes per job',
    480
  );
  const slots = {
    worker: workers * jobsPerWorker,
    reviewer: reviewers * Math.floor(minutesPerReviewer / minutesPerJob),
    rewardBudget: Number(budget / reward),
  };
  const candidateJobs = Math.min(...Object.values(slots));
  return {
    model: 'one-day-static-capacity/v2',
    assumptions: {
      workers,
      jobsPerWorker,
      reviewers,
      minutesPerReviewer,
      minutesPerJob,
      reviewAssignment: 'one-independent-reviewer-per-job',
      rewardBaseUnits: reward.toString(),
      dailyBudgetBaseUnits: budget.toString(),
    },
    slots,
    candidateJobs,
    bottlenecks: Object.keys(slots).filter(
      (key) => slots[key] === candidateJobs
    ),
    reservedRewardsBaseUnits: (BigInt(candidateJobs) * reward).toString(),
    unallocatedRewardsBaseUnits: (
      budget -
      BigInt(candidateJobs) * reward
    ).toString(),
    reviewMinutesReserved: candidateJobs * minutesPerJob,
    reviewMinutesUnallocated:
      reviewers * minutesPerReviewer - candidateJobs * minutesPerJob,
    forecast: false,
    assumptionsVerified: false,
    excludes: [
      'provider charges',
      'review fees',
      'failed attempts',
      'rework',
      'disputes',
      'buyer demand',
      'settlement delays',
    ],
  };
}

export function createAlphaMarkPlan(input) {
  const capacity = modelCapacity(input);
  const proposal = createDraft(input);
  const preparation = Object.fromEntries(
    prerequisites.map(([key]) => [key, input[key] === true])
  );
  const missing = prerequisites
    .filter(([key]) => !preparation[key])
    .map(([, label]) => label);
  return {
    schema: 'alpha-agi-mark-work-plan/v1',
    status: missing.length
      ? 'preparation-incomplete'
      : capacity.candidateJobs === 0
      ? 'capacity-unavailable'
      : 'draft-for-operator-review',
    browserOnly: true,
    simulation: true,
    productionApproved: false,
    preparation,
    missing,
    capacity,
    proposal: missing.length || capacity.candidateJobs === 0 ? null : proposal,
    relationshipToMarket:
      'No capital transfer, token valuation, launch approval, contract execution or settlement is performed. This USDC work proposal is separate from the Alpha Mark native/ERC20 bonding-curve demo.',
  };
}

export function formatUsdc(units) {
  const value = BigInt(units);
  const fraction = (value % 1000000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '');
  return `${(value / 1000000n).toLocaleString('en-US')}${
    fraction ? '.' + fraction : ''
  }`;
}
