'use strict';
/** Deterministic local artifact work. No model, browser, network or wallet calls. */
const { createHash } = require('node:crypto');
const { review } = require('../One-Box/computer-work/review.cjs');
const quotes = require('../One-Box/computer-work/quotes.json');
for (const quote of quotes) Object.freeze(quote);
Object.freeze(quotes);
const digest = (text) => createHash('sha256').update(text).digest('hex');
const artifact = (name, content) => ({
  name,
  content,
  sha256: digest(content),
});
const STAGES = Object.freeze([
  'validate-quotes',
  'compare-quotes',
  'write-recommendation',
  'independent-review',
  'export-receipt',
]);
function executeStage(index, previous, { injectError = false } = {}) {
  if (index === 0) {
    if (
      !Array.isArray(quotes) ||
      quotes.length !== 3 ||
      new Set(quotes.map((q) => q.supplier)).size !== 3
    )
      throw Error('Invalid fixed quote source');
    for (const quote of quotes)
      for (const key of [
        'quantity',
        'unitCents',
        'shippingCents',
        'deliveryDays',
      ])
        if (
          !Number.isSafeInteger(quote[key]) ||
          quote[key] < 0 ||
          quote[key] > 1000000
        )
          throw Error('Invalid bounded quote arithmetic');
    return {
      quotes: structuredClone(quotes),
      maxDeliveryDays: 7,
      source: 'fixed One-Box synthetic supplier quotes',
      physicalWorkExecuted: false,
    };
  }
  if (index === 1) {
    const rows = previous.quotes.map((q) => ({
      supplier: q.supplier,
      totalCents: q.quantity * q.unitCents + q.shippingCents,
      eligible: q.deliveryDays <= previous.maxDeliveryDays,
    }));
    const eligible = rows
      .filter((q) => q.eligible)
      .sort((a, b) => a.totalCents - b.totalCents);
    if (!eligible.length) throw Error('No eligible supplier');
    return {
      maxDeliveryDays: previous.maxDeliveryDays,
      quotes: rows,
      recommendedSupplier: injectError ? 'Laurentian' : eligible[0].supplier,
      purchaseExecuted: false,
    };
  }
  if (index === 2) {
    return {
      artifacts: [
        artifact('comparison.json', JSON.stringify(previous, null, 2) + '\n'),
        artifact(
          'recommendation.md',
          `# Supplier recommendation\n\n${previous.recommendedSupplier} is recommended for review. No purchase executed.\n`
        ),
      ],
    };
  }
  if (index === 3) {
    return { receipt: previous, review: review(previous) };
  }
  if (index === 4) {
    if (!previous.review.accepted || !review(previous.receipt).accepted)
      throw Error('Independent review rejected the artifacts');
    return {
      schema: 'agijobs.omega-local-delivery.v1',
      receipt: previous.receipt,
      review: previous.review,
      executionMode: 'deterministic-local-code',
      providerCalled: false,
      browserUsed: false,
      admitted: false,
      settlementApproved: false,
      productionApproved: false,
    };
  }
  throw Error('Unknown built-in stage');
}
module.exports = { STAGES, executeStage, digest };
