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

  it('produces coherent equilibria across solvers', function () {
    const probabilitySum = equilibrium.replicator.reduce((sum, value) => sum + value, 0);

    expect(equilibrium.labels).to.have.lengthOf(mission.gameTheory.strategies.length);
    expect(equilibrium.methodConsistency).to.equal(true);
    expect(probabilitySum).to.be.closeTo(1, 1e-9);
    expect(equilibrium.divergenceAtEquilibrium).to.be.at.most(
      mission.hamiltonian.divergenceTolerance + 1e-6,
    );
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

    expect(incentives.burn.burned + incentives.burn.treasury + incentives.burn.employer).to.be.closeTo(
      incentives.burn.jobEscrow,
      1e-6,
    );

    for (const severity of incentives.slashing.severities) {
      expect(severity.slashAmount).to.be.closeTo(
        mission.incentives.slashing.stakeExample * severity.fraction,
        1e-6,
      );
    }
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
