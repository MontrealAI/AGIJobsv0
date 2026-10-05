'use strict';
// Deliberately independent of the production planner: recompute directly from
// the admitted fixture and check per-account and aggregate conservation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const LIMIT = (1n << 256n) - 1n;
function raw(value) {
  assert.equal(typeof value, 'string', 'Base units must be decimal strings');
  assert.match(value, /^(0|[1-9][0-9]*)$/, 'Invalid base-unit representation');
  assert.ok(value.length <= 78, 'Amount too large');
  const number = BigInt(value);
  assert.ok(number <= LIMIT, 'Amount exceeds uint256');
  return number;
}
function boundedRead(file) {
  assert.ok(fs.statSync(file).size <= 131072, 'Deliverable exceeds 128 KiB');
  return fs.readFileSync(file, 'utf8');
}
function review(
  candidate,
  dossier,
  fixtureBytes = fs.readFileSync(path.join(__dirname, 'ledger.json'))
) {
  const ledger = JSON.parse(fixtureBytes);
  const sourceSha256 = crypto
    .createHash('sha256')
    .update(fixtureBytes)
    .digest('hex');
  assert.equal(candidate.schemaVersion, 1, 'Unsupported result schema');
  assert.equal(
    candidate.sourceSha256,
    sourceSha256,
    'Wrong source ledger hash'
  );
  assert.equal(
    candidate.rounding,
    'floor',
    'This fixture requires per-account floor rounding'
  );
  assert.equal(candidate.factor, ledger.factor, 'Wrong factor');
  assert.equal(
    candidate.currentDecimals,
    ledger.currentDecimals,
    'Wrong source precision'
  );
  assert.equal(
    candidate.targetDecimals,
    ledger.targetDecimals,
    'Wrong target precision'
  );
  assert.equal(
    candidate.productionApproved,
    false,
    'Candidate must not claim production approval'
  );
  assert.equal(
    candidate.settlementApproved,
    false,
    'Candidate must not claim settlement approval'
  );
  assert.ok(Array.isArray(candidate.accounts), 'Missing accounts');
  assert.equal(
    candidate.accounts.length,
    ledger.accounts.length,
    'Missing or extra account'
  );
  const byId = new Map(
    candidate.accounts.map((account) => [account.id, account])
  );
  assert.equal(byId.size, ledger.accounts.length, 'Duplicate account');
  const denominator =
    BigInt(ledger.factor) * 10n ** BigInt(ledger.currentDecimals);
  const scale = 10n ** BigInt(ledger.targetDecimals);
  let totalSource = 0n,
    totalTarget = 0n,
    totalResidual = 0n;
  for (const source of ledger.accounts) {
    const account = byId.get(source.id);
    assert.ok(account, `Missing account ${source.id}`);
    const old = raw(source.sourceRaw),
      proposed = raw(account.targetRaw);
    assert.equal(
      account.sourceRaw,
      source.sourceRaw,
      `Wrong source amount: ${source.id}`
    );
    const numerator = old * scale;
    assert.equal(
      proposed,
      numerator / denominator,
      `Wrong conversion: ${source.id}`
    );
    assert.equal(
      account.remainderNumerator,
      String(numerator % denominator),
      `Wrong remainder: ${source.id}`
    );
    assert.equal(
      account.remainderDenominator,
      String(denominator),
      `Wrong denominator: ${source.id}`
    );
    assert.equal(
      proposed * denominator + BigInt(account.remainderNumerator),
      numerator,
      'Conservation failed'
    );
    totalSource += old;
    totalTarget += proposed;
    totalResidual += numerator % denominator;
  }
  const totals = candidate.totals;
  assert.equal(totals.sourceRaw, String(totalSource), 'Incorrect source total');
  assert.equal(
    totals.targetRaw,
    String(totalTarget),
    'Total must sum per-account floors'
  );
  assert.equal(
    totals.remainderNumerator,
    String(totalResidual),
    'Residual liabilities must not be discarded'
  );
  assert.equal(
    totals.remainderDenominator,
    String(denominator),
    'Incorrect total residual denominator'
  );
  assert.equal(
    totals.floorOfAggregateRaw,
    String((totalSource * scale) / denominator),
    'Incorrect aggregate floor'
  );
  assert.equal(
    totals.aggregateFloorDifferenceRaw,
    String((totalSource * scale) / denominator - totalTarget),
    'Incorrect aggregate/per-account difference'
  );
  assert.ok(
    typeof dossier === 'string' && dossier.trim().length >= 100,
    'A substantive dossier is required'
  );
  assert.ok(
    dossier.includes(sourceSha256),
    'Dossier must identify the exact source hash'
  );
  assert.ok(
    /dust|remainder|residual/i.test(dossier),
    'Dossier must address residual liabilities'
  );
  return {
    accepted: true,
    scope:
      'synthetic arithmetic and structural checks only; dossier quality requires human review',
    accountsChecked: ledger.accounts.length,
    sourceSha256,
    productionApproved: false,
    settlementApproved: false,
    providerExecution: 'not assessed by this checker',
  };
}
module.exports = { review, boundedRead };
if (require.main === module) {
  try {
    if (process.argv.length !== 4)
      throw new Error(
        'Usage: node demo/REDENOMINATION/computer-work/review.cjs conversion.json dossier.md'
      );
    console.log(
      JSON.stringify(
        review(
          JSON.parse(boundedRead(process.argv[2])),
          boundedRead(process.argv[3])
        ),
        null,
        2
      )
    );
  } catch (error) {
    console.error(`Candidate rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
