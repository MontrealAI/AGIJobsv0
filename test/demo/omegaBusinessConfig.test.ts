import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

import {
  validateScenario,
  type OmegaScenario,
} from '../../demo/LARGE-SCALE-OMEGA-BUSINESS-3/orchestrator';

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
    const scenario = JSON.parse(
      fs.readFileSync(scenarioPath, 'utf8')
    ) as OmegaScenario;

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
    const scenario = JSON.parse(
      fs.readFileSync(scenarioPath, 'utf8')
    ) as OmegaScenario;
    const invalid = JSON.parse(JSON.stringify(scenario)) as OmegaScenario;

    invalid.validators[0].wallet = invalid.nations[0].wallet;

    expect(() => validateScenario(invalid)).to.throw(
      'Duplicate validator wallet label'
    );
  });
  it('exports tasks accepted by the real computer-work adapter schema', function () {
    const {
      taskFor,
    } = require('../../demo/LARGE-SCALE-OMEGA-BUSINESS-3/lib/mission.cjs');
    const scenario = require('../../demo/LARGE-SCALE-OMEGA-BUSINESS-3/config/omega.simulation.json');
    const workloads = require('../../demo/LARGE-SCALE-OMEGA-BUSINESS-3/computer-work/workloads.json');
    const {
      parseComputerWorkTask,
      computerTaskDigest,
    } = require('../../apps/orchestrator/computerWork');
    for (const nation of scenario.nations) {
      const task = taskFor(nation, workloads[nation.wallet]);
      expect(parseComputerWorkTask(task).workerProfile).to.equal('omega');
      expect(computerTaskDigest(task)).to.match(/^[0-9a-f]{64}$/);
      const changed = { ...task, goal: task.goal + ' changed' };
      expect(computerTaskDigest(changed)).not.to.equal(
        computerTaskDigest(task)
      );
    }
  });
});
