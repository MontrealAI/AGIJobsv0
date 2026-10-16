// Hypothetical outcome under the frozen fixture policy, never an execution result.
export function calculate(initialReveals, replacementApprovals) {
  for (const n of [initialReveals, replacementApprovals])
    if (!Number.isInteger(n) || n < 0 || n > 3)
      throw Error('Choose an integer from 0 to 3');
  return {
    schema: 'agijobs.polaris-expected-outcome.v1',
    mode: 'hypothetical-calculation',
    initialReveals,
    replacementApprovals,
    revealQuorum: 3,
    requiredApprovals: 2,
    approvalThresholdPercent: 66,
    missingRevealers: 3 - initialReveals,
    penaltyPercentPerMissing: 1,
    firstExpectedSuccess: initialReveals === 3,
    replacementExpectedSuccess: replacementApprovals >= 2,
    executed: false,
    chainAttested: false,
    settlementApproved: false,
  };
}
