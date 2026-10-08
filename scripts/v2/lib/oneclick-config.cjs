'use strict';
const parseDuration = require('../../utils/parseDuration.js');
const UINT256_MAX = (1n << 256n) - 1n;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
}
function token(value, label, decimals, max = UINT256_MAX) {
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new Error(`${label} must be an unsigned decimal amount`);
  const source = String(value);
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(source) || source.length > 256)
    throw new Error(`${label} must be an unsigned decimal amount`);
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER)
  )
    throw new Error(`${label} requires an exact decimal string`);
  const [whole, fraction = ''] = source.split('.');
  if (fraction.length > decimals)
    throw new Error(`${label} exceeds token precision`);
  const units =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, '0') || '0');
  if (units > max) throw new Error(`${label} exceeds contract range`);
}
function seconds(value, label, positive = false, numericOnly = false) {
  let parsed = value;
  if (!numericOnly && typeof value === 'string') {
    // Reject ignored suffixes, negative values, subsecond rounding and implicit units.
    if (/^[0-9]+$/.test(value)) parsed = Number(value);
    else {
      // Bound each component to parseDuration's full numeric match so that
      // oversized quantities cannot be split into several smaller matches.
      if (
        !/^(?:[0-9]{1,16}(?:\.[0-9]{1,16})?\s*(?:s|sec(?:ond)?s?|m|min(?:ute)?s?|h|hours?|hrs?|d|days?|w|weeks?|wks?)\s*)+$/.test(
          value
        )
      )
        throw new Error(
          `${label} must be whole seconds or explicit duration units`
        );
      parsed = parseDuration(value, 's');
    }
  }
  if (!Number.isSafeInteger(parsed) || parsed < (positive ? 1 : 0))
    throw new Error(
      `${label} must resolve to ${
        positive ? 'positive' : 'nonnegative'
      } safe integer seconds`
    );
}
function validateOneclickConfig(config, decimals) {
  object(config, 'Deployment config');
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 80)
    throw new Error('Invalid configured token decimals');
  const econ = config.econ === undefined ? {} : config.econ;
  const defaults =
    config.secureDefaults === undefined ? {} : config.secureDefaults;
  object(econ, 'econ');
  object(defaults, 'secureDefaults');
  const tax = config.tax === undefined ? {} : config.tax;
  object(tax, 'tax');
  if (tax.enabled !== undefined && typeof tax.enabled !== 'boolean')
    throw new Error('tax.enabled must be boolean');
  for (const key of ['uri', 'description'])
    if (
      tax[key] !== undefined &&
      (typeof tax[key] !== 'string' || !tax[key].trim())
    )
      throw new Error(`tax.${key} must be a nonempty string`);
  for (const key of Object.keys(econ))
    if (
      ![
        'feePct',
        'burnPct',
        'minStake',
        'jobStake',
        'minPlatformStake',
        'commitWindow',
        'revealWindow',
        'employerSlashPct',
        'treasurySlashPct',
        'validatorSlashRewardPct',
        'appealFee',
        'disputeWindow',
        'treasury',
      ].includes(key)
    )
      throw new Error(`Unknown econ field ${key}`);
  for (const key of [
    'feePct',
    'burnPct',
    'employerSlashPct',
    'treasurySlashPct',
    'validatorSlashRewardPct',
  ]) {
    if (
      econ[key] !== undefined &&
      (!Number.isInteger(econ[key]) || econ[key] < 0 || econ[key] > 100)
    )
      throw new Error(`econ.${key} must be a whole percentage from 0 to 100`);
  }
  // Mirror apply-secure-defaults' omitted-share defaults and the public setter.
  if (
    (econ.employerSlashPct ?? 0) +
      (econ.treasurySlashPct ?? 100) +
      (econ.validatorSlashRewardPct ?? 0) >
    100
  )
    throw new Error('Slashing distribution exceeds 100 percent');
  for (const key of ['minStake', 'jobStake', 'minPlatformStake', 'appealFee'])
    if (econ[key] !== undefined)
      token(
        econ[key],
        `econ.${key}`,
        decimals,
        key === 'jobStake' ? (1n << 96n) - 1n : UINT256_MAX
      );
  for (const key of ['commitWindow', 'revealWindow', 'disputeWindow'])
    if (econ[key] !== undefined)
      seconds(econ[key], `econ.${key}`, key !== 'disputeWindow');
  for (const key of Object.keys(defaults))
    if (
      ![
        'pauseOnLaunch',
        'maxJobRewardAgia',
        'maxJobDurationSeconds',
        'validatorCommitWindowSeconds',
        'validatorRevealWindowSeconds',
      ].includes(key)
    )
      throw new Error(`Unknown secureDefaults field ${key}`);
  if (
    defaults.pauseOnLaunch !== undefined &&
    typeof defaults.pauseOnLaunch !== 'boolean'
  )
    throw new Error('secureDefaults.pauseOnLaunch must be boolean');
  if (defaults.maxJobRewardAgia !== undefined)
    token(
      defaults.maxJobRewardAgia,
      'secureDefaults.maxJobRewardAgia',
      decimals
    );
  for (const key of [
    'maxJobDurationSeconds',
    'validatorCommitWindowSeconds',
    'validatorRevealWindowSeconds',
  ])
    if (defaults[key] !== undefined)
      seconds(defaults[key], `secureDefaults.${key}`, true, true);
  return config;
}
module.exports = { validateOneclickConfig };
