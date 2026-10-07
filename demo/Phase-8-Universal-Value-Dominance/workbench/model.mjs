export const defaults = Object.freeze({
  offers: 120,
  workers: 8,
  days: 10,
  hoursPerJob: 8,
  reviewMinutes: 30,
  reviewerHours: 40,
  budgetUSDC: 30000,
  rewardUSDC: 500,
  executionUSDC: 30,
  reviewUSDC: 20,
  acceptancePercent: 80,
  outagePercent: 0,
});
const limits = {
  offers: [0, 1000000],
  workers: [0, 1000000],
  days: [1, 365],
  hoursPerJob: [1, 8760],
  reviewMinutes: [1, 1440],
  reviewerHours: [0, 1000000],
  budgetUSDC: [0, 1000000000],
  rewardUSDC: [1, 1000000],
  executionUSDC: [0, 1000000],
  reviewUSDC: [0, 1000000],
  acceptancePercent: [0, 100],
  outagePercent: [0, 100],
};
export function plan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('A scenario object is required.');
  if (Object.keys(input).some((key) => !Object.hasOwn(limits, key)))
    throw new Error('Unknown scenario field.');
  const settings = { ...defaults, ...input };
  for (const [key, [min, max]] of Object.entries(limits)) {
    const n = settings[key];
    if (!Number.isSafeInteger(n) || n < min || n > max)
      throw new Error(`${key} must be a whole number from ${min} to ${max}.`);
  }
  const s = settings;
  const workerCapacity = Math.floor(
    (s.workers * s.days * 8 * (100 - s.outagePercent)) / (100 * s.hoursPerJob)
  );
  const reviewCapacity = Math.floor((s.reviewerHours * 60) / s.reviewMinutes);
  const reservePerJobUSDC = s.rewardUSDC + s.executionUSDC + s.reviewUSDC;
  const budgetCapacity = Math.floor(s.budgetUSDC / reservePerJobUSDC);
  const admitted = Math.min(
    s.offers,
    workerCapacity,
    reviewCapacity,
    budgetCapacity
  );
  const accepted = Math.floor((admitted * s.acceptancePercent) / 100);
  const reserveUSDC = admitted * reservePerJobUSDC;
  const payoutUSDC = accepted * s.rewardUSDC;
  const operatingCostUSDC = admitted * (s.executionUSDC + s.reviewUSDC);
  const spentUSDC = payoutUSDC + operatingCostUSDC;
  const capacity = {
    offers: s.offers,
    workers: workerCapacity,
    review: reviewCapacity,
    budget: budgetCapacity,
  };
  return {
    schemaVersion: 1,
    evidenceClass: 'capacity-scenario',
    settings,
    capacity,
    bottlenecks: Object.keys(capacity).filter(
      (key) => capacity[key] === admitted
    ),
    admitted,
    accepted,
    notAccepted: admitted - accepted,
    deferred: s.offers - admitted,
    reserveUSDC,
    uncommittedUSDC: s.budgetUSDC - reserveUSDC,
    payoutUSDC,
    operatingCostUSDC,
    spentUSDC,
    releasedReserveUSDC: reserveUSDC - spentUSDC,
    remainingUSDC: s.budgetUSDC - spentUSDC,
    reviewHours: (admitted * s.reviewMinutes) / 60,
    minutesPerAccepted: accepted
      ? (admitted * s.reviewMinutes) / accepted
      : null,
    costPerAcceptedUSDC: accepted ? spentUSDC / accepted : null,
    providerCalls: 0,
    chainTransactions: 0,
    independentReviewCompleted: false,
    buyerUseVerified: false,
    productionApproved: false,
    settlementApproved: false,
  };
}
export function workOrder(task, scenario = defaults) {
  if (
    !task ||
    typeof task.id !== 'string' ||
    !Array.isArray(task.acceptanceCriteria)
  )
    throw new Error('Select a work category.');
  return {
    schemaVersion: 1,
    status: 'draft',
    taskId: task.id,
    title: task.title,
    goal: task.goal,
    dataClass: 'public-licensed-or-synthetic',
    deliverables: [...task.deliverables],
    acceptanceCriteria: [...task.acceptanceCriteria],
    authorization: {
      scope:
        'Define exact sources, application origins, allowed actions and stop conditions before admission.',
      externalActionsApproved: false,
    },
    runtime: {
      operatorChoice: [
        'OpenClaw isolated browser',
        'ChatGPT Work Computer Use',
        'OpenAI API computer-use harness',
      ],
      configured: false,
    },
    review: {
      independentReviewerRequired: true,
      identityVerified: false,
      buyerAcceptanceRequired: true,
    },
    settlement: {
      currency: 'USDC',
      approved: false,
      note: 'Separate deployed settlement policy and explicit authorization required.',
    },
    scenario: plan(scenario),
  };
}
export function reportMarkdown(result) {
  return `# Phase 8 capacity report\n\nSynthetic planning scenario; no live work, independent acceptance or payment is claimed.\n\n| Measure | Result |\n| --- | ---: |\n| Offers | ${
    result.settings.offers
  } |\n| Admitted | ${result.admitted} |\n| Expected accepted | ${
    result.accepted
  } |\n| Deferred | ${result.deferred} |\n| Reserved USDC | ${
    result.reserveUSDC
  } |\n| Expected spent USDC | ${result.spentUSDC} |\n| Remaining USDC | ${
    result.remainingUSDC
  } |\n| Review hours | ${
    result.reviewHours
  } |\n\nBottleneck: ${result.bottlenecks.join(
    ', '
  )}.\n\nEight productive hours per worker-day. Every admitted attempt consumes execution and review cost and reserves its full reward; only accepted work earns the modeled reward. Non-accepted rewards are released in this scenario. Actual refunds, disputes, gas, taxes, fees and payment finality require the applicable settlement implementation. Expected acceptance is an input, never a measured success rate.\n`;
}
