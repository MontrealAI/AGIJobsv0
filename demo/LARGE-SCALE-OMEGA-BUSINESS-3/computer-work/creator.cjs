'use strict';
// Deterministic fixture creator; it never invokes a model or provider.
const { sha256, json } = require('../lib/scenario.cjs');
function createCandidate(input) {
  let rows, summary;
  if (input.kind === 'energy-balance') {
    rows = input.rows.map((r) => ({
      id: r.id,
      netKwh: String(BigInt(r.generatedKwh) - BigInt(r.consumedKwh)),
    }));
    summary = {
      netKwh: String(rows.reduce((sum, r) => sum + BigInt(r.netKwh), 0n)),
      deficits: rows.filter((r) => BigInt(r.netKwh) < 0n).map((r) => r.id),
    };
  } else if (input.kind === 'reserve-reconciliation') {
    rows = input.rows.map((r) => {
      const net =
        BigInt(r.stockUnits) -
        BigInt(r.committedUnits) -
        BigInt(r.reserveUnits);
      return {
        id: r.id,
        availableUnits: String(net > 0n ? net : 0n),
        shortfallUnits: String(net < 0n ? -net : 0n),
      };
    });
    summary = {
      availableUnits: String(
        rows.reduce((sum, r) => sum + BigInt(r.availableUnits), 0n)
      ),
      shortfallUnits: String(
        rows.reduce((sum, r) => sum + BigInt(r.shortfallUnits), 0n)
      ),
    };
  } else if (input.kind === 'supplier-selection') {
    rows = input.rows.map((r) => ({
      id: r.id,
      totalMicros: String(
        BigInt(r.unitPriceMicros) * BigInt(input.quantity) +
          BigInt(r.shippingMicros)
      ),
      eligible: r.deliveryDays <= input.maxDeliveryDays,
    }));
    const eligible = rows
      .filter((r) => r.eligible)
      .sort((a, b) =>
        BigInt(a.totalMicros) < BigInt(b.totalMicros)
          ? -1
          : BigInt(a.totalMicros) > BigInt(b.totalMicros)
          ? 1
          : a.id < b.id
          ? -1
          : a.id > b.id
          ? 1
          : 0
      );
    summary = { recommended: eligible[0]?.id ?? null };
  } else throw new Error('Unsupported workload');
  return {
    schemaVersion: 1,
    sourceSha256: sha256(json(input)),
    kind: input.kind,
    rows,
    summary,
    productionApproved: false,
    settlementApproved: false,
  };
}
module.exports = { createCandidate };
