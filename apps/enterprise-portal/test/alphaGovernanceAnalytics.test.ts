import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';

import {
  computeEnergyMetrics,
  computeValidatorEntropy,
  type GovernanceScenario,
} from '../src/lib/agiGovernanceAnalytics';

const SCENARIO_RELATIVE_PATH = 'demo/agi-governance/data/scenario.json';

const candidateBases = [
  path.resolve(__dirname, '../../../../'),
  path.resolve(__dirname, '../../../'),
  process.cwd(),
];

const scenarioPath = (() => {
  for (const base of candidateBases) {
    const candidate = path.resolve(base, SCENARIO_RELATIVE_PATH);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Unable to locate scenario JSON. Checked: ${candidateBases
      .map((base) => path.resolve(base, SCENARIO_RELATIVE_PATH))
      .join(', ')}`
  );
})();

const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8')) as GovernanceScenario;

const entropy = computeValidatorEntropy(scenario.validators);

test('validator entropy is positive and finite', () => {
  assert.ok(entropy > 0, 'entropy should be positive');
  assert.ok(Number.isFinite(entropy));
});

test('energy metrics stay above Landauer bound and track cooperation', () => {
  const totalRewards = scenario.nations.reduce(
    (
      sum: number,
      nation: GovernanceScenario['nations'][number]
    ) => sum + nation.reward,
    0
  );
  const totalFees = (totalRewards * 3) / 100; // default fee percentage
  const metrics = computeEnergyMetrics({
    temperatureKelvin: scenario.temperatureKelvin,
    lambda: scenario.lambda,
    landauerMultiplier: scenario.landauerMultiplier,
    discountFactor: scenario.discountFactor,
    totalRewards,
    treasuryInflows: totalFees,
    stakeLocked: scenario.owner.minStake * 4,
    validatorEntropy: entropy,
    validatorCooperation: 0.95,
    dissipationVector: scenario.nations.map(
      (nation: GovernanceScenario['nations'][number]) => nation.dissipation
    ),
  });

  assert.ok(metrics.energyBudget > 0);
  assert.ok(metrics.gibbsFreeEnergy < metrics.energyBudget);
  assert.ok(metrics.landauerBound > 0);
  assert.ok(metrics.antifragilityScore <= 1);
  assert.ok(metrics.validatorCooperation > 0.9);
});
