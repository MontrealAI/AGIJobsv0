export const operations = Object.freeze([
  'add2',
  'times3',
  'nonnegative',
  'sum',
  'sort',
  'unique',
  'reverse',
]);
export function execute(input, program) {
  if (
    !Array.isArray(input) ||
    input.length > 4096 ||
    !input.every(Number.isSafeInteger)
  )
    throw new Error('Input must be a bounded integer array.');
  if (
    !Array.isArray(program) ||
    program.length > 3 ||
    !program.every((op) => operations.includes(op))
  )
    throw new Error('Unknown or unbounded program.');
  let values = [...input];
  for (const op of program) {
    if (op === 'add2') values = values.map((x) => x + 2);
    if (op === 'times3') values = values.map((x) => x * 3);
    if (op === 'nonnegative') values = values.filter((x) => x >= 0);
    if (op === 'sum') values = [values.reduce((sum, x) => sum + x, 0)];
    if (op === 'sort') values.sort((a, b) => a - b);
    if (op === 'unique') values = [...new Set(values)];
    if (op === 'reverse') values.reverse();
    if (!values.every(Number.isSafeInteger))
      throw new Error('Integer overflow.');
  }
  return values;
}
export function* candidates() {
  yield [];
  let level = [[]];
  for (let depth = 1; depth <= 3; depth++) {
    level = level.flatMap((program) =>
      operations.map((op) => [...program, op])
    );
    yield* level;
  }
}
export function matches(task, program) {
  return task.training.every(
    (example) =>
      JSON.stringify(execute(example.input, program)) ===
      JSON.stringify(example.expected)
  );
}
export function candidate(task, program, tested, sourceSha256) {
  if (!matches(task, program))
    throw new Error('Candidate does not match every training example.');
  return {
    schemaVersion: 1,
    taskId: task.id,
    sourceSha256,
    operations: [...program],
    candidatesEvaluated: tested,
    evidenceClass: 'local-synthesis',
    reviewStatus: 'required',
    providerCalls: 0,
    chainTransactions: 0,
    productionApproved: false,
    settlementApproved: false,
  };
}
export function plan({
  budget,
  workerCost,
  reviewerCost,
  reviewMinutes,
  reviewCapacity,
  lawful,
  rights,
  independent,
}) {
  const money = (value) => {
    if (!/^\d{1,9}(?:\.\d{1,6})?$/.test(String(value)))
      throw new Error(
        'USDC amounts need 0–6 decimal places and no sign or exponent.'
      );
    const [whole, fraction = ''] = String(value).split('.');
    return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  };
  const total = money(budget),
    cost = money(workerCost) + money(reviewerCost);
  for (const n of [reviewMinutes, reviewCapacity])
    if (!Number.isInteger(n) || n < 0 || n > 100000)
      throw new Error(
        'Reviewer minutes must be bounded non-negative integers.'
      );
  const reasons = [];
  if (!lawful) reasons.push('Confirm lawful, authorized scope.');
  if (!rights) reasons.push('Confirm rights to the inputs and outputs.');
  if (!independent)
    reasons.push('Assign a reviewer independent of the creator.');
  if (total <= 0n || cost > total)
    reasons.push('Budget does not cover the work and review.');
  if (reviewMinutes === 0 || reviewMinutes > reviewCapacity)
    reasons.push('Reserve sufficient reviewer time.');
  const fmt = (n) => `${n / 1000000n}.${String(n % 1000000n).padStart(6, '0')}`;
  return {
    status: reasons.length ? 'held' : 'ready-for-operator-review',
    reasons,
    budgetUsdc: fmt(total),
    estimatedCostUsdc: fmt(cost),
    unallocatedUsdc: cost <= total ? fmt(total - cost) : null,
    reviewMinutes,
    currency: 'USDC',
    dispatched: false,
    productionApproved: false,
    settlementApproved: false,
  };
}
export function market({ addressable, licensed, reliable, adoption, fee }) {
  for (const value of [addressable, licensed, reliable, adoption, fee])
    if (!Number.isFinite(value) || value < 0 || value > 100)
      throw new Error('Percentages must be between 0 and 100.');
  const work =
    (((((((40e12 * addressable) / 100) * licensed) / 100) * reliable) / 100) *
      adoption) /
    100;
  return {
    annualWorkValue: work,
    annualPlatformRevenue: (work * fee) / 100,
    evidenceClass: 'illustrative-assumptions',
  };
}
