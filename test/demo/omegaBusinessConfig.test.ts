import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

import { validateScenario, type OmegaScenario } from '../../demo/LARGE-SCALE-OMEGA-BUSINESS-3/orchestrator';

describe('Omega Business scenario configuration', function () {
  it('accepts the shipped scenario file', function () {
    const scenarioPath = path.resolve(
      __dirname,
      '..',
      '..',
      'demo',
      'LARGE-SCALE-OMEGA-BUSINESS-3',
      'config',
      'omega.simulation.json'
    );
    const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8')) as OmegaScenario;

    expect(() => validateScenario(scenario)).not.to.throw();
  });

  it('rejects duplicate wallet labels', function () {
    const scenarioPath = path.resolve(
      __dirname,
      '..',
      '..',
      'demo',
      'LARGE-SCALE-OMEGA-BUSINESS-3',
      'config',
      'omega.simulation.json'
    );
    const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8')) as OmegaScenario;
    const invalid = JSON.parse(JSON.stringify(scenario)) as OmegaScenario;

    invalid.validators[0].wallet = invalid.nations[0].wallet;

    expect(() => validateScenario(invalid)).to.throw('Duplicate validator wallet label');
  });
});
