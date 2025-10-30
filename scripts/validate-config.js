#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  const contents = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(contents);
}

function ensureNumber(label, value, { min, max, allowZero = false } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (!allowZero && numeric === 0) {
    throw new Error(`${label} must be non-zero`);
  }
  if (min !== undefined && numeric < min) {
    throw new Error(`${label} must be >= ${min}`);
  }
  if (max !== undefined && numeric > max) {
    throw new Error(`${label} must be <= ${max}`);
  }
  return numeric;
}

function validateSentinel(config) {
  const issues = [];
  try {
    ensureNumber('sentinel.budgetCap', config.budgetCap, { min: 1 });
  } catch (error) {
    issues.push(error.message);
  }
  try {
    ensureNumber('sentinel.budgetSoftRatio', config.budgetSoftRatio, {
      min: 0,
      max: 1,
      allowZero: false,
    });
  } catch (error) {
    issues.push(error.message);
  }
  try {
    ensureNumber('sentinel.roiFloor', config.roiFloor, { min: 0 });
  } catch (error) {
    issues.push(error.message);
  }
  if (!config.controlTargets || typeof config.controlTargets !== 'object') {
    issues.push('sentinel.controlTargets is required');
  } else {
    for (const key of ['roi', 'maxBurnRate', 'minSuccessRate']) {
      try {
        ensureNumber(`sentinel.controlTargets.${key}`, config.controlTargets[key], { min: 0 });
      } catch (error) {
        issues.push(error.message);
      }
    }
  }
  return issues;
}

function validateThermostat(config) {
  const issues = [];
  if (!config.controller || typeof config.controller !== 'object') {
    issues.push('thermostat.controller is required');
    return issues;
  }
  const numericFields = [
    'targetRoi',
    'lowerMargin',
    'upperMargin',
    'roiWindow',
    'wideningStep',
    'minWideningAlpha',
    'maxWideningAlpha',
    'thompsonStep',
    'minThompsonPrior',
    'maxThompsonPrior',
    'cooldownSteps',
  ];
  for (const field of numericFields) {
    try {
      ensureNumber(`thermostat.controller.${field}`, config.controller[field], { min: 0, allowZero: field !== 'targetRoi' && field !== 'roiWindow' });
    } catch (error) {
      issues.push(error.message);
    }
  }
  return issues;
}

function validateHgm(config) {
  const issues = [];
  if (!config.budget || typeof config.budget !== 'object') {
    issues.push('hgm.budget is required');
  } else {
    for (const field of ['max', 'softRatio', 'initial']) {
      try {
        ensureNumber(`hgm.budget.${field}`, config.budget[field], {
          min: field === 'softRatio' ? 0 : 1,
          max: field === 'softRatio' ? 1 : undefined,
          allowZero: field === 'softRatio',
        });
      } catch (error) {
        issues.push(error.message);
      }
    }
  }
  if (!config.agents || typeof config.agents !== 'object') {
    issues.push('hgm.agents is required');
  } else if (!config.agents.priors || typeof config.agents.priors !== 'object') {
    issues.push('hgm.agents.priors is required');
  } else {
    const priors = config.agents.priors;
    for (const [role, value] of Object.entries(priors)) {
      try {
        ensureNumber(`hgm.agents.priors.${role}`, value, { min: 0 });
      } catch (error) {
        issues.push(error.message);
      }
    }
  }
  if (!config.controlTargets || typeof config.controlTargets !== 'object') {
    issues.push('hgm.controlTargets is required');
  } else {
    for (const key of ['roi', 'successRate', 'maxFailureRatio']) {
      try {
        ensureNumber(`hgm.controlTargets.${key}`, config.controlTargets[key], { min: 0 });
      } catch (error) {
        issues.push(error.message);
      }
    }
  }
  return issues;
}

function main() {
  const profileDir = path.join(__dirname, '..', 'config', 'agialpha');
  const errors = [];
  try {
    const sentinel = readJson(path.join(profileDir, 'sentinel.json'));
    errors.push(...validateSentinel(sentinel));
  } catch (error) {
    errors.push(`Unable to read sentinel profile config: ${error.message}`);
  }
  try {
    const thermostat = readJson(path.join(profileDir, 'thermostat.json'));
    errors.push(...validateThermostat(thermostat));
  } catch (error) {
    errors.push(`Unable to read thermostat profile config: ${error.message}`);
  }
  try {
    const hgm = readJson(path.join(profileDir, 'hgm.json'));
    errors.push(...validateHgm(hgm));
  } catch (error) {
    errors.push(`Unable to read hgm profile config: ${error.message}`);
  }

  if (errors.length > 0) {
    for (const message of errors) {
      console.error(`✖ ${message}`);
    }
    process.exit(1);
  }
  console.log('✓ AGIALPHA profile configuration validated successfully.');
}

main();
