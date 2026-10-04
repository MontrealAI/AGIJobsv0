'use strict';
const { createHash } = require('node:crypto');
const quotes = require('./quotes.json');
/** Independent arithmetic acceptance check: never trust the worker's verdict. */
function review(receipt) {
  const checks = [];
  const add = (name, passed) => checks.push({ name, passed: Boolean(passed) });
  const files = receipt.artifacts || [];
  add(
    'Exactly two unique deliverables',
    files.length === 2 && new Set(files.map((x) => x.name)).size === 2
  );
  for (const file of files)
    add(
      `Integrity: ${file.name}`,
      typeof file.content === 'string' &&
        createHash('sha256').update(file.content).digest('hex') === file.sha256
    );
  let report = {};
  try {
    report = JSON.parse(
      files.find((x) => x.name === 'comparison.json')?.content || '{}'
    );
  } catch {
    /* report stays invalid */
  }
  add('Delivery limit is 7 days', report.maxDeliveryDays === 7);
  add(
    'All quotes appear once',
    Array.isArray(report.quotes) &&
      report.quotes.length === quotes.length &&
      new Set(report.quotes.map((x) => x.supplier)).size === quotes.length
  );
  for (const source of quotes) {
    const observed = report.quotes?.find?.(
      (x) => x.supplier === source.supplier
    );
    add(
      `${source.supplier}: total and eligibility`,
      observed?.totalCents ===
        source.quantity * source.unitCents + source.shippingCents &&
        observed?.eligible === source.deliveryDays <= 7
    );
  }
  const winner = quotes
    .filter((x) => x.deliveryDays <= 7)
    .sort(
      (a, b) =>
        a.quantity * a.unitCents +
        a.shippingCents -
        (b.quantity * b.unitCents + b.shippingCents)
    )[0];
  add(
    'Lowest eligible total wins',
    report.recommendedSupplier === winner.supplier
  );
  add('No purchase claimed', report.purchaseExecuted === false);
  const brief =
    files.find((x) => x.name === 'recommendation.md')?.content || '';
  add(
    'Brief names the recommendation and no-purchase boundary',
    brief.includes(winner.supplier) && brief.includes('No purchase')
  );
  return {
    schemaVersion: 1,
    reviewer: 'deterministic fixture acceptance rules',
    accepted: checks.every((x) => x.passed),
    settlementApproved: false,
    productionApproved: false,
    checks,
  };
}
module.exports = { review };
