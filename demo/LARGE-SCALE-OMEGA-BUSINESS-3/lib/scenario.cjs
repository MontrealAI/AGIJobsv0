'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const DEMO = path.resolve(__dirname, '..');
const MAX_RAW = (1n << 128n) - 1n;
const sha256 = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
function text(value, label, max = 2000) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw new Error(
      `${label} must be nonempty text without control characters`
    );
  return value;
}
function unsigned(value, label, max = MAX_RAW) {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(value) ||
    value.length > 78
  )
    throw new Error(`${label} must be an unsigned decimal integer string`);
  const raw = BigInt(value);
  if (raw > max) throw new Error(`${label} exceeds supported range`);
  return raw;
}
function integer(value, label, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  return value;
}
function usdc(value, label = 'USDC amount') {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value)
  )
    throw new Error(
      `${label} requires a decimal string with at most six places`
    );
  const [whole, fraction = ''] = value.split('.');
  const raw =
    unsigned(whole, label) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (raw > MAX_RAW)
    throw new Error(`${label} exceeds supported micro-unit range`);
  return raw;
}
function formatUsdc(raw) {
  const negative = raw < 0n;
  if (negative) raw = -raw;
  return `${negative ? '-' : ''}${raw / 1000000n}.${String(
    raw % 1000000n
  ).padStart(6, '0')}`;
}
function sanitizeScope(raw) {
  text(raw, 'Report scope', 120);
  const safe = raw.trim().replace(/[^A-Za-z0-9_.-]/g, '-');
  return safe === '.' || safe === '..' ? 'mission' : safe;
}
function computeSha256(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile()
    ? sha256(fs.readFileSync(file))
    : null;
}
function validateScenario(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s))
    throw new Error('Scenario configuration is required');
  text(s.reportLabel, 'Scenario reportLabel', 120);
  const gateway = new URL(text(s.ipfsGateway, 'IPFS gateway'));
  if (
    gateway.protocol !== 'https:' ||
    gateway.username ||
    gateway.password ||
    gateway.search ||
    gateway.hash
  )
    throw new Error('IPFS gateway must be a credential-free HTTPS URL');
  if (
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.eth$/i.test(
      text(s.ensRoot, 'ENS root', 253)
    )
  )
    throw new Error('Invalid ENS root');
  if (!Array.isArray(s.nations) || !s.nations.length || s.nations.length > 1000)
    throw new Error('Provide 1–1000 nations');
  if (
    !Array.isArray(s.validators) ||
    !s.validators.length ||
    s.validators.length > 100
  )
    throw new Error('Provide 1–100 validators');
  if (!s.treasury || typeof s.treasury !== 'object')
    throw new Error('Scenario must include a treasury configuration');
  const wallets = new Set(),
    labels = new Set(),
    identities = new Set();
  function unique(value, label, set, regex) {
    text(value, label, 253);
    if (!regex.test(value)) throw new Error(`Invalid ${label}`);
    const normalized = value.toLowerCase();
    if (set.has(normalized)) throw new Error(`Duplicate ${label} detected`);
    set.add(normalized);
  }
  function actor(a, label) {
    if (!a || typeof a !== 'object') throw new Error(`Invalid ${label}`);
    text(a.name, `${label} name`, 200);
    text(a.mission, `${label} mission`);
    unique(
      a.wallet,
      `${label} wallet label`,
      wallets,
      /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
    );
    unique(
      a.ensSubdomain,
      `${label} ENS subdomain`,
      labels,
      /^[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*$/
    );
  }
  for (const nation of s.nations) {
    actor(nation, 'nation');
    text(nation.specCid, 'Legacy spec reference', 512);
    text(nation.resultCid, 'Legacy result reference', 512);
    if (
      unsigned(nation.rewardTokens, 'rewardTokens', MAX_RAW / 10n ** 18n) === 0n
    )
      throw new Error('rewardTokens must be greater than zero');
    integer(nation.deadlineHours, 'deadlineHours', 1, 8760);
    if (s.schemaVersion === 2) {
      if (usdc(nation.budgetUsdc, 'budgetUsdc') <= 0n)
        throw new Error('budgetUsdc must be positive');
      usdc(nation.modeledWorkerCostUsdc, 'modeledWorkerCostUsdc');
      integer(nation.estimatedReviewMinutes, 'estimatedReviewMinutes', 1, 1440);
      unique(
        nation.agentEns,
        'agent identity',
        identities,
        /^[a-z0-9-]+\.agent\.agi\.eth$/
      );
    }
  }
  for (const validator of s.validators) {
    actor(validator, 'validator');
    if (s.schemaVersion === 2)
      unique(
        validator.validatorEns,
        'validator identity',
        identities,
        /^[a-z0-9-]+\.club\.agi\.eth$/
      );
  }
  actor(s.treasury, 'treasury');
  if (s.schemaVersion !== undefined && s.schemaVersion !== 2)
    throw new Error('Unsupported scenario schema');
  if (s.schemaVersion === 2) {
    if (s.mode !== 'synthetic')
      throw new Error('This runner requires a synthetic scenario');
    unsigned(s.marketAnnualUsd, 'Market planning assumption');
    text(s.marketBasis, 'Market assumption provenance');
    const p = s.businessPolicy;
    if (!p || p.budgetCurrency !== 'USDC' || p.budgetDecimals !== 6)
      throw new Error('Business budgets use six-decimal USDC planning units');
    integer(p.platformFeeBps, 'platformFeeBps', 0, 10000);
    integer(p.reviewCapacityMinutes, 'reviewCapacityMinutes');
    integer(p.maxReviewerMinutesPerJob, 'maxReviewerMinutesPerJob', 1, 1440);
    usdc(p.reviewRateUsdcPerHour, 'reviewRateUsdcPerHour');
  }
}
function writeLedger(scenario, file) {
  validateScenario(scenario);
  const records = scenario.nations.map((nation, index) => ({
    type: 'nation-mission',
    plannedJobId: index + 1,
    jobId: null,
    status: 'planned',
    employer: nation.name,
    employerEns: `${nation.ensSubdomain}.${scenario.ensRoot}`,
    mission: nation.mission,
    legacySpecCid: nation.specCid,
    legacyResultCid: nation.resultCid,
    referencesVerified: false,
    rewardTokens: nation.rewardTokens,
    rewardAsset: '18-decimal mock token in optional contract tests',
    deadlineHours: nation.deadlineHours,
    transactionsSubmitted: false,
    validatorPool: scenario.validators.map((v) => ({
      name: v.name,
      ens: v.validatorEns ?? `${v.ensSubdomain}.${scenario.ensRoot}`,
      registrationVerified: false,
    })),
  }));
  fs.writeFileSync(
    file,
    records.map((x) => JSON.stringify(x)).join('\n') + '\n'
  );
}
function loadScenario(file = path.join(DEMO, 'config/omega.simulation.json')) {
  const bytes = fs.readFileSync(file);
  if (bytes.length > 1024 * 1024) throw new Error('Scenario exceeds 1 MiB');
  const scenario = JSON.parse(bytes);
  validateScenario(scenario);
  return { scenario, bytes, sha256: sha256(bytes) };
}
// CIDv1, raw codec, sha2-256. An offline CID identifies bytes; it is not proof of publication.
function cid(bytes) {
  const data = Buffer.concat([
    Buffer.from([1, 0x55, 0x12, 0x20]),
    crypto.createHash('sha256').update(bytes).digest(),
  ]);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0,
    value = 0,
    output = 'b';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
module.exports = {
  ROOT,
  DEMO,
  MAX_RAW,
  text,
  unsigned,
  integer,
  usdc,
  formatUsdc,
  sanitizeScope,
  computeSha256,
  validateScenario,
  writeLedger,
  loadScenario,
  sha256,
  json,
  cid,
};
