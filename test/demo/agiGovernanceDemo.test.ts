import { expect } from 'chai';

import {
  assertValidConfig,
  loadMission,
  loadPackageScripts,
  computeThermodynamics,
  computeHamiltonian,
  computeEquilibrium,
  computeAntifragility,
  computeRiskReport,
  computeIncentiveReport,
  computeOwnerReport,
  computeJacobian,
  computeBlockchainReport,
  type MissionConfig,
  type IncentiveReport,
  type ThermodynamicReport,
  type EquilibriumResult,
  type AntifragilityReport,
  type RiskReport,
  type OwnerControlReport,
  type JacobianReport,
  type BlockchainReport,
} from '../../demo/agi-governance/scripts/executeDemo';

describe('Solving α-AGI Governance mission dossier', function () {
  this.timeout(20000);

  let mission: MissionConfig;
  let packageScripts: Record<string, string>;
  let incentives: IncentiveReport;
  let thermodynamics: ThermodynamicReport;
  let equilibrium: EquilibriumResult;
  let antifragility: AntifragilityReport;
  let risk: RiskReport;
  let owner: OwnerControlReport;
  let jacobian: JacobianReport;
  let blockchain: BlockchainReport;

  before(async function () {
    mission = await loadMission();
    packageScripts = await loadPackageScripts();
    thermodynamics = computeThermodynamics(mission);
    equilibrium = computeEquilibrium(mission);
    antifragility = computeAntifragility(
      mission,
      mission.gameTheory.payoffMatrix,
      equilibrium,
      thermodynamics,
    );
    risk = computeRiskReport(mission);
    incentives = computeIncentiveReport(mission);
    owner = computeOwnerReport(mission, packageScripts);
    jacobian = computeJacobian(mission.gameTheory.payoffMatrix, equilibrium.closedForm);
    blockchain = computeBlockchainReport(mission);
  });

  it('passes structural validation', function () {
    expect(() => assertValidConfig(mission)).not.to.throw();
  });

  it('keeps thermodynamic margins positive and Landauer-compliant', function () {
    expect(thermodynamics.gibbsFreeEnergyKJ).to.be.greaterThan(0);
    expect(thermodynamics.landauerWithinMargin).to.equal(true);
    expect(thermodynamics.freeEnergyMarginPercent).to.be.greaterThan(0.99);
  });

  it('maintains Hamiltonian cross-check consistency', function () {
    const hamiltonian = computeHamiltonian(mission);

    expect(hamiltonian.difference).to.be.lessThan(1e-6);
    expect(hamiltonian.kineticTerm).to.be.greaterThan(hamiltonian.potentialTerm);
  });

  it('finds the exact interior equilibrium without claiming cyclic trajectories converge', function () {
    const probabilitySum = equilibrium.replicator.reduce((sum, value) => sum + value, 0);

    expect(equilibrium.labels).to.have.lengthOf(mission.gameTheory.strategies.length);
    // Independent oracle: this fixture is 1 + an antisymmetric cyclic game.
    // Every strategy earns exactly 1 at the uniform interior equilibrium.
    expect(mission.gameTheory.payoffMatrix).to.deep.equal([
      [1, 0.9, 1.1],
      [1.1, 1, 0.9],
      [0.9, 1.1, 1],
    ]);
    equilibrium.closedForm.forEach((value) => expect(value).to.be.closeTo(1 / 3, 1e-12));
    mission.gameTheory.payoffMatrix.forEach((row) => {
      expect(row.reduce((sum, value) => sum + value / 3, 0)).to.be.closeTo(1, 1e-12);
    });
    expect(equilibrium.kktCertified).to.equal(true);
    expect(equilibrium.methodConsistency).to.equal(false);
    expect(equilibrium.maxMethodDeviation).to.be.greaterThan(equilibrium.consistencyThreshold);
    expect(equilibrium.replicatorConverged).to.equal(false);
    expect(equilibrium.replicatorEstimate).to.equal('tail-average-ensemble');
    expect(equilibrium.replicatorIterations).to.equal(50000);
    expect(equilibrium.replicatorDeviation).to.be.greaterThan(1e-6);
    expect(equilibrium.replicator).to.not.deep.equal(equilibrium.closedForm);
    expect(equilibrium.continuousConverged).to.equal(false);
    expect(equilibrium.continuousIterations).to.equal(25000);
    expect(probabilitySum).to.be.closeTo(1, 1e-9);
    expect(equilibrium.divergenceAtEquilibrium).to.be.at.most(
      mission.hamiltonian.divergenceTolerance + 1e-6,
    );
  });

  it('preserves the exact continuous cyclic invariant instead of manufacturing convergence', function () {
    // For x'=.1*x*(z-y), y'=.1*y*(x-z), z'=.1*z*(y-x),
    // d(log(x*y*z))/dt is identically zero. The initial product is 0.03381,
    // strictly below the unique maximum 1/27 at the uniform equilibrium.
    const [x, y, z] = equilibrium.continuous;
    expect(x * y * z).to.be.closeTo(0.42 * 0.35 * 0.23, 1e-10);
    expect(x * y * z).to.be.lessThan(1 / 27 - 0.003);
    const derivative = [0.1 * x * (z - y), 0.1 * y * (x - z), 0.1 * z * (y - x)];
    const norm = Math.hypot(...derivative);
    expect(norm).to.be.greaterThan(0.001);
    expect(equilibrium.continuousDerivativeNorm).to.be.closeTo(norm, 1e-12);
    expect(equilibrium.continuous.reduce((sum, value) => sum + value, 0)).to.be.closeTo(1, 1e-12);
    equilibrium.continuous.forEach((value) => expect(value).to.be.greaterThan(0));
  });

  it('does not let an agreement tolerance rewrite solver output or convergence status', function () {
    const permissive = structuredClone(mission);
    permissive.gameTheory.consistencyThreshold = 2;
    const result = computeEquilibrium(permissive);

    expect(result.methodConsistency).to.equal(true);
    expect(result.consistencyThreshold).to.equal(2);
    expect(result.replicator).to.deep.equal(equilibrium.replicator);
    expect(result.replicatorIterations).to.equal(equilibrium.replicatorIterations);
    expect(result.replicatorDeviation).to.equal(equilibrium.replicatorDeviation);
    expect(result.continuous).to.deep.equal(equilibrium.continuous);
    expect(result.maxMethodDeviation).to.equal(equilibrium.maxMethodDeviation);
    expect(result.replicatorConverged).to.equal(false);
    expect(result.continuousConverged).to.equal(false);
  });

  it('converges to the known uniform equilibrium in a stable anti-coordination game', function () {
    const stable = structuredClone(mission);
    stable.gameTheory.payoffMatrix = [[1, 2, 2], [2, 1, 2], [2, 2, 1]];
    stable.gameTheory.monteCarlo.iterations = 64;
    const result = computeEquilibrium(stable);

    expect(result.methodConsistency).to.equal(true);
    expect(result.replicatorConverged).to.equal(true);
    expect(result.replicatorEstimate).to.equal('terminal-ensemble');
    expect(result.continuousConverged).to.equal(true);
    expect(result.continuousDerivativeNorm).to.be.lessThan(1e-8);
    expect(result.replicatorIterations).to.be.greaterThan(0);
    for (const vector of [result.closedForm, result.replicator, result.continuous]) {
      vector.forEach((value) => expect(value).to.be.closeTo(1 / 3, 1e-6));
    }
  });

  it('keeps distinct coordination limits separate from the interior equilibrium', function () {
    const coordination = structuredClone(mission);
    coordination.gameTheory.payoffMatrix = [[2, 1, 1], [1, 2, 1], [1, 1, 2]];
    coordination.gameTheory.monteCarlo.iterations = 64;
    const result = computeEquilibrium(coordination);

    result.closedForm.forEach((value) => expect(value).to.be.closeTo(1 / 3, 1e-12));
    expect(result.continuousConverged).to.equal(true);
    expect(result.continuous[0]).to.be.greaterThan(0.99999);
    expect(result.replicatorIterations).to.be.greaterThan(0);
    expect(result.replicatorDeviation).to.be.greaterThan(0.1);
    expect(result.replicator).to.not.deep.equal(result.closedForm);
    expect(result.methodConsistency).to.equal(false);
  });

  it('does not mistake a Perron eigenvector for a general game equilibrium', function () {
    const asymmetric = structuredClone(mission);
    asymmetric.gameTheory.payoffMatrix = [[1, 2, 2], [2, 1, 2], [2, 2, 0.5]];
    asymmetric.gameTheory.monteCarlo.iterations = 64;
    const result = computeEquilibrium(asymmetric);
    // Exact equal-payoff solution: (3/8, 3/8, 1/4), each payoff 13/8.
    [3 / 8, 3 / 8, 1 / 4].forEach((value, index) => {
      expect(result.closedForm[index]).to.be.closeTo(value, 1e-12);
      expect(result.continuous[index]).to.be.closeTo(value, 1e-6);
    });
    expect(result.closedFormPayoff).to.be.closeTo(13 / 8, 1e-12);
    expect(result.continuousConverged).to.equal(true);
    expect(result.eigenvector[2]).to.be.greaterThan(0.3);
    expect(result.methodConsistency).to.equal(false);
  });

  it('confirms antifragility with positive curvature', function () {
    expect(antifragility.samples).to.have.lengthOf(mission.antifragility.sigmaSamples.length);
    expect(antifragility.quadraticSecondDerivative).to.be.greaterThan(0);
    expect(antifragility.monotonicIncrease).to.equal(true);
  });

  it('keeps the risk portfolio within the mandated threshold', function () {
    expect(risk.withinBounds).to.equal(true);
    expect(risk.portfolioResidual).to.be.closeTo(risk.portfolioResidualCrossCheck, 1e-9);
    expect(risk.portfolioResidual).to.be.below(mission.risk.portfolioThreshold + 1e-9);
  });

  it('enforces mint/burn parity for incentives', function () {
    const mintedSum = incentives.mint.roles.reduce((sum, role) => sum + role.minted, 0);

    expect(incentives.mint.totalMinted).to.be.closeTo(
      mission.incentives.mintRule.deltaValue * mission.incentives.mintRule.eta,
      1e-6,
    );
    expect(mintedSum).to.be.closeTo(incentives.mint.totalMinted, 1e-6);
    expect(incentives.mint.equalityOk).to.equal(true);
    expect(incentives.mint.agentShare).to.not.equal(null);

    expect(incentives.burn.burned + incentives.burn.treasury + incentives.burn.employer + incentives.burn.retained).to.be.closeTo(
      incentives.burn.jobEscrow,
      1e-6,
    );
    expect(incentives.burn.burned).to.equal(3000);
    expect(incentives.burn.treasury).to.equal(1000);
    expect(incentives.burn.employer).to.equal(1000);
    expect(incentives.burn.retained).to.equal(45000);

    for (const severity of incentives.slashing.severities) {
      expect(severity.slashAmount).to.be.closeTo(
        mission.incentives.slashing.stakeExample * severity.fraction,
        1e-6,
      );
    }
  });

  it('conserves escrow at the zero-allocation and full-allocation boundaries', function () {
    for (const burnBps of [0, 10000]) {
      const boundary = structuredClone(mission);
      Object.assign(boundary.incentives.burnRule, { burnBps, treasuryBps: 0, employerBps: 0 });
      expect(() => assertValidConfig(boundary)).not.to.throw();
      const { burn } = computeIncentiveReport(boundary);
      expect(burn.burned).to.equal(burnBps === 0 ? 0 : burn.jobEscrow);
      expect(burn.retained).to.equal(burnBps === 0 ? burn.jobEscrow : 0);
      expect(burn.burned + burn.treasury + burn.employer + burn.retained).to.equal(burn.jobEscrow);
    }
  });

  it('rejects escrow over-allocation and negative allocations during validation', function () {
    const invalid = structuredClone(mission);
    invalid.incentives.burnRule.burnBps = 10001;
    expect(() => assertValidConfig(invalid)).to.throw('burn rule percentages cannot exceed 100% of escrow');
    invalid.incentives.burnRule.burnBps = -1;
    expect(() => assertValidConfig(invalid)).to.throw('burn rule basis points must be non-negative');
  });

  it('guarantees owner command coverage', function () {
    expect(owner.fullCoverage).to.equal(true);
    expect(owner.allCommandsPresent).to.equal(true);
    owner.capabilities.forEach((capability) => {
      expect(capability.present).to.equal(true);
      if (capability.scriptName) {
        expect(capability.scriptExists).to.equal(true);
      }
    });
  });

  it('exports Jacobian diagnostics with bounded spectrum', function () {
    expect(jacobian.analytic).to.have.lengthOf(3);
    expect(jacobian.numeric).to.have.lengthOf(3);
    expect(jacobian.maxDifference).to.be.greaterThan(0);
    expect(jacobian.spectralRadius).to.be.at.most(1 + 1e-6);
  });

  it('describes a mainnet-grade blockchain deployment envelope', function () {
    expect(blockchain.safeForMainnet).to.equal(true);
    expect(blockchain.upgradeDelayHours).to.equal(168);
    expect(blockchain.contracts).to.have.lengthOf(mission.blockchain.contracts.length);
  });
});
