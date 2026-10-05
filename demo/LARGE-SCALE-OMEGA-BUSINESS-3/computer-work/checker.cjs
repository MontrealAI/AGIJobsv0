'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const digest = (bytes) =>
  crypto.createHash('sha256').update(bytes).digest('hex');
function amount(value) {
  assert.equal(typeof value, 'string', 'Amounts must be strings');
  assert.match(value, /^(0|[1-9][0-9]*)$/);
  assert.ok(value.length <= 39);
  return BigInt(value);
}
function validateInput(input) {
  assert.ok(
    Array.isArray(input.rows) &&
      input.rows.length > 0 &&
      input.rows.length <= 1000,
    'Invalid workload rows'
  );
  const ids = new Set();
  for (const row of input.rows) {
    assert.ok(
      typeof row.id === 'string' && /^[a-z0-9-]{1,64}$/.test(row.id),
      'Invalid row ID'
    );
    assert.ok(!ids.has(row.id), 'Duplicate source row');
    ids.add(row.id);
    if (input.kind === 'energy-balance') {
      amount(row.generatedKwh);
      amount(row.consumedKwh);
    } else if (input.kind === 'reserve-reconciliation') {
      amount(row.stockUnits);
      amount(row.committedUnits);
      amount(row.reserveUnits);
    } else if (input.kind === 'supplier-selection') {
      amount(row.unitPriceMicros);
      amount(row.shippingMicros);
      assert.ok(
        Number.isSafeInteger(row.deliveryDays) &&
          row.deliveryDays > 0 &&
          row.deliveryDays <= 3650
      );
    } else throw new Error('Unsupported workload kind');
  }
  if (input.kind === 'supplier-selection') {
    assert.ok(amount(input.quantity) > 0n);
    assert.ok(
      Number.isSafeInteger(input.maxDeliveryDays) &&
        input.maxDeliveryDays > 0 &&
        input.maxDeliveryDays <= 3650
    );
  }
}
function checkCandidate(inputBytes, candidateBytes) {
  try {
    assert.ok(
      Buffer.byteLength(inputBytes) <= 131072 &&
        Buffer.byteLength(candidateBytes) <= 131072,
      'Workload or candidate exceeds 128 KiB'
    );
    const input = JSON.parse(inputBytes),
      candidate = JSON.parse(candidateBytes);
    validateInput(input);
    assert.equal(candidate.schemaVersion, 1);
    assert.equal(candidate.kind, input.kind);
    assert.equal(
      candidate.sourceSha256,
      digest(inputBytes),
      'Wrong source bytes'
    );
    assert.equal(candidate.productionApproved, false);
    assert.equal(candidate.settlementApproved, false);
    assert.ok(Array.isArray(candidate.rows));
    assert.equal(
      candidate.rows.length,
      input.rows.length,
      'Missing or extra row'
    );
    const byId = new Map(candidate.rows.map((row) => [row.id, row]));
    assert.equal(byId.size, input.rows.length, 'Duplicate result row');
    let net = 0n,
      available = 0n,
      shortfall = 0n,
      winner = null,
      best = null;
    const deficits = [];
    // Independent recomputation, without importing the creator or its calculations.
    for (const source of input.rows) {
      const row = byId.get(source.id);
      assert.ok(row, `Missing ${source.id}`);
      if (input.kind === 'energy-balance') {
        const expected =
          amount(source.generatedKwh) - amount(source.consumedKwh);
        assert.deepEqual(row, { id: source.id, netKwh: String(expected) });
        net += expected;
        if (expected < 0n) deficits.push(source.id);
      } else if (input.kind === 'reserve-reconciliation') {
        const remainder =
          amount(source.stockUnits) -
          amount(source.committedUnits) -
          amount(source.reserveUnits);
        const a = remainder > 0n ? remainder : 0n,
          s = remainder < 0n ? -remainder : 0n;
        assert.deepEqual(row, {
          id: source.id,
          availableUnits: String(a),
          shortfallUnits: String(s),
        });
        available += a;
        shortfall += s;
      } else {
        const total =
          amount(source.unitPriceMicros) * amount(input.quantity) +
          amount(source.shippingMicros);
        const eligible = source.deliveryDays <= input.maxDeliveryDays;
        assert.deepEqual(row, {
          id: source.id,
          totalMicros: String(total),
          eligible,
        });
        if (
          eligible &&
          (best === null ||
            total < best ||
            (total === best && source.id < winner))
        ) {
          best = total;
          winner = source.id;
        }
      }
    }
    const expected =
      input.kind === 'energy-balance'
        ? { netKwh: String(net), deficits }
        : input.kind === 'reserve-reconciliation'
        ? {
            availableUnits: String(available),
            shortfallUnits: String(shortfall),
          }
        : { recommended: winner };
    assert.deepEqual(
      candidate.summary,
      expected,
      'Incorrect summary or recommendation'
    );
    return {
      accepted: true,
      checks:
        'Exact source hash, complete unique rows, independent arithmetic and decision checks',
      candidateSha256: digest(candidateBytes),
      sourceSha256: digest(inputBytes),
      humanReview: 'required',
      productionApproved: false,
      settlementApproved: false,
    };
  } catch (error) {
    return {
      accepted: false,
      error: error.message,
      humanReview: 'required',
      productionApproved: false,
      settlementApproved: false,
    };
  }
}
module.exports = { validateInput, checkCandidate };
if (require.main === module) {
  try {
    if (process.argv.length !== 4)
      throw new Error(
        'Usage: node computer-work/checker.cjs input.json candidate.json'
      );
    for (const file of process.argv.slice(2))
      if (fs.statSync(file).size > 131072)
        throw new Error('File exceeds 128 KiB');
    const verdict = checkCandidate(
      fs.readFileSync(process.argv[2]),
      fs.readFileSync(process.argv[3])
    );
    console.log(JSON.stringify(verdict, null, 2));
    process.exitCode = verdict.accepted ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
